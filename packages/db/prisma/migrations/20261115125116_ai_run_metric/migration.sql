-- CreateTable
CREATE TABLE "AiRunMetric" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'agentic',
    "model" TEXT NOT NULL,
    "issueId" TEXT,
    "jobId" TEXT,
    "turns" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL,
    "cacheCreationTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRunMetric_kind_createdAt_idx" ON "AiRunMetric"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunMetric_issueId_idx" ON "AiRunMetric"("issueId");
