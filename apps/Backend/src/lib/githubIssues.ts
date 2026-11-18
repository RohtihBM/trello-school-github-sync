import { prisma } from "@repo/db";

// Shared by the webhook (one issue at a time, as GitHub sends them) and the
// "sync now" import (a repository's open issues in one go), so both create a
// ticket in exactly the same way.

export interface GitHubIssueInput {
  githubNodeId: string;
  title: string;
  description: string | null;
}

// The board whose tickets come from this repository. If several boards are
// linked to one repository, the oldest one receives its issues.
export async function boardIdForRepository(fullName: string): Promise<string | null> {
  const repository = await prisma.repository.findFirst({
    where: { fullName: { equals: fullName, mode: "insensitive" } },
    include: { boards: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } },
  });
  return repository?.boards[0]?.id ?? null;
}

// Creates the ticket in the board's Todo section, or updates it if this GitHub
// issue was already imported. Returns whether it was newly created.
export async function upsertGitHubIssue(boardId: string, input: GitHubIssueInput) {
  const todoSection = await prisma.section.findFirst({ where: { boardId, title: "Todo" } });
  if (!todoSection) return null;

  const existing = await prisma.issue.findUnique({ where: { githubNodeId: input.githubNodeId } });

  // Not a plain count: positions have gaps once issues get deleted, so "how
  // many issues exist" can collide with a position already in use. "highest
  // position + 1" is the correct next slot, same fix as in the Websockets app.
  const { _max } = await prisma.issue.aggregate({
    where: { sectionId: todoSection.id },
    _max: { position: true },
  });

  const issue = await prisma.issue.upsert({
    where: { githubNodeId: input.githubNodeId },
    update: { title: input.title, description: input.description },
    create: {
      title: input.title,
      description: input.description,
      githubNodeId: input.githubNodeId,
      position: (_max.position ?? -1) + 1,
      boardId,
      sectionId: todoSection.id,
    },
  });
  return { issue, created: !existing };
}
