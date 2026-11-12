-- CreateTable
CREATE TABLE "PlanMessage" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanMessage_issueId_idx" ON "PlanMessage"("issueId");

-- AddForeignKey
ALTER TABLE "PlanMessage" ADD CONSTRAINT "PlanMessage_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

