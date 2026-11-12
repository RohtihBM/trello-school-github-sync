-- CreateTable
CREATE TABLE "PendingInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingInvite_orgId_idx" ON "PendingInvite"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingInvite_email_orgId_key" ON "PendingInvite"("email", "orgId");

-- AddForeignKey
ALTER TABLE "PendingInvite" ADD CONSTRAINT "PendingInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
