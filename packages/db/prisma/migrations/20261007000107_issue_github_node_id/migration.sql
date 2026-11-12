-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "githubNodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Issue_githubNodeId_key" ON "Issue"("githubNodeId");

