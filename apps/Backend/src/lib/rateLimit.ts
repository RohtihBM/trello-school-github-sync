import { redis } from "./redis.js";

// Named "claude-call", not "plan-gen" — this same counter will also cover
// chat messages once that's built, since both cost real, billed API usage.
const DAILY_CLAUDE_CALL_LIMIT = 10;

export async function checkClaudeCallRateLimit(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // "2026-11-06"
  const key = `ratelimit:claude-call:${userId}:${today}`;

  const count = await redis.incr(key);
  if (count === 1) {
    // Only set the expiry on the first increment of the day — otherwise
    // every subsequent call would push the expiry further out, and the
    // counter would never actually reset.
    await redis.expire(key, 60 * 60 * 24);
  }

  return count <= DAILY_CLAUDE_CALL_LIMIT;
}
