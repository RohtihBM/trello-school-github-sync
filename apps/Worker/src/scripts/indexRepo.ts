import { chunkFiles } from "../chunks.js";
import { chunkHash, EMBEDDING_MODEL, ensureEmbedded } from "../embeddings.js";
import { ensureRepoCloned } from "../repoClone.js";
import { loadSourceFiles } from "../repoContext.js";
import { countVectors, pruneVectors } from "../vectorStore.js";

// Keeps the vectors in Postgres (pgvector) in step with the code. Safe to run
// as often as you like: only chunks whose text is new get embedded.
//
//   npx tsx src/scripts/indexRepo.ts
//
// REPO_PATH  index this checkout instead of the Worker's own clone (CI sets it)
// PRUNE=1    also delete stored vectors that no chunk in this checkout uses

async function main() {
  const repoPath = process.env.REPO_PATH ?? (await ensureRepoCloned());
  const started = Date.now();

  const files = await loadSourceFiles(repoPath);
  const chunks = chunkFiles(files);
  const report = await ensureEmbedded(chunks, true);

  console.log(
    `${files.length} files -> ${report.chunks} chunks (${report.uniqueChunks} unique). ` +
      `Already stored: ${report.alreadyStored}. Embedded now: ${report.embeddedNow}. ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  if (process.env.PRUNE === "1") {
    const removed = await pruneVectors(EMBEDDING_MODEL, [...new Set(chunks.map(chunkHash))]);
    console.log(`Pruned ${removed} vectors no chunk uses any more.`);
  }

  console.log(`Vectors stored for ${EMBEDDING_MODEL}: ${await countVectors(EMBEDDING_MODEL)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
