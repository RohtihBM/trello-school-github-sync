-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PLANNING', 'BLOCKED', 'READY', 'DONE');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "status" "TicketStatus" NOT NULL DEFAULT 'OPEN';

