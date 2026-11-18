import { createHash } from "node:crypto";
import type { Chunk } from "./chunks.js";
import { existingHashes, saveVectors, searchSimilar } from "./vectorStore.js";

// A small general-purpose embedding model that runs inside this process: no
// account, no API key and no per-call cost. 384 dimensions. Not code
// specific, which is the trade-off against a hosted code model.
export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const BATCH_SIZE = 16;

type Extractor = (
  texts: string[],
  options: { pooling: "cls"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

// Loaded lazily and imported dynamically: the package is an optional
// dependency, so a deployment without it keeps working on keyword retrieval.
async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" })) as unknown as Extractor;
    })();
  }
  return extractorPromise;
}

export async function embedTexts(texts: string[], kind: "passage" | "query"): Promise<number[][]> {
  const extractor = await getExtractor();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => (kind === "query" ? QUERY_PREFIX + t : t));
    const result = await extractor(batch, { pooling: "cls", normalize: true });
    out.push(...result.tolist());
  }
  return out;
}

// What actually gets embedded for a chunk: its path gives the model the file
// context the chunk's own text may not carry.
function chunkText(chunk: Chunk): string {
  return `${chunk.path}\n${chunk.content}`;
}

// The fingerprint a vector is stored under: it changes when the model or the
// chunk's path or text changes, and not when the chunk merely moves lines.
export function chunkHash(chunk: Chunk): string {
  return createHash("sha1").update(EMBEDDING_MODEL).update("\0").update(chunkText(chunk)).digest("hex");
}

export interface EmbedReport {
  chunks: number;
  uniqueChunks: number;
  alreadyStored: number;
  missing: number;
  embeddedNow: number;
}

// Makes sure every chunk of this repository has a vector in Postgres. With allowEmbedding false
// (a small server) it only reports what is missing and never loads the model.
export async function ensureEmbedded(
  repositoryId: string,
  chunks: Chunk[],
  allowEmbedding: boolean,
): Promise<EmbedReport> {
  const byHash = new Map<string, Chunk>();
  for (const c of chunks) byHash.set(chunkHash(c), c);

  const have = await existingHashes(repositoryId, [...byHash.keys()], EMBEDDING_MODEL);
  const missing = [...byHash.entries()].filter(([hash]) => !have.has(hash));

  let embeddedNow = 0;
  if (allowEmbedding && missing.length > 0) {
    const GROUP = 64;
    for (let i = 0; i < missing.length; i += GROUP) {
      const group = missing.slice(i, i + GROUP);
      const vectors = await embedTexts(group.map(([, c]) => chunkText(c)), "passage");
      await saveVectors(
        repositoryId,
        EMBEDDING_MODEL,
        group.map(([hash], j) => ({ hash, vector: vectors[j] ?? [] })).filter((r) => r.vector.length > 0),
      );
      embeddedNow += group.length;
    }
  }

  return {
    chunks: chunks.length,
    uniqueChunks: byHash.size,
    alreadyStored: have.size,
    missing: missing.length,
    embeddedNow,
  };
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text.slice(0, 2000)], "query");
  return v ?? [];
}

// Chunk keys ranked by similarity to the ticket, best first, using pgvector
// inside Postgres. Chunks with no stored vector simply do not appear, so the
// caller's keyword ranking still covers them.
export async function vectorRanking(
  repositoryId: string,
  queryText: string,
  chunks: Chunk[],
  topK = 80,
): Promise<string[]> {
  const keysByHash = new Map<string, string[]>();
  for (const c of chunks) {
    const h = chunkHash(c);
    keysByHash.set(h, [...(keysByHash.get(h) ?? []), c.key]);
  }
  const best = await searchSimilar(
    repositoryId,
    await embedQuery(queryText),
    [...keysByHash.keys()],
    EMBEDDING_MODEL,
    topK,
  );
  return best.flatMap((h) => keysByHash.get(h) ?? []);
}
