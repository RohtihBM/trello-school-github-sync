import type { WebSocket } from "ws";
import { prisma } from "@repo/db";
import { publishToBoard } from "./pubsub.js";
import { resolveDependenciesOnDone } from "./lib/resolveDependencies.js";

// Who sent the message and which board they joined. This comes from server-side
// state (set in handleJoin), never from what the client claims in the message.
export interface JoinedContext {
  boardId: string;
  userId: string;
}

export type ClientMessage = Record<string, unknown>;

export type ActionHandler = (
  socket: WebSocket,
  ctx: JoinedContext,
  message: ClientMessage,
) => Promise<void>;

function sendError(socket: WebSocket, message: string) {
  socket.send(JSON.stringify({ type: "error", message }));
}

// Issues in a section are ordered by `position`. Deleting an issue leaves a gap,
// so the next free slot is "highest position + 1", not "how many issues there are".
async function nextPosition(sectionId: string) {
  const { _max } = await prisma.issue.aggregate({
    where: { sectionId },
    _max: { position: true },
  });
  return (_max.position ?? -1) + 1;
}

// No handleCreateIssue here on purpose — tickets only ever get created
// through GitHub sync (apps/Backend/src/routes/github.ts's webhook
// upsert), never over this socket. Enforced server-side, not just hidden
// in the UI: there is no "create-issue" message type for a client to send.

export const handleDeleteIssue: ActionHandler = async (socket, ctx, message) => {
  const { issueId } = message;

  if (typeof issueId !== "string") {
    return sendError(socket, "issueId is required");
  }

  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue || issue.boardId !== ctx.boardId) {
    return sendError(socket, "issue not found on this board");
  }

  await prisma.issue.delete({ where: { id: issueId } });

await publishToBoard(ctx.boardId, { type: "issue-deleted", issueId: issue.id });
};

export const handleMoveIssue: ActionHandler = async (socket, ctx, message) => {
  const { issueId, sectionId } = message;

  if (typeof issueId !== "string" || typeof sectionId !== "string") {
    return sendError(socket, "issueId and sectionId are required");
  }

  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue || issue.boardId !== ctx.boardId) {
    return sendError(socket, "issue not found on this board");
  }

  const targetSection = await prisma.section.findUnique({
    where: { id: sectionId },
  });
  if (!targetSection || targetSection.boardId !== ctx.boardId) {
    return sendError(socket, "section not found on this board");
  }

  // Moving into "Completed" IS what marks a ticket DONE — there is no
  // separate "mark as done" action anywhere in the system. This is the
  // only place TicketStatus.DONE ever gets set.
  const movedIntoCompleted = targetSection.title === "Completed";

  // Gated, not automatic: a card can't land in "Completed" just because
  // someone dragged it there — the plan has to actually be approved
  // first, same bar approval.ts already applies when deciding whether an
  // approval itself is enough to reach READY (approved AND no open
  // blockers). Without this, DONE meant nothing — any card, planned or
  // not, approved or not, could be dropped here and call itself finished.
  if (movedIntoCompleted) {
    const hasApproval = (await prisma.approvalRecord.count({ where: { issueId } })) > 0;
    const edges = await prisma.ticketDependency.findMany({
      where: { blockedId: issueId },
      include: { blocker: true },
    });
    const hasOpenBlocker = edges.some((e) => e.blocker.status !== "DONE");

    if (!hasApproval || hasOpenBlocker) {
      // The frontend applies a move optimistically the instant a card is
      // dropped (before this round trip even starts) — a plain "error"
      // broadcast would leave the card stuck wherever it was dropped,
      // since nothing in that message says where it actually belongs.
      // Sending the issue's real (pre-move) sectionId back is what lets
      // the frontend put it back where it actually still is.
      socket.send(
        JSON.stringify({
          type: "move-rejected",
          issueId,
          sectionId: issue.sectionId,
          message: !hasApproval
            ? "Approve the plan before marking this ticket done"
            : "This ticket still has an unresolved dependency",
        }),
      );
      return;
    }
  }

  const moved = await prisma.issue.update({
    where: { id: issueId },
    data: {
      sectionId,
      position: await nextPosition(sectionId),
      ...(movedIntoCompleted ? { status: "DONE" } : {}),
    },
  });

  await publishToBoard(ctx.boardId, { type: "issue-moved", issue: moved });

  // Contract diff + READY-unblocking, step 6: only relevant the moment a
  // ticket actually becomes DONE, not on every move.
  if (movedIntoCompleted) {
    await resolveDependenciesOnDone(moved.id, moved.plan, ctx.boardId);
  }
};
