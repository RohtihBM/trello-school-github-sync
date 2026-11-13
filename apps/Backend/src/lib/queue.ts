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

// Only set when deployed on Render's free tier — see apps/Worker/src/index.ts
// for why the Worker pretends to be a web service at all. Locally this env
// var is unset, so wakeWorker() below is a no-op and nothing changes about
// local dev. Not awaited at call sites — a slow or failed wake ping must
// never block or fail job creation, since the job sits durably in Redis
// either way and the Worker will eventually pick it up regardless.
const WORKER_WAKE_URL = process.env.WORKER_WAKE_URL;

function wakeWorker(): void {
  if (!WORKER_WAKE_URL) return;
  fetch(WORKER_WAKE_URL).catch((err) => {
    console.error("failed to ping Worker to wake it:", err);
  });
}

// Every real enqueue should go through this, not planGenerationQueue.add()
// directly — centralizing the wake-ping here means it's impossible to add
// a new job type later and forget it.
export async function enqueuePlanJob(
  name: "generate-plan" | "check-dependency" | "chat",
  data: Record<string, unknown>,
) {
  wakeWorker();
  return planGenerationQueue.add(name, data);
}
