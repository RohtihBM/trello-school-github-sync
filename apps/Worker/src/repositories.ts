import { parseGitHubRepo, prisma } from "@repo/db";

// The repository a script works on when none is named.
export const DEFAULT_REPO = "RohtihBM/trello-school-github-sync";

// Finds a repository by "owner/name" or GitHub URL (ignoring letter case, as
// GitHub does), creating the record the first time it is seen.
export async function findOrCreateRepository(input: string) {
  const parsed = parseGitHubRepo(input);
  if (!parsed) throw new Error(`not a GitHub repository: ${input}`);

  const existing = await prisma.repository.findFirst({
    where: { fullName: { equals: parsed.fullName, mode: "insensitive" } },
  });
  if (existing) return existing;

  return prisma.repository.create({
    data: { fullName: parsed.fullName, cloneUrl: parsed.cloneUrl },
  });
}
