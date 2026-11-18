import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface SourceFile {
  path: string;
  content: string;
  tokens: number;
  names: string[];
  imports: string[];
}

// Deliberately conservative. Measured on this repo: the main model counted
// ~3.3 characters per token, but the small model the SDK also calls in the
// background counted ~2.6, and a budget has to hold for the larger count.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}

const SOURCE_FILE = /\.(ts|tsx|prisma)$/;

const EXPORT_NAME =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
const ROUTE = /\b\w+(?:Router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
const PRISMA_DECL = /^(?:model|enum)\s+(\w+)/gm;
const IMPORT_SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function extractNames(file: string, content: string): string[] {
  const names: string[] = [];
  if (file.endsWith(".prisma")) {
    for (const m of content.matchAll(PRISMA_DECL)) if (m[1]) names.push(m[1]);
    return names;
  }
  for (const m of content.matchAll(ROUTE)) if (m[1] && m[2]) names.push(`${m[1].toUpperCase()} ${m[2]}`);
  for (const m of content.matchAll(EXPORT_NAME)) if (m[1]) names.push(m[1]);
  return names;
}

function resolveImport(from: string, spec: string, known: Set<string>): string | null {
  if (spec === "@repo/db") {
    return known.has("packages/db/src/index.ts") ? "packages/db/src/index.ts" : null;
  }
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const stem = base.replace(/\.(js|jsx)$/, "");
  const candidates = [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.find((c) => known.has(c)) ?? null;
}

// Source only: not docs, lockfiles or the generated Prisma client.
export async function loadSourceFiles(repoPath: string): Promise<SourceFile[]> {
  const { stdout } = await exec("git", ["ls-files"], { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
  const paths = stdout
    .split("\n")
    .filter((f) => SOURCE_FILE.test(f) && !f.includes("generated/") && !f.endsWith(".d.ts"));
  const known = new Set(paths);

  const files: SourceFile[] = [];
  for (const p of paths) {
    const content = await readFile(path.join(repoPath, p), "utf8");
    const imports = new Set<string>();
    for (const m of content.matchAll(IMPORT_SPEC)) {
      const resolved = m[1] ? resolveImport(p, m[1], known) : null;
      if (resolved && resolved !== p) imports.add(resolved);
    }
    files.push({
      path: p,
      content,
      tokens: estimateTokens(content),
      names: extractNames(p, content),
      imports: [...imports],
    });
  }
  return files;
}

export function totalTokens(files: SourceFile[]): number {
  return files.reduce((sum, f) => sum + f.tokens, 0);
}

export type Tier = "full" | "map";

// "full" while all the source fits the budget, "map" (ranked slice plus a
// map of every file) once it doesn't. This is what keeps the size of one
// plan's context from growing with the repository.
export function chooseTier(files: SourceFile[], fullMaxTokens: number): Tier {
  return totalTokens(files) <= fullMaxTokens ? "full" : "map";
}

const STOPWORDS = new Set(
  (
    "the and for that this with from into when then than have has are was were not but you your can will " +
    "should must would could about also each only any all one two out use used using via per new add make " +
    "made need needs get set run its they them their there here which what who how why where while after " +
    "before over under more most some such other another both either same without within between across " +
    "just like etc ticket issue acceptance criteria currently there instead rather still even"
  ).split(" "),
);

export function ticketTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const raw of text.split(/[^A-Za-z0-9_]+/)) {
    if (raw.length < 3) continue;
    const lower = raw.toLowerCase();
    if (!STOPWORDS.has(lower)) terms.add(lower);
    for (const part of raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_]+/)) {
      const p = part.toLowerCase();
      if (p.length >= 3 && !STOPWORDS.has(p)) terms.add(p);
    }
  }
  return [...terms];
}

export function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

// TF-IDF style relevance on file contents, plus bonuses for the ticket's
// words appearing in a file's path or its exported names, then a one-hop
// expansion along the import graph (code that changes together is usually
// connected). Deterministic, free, and explainable: no Claude call.
export function rankFiles(files: SourceFile[], ticketText: string): Map<string, number> {
  const terms = ticketTerms(ticketText);
  const n = files.length;
  const lowered = files.map((f) => f.content.toLowerCase());

  const df = new Map<string, number>();
  for (const t of terms) {
    let c = 0;
    for (const l of lowered) if (l.includes(t)) c++;
    df.set(t, c);
  }

  const own = new Map<string, number>();
  files.forEach((f, i) => {
    const lowerPath = f.path.toLowerCase();
    const lowerNames = f.names.join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) {
      const dfT = df.get(t) ?? 0;
      if (dfT === 0) continue;
      const idf = Math.log(1 + n / dfT);
      const tf = countOccurrences(lowered[i] ?? "", t);
      if (tf > 0) score += ((1 + Math.log(tf)) * idf) / (1 + Math.log(1 + f.tokens / 2000));
      if (lowerPath.includes(t)) score += 4 * idf;
      if (lowerNames.includes(t)) score += 3 * idf;
    }
    own.set(f.path, score);
  });

  const importers = new Map<string, string[]>();
  for (const f of files) {
    for (const target of f.imports) {
      const list = importers.get(target) ?? [];
      list.push(f.path);
      importers.set(target, list);
    }
  }

  const final = new Map(own);
  const seeds = [...own.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const [seedPath, seedScore] of seeds) {
    const neighbours = [...(byPath.get(seedPath)?.imports ?? []), ...(importers.get(seedPath) ?? [])];
    for (const nb of neighbours) {
      final.set(nb, Math.max(final.get(nb) ?? 0, seedScore * 0.35));
    }
  }

  for (const [p, s] of final) {
    if (s > 0) final.set(p, s + 0.3 * Math.log(1 + (importers.get(p)?.length ?? 0)));
  }
  return final;
}

export function selectWithinBudget(
  files: SourceFile[],
  scores: Map<string, number>,
  budgetTokens: number,
): SourceFile[] {
  const ranked = [...files]
    .filter((f) => (scores.get(f.path) ?? 0) > 0)
    .sort((a, b) => (scores.get(b.path) ?? 0) - (scores.get(a.path) ?? 0));

  const maxSingle = budgetTokens * 0.4;
  const selected: SourceFile[] = [];
  let remaining = budgetTokens;
  for (const f of ranked) {
    if (f.tokens > maxSingle || f.tokens > remaining) continue;
    selected.push(f);
    remaining -= f.tokens;
  }
  return selected;
}

export function formatSource(files: SourceFile[]): string {
  return files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
}

// One line per file with its exported names and routes. Files that have
// something selected come first and are marked *; the rest follow in path
// order. Capped so the map itself can't grow without bound on a large repo.
export function buildMap(files: SourceFile[], selectedPaths: Set<string>, maxTokens: number): string {
  const ordered = [...files].sort(
    (a, b) =>
      Number(selectedPaths.has(b.path)) - Number(selectedPaths.has(a.path)) || a.path.localeCompare(b.path),
  );

  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < ordered.length; i++) {
    const f = ordered[i];
    if (!f) break;
    const names = f.names.slice(0, 10).join(", ");
    const line = `${selectedPaths.has(f.path) ? "*" : " "} ${f.path}${names ? `  [${names}]` : ""}`;
    const cost = estimateTokens(line);
    if (used + cost > maxTokens) {
      lines.push(`... and ${ordered.length - i} more files not listed (use Glob to find them)`);
      break;
    }
    lines.push(line);
    used += cost;
  }
  return lines.join("\n");
}
