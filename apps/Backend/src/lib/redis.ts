import Redis from "ioredis";

// One shared connection, reused by both the rate-limit check and the job
// queue below — not two separate clients for two separate concerns.
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  // BullMQ requires this on any connection it's handed.
  maxRetriesPerRequest: null,
});
