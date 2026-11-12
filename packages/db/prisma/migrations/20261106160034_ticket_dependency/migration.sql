-- CreateTable
CREATE TABLE "TicketDependency" (
    "id" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "assumedContract" TEXT,
    "actualContract" TEXT,
    "mismatchFlag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TicketDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketDependency_blockedId_blockerId_key" ON "TicketDependency"("blockedId", "blockerId");

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

