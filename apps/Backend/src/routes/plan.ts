import { Router } from "express";
import { prisma } from "@repo/db";
import type { Issue } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";
import { checkClaudeCallRateLimit } from "../lib/rateLimit.js";
import { enqueuePlanJob } from "../lib/queue.js";
import { notifyBoard } from "../lib/notifyBoard.js";

export const planRouter = Router();

type GateResult =
  | { ok: true; issue: Issue }
  | { ok: false; status: number; error: string };

// Shared by both routes below: membership, in-flight, and rate-limit checks
// are identical whether this is a fresh "generate plan" or a chat message —
// both are billed Claude calls scoped to one ticket, gated the same way.
async function gateClaudeCall(issueId: string, userId: string): Promise<GateResult> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { board: true },
  });
  if (!issue) {
    return { ok: false, status: 404, error: "issue not found" };
  }

  const membership = await getMembershipForOrg(userId, issue.board.orgId);
  if (!membership) {
    return {
      ok: false,
      status: 403,
      error: "you are not a member of this organisation",
    };
  }

  // Checked BEFORE the rate limit on purpose: a rejected duplicate-click
  // never costs anything, so it must never count against the daily quota
  // either — found by actually testing this path, not by reading the code.
  const existingJob = await prisma.planGenerationJob.findFirst({
    where: { issueId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (existingJob) {
    return {
      ok: false,
      status: 409,
      error: "a plan is already being generated for this ticket",
    };
  }

  const withinLimit = await checkClaudeCallRateLimit(userId);
  if (!withinLimit) {
    return { ok: false, status: 429, error: "daily plan-generation limit reached" };
  }

  return { ok: true, issue };
}

planRouter.post("/issues/:id/generate-plan", requireAuth, async (req, res) => {
  const issueId = req.params.id as string;

  const gate = await gateClaudeCall(issueId, req.userId!);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  // All checks passed — create the durable record, then hand its id to the
  // queue. The job row is what survives a crash; the queue entry is just a
  // disposable pointer saying "go look at this row." "check-dependency"
  // runs first now, not "generate-plan" directly — a cheap pre-planning
  // step that either auto-continues straight into real plan generation
  // (nothing found) or pauses for a human to confirm/dismiss first
  // (apps/Worker/src/processPlanJob.ts's processDependencyCheck).
  const job = await prisma.planGenerationJob.create({
    data: { issueId, requestedById: req.userId! },
  });

  await enqueuePlanJob("check-dependency", { jobId: job.id });

  // The one place status actually moves OPEN -> PLANNING, and the card
  // auto-moves into "In Progress" — both the instant generation is
  // requested, not once the (slow, async) job finishes. Only applies
  // from OPEN: a ticket already BLOCKED (a dependency exists before its
  // own plan does) stays BLOCKED, since that's the more specific, more
  // important thing to show than "planning."
  if (gate.issue.status === "OPEN") {
    const inProgress = await prisma.section.findFirst({
      where: { boardId: gate.issue.boardId, title: "In Progress" },
    });

    const data: { status: "PLANNING"; sectionId?: string; position?: number } = {
      status: "PLANNING",
    };
    if (inProgress && inProgress.id !== gate.issue.sectionId) {
      const { _max } = await prisma.issue.aggregate({
        where: { sectionId: inProgress.id },
        _max: { position: true },
      });
      data.sectionId = inProgress.id;
      data.position = (_max.position ?? -1) + 1;
    }

    const updated = await prisma.issue.update({ where: { id: issueId }, data });
    await notifyBoard(gate.issue.boardId, { type: "issue-updated", issue: updated });
  }

  res.status(202).json({ jobId: job.id, status: job.status });
});

planRouter.post("/issues/:id/chat", requireAuth, async (req, res) => {
  const issueId = req.params.id as string;
  const { message } = req.body;

  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "message is required" });
  }

  const gate = await gateClaudeCall(issueId, req.userId!);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  // Chat can't resume a session that doesn't exist yet — a plan has to be
  // generated at least once before there's anything to continue.
  if (!gate.issue.claudeSessionId) {
    return res
      .status(409)
      .json({ error: "generate a plan before starting a chat" });
  }

  // A pending revision has to be accepted or rejected before the
  // conversation continues — the session Claude resumes only ever knows
  // about the last plan it actually wrote, not an unresolved proposal
  // still sitting in `proposedPlan`, so letting the discussion race ahead
  // of it would just talk past a decision the human hasn't made yet.
  if (gate.issue.proposedPlan) {
    return res
      .status(409)
      .json({ error: "resolve the proposed plan revision before continuing" });
  }

  // Store and broadcast the user's own message immediately — this is what
  // makes it show up in the chat panel right away, before Claude's reply
  // exists at all, same as any normal chat UI.
  const userMessage = await prisma.planMessage.create({
    data: { issueId, role: "user", content: message },
  });
  await notifyBoard(gate.issue.boardId, { type: "chat-message", message: userMessage });

  const job = await prisma.planGenerationJob.create({
    data: { issueId, requestedById: req.userId! },
  });

  // The message text travels with the job itself, not just its id — the
  // worker's chat handler needs the actual content to send to Claude, and
  // pulling it back out of PlanMessage by some "most recent unanswered"
  // query would be fragile; passing it directly is simpler and exact.
  await enqueuePlanJob("chat", { jobId: job.id, message });

  res.status(202).json({ jobId: job.id, status: job.status });
});

// Accepting a proposed revision replaces `plan` with it — the existing
// approve route is untouched by this and already does the right thing on
// its own: it hashes whatever `plan` holds at approve time, so a ticket
// that was already approved under the OLD text correctly needs a fresh
// approval for the new one. If it was READY (approved, unblocked) when
// the plan changed underneath it, that approval is now stale — flip back
// to PLANNING so the UI actually asks for a new one, rather than quietly
// leaving a "Plan approved" badge up over text nobody approved. Any other
// status (BLOCKED, PLANNING) is left as-is: plan text changing doesn't by
// itself resolve a blocker or need a status change beyond that.
planRouter.post("/issues/:id/plan/accept-revision", requireAuth, async (req, res) => {
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
    return res.status(403).json({ error: "you are not a member of this organisation" });
  }

  if (!issue.proposedPlan) {
    return res.status(400).json({ error: "no proposed revision to accept" });
  }

  const updated = await prisma.issue.update({
    where: { id: issueId },
    data: {
      plan: issue.proposedPlan,
      proposedPlan: null,
      status: issue.status === "READY" ? "PLANNING" : issue.status,
    },
  });

  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updated });

  res.json(updated);
});

planRouter.post("/issues/:id/plan/reject-revision", requireAuth, async (req, res) => {
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
    return res.status(403).json({ error: "you are not a member of this organisation" });
  }

  const updated = await prisma.issue.update({
    where: { id: issueId },
    data: { proposedPlan: null },
  });

  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updated });

  res.json(updated);
});
