import { Prisma, prisma } from "@repo/db";

// Raw SQL on purpose: Prisma's typed client cannot read or write the
// pgvector column. Every value goes in as a bound parameter, never into the
// SQL text. Vectors are stored normalised, so pgvector's cosine distance
// operator (<=>) ranks them the same way the dot product would.

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// Which of these fingerprints already have a stored vector for this model?
export async function existingHashes(hashes: string[], model: string): Promise<Set<string>> {
  const found = new Set<string>();
  const BATCH = 2000;
  for (let i = 0; i < hashes.length; i += BATCH) {
    const slice = hashes.slice(i, i + BATCH);
    const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
      SELECT hash FROM "CodeChunkEmbedding"
      WHERE model = ${model} AND hash = ANY(${slice}::text[])`;
    for (const r of rows) found.add(r.hash);
  }
  return found;
}

export async function saveVectors(
  model: string,
  rows: Array<{ hash: string; vector: number[] }>,
): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map((r) => Prisma.sql`(${r.hash}, ${model}, ${toVectorLiteral(r.vector)}::vector)`);
    // A fingerprint already stored for the same text is simply left alone.
    await prisma.$executeRaw`
      INSERT INTO "CodeChunkEmbedding" (hash, model, embedding)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (hash) DO NOTHING`;
  }
}

// The fingerprints closest to the query vector, best first, limited to the
// chunks that exist in the current checkout. At this scale Postgres compares
// against every row, which is instant; an ANN index only matters at tens of
// thousands of chunks.
export async function searchSimilar(
  queryVector: number[],
  hashes: string[],
  model: string,
  topK: number,
): Promise<string[]> {
  const literal = toVectorLiteral(queryVector);
  const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
    SELECT hash FROM "CodeChunkEmbedding"
    WHERE model = ${model} AND hash = ANY(${hashes}::text[])
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${topK}`;
  return rows.map((r) => r.hash);
}

// Drops stored vectors for this model that no chunk in the current checkout
// refers to any more, so the table does not grow with every edit.
export async function pruneVectors(model: string, keepHashes: string[]): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "CodeChunkEmbedding"
    WHERE model = ${model} AND NOT (hash = ANY(${keepHashes}::text[]))`;
}

export async function countVectors(model: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "CodeChunkEmbedding" WHERE model = ${model}`;
  return Number(rows[0]?.n ?? 0);
}
