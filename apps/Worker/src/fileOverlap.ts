import { prisma } from "@repo/db";

// "Still relevant" statuses only — a DONE ticket's intendedFiles describe
// work that already landed, not a conflict waiting to happen; READY sits
// between "plan approved" and "actually being built," which is exactly
// where a real file collision still matters.
const RELEVANT_STATUSES = ["OPEN", "PLANNING", "BLOCKED"] as const;

export interface OverlappingIssue {
  id: string;
  title: string;
  sharedFiles: string[];
}

// Given a board and the file list one ticket's plan just declared, find
// every OTHER still-relevant ticket on that board whose own intendedFiles
// shares at least one path. File/module granularity only — there's no real
// code yet at plan time to predict a line-level conflict, so this is
// explicitly a human decision point (the frontend banner), never a block.
export async function findOverlappingIssues(
  boardId: string,
  excludeIssueId: string,
  files: string[],
): Promise<OverlappingIssue[]> {
  if (files.length === 0) return [];

  const candidates = await prisma.issue.findMany({
    where: {
      boardId,
      id: { not: excludeIssueId },
      status: { in: [...RELEVANT_STATUSES] },
      intendedFiles: { hasSome: files },
    },
    select: { id: true, title: true, intendedFiles: true },
  });

  return candidates.map((c) => ({
    id: c.id,
    title: c.title,
    sharedFiles: c.intendedFiles.filter((f) => files.includes(f)),
  }));
}
