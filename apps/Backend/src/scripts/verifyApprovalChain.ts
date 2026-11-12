import { prisma } from "@repo/db";

// This is the actual point of phase 6: a tamper-evident log is only
// meaningful if something can actually walk it and prove whether it's
// intact, rather than everyone just trusting the rows in Postgres by
// construction. Run as: npx tsx src/scripts/verifyApprovalChain.ts <boardId>
async function verifyApprovalChain(boardId: string): Promise<boolean> {
  const records = await prisma.approvalRecord.findMany({
    where: { issue: { boardId } },
    orderBy: { createdAt: "asc" },
    include: { issue: { select: { title: true } } },
  });

  if (records.length === 0) {
    console.log(`No ApprovalRecords for board ${boardId}.`);
    return true;
  }

  let ok = true;
  let expectedPreviousHash: string | null = null;

  for (const [index, record] of records.entries()) {
    const position = index + 1;
    if (record.previousHash !== expectedPreviousHash) {
      console.error(
        `BROKEN at record ${position} (id=${record.id}, ticket="${record.issue.title}"): ` +
          `expected previousHash=${expectedPreviousHash}, found ${record.previousHash}`,
      );
      ok = false;
      // Keep walking (don't stop at the first break) — a tampered record
      // early in the chain would otherwise hide whether anything AFTER it
      // was also altered, and the whole point of this script is to show
      // the real extent of the damage, not just the first symptom.
    } else {
      console.log(`OK record ${position} (id=${record.id}, ticket="${record.issue.title}")`);
    }
    expectedPreviousHash = record.contentHash;
  }

  console.log(ok ? "\nChain intact." : "\nChain BROKEN — see above.");
  return ok;
}

const boardId = process.argv[2];
if (!boardId) {
  console.error("usage: npx tsx src/scripts/verifyApprovalChain.ts <boardId>");
  process.exit(1);
}

verifyApprovalChain(boardId)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
