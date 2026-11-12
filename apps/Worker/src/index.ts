import "dotenv/config";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { prisma, installCrashGuard } from "@repo/db";
import { processPlanJob, processChatMessage, processDependencyCheck } from "./processPlanJob.js";
import { notifyBoard } from "./notifyBoard.js";

installCrashGuard("Worker");

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "plan-generation",
  async (job) => {
    // job.name is the string passed as the queue.add(...) first argument —
    // "generate-plan" vs "chat" in apps/Backend/src/routes/plan.ts — not
    // something stored on the PlanGenerationJob row itself.
    if (job.name === "chat") {
      const { jobId, message } = job.data as { jobId: string; message: string };
      await processChatMessage(jobId, message);
    } else if (job.name === "check-dependency") {
      const { jobId } = job.data as { jobId: string };
      await processDependencyCheck(jobId);
    } else {
      const { jobId } = job.data as { jobId: string };
      await processPlanJob(jobId);
    }
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`job ${job.id} completed`);
});

// This fires on EVERY failed attempt, including ones BullMQ is about to
// retry — verified directly from bullmq's own source before writing this.
// Only mark the Postgres row permanently FAILED once attemptsMade has
// actually reached the configured max (set in apps/Backend/src/lib/queue.ts).
worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`job ${job.id} attempt failed:`, err.message);

  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= maxAttempts) {
    const { jobId } = job.data as { jobId: string };
    try {
      const failedJob = await prisma.planGenerationJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: err.message },
        include: { issue: true },
      });
      console.error(`job ${job.id} permanently failed after ${maxAttempts} attempts`);

      // Without this, the frontend's "generating..." state would spin
      // forever — nothing else ever tells it the request actually failed.
      await notifyBoard(failedJob.issue.boardId, {
        type: "job-failed",
        issueId: failedJob.issueId,
        error: err.message,
      });
    } catch (updateErr) {
      // A stale/orphaned queue entry (its Postgres row already gone) must
      // not be allowed to throw here — that would be an unhandled rejection
      // inside an event handler, which crashes the ENTIRE worker process,
      // taking down every other job currently in flight along with it.
      console.error(`job ${job.id} row no longer exists, skipping:`, updateErr);
    }
  }
});

console.log("Worker ready — listening on the plan-generation queue");
