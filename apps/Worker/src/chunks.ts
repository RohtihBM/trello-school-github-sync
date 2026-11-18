import {
  countOccurrences,
  estimateTokens,
  ticketTerms,
  type SourceFile,
} from "./repoContext.js";

// A chunk is one function, component, route handler or schema model, not a
// whole file. Selecting chunks lets a large file contribute only the part a
// ticket needs, instead of being skipped (or crowding everything else out)
// because the whole file does not fit the budget.
export interface Chunk {
  key: string; // "path:startLine", stable for a given file content
  path: string;
  startLine: number; // 1-based, inclusive
  endLine: number;
  name: string;
  content: string;
  tokens: number;
}

const TS_DECL_START =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var)\b/;
const ROUTE_START = /^\w+(?:Router|app)\.(?:get|post|put|patch|delete|use)\(/;
const PRISMA_START = /^(?:model|enum|generator|datasource)\s+\w+/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

const MIN_CHUNK_LINES = 6;
const MAX_CHUNK_LINES = 80;

// Where a new chunk may start, per language. Languages with no rule here (HTML,
// CSS, SQL, Java and so on) get no boundaries, so they are split only by size.
const PYTHON_START = /^(?:async\s+def|def|class)\s/;
const GO_START = /^(?:func|type|var|const)\s/;
const RUST_START = /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|impl|trait|mod)\b/;
const RUBY_START = /^(?:def|class|module)\s/;

function isBoundary(file: string, line: string): boolean {
  if (file.endsWith(".prisma")) return PRISMA_START.test(line);
  if (/\.py$/i.test(file)) return PYTHON_START.test(line);
  if (/\.go$/i.test(file)) return GO_START.test(line);
  if (/\.rs$/i.test(file)) return RUST_START.test(line);
  if (/\.rb$/i.test(file)) return RUBY_START.test(line);
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) return TS_DECL_START.test(line) || ROUTE_START.test(line);
  return false;
}

// Leading comments stay with the definition below them. "#" comments belong to
// Python and Ruby only; in other languages a line starting with # is code.
function isCommentLine(file: string, line: string): boolean {
  if (COMMENT_LINE.test(line)) return true;
  return /\.(py|rb)$/i.test(file) && /^\s*#/.test(line);
}

function chunkName(file: string, lines: string[]): string {
  const text = lines.join("\n");
  const route = text.match(/\b\w+(?:Router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/);
  if (route?.[1] && route[2]) return `${route[1].toUpperCase()} ${route[2]}`;
  const decl = text.match(
    /(?:function\*?|class|interface|type|enum|const|let|var|model)\s+([A-Za-z0-9_$]+)/,
  );
  return decl?.[1] ?? (file.endsWith(".prisma") ? "schema" : "module");
}

// Splits at top-level declarations (column 0), keeping a declaration's
// leading comment with it, merges runs of tiny pieces, and splits oversized
// ones at the last blank line before the size cap.
function chunkFile(file: SourceFile): Chunk[] {
  const lines = file.content.split("\n");
  const starts: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (!isBoundary(file.path, lines[i] ?? "")) continue;
    let s = i;
    while (s - 1 > (starts[starts.length - 1] ?? 0) && isCommentLine(file.path, lines[s - 1] ?? "")) s--;
    if (s > (starts[starts.length - 1] ?? 0)) starts.push(s);
  }

  const pieces: Array<[number, number]> = [];
  for (let k = 0; k < starts.length; k++) {
    pieces.push([starts[k] ?? 0, k + 1 < starts.length ? (starts[k + 1] ?? lines.length) : lines.length]);
  }

  const merged: Array<[number, number]> = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && last[1] - last[0] < MIN_CHUNK_LINES) last[1] = piece[1];
    else merged.push([piece[0], piece[1]]);
  }

  const bounded: Array<[number, number]> = [];
  for (const [start, end] of merged) {
    let from = start;
    while (end - from > MAX_CHUNK_LINES) {
      let cut = from + MAX_CHUNK_LINES;
      for (let j = cut; j > from + MAX_CHUNK_LINES / 2; j--) {
        if ((lines[j] ?? "").trim() === "") {
          cut = j;
          break;
        }
      }
      bounded.push([from, cut]);
      from = cut;
    }
    bounded.push([from, end]);
  }

  return bounded
    .filter(([s, e]) => e > s)
    .map(([s, e]) => {
      const slice = lines.slice(s, e);
      const content = slice.join("\n");
      return {
        key: `${file.path}:${s + 1}`,
        path: file.path,
        startLine: s + 1,
        endLine: e,
        name: chunkName(file.path, slice),
        content,
        tokens: estimateTokens(content),
      };
    });
}

export function chunkFiles(files: SourceFile[]): Chunk[] {
  return files.flatMap(chunkFile);
}

// Same TF-IDF idea as file ranking, computed per chunk, plus a one-hop
// import-graph expansion that lifts the best chunk of each neighbouring file.
export function rankChunks(
  chunks: Chunk[],
  files: SourceFile[],
  ticketText: string,
): Map<string, number> {
  const terms = ticketTerms(ticketText);
  const n = chunks.length;
  const lowered = chunks.map((c) => c.content.toLowerCase());

  const df = new Map<string, number>();
  for (const t of terms) {
    let c = 0;
    for (const l of lowered) if (l.includes(t)) c++;
    df.set(t, c);
  }

  const scores = new Map<string, number>();
  chunks.forEach((c, i) => {
    const lowerPath = c.path.toLowerCase();
    const lowerName = c.name.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const dfT = df.get(t) ?? 0;
      if (dfT === 0) continue;
      const idf = Math.log(1 + n / dfT);
      const tf = countOccurrences(lowered[i] ?? "", t);
      if (tf > 0) score += ((1 + Math.log(tf)) * idf) / (1 + Math.log(1 + c.tokens / 300));
      if (lowerPath.includes(t)) score += 2 * idf;
      if (lowerName.includes(t)) score += 4 * idf;
    }
    scores.set(c.key, score);
  });

  const bestByFile = new Map<string, { key: string; score: number }>();
  for (const c of chunks) {
    const s = scores.get(c.key) ?? 0;
    const cur = bestByFile.get(c.path);
    if (!cur || s > cur.score) bestByFile.set(c.path, { key: c.key, score: s });
  }

  const importers = new Map<string, string[]>();
  for (const f of files) {
    for (const target of f.imports) {
      const list = importers.get(target) ?? [];
      list.push(f.path);
      importers.set(target, list);
    }
  }
  const byPath = new Map(files.map((f) => [f.path, f]));

  const seeds = [...bestByFile.entries()]
    .filter(([, b]) => b.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 6);
  for (const [seedPath, seed] of seeds) {
    const neighbours = [...(byPath.get(seedPath)?.imports ?? []), ...(importers.get(seedPath) ?? [])];
    for (const nb of neighbours) {
      const best = bestByFile.get(nb);
      if (!best || best.score <= 0) continue;
      scores.set(best.key, Math.max(scores.get(best.key) ?? 0, seed.score * 0.35));
    }
  }
  return scores;
}

export function rankingFromScores(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

// Reciprocal rank fusion: a chunk ranks high if ANY ranking puts it high, and
// highest if several agree. Scale-free, so keyword scores and vector
// similarities never need to be put on the same scale.
export function fuseRankings(rankings: string[][], k = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((key, i) => fused.set(key, (fused.get(key) ?? 0) + 1 / (k + i + 1)));
  }
  return fused;
}

export function selectChunks(
  chunks: Chunk[],
  scores: Map<string, number>,
  budgetTokens: number,
): Chunk[] {
  const ranked = chunks
    .filter((c) => (scores.get(c.key) ?? 0) > 0)
    .sort((a, b) => (scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0));
  const selected: Chunk[] = [];
  let remaining = budgetTokens;
  for (const c of ranked) {
    if (c.tokens > remaining) continue;
    selected.push(c);
    remaining -= c.tokens;
  }
  return selected;
}

// Groups chunks by file in source order; chunks that sit next to each other
// share one header, gaps are marked so the model knows lines were skipped.
export function formatChunks(selected: Chunk[]): string {
  const byFile = new Map<string, Chunk[]>();
  for (const c of selected) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c]);

  const blocks: string[] = [];
  for (const [filePath, list] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.startLine - b.startLine);
    let run: Chunk[] = [];
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) return;
      blocks.push(
        `=== ${filePath} (lines ${first.startLine}-${last.endLine}) ===\n${run.map((c) => c.content).join("\n")}`,
      );
      run = [];
    };
    for (const c of list) {
      const prev = run[run.length - 1];
      if (prev && c.startLine !== prev.endLine + 1) flush();
      run.push(c);
    }
    flush();
  }
  return blocks.join("\n\n");
}

// Chunks of files the model explicitly asked for (by path or file name), best
// first, skipping anything already shown, within a token budget. Backs the one
// bounded "I need more context" step, so the model never explores open-endedly.
export function chunksForRequestedFiles(
  chunks: Chunk[],
  requested: string[],
  scores: Map<string, number>,
  alreadyShown: Set<string>,
  budgetTokens: number,
): Chunk[] {
  const matches = (c: Chunk) =>
    requested.some((r) => c.path === r || c.path.endsWith(`/${r}`) || c.path.split("/").pop() === r);
  const wanted = chunks
    .filter((c) => matches(c) && !alreadyShown.has(c.key))
    .sort(
      (a, b) =>
        (scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0) ||
        a.path.localeCompare(b.path) ||
        a.startLine - b.startLine,
    );
  const picked: Chunk[] = [];
  let remaining = budgetTokens;
  for (const c of wanted) {
    if (c.tokens > remaining) continue;
    picked.push(c);
    remaining -= c.tokens;
  }
  return picked;
}
