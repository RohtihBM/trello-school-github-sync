import { Router } from "express";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";

// Every board gets exactly these sections; there is no way to add more.
const DEFAULT_SECTIONS = ["Todo", "In Progress", "Completed"];

export const boardRouter = Router();

boardRouter.post("/boards", requireAuth, async (req, res) => {
  const { title, orgId } = req.body;

  if (typeof title !== "string" || typeof orgId !== "string") {
    return res.status(400).json({ error: "title and orgId are required" });
  }

  const membership = await getMembershipForOrg(req.userId!, orgId);

  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const board = await prisma.board.create({
    data: {
      title,
      orgId,
      sections: {
        create: DEFAULT_SECTIONS.map((sectionTitle, position) => ({
          title: sectionTitle,
          position,
        })),
      },
    },
  });
  res.status(201).json(board);
});

// Extended for the BoardsList dashboard redesign — issueCount and
// members used to not exist on this response at all. One query, not
// N+1: _count for the issue total, a nested org->memberships->user
// include for the member list, reshaped below into the flat shape the
// frontend actually needs (it has no reason to know about Membership
// rows directly).
boardRouter.get("/boards", requireAuth, async (req, res) => {
  const boards = await prisma.board.findMany({
    where: { org: { memberships: { some: { userId: req.userId! } } } },
    include: {
      _count: { select: { issues: true } },
      org: {
        include: {
          memberships: {
            where: { accepted: true },
            include: { user: { select: { email: true } } },
          },
        },
      },
    },
  });

  const shaped = boards.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    orgId: b.orgId,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    issueCount: b._count.issues,
    members: b.org.memberships.map((m) => ({ email: m.user.email })),
  }));

  res.json(shaped);
});

boardRouter.patch("/boards/:boardId", requireAuth, async (req, res) => {
  const boardId = req.params.boardId as string;
  const { title, description } = req.body;

  if (typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  // description is optional — undefined means "leave it as-is," distinct
  // from an empty string clearing it. Only a non-string, non-undefined
  // value is actually rejected.
  if (description !== undefined && typeof description !== "string") {
    return res.status(400).json({ error: "description must be a string" });
  }

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const membership = await getMembershipForOrg(req.userId!, board.orgId);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const updated = await prisma.board.update({
    where: { id: boardId },
    data: { title, ...(description !== undefined ? { description } : {}) },
  });
  res.json(updated);
});

// Phase 2 — who's assignable to a ticket on this board. GET /boards
// already returns a board's members as {email} for the dashboard card;
// assignment needs the actual userId too, hence its own small route
// rather than reusing that shape.
boardRouter.get("/boards/:boardId/members", requireAuth, async (req, res) => {
  const boardId = req.params.boardId as string;

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const membership = await getMembershipForOrg(req.userId!, board.orgId);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const memberships = await prisma.membership.findMany({
    where: { orgId: board.orgId, accepted: true },
    include: { user: { select: { id: true, email: true } } },
  });

  res.json(memberships.map((m) => m.user));
});

// Phase 5 — the dependency graph page's only data source. Nodes + edges,
// nothing else: the graph view doesn't need plans, chat history, or
// sections, just enough to draw the DAG and label each node.
boardRouter.get("/boards/:boardId/dependencies", requireAuth, async (req, res) => {
  const boardId = req.params.boardId as string;

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const membership = await getMembershipForOrg(req.userId!, board.orgId);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "you are not a member of this organisation" });
  }

  const issues = await prisma.issue.findMany({
    where: { boardId },
    select: { id: true, title: true, status: true, description: true },
  });

  // Scoped the same way every other dependency query in this app is
  // scoped — via the blocked side's boardId, since TicketDependency has
  // no boardId column of its own.
  const edges = await prisma.ticketDependency.findMany({
    where: { blocked: { boardId } },
    select: { id: true, blockedId: true, blockerId: true },
  });

  res.json({ issues, edges });
});
