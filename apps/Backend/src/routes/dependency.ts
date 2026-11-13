import { Router } from "express";
import { Prisma, prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";
import { wouldCreateCycle } from "../lib/cycleCheck.js";
import { notifyBoard } from "../lib/notifyBoard.js";
import { enqueuePlanJob } from "../lib/queue.js";

export const dependencyRouter = Router();

// True only for the specific pre-plan pending state processDependencyCheck
// leaves an issue in: Claude found something and nothing has written a
// plan yet. A dependency declared/dismissed on a ticket that already HAS
// a plan (the normal, always-available manual path) must never trigger
// this — only resolving that one specific pending state should.
function isPendingPrePlanSuggestion(issue: { plan: string | null; suggestedDependency: unknown }) {
  return issue.plan === null && issue.suggestedDependency !== null;
}

// Shared by both routes below — confirming or dismissing the pre-plan
// suggestion both mean the same thing for what happens next: there's no
// more human decision to wait on here, so the pipeline the original
// "Generate plan" click started continues on its own into a real plan,
// instead of requiring a second manual click.
async function continuePlanGeneration(issueId: string, requestedById: string) {
  const job = await prisma.planGenerationJob.create({
    data: { issueId, requestedById },
  });
  await enqueuePlanJob("generate-plan", { jobId: job.id });
}

dependencyRouter.post("/issues/:id/dependencies", requireAuth, async (req, res) => {
  const blockedId = req.params.id as string;
  const { blockerId, assumedContract } = req.body;

  if (typeof blockerId !== "string") {
    return res.status(400).json({ error: "blockerId is required" });
  }
  // Required, not optional — captured here because this is the only point
  // where a human is actually declaring what they expect from the blocker.
  // Without it, the contract diff in phase 3 step 6 would have nothing to
  // ever compare against.
  if (typeof assumedContract !== "string" || assumedContract.trim() === "") {
    return res.status(400).json({ error: "assumedContract is required" });
  }

  const blocked = await prisma.issue.findUnique({
    where: { id: blockedId },
    include: { board: true },
  });
  if (!blocked) {
    return res.status(404).json({ error: "issue not found" });
  }

  const membership = await getMembershipForOrg(req.userId!, blocked.board.orgId);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const blocker = await prisma.issue.findUnique({ where: { id: blockerId } });
  // Scoped to the same board — not stated outright in the architecture
  // doc, but a cross-board dependency wouldn't mean anything here, and
  // this matches how file-overlap warnings are scoped in phase 4.
  if (!blocker || blocker.boardId !== blocked.boardId) {
    return res
      .status(400)
      .json({ error: "blockerId must be an issue on the same board" });
  }

  const existingEdges = await prisma.ticketDependency.findMany({
    where: { blocked: { boardId: blocked.boardId } },
    select: { blockedId: true, blockerId: true },
  });

  if (wouldCreateCycle(existingEdges, blockedId, blockerId)) {
    return res
      .status(409)
      .json({ error: "this would create a circular dependency" });
  }

  const wasPendingPrePlan = isPendingPrePlanSuggestion(blocked);

  try {
    // Both writes together — a ticket should never end up BLOCKED without
    // the edge that explains why, or vice versa. Also clears any pending
    // AI suggestion on this ticket in the same write: once a real
    // dependency has been declared (confirming the suggestion, editing
    // it, or declaring an unrelated one manually), showing a stale
    // suggestion banner underneath no longer makes sense either way.
    const [dependency] = await prisma.$transaction([
      prisma.ticketDependency.create({
        data: { blockedId, blockerId, assumedContract },
      }),
      prisma.issue.update({
        where: { id: blockedId },
        data: { status: "BLOCKED", suggestedDependency: Prisma.JsonNull },
      }),
    ]);

    if (wasPendingPrePlan) {
      await continuePlanGeneration(blockedId, req.userId!);
    }

    // Every other write path in this app (issue-moved, plan-ready, the
    // GitHub sync routes) broadcasts live to everyone on the board — this
    // one didn't, which meant declaring a dependency in one browser tab
    // would silently never show up in another until a manual refresh.
    // Re-fetch with dependsOn + each blocker's title (what the frontend
    // actually needs to render the dependency list) rather than broadcast
    // the bare update result, which has neither relation populated.
    const blockedWithDeps = await prisma.issue.findUnique({
      where: { id: blockedId },
      include: {
        dependsOn: { include: { blocker: { select: { id: true, title: true, status: true } } } },
      },
    });
    await notifyBoard(blocked.boardId, { type: "issue-updated", issue: blockedWithDeps });

    res.status(201).json(dependency);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({ error: "this dependency already exists" });
    }
    throw err;
  }
});

// Declining Claude's suggestion without declaring anything in its place —
// the confirm path is just the existing route above (the frontend
// prefills the form from the suggestion, a human still has to hit Add).
// This route exists purely so "no thanks" also clears it, instead of it
// reappearing every time the board reloads.
dependencyRouter.post("/issues/:id/dependencies/dismiss-suggestion", requireAuth, async (req, res) => {
  const issueId = req.params.id as string;

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { board: true },
  });
  if (!issue) {
    return res.status(404).json({ error: "issue not found" });
  }

  const membership = await getMembershipForOrg(req.userId!, issue.board.orgId);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const wasPendingPrePlan = isPendingPrePlanSuggestion(issue);

  const updated = await prisma.issue.update({
    where: { id: issueId },
    data: { suggestedDependency: Prisma.JsonNull },
  });

  if (wasPendingPrePlan) {
    await continuePlanGeneration(issueId, req.userId!);
  }

  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updated });

  res.status(200).json({ ok: true });
});
