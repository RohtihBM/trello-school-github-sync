import { Router } from "express";
import { createHash } from "node:crypto";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";
import { notifyBoard } from "../lib/notifyBoard.js";

export const approvalRouter = Router();

approvalRouter.post("/issues/:id/approve", requireAuth, async (req, res) => {
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

  // Nothing to hash and nothing meaningful to approve without a plan —
  // same defensive posture as requiring assumedContract in phase 3.
  if (!issue.plan || issue.plan.trim() === "") {
    return res.status(400).json({ error: "this ticket has no plan to approve" });
  }

  const contentHash = createHash("sha256").update(issue.plan).digest("hex");

  // Chained per-board, not per-ticket — every approval on the board
  // extends ONE chain, which is simpler and still makes tampering with
  // ANY past approval on the board detectable (not just on this ticket).
  const previous = await prisma.approvalRecord.findFirst({
    where: { issue: { boardId: issue.boardId } },
    orderBy: { createdAt: "desc" },
  });

  const record = await prisma.approvalRecord.create({
    data: {
      issueId: issue.id,
      approvedById: req.userId!,
      contentHash,
      previousHash: previous?.contentHash ?? null,
    },
  });

  // READY requires BOTH "plan approved" AND "no open blockers" (the
  // architecture doc's own TicketStatus comment) — approving a still-
  // BLOCKED ticket records the approval but doesn't itself unblock it;
  // phase 3's resolveDependenciesOnDone is the mirror of this check,
  // applied when a blocker finishes instead of when an approval lands.
  const edges = await prisma.ticketDependency.findMany({
    where: { blockedId: issue.id },
    include: { blocker: true },
  });
  const hasOpenBlocker = edges.some((e) => e.blocker.status !== "DONE");

  // Drop the included `board` relation up front — prisma.issue.update()
  // below returns the plain row without it, so both branches of this
  // need to agree on the same (board-less) shape.
  const { board: _board, ...plainIssue } = issue;
  let updatedIssue = plainIssue;
  if (!hasOpenBlocker && issue.status !== "DONE") {
    updatedIssue = await prisma.issue.update({
      where: { id: issue.id },
      data: { status: "READY" },
    });
  }

  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updatedIssue });

  res.status(201).json(record);
});
