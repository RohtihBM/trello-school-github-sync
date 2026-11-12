-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "claudeSessionId" TEXT,
ADD COLUMN     "intendedFiles" TEXT[],
ADD COLUMN     "plan" TEXT;

-- CreateTable
CREATE TABLE "PlanGenerationJob" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanGenerationJob_issueId_idx" ON "PlanGenerationJob"("issueId");

-- AddForeignKey
ALTER TABLE "PlanGenerationJob" ADD CONSTRAINT "PlanGenerationJob_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanGenerationJob" ADD CONSTRAINT "PlanGenerationJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

