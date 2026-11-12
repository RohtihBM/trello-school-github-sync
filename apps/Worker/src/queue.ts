import { Queue } from "bullmq";
import Redis from "ioredis";

// A producer, not a consumer — the Worker's own `Worker` instance in
// index.ts is what CONSUMES "plan-generation" jobs; this is for the one
// place the Worker itself needs to enqueue a NEW job rather than just
// process one: processDependencyCheck auto-continuing straight into plan
// generation once it's established there's no dependency to pause on.
// Same queue name as apps/Backend/src/lib/queue.ts on purpose — there's
// no shared package between the two apps, so this string has to be kept
// in sync by hand, not imported.
export const PLAN_GENERATION_QUEUE_NAME = "plan-generation";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const planGenerationQueue = new Queue(PLAN_GENERATION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});
