import type { WebSocket } from "ws";
import { redis } from "./lib/redis.js";

export interface ConnectedUser {
  userId: string;
  email: string;
}

// Local-only: just the actual socket objects THIS process is holding. A
// socket can never be shared across processes, so this map stays
// per-instance even with Redis in the picture — it exists purely so
// broadcastToBoard knows which real connections, on THIS process, to
// write bytes to. Redis (below) is the shared source of truth for
// presence itself, which is a different concern from "who do I have a
// live connection to."
const localSockets = new Map<string, Map<string, WebSocket>>();

function presenceKey(boardId: string) {
  return `board:${boardId}:users`;
}

export async function joinBoard(
  boardId: string,
  user: ConnectedUser & { socket: WebSocket },
) {
  let room = localSockets.get(boardId);
  if (!room) {
    room = new Map();
    localSockets.set(boardId, room);
  }
  room.set(user.userId, user.socket);

  // Shared across every Websockets instance — this is what lets a client
  // connected to instance 2 show up in the presence list sent to a client
  // that just joined on instance 1.
  await redis.hset(presenceKey(boardId), user.userId, JSON.stringify({
    userId: user.userId,
    email: user.email,
  }));
}

export async function leaveBoard(boardId: string, userId: string) {
  const room = localSockets.get(boardId);
  if (room) {
    room.delete(userId);
    if (room.size === 0) {
      localSockets.delete(boardId);
    }
  }
  await redis.hdel(presenceKey(boardId), userId);
}

export async function getBoardUsers(boardId: string): Promise<ConnectedUser[]> {
  const raw = await redis.hgetall(presenceKey(boardId));
  return Object.values(raw).map((v) => JSON.parse(v));
}

// Unchanged in spirit from before Redis was introduced: sends only to
// sockets THIS process actually holds. The fix for cross-instance delivery
// isn't here — it's that every write path now goes through publishToBoard
// (pubsub.ts) first, which every instance's subscriber turns back into a
// call to this exact function, for its own local sockets.
export function broadcastToBoard(
  boardId: string,
  message: unknown,
  excludeUserId?: string,
) {
  const room = localSockets.get(boardId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const [userId, socket] of room) {
    if (userId === excludeUserId) continue;
    socket.send(payload);
  }
}
