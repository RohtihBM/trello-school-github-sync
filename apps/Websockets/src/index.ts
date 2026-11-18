import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { prisma, installCrashGuard } from "@repo/db";
import { getJwtSecret } from "./lib/jwt.js";
import { joinBoard, leaveBoard, getBoardUsers } from "./rooms.js";
import { publishToBoard, startBoardSubscriber } from "./pubsub.js";
import {
  handleDeleteIssue,
  handleMoveIssue,
  type ActionHandler,
  type ClientMessage,
} from "./handlers.js";
import { handleInternalRequest } from "./internal.js";

installCrashGuard("Websockets");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;

// One http.Server backs both the public WebSocket upgrade and the
// internal broadcast endpoint — see internal.ts for why this is no
// longer two separate servers on two separate ports.
const httpServer = createServer(handleInternalRequest);
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => {
  console.log(`Websocket server listening on ws://localhost:${PORT}`);
});
startBoardSubscriber();

interface JoinMessage {
  type: "join";
  boardId: string;
  token: string;
}

// Message types a client can send once it has joined a board.
// A Map (not a plain object) so a type like "constructor" can't match by accident.
const actionHandlers = new Map<string, ActionHandler>([
  ["delete-issue", handleDeleteIssue],
  ["move-issue", handleMoveIssue],
]);

// Remembers which board/user a socket joined, so we can clean up on disconnect.
const socketBoard = new WeakMap<WebSocket, { boardId: string; userId: string }>();

wss.on("connection", (socket) => {
  socket.on("message", async (data) => {
    let message: { type?: string };
    try {
      message = JSON.parse(data.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      return;
    }

    if (message.type === "join") {
      await handleJoin(socket, message as JoinMessage);
      return;
    }

    const action = message.type ? actionHandlers.get(message.type) : undefined;
    if (action) {
      const ctx = socketBoard.get(socket);
      if (!ctx) {
        socket.send(
          JSON.stringify({ type: "error", message: "join a board first" }),
        );
        return;
      }

      try {
        await action(socket, ctx, message as ClientMessage);
      } catch (err) {
        console.error(`failed to handle ${message.type}:`, err);
        socket.send(
          JSON.stringify({ type: "error", message: "something went wrong" }),
        );
      }
      return;
    }

    socket.send(
      JSON.stringify({
        type: "error",
        message: `unknown message type: ${message.type}`,
      }),
    );
  });

  socket.on("close", async () => {
    const joined = socketBoard.get(socket);
    if (!joined) return;
    try {
      await leaveBoard(joined.boardId, joined.userId);
      await publishToBoard(joined.boardId, {
        type: "user-left",
        userId: joined.userId,
      });
    } catch (err) {
      console.error("failed to handle socket close:", err);
    }
  });
});

async function handleJoin(socket: WebSocket, message: JoinMessage) {
  const { boardId, token } = message;

  if (typeof boardId !== "string" || typeof token !== "string") {
    socket.send(
      JSON.stringify({
        type: "error",
        message: "boardId and token are required",
      }),
    );
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    userId = payload.userId;
  } catch {
    socket.send(
      JSON.stringify({ type: "error", message: "invalid or expired token" }),
    );
    return;
  }

  const boardRow = await prisma.board.findUnique({
    where: { id: boardId },
    include: { repository: { select: { fullName: true } } },
  });
  const board = boardRow && { ...boardRow, repository: boardRow.repository?.fullName ?? null };
  if (!board) {
    socket.send(JSON.stringify({ type: "error", message: "board not found" }));
    return;
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId: board.orgId } },
  });
  if (!membership) {
    socket.send(
      JSON.stringify({
        type: "error",
        message: "you are not a member of this organisation",
      }),
    );
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    socket.send(JSON.stringify({ type: "error", message: "user not found" }));
    return;
  }

  const sections = await prisma.section.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    include: {
      issues: {
        orderBy: { position: "asc" },
        include: {
          planMessages: { orderBy: { createdAt: "asc" } },
          dependsOn: {
            include: { blocker: { select: { id: true, title: true, status: true } } },
          },
          assignees: { include: { user: { select: { id: true, email: true } } } },
        },
      },
    },
  });

  // The client may have disconnected while the queries above were in flight;
  // the "close" handler already ran and found no room entry to clean up, so
  // joining now would leave a permanently stale, dead socket in the room.
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  // One socket can only be "in" one board room at a time. If it had already
  // joined a different board (e.g. the user navigated to another board in
  // the same SPA tab without closing the connection), leave that room first
  // — otherwise it'd stay registered there forever with a dead reference,
  // since socketBoard is about to be overwritten to point at the new board.
  const previous = socketBoard.get(socket);
  if (previous && previous.boardId !== boardId) {
    await leaveBoard(previous.boardId, previous.userId);
    await publishToBoard(previous.boardId, {
      type: "user-left",
      userId: previous.userId,
    });
  }

  await joinBoard(boardId, { userId, email: user.email, socket });
  socketBoard.set(socket, { boardId, userId });

  const connectedUsers = await getBoardUsers(boardId);

  socket.send(
    JSON.stringify({
      type: "board-state",
      board,
      sections,
      users: connectedUsers,
    }),
  );

  await publishToBoard(
    boardId,
    { type: "user-joined", user: { userId, email: user.email } },
    userId,
  );
}
