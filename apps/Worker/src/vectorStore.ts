import { Prisma, prisma } from "@repo/db";

// Raw SQL on purpose: Prisma's typed client cannot read or write the
// pgvector column. Every value goes in as a bound parameter, never into the
// SQL text. Vectors are stored normalised, so pgvector's cosine distance
// operator (<=>) ranks them the same way the dot product would.

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// Which of these fingerprints already have a stored vector for this model?
export async function existingHashes(
  repositoryId: string,
  hashes: string[],
  model: string,
): Promise<Set<string>> {
  const found = new Set<string>();
  const BATCH = 2000;
  for (let i = 0; i < hashes.length; i += BATCH) {
    const slice = hashes.slice(i, i + BATCH);
    const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
      SELECT hash FROM "CodeChunkEmbedding"
      WHERE "repositoryId" = ${repositoryId} AND model = ${model} AND hash = ANY(${slice}::text[])`;
    for (const r of rows) found.add(r.hash);
  }
  return found;
}

export async function saveVectors(
  repositoryId: string,
  model: string,
  rows: Array<{ hash: string; vector: number[] }>,
): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map((r) => Prisma.sql`(${repositoryId}, ${r.hash}, ${model}, ${toVectorLiteral(r.vector)}::vector)`);
    // A fingerprint already stored for this repository is simply left alone.
    await prisma.$executeRaw`
      INSERT INTO "CodeChunkEmbedding" ("repositoryId", hash, model, embedding)
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("repositoryId", hash) DO NOTHING`;
  }
}

// The fingerprints closest to the query vector, best first, limited to the
// chunks that exist in the current checkout. At this scale Postgres compares
// against every row, which is instant; an ANN index only matters at tens of
// thousands of chunks.
export async function searchSimilar(
  repositoryId: string,
  queryVector: number[],
  hashes: string[],
  model: string,
  topK: number,
): Promise<string[]> {
  const literal = toVectorLiteral(queryVector);
  const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
    SELECT hash FROM "CodeChunkEmbedding"
    WHERE "repositoryId" = ${repositoryId} AND model = ${model} AND hash = ANY(${hashes}::text[])
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${topK}`;
  return rows.map((r) => r.hash);
}

// Drops stored vectors of ONE repository that no chunk in its current checkout
// refers to any more, so the table does not grow with every edit. Scoped by
// repository on purpose: pruning one repository must never touch another's.
export async function pruneVectors(
  repositoryId: string,
  model: string,
  keepHashes: string[],
): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "CodeChunkEmbedding"
    WHERE "repositoryId" = ${repositoryId} AND model = ${model}
      AND NOT (hash = ANY(${keepHashes}::text[]))`;
}

export async function countVectors(repositoryId: string, model: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "CodeChunkEmbedding"
    WHERE "repositoryId" = ${repositoryId} AND model = ${model}`;
  return Number(rows[0]?.n ?? 0);
}
