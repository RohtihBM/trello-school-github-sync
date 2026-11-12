import { prisma } from "@repo/db";
import { publishToBoard } from "../pubsub.js";

// Runs once, right after handleMoveIssue flips a ticket to DONE. Two jobs:
//
//   1. Contract diff — for every TicketDependency where the finished ticket
//      is the blocker, compare what it actually turned into (its own `plan`,
//      read straight from Postgres — never a fresh Claude call) against what
//      the blocked ticket originally assumed it would get back in step 4.
//      Flag + broadcast a mismatch so the human can see it.
//   2. Unblock — for every ticket that was waiting on this one, check if it
//      now has zero remaining non-DONE blockers. If so, flip it to READY.
//      This is the only place BLOCKED has a way back out anywhere in the app.
export async function resolveDependenciesOnDone(
  doneIssueId: string,
  doneIssuePlan: string | null,
  boardId: string,
) {
  const actualContract = doneIssuePlan;

  const dependentEdges = await prisma.ticketDependency.findMany({
    where: { blockerId: doneIssueId },
  });

  for (const edge of dependentEdges) {
    // Both sides must actually have text to compare — a null assumedContract
    // can't happen (step 4 requires it), but actualContract can be null if
    // the blocker ticket went DONE without ever having a plan generated.
    const mismatchFlag =
      edge.assumedContract !== null &&
      actualContract !== null &&
      edge.assumedContract.trim() !== actualContract.trim();

    await prisma.ticketDependency.update({
      where: { id: edge.id },
      data: { actualContract, mismatchFlag },
    });

    if (mismatchFlag) {
      await publishToBoard(boardId, {
        type: "dependency-mismatch",
        blockedId: edge.blockedId,
        blockerId: edge.blockerId,
        assumedContract: edge.assumedContract,
        actualContract,
      });
    }
  }

  // A ticket can depend on more than one blocker, so dedupe before checking —
  // no point re-checking the same blockedId twice in one pass.
  const uniqueBlockedIds = [...new Set(dependentEdges.map((e) => e.blockedId))];

  for (const blockedId of uniqueBlockedIds) {
    const blocked = await prisma.issue.findUnique({ where: { id: blockedId } });
    // Only a ticket actually sitting in BLOCKED can be promoted out of it —
    // guards against ever overwriting some other status (e.g. if it was
    // somehow already DONE itself) just because its blockers resolved.
    if (!blocked || blocked.status !== "BLOCKED") continue;

    const allEdgesForBlocked = await prisma.ticketDependency.findMany({
      where: { blockedId },
      include: { blocker: true },
    });

    const stillBlocked = allEdgesForBlocked.some(
      (edge) => edge.blocker.status !== "DONE",
    );

    if (!stillBlocked) {
      // READY means BOTH "no open blockers" AND "plan approved" — per the
      // architecture doc's own TicketStatus comment, not just the former.
      // Clearing dependencies alone doesn't make something READY if a
      // human never approved the plan; it just means there's no longer a
      // dependency reason to stay BLOCKED, so it falls back to whatever
      // status a ticket with no blockers would otherwise have.
      const hasApproval =
        (await prisma.approvalRecord.count({ where: { issueId: blockedId } })) > 0;
      const newStatus = hasApproval ? "READY" : blocked.plan ? "PLANNING" : "OPEN";

      const unblocked = await prisma.issue.update({
        where: { id: blockedId },
        data: { status: newStatus },
      });
      await publishToBoard(boardId, { type: "issue-updated", issue: unblocked });
    }
  }
}
