import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Ordinary commands (HSET/HDEL/HGETALL/PUBLISH) — one shared connection,
// same pattern Backend uses for its rate limiter + job queue.
export const redis = new Redis(REDIS_URL);

// A SEPARATE connection, used only for PSUBSCRIBE. Once a client issues
// (P)SUBSCRIBE, Redis puts that connection into a mode where it can only
// receive published messages — it can no longer run ordinary commands on
// the same connection. Sharing one client for both would break HSET/HDEL
// the moment the subscriber starts listening.
export const redisSub = new Redis(REDIS_URL);
