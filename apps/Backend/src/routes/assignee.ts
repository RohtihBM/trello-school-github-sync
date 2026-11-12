import { Router } from "express";
import { Prisma, prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";
import { notifyBoard } from "../lib/notifyBoard.js";

export const assigneeRouter = Router();

// IssueMapping was in the schema from the start but referenced by zero
// routes anywhere — this is the first thing that actually uses it.
const ASSIGNEE_INCLUDE = {
  assignees: { include: { user: { select: { id: true, email: true } } } },
} as const;

assigneeRouter.post("/issues/:id/assignees", requireAuth, async (req, res) => {
  const issueId = req.params.id as string;
  const { userId } = req.body;

  if (typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }

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

  // The assignee must themselves be an accepted member of the same org —
  // the same scoping GET /boards already applies to its member list, so
  // nobody can be assigned who wouldn't show up as a collaborator there.
  const assigneeMembership = await getMembershipForOrg(userId, issue.board.orgId);
  if (!assigneeMembership || !assigneeMembership.accepted) {
    return res
      .status(400)
      .json({ error: "userId must be an accepted member of this organisation" });
  }

  try {
    await prisma.issueMapping.create({ data: { userId, issueId } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({ error: "already assigned" });
    }
    throw err;
  }

  // Partial update, same pattern as dependency.ts — this doesn't carry
  // planMessages/dependsOn, so the frontend's existing mergeIssue (already
  // built for exactly this gap) fills those back in from what it already has.
  const updated = await prisma.issue.findUnique({
    where: { id: issueId },
    include: ASSIGNEE_INCLUDE,
  });
  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updated });

  res.status(201).json(updated);
});

assigneeRouter.delete("/issues/:id/assignees/:userId", requireAuth, async (req, res) => {
  const issueId = req.params.id as string;
  const userId = req.params.userId as string;

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

  await prisma.issueMapping.deleteMany({ where: { issueId, userId } });

  const updated = await prisma.issue.findUnique({
    where: { id: issueId },
    include: ASSIGNEE_INCLUDE,
  });
  await notifyBoard(issue.boardId, { type: "issue-updated", issue: updated });

  res.status(200).json(updated);
});
