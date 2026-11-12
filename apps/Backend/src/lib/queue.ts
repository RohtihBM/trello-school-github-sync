import { Queue } from "bullmq";
import { redis } from "./redis.js";

// This exact name has to match what apps/Worker listens on — there's no
// shared package between them, so a typo here would silently mean jobs get
// created but nothing ever picks them up.
export const PLAN_GENERATION_QUEUE_NAME = "plan-generation";

export const planGenerationQueue = new Queue(PLAN_GENERATION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // BullMQ retries automatically on this schedule if the processor throws;
    // the worker still has to check job.attemptsMade before deciding this
    // was the FINAL failure, since its "failed" event fires on every single
    // attempt, including ones that are about to be retried.
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});
