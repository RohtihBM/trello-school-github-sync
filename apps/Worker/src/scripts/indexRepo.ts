import { chunkFiles } from "../chunks.js";
import { chunkHash, EMBEDDING_MODEL, ensureEmbedded } from "../embeddings.js";
import { DEFAULT_REPO, findOrCreateRepository } from "../repositories.js";
import { ensureRepoCloned } from "../repoClone.js";
import { loadSourceFiles } from "../repoContext.js";
import { countVectors, pruneVectors } from "../vectorStore.js";

// Keeps the vectors in Postgres (pgvector) for ONE repository in step with its
// code. Safe to run as often as you like: only chunks whose text is new get
// embedded.
//
//   npx tsx src/scripts/indexRepo.ts                       the default repository
//   REPO=RohtihBM/simple-chat npx tsx src/scripts/indexRepo.ts
//
// REPO       "owner/name" or a GitHub URL (default: the Trello-school repository)
// REPO_PATH  index this local checkout instead of cloning (used only when it is
//            the repository being run by GitHub Actions, GITHUB_REPOSITORY)
// PRUNE=1    also delete this repository's stored vectors no chunk uses any more

async function main() {
  const repository = await findOrCreateRepository(process.env.REPO ?? DEFAULT_REPO);
  const isThisWorkflowsRepo =
    process.env.GITHUB_REPOSITORY?.toLowerCase() === repository.fullName.toLowerCase();
  const repoPath =
    process.env.REPO_PATH && isThisWorkflowsRepo ? process.env.REPO_PATH : await ensureRepoCloned(repository);
  const started = Date.now();

  const files = await loadSourceFiles(repoPath);
  const chunks = chunkFiles(files);
  const report = await ensureEmbedded(repository.id, chunks, true);

  console.log(
    `${repository.fullName}: ${files.length} files -> ${report.chunks} chunks (${report.uniqueChunks} unique). ` +
      `Already stored: ${report.alreadyStored}. Embedded now: ${report.embeddedNow}. ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  if (process.env.PRUNE === "1") {
    const removed = await pruneVectors(repository.id, EMBEDDING_MODEL, [...new Set(chunks.map(chunkHash))]);
    console.log(`Pruned ${removed} vectors of ${repository.fullName} that no chunk uses any more.`);
  }

  console.log(`Vectors stored for ${repository.fullName} (${EMBEDDING_MODEL}): ${await countVectors(repository.id, EMBEDDING_MODEL)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
