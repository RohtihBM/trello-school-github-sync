import "dotenv/config";
import { createServer } from "node:http";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { prisma, installCrashGuard } from "@repo/db";
import { processPlanJob, processChatMessage, processDependencyCheck } from "./processPlanJob.js";
import { notifyBoard } from "./notifyBoard.js";

installCrashGuard("Worker");

// This app has no real reason to listen on any HTTP port at all — it only
// ever reacts to BullMQ jobs over Redis. It's here purely because Render's
// free tier only covers "Web Service" deployments, not a real Background
// Worker (that starts at $7/month). A Web Service has to bind to $PORT or
// Render considers the deploy unhealthy, so this exists only to satisfy
// that check. The real consequence of pretending to be a web service: free
// web services SLEEP after 15 minutes with no HTTP traffic — and since
// nothing normally calls this, it would fall asleep almost immediately
// after deploying and stay asleep. Backend's queue.ts pings this exact
// endpoint right when it enqueues a job, specifically to wake it back up
// at the moment it's actually needed.
if (process.env.PORT) {
  createServer((_req, res) => {
    res.writeHead(200).end("ok");
  }).listen(Number(process.env.PORT), () => {
    console.log(`Worker health server listening on port ${process.env.PORT}`);
  });
}

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

// Found directly, not assumed: this step (marking the Postgres row
// FAILED and notifying the frontend) had zero retries of its own, unlike
// the actual job attempts above it (3 tries, exponential backoff, set in
// apps/Backend/src/lib/queue.ts). A brief DB connectivity blip at exactly
// this moment — confirmed happening live — meant the row never got
// marked FAILED and the frontend never got told, so its "generating..."
// state spun forever with no error shown and no way out except a page
// refresh. Retrying this specific step (separately from, and after, the
// job's own retries) is what closes that gap.
async function markJobFailedAndNotify(jobId: string, errMessage: string, attempt = 1): Promise<void> {
  try {
    const failedJob = await prisma.planGenerationJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: errMessage },
      include: { issue: true },
    });
    await notifyBoard(failedJob.issue.boardId, {
      type: "job-failed",
      issueId: failedJob.issueId,
      error: errMessage,
    });
  } catch (updateErr) {
    if (attempt < 3) {
      console.error(
        `job ${jobId}: failed to record/notify (attempt ${attempt}/3), retrying:`,
        updateErr,
      );
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return markJobFailedAndNotify(jobId, errMessage, attempt + 1);
    }
    // Genuinely out of options at this point (DB unreachable across all
    // 3 attempts, or the row really is gone) — must not throw here, since
    // that would be an unhandled rejection inside an event handler,
    // crashing the ENTIRE worker process and taking every other
    // in-flight job down with it.
    console.error(`job ${jobId}: giving up after ${attempt} attempts:`, updateErr);
  }
}

// This fires on EVERY failed attempt, including ones BullMQ is about to
// retry — verified directly from bullmq's own source before writing this.
// Only mark the Postgres row permanently FAILED once attemptsMade has
// actually reached the configured max.
worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`job ${job.id} attempt failed:`, err.message);

  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= maxAttempts) {
    const { jobId } = job.data as { jobId: string };
    await markJobFailedAndNotify(jobId, err.message);
  }
});

console.log("Worker ready — listening on the plan-generation queue");
