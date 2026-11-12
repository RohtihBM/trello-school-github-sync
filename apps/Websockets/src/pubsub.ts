import { redis, redisSub } from "./lib/redis.js";
import { broadcastToBoard } from "./rooms.js";

const CHANNEL_PREFIX = "board:";
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`;

// The actual fix this phase exists for: with a single Websockets instance,
// calling broadcastToBoard directly was indistinguishable from doing this
// correctly, because every client was always on the same process. The
// moment there's a second instance, an action handled by instance 1 (a
// move-issue message, or an internal HTTP push from Backend/Worker) would
// never reach a client connected to instance 2. Every write path that used
// to call broadcastToBoard directly now calls this instead.
export async function publishToBoard(
  boardId: string,
  message: unknown,
  excludeUserId?: string,
) {
  await redis.publish(
    `${CHANNEL_PREFIX}${boardId}`,
    JSON.stringify({ message, excludeUserId }),
  );
}

// Called once at startup. Every instance subscribes to every board's
// channel (a pattern, not per-board subscribe/unsubscribe churn as boards
// get joined/left) and, on receipt, calls the existing, UNCHANGED
// broadcastToBoard — which only ever touches this process's own
// locally-held sockets. Redis delivers a published message to every
// subscriber, publisher included, so the instance that originated the
// event gets it back through this same path too — there is no separate
// "broadcast locally AND publish" branch anywhere.
export function startBoardSubscriber() {
  redisSub.psubscribe(CHANNEL_PATTERN);
  redisSub.on("pmessage", (_pattern, channel, raw) => {
    const boardId = channel.slice(CHANNEL_PREFIX.length);
    try {
      const { message, excludeUserId } = JSON.parse(raw);
      broadcastToBoard(boardId, message, excludeUserId);
    } catch (err) {
      console.error("failed to handle a published board message:", err);
    }
  });
}
