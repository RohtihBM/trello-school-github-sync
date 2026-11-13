import { redis } from "./redis.js";

// Named "claude-call", not "plan-gen" — this same counter will also cover
// chat messages once that's built, since both cost real, billed API usage.
//
// Raised from 10 to 50 (2026-11-12): confirmed these calls run through a
// Claude Code subscription login, not metered per-token API billing (no
// ANTHROPIC_API_KEY configured anywhere), so the original cap was bounding
// subscription usage during active development/testing far more
// aggressively than actually needed for a personal project.
const DAILY_CLAUDE_CALL_LIMIT = 50;

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
