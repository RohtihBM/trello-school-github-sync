import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Chunk } from "./chunks.js";

// A small general-purpose embedding model that runs inside this process: no
// account, no API key and no per-call cost. 384 dimensions. Not code
// specific, which is the trade-off against a hosted code model.
const MODEL = "Xenova/bge-small-en-v1.5";
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
      return (await pipeline("feature-extraction", MODEL, { dtype: "q8" })) as unknown as Extractor;
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

function contentKey(chunk: Chunk): string {
  return createHash("sha1").update(MODEL).update("\0").update(chunkText(chunk)).digest("hex");
}

type Cache = Record<string, number[]>;

function cachePath(repoPath: string): string {
  return path.resolve(repoPath, "..", "embeddings-cache.json");
}

function loadCache(repoPath: string): Cache {
  const file = cachePath(repoPath);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Cache;
  } catch {
    return {};
  }
}

// Returns one vector per chunk. Only chunks whose text has not been embedded
// before (by content hash) cost any work, so after the first run a push that
// changes two files re-embeds only the chunks inside those two files.
export async function embedChunks(
  repoPath: string,
  chunks: Chunk[],
): Promise<{ vectors: Map<string, number[]>; embeddedNow: number }> {
  const cache = loadCache(repoPath);
  const missing = chunks.filter((c) => !cache[contentKey(c)]);

  if (missing.length > 0) {
    const fresh = await embedTexts(missing.map(chunkText), "passage");
    missing.forEach((c, i) => {
      cache[contentKey(c)] = (fresh[i] ?? []).map((n) => Math.round(n * 1e5) / 1e5);
    });
    await mkdir(path.dirname(cachePath(repoPath)), { recursive: true });
    await writeFile(cachePath(repoPath), JSON.stringify(cache));
  }

  const vectors = new Map<string, number[]>();
  for (const c of chunks) vectors.set(c.key, cache[contentKey(c)] ?? []);
  return { vectors, embeddedNow: missing.length };
}

// Vectors are normalised, so the dot product is the cosine similarity.
export function vectorRanking(queryVector: number[], vectors: Map<string, number[]>, topK = 80): string[] {
  const scored: Array<[string, number]> = [];
  for (const [key, v] of vectors) {
    if (v.length !== queryVector.length) continue;
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += (v[i] ?? 0) * (queryVector[i] ?? 0);
    scored.push([key, dot]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([k]) => k);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text.slice(0, 2000)], "query");
  return v ?? [];
}
