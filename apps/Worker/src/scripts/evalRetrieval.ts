import { readFileSync } from "node:fs";
import path from "node:path";
import {
  chunkFiles,
  fuseRankings,
  rankChunks,
  rankingFromScores,
  selectChunks,
  type Chunk,
} from "../chunks.js";
import { ensureEmbedded, vectorRanking } from "../embeddings.js";
import {
  loadSourceFiles,
  rankFiles,
  selectWithinBudget,
  type SourceFile,
} from "../repoContext.js";

// Offline: no Claude calls, so it costs nothing to run. For every ticket in
// docs/eval/retrieval-tickets.json it asks each strategy to pick source
// within a token budget, then checks how many of the files a change would
// touch ended up in the selection (recall) and how many selected tokens were
// spent on files that change did not need (waste).
//
// Run from apps/Worker:  npx tsx src/scripts/evalRetrieval.ts

interface EvalTicket {
  id: string;
  title: string;
  description: string;
  files: string[];
}
interface Selected {
  path: string;
  tokens: number;
}
interface Context {
  files: SourceFile[];
  chunks: Chunk[];
}
type Strategy = (ctx: Context, ticketText: string, budget: number) => Promise<Selected[]> | Selected[];

const strategies: Record<string, Strategy> = {
  "file keyword": (ctx, text, budget) =>
    selectWithinBudget(ctx.files, rankFiles(ctx.files, text), budget).map((f) => ({
      path: f.path,
      tokens: f.tokens,
    })),
  "chunk keyword": (ctx, text, budget) =>
    selectChunks(ctx.chunks, rankChunks(ctx.chunks, ctx.files, text), budget).map((c) => ({
      path: c.path,
      tokens: c.tokens,
    })),
  "chunk vector": async (ctx, text, budget) => {
    const ranking = await vectorRanking(text, ctx.chunks);
    const scores = new Map(ranking.map((k, i) => [k, 1 / (i + 1)]));
    return selectChunks(ctx.chunks, scores, budget).map((c) => ({ path: c.path, tokens: c.tokens }));
  },
  "chunk hybrid": async (ctx, text, budget) => {
    const keyword = rankingFromScores(rankChunks(ctx.chunks, ctx.files, text));
    const vector = await vectorRanking(text, ctx.chunks);
    const fused = fuseRankings([keyword, vector]);
    return selectChunks(ctx.chunks, fused, budget).map((c) => ({ path: c.path, tokens: c.tokens }));
  },
};

export function registerStrategy(name: string, strategy: Strategy) {
  strategies[name] = strategy;
}

async function main() {
  const repoPath = process.env.REPO_PATH ?? path.resolve(process.cwd(), ".repo-cache/trello-school-github-sync");
  const tickets: EvalTicket[] = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "../../docs/eval/retrieval-tickets.json"), "utf8"),
  ).tickets;

  const files = await loadSourceFiles(repoPath);
  const known = new Set(files.map((f) => f.path));
  const chunks = chunkFiles(files);
  const started = Date.now();
  const report = await ensureEmbedded(chunks, true);
  const ctx: Context = { files, chunks };
  console.log(
    `repo: ${files.length} files, ${chunks.length} chunks (${report.uniqueChunks} unique), ${tickets.length} tickets; already in Postgres: ${report.alreadyStored}, embedded now: ${report.embeddedNow} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );

  const only = process.env.ONLY?.split(",");
  for (const budget of [40_000, 20_000]) {
    console.log(`=== budget ${budget} tokens ===`);
    for (const [name, strategy] of Object.entries(strategies)) {
      if (only && !only.includes(name)) continue;
      let recallSum = 0;
      let wasteSum = 0;
      const perTicket: string[] = [];
      for (const t of tickets) {
        const truth = new Set(t.files.filter((f) => known.has(f)));
        const picked = await strategy(ctx, `${t.title}\n${t.description}`, budget);
        const pickedFiles = new Set(picked.map((p) => p.path));
        const hit = [...truth].filter((f) => pickedFiles.has(f)).length;
        const recall = truth.size ? hit / truth.size : 1;
        const used = picked.reduce((s, p) => s + p.tokens, 0);
        const waste = used ? picked.filter((p) => !truth.has(p.path)).reduce((s, p) => s + p.tokens, 0) / used : 0;
        recallSum += recall;
        wasteSum += waste;
        perTicket.push(`${t.id}:${hit}/${truth.size}`);
      }
      console.log(
        `${name.padEnd(16)} recall ${(100 * recallSum / tickets.length).toFixed(0)}%  waste ${(100 * wasteSum / tickets.length).toFixed(0)}%   [${perTicket.join(" ")}]`,
      );
    }
    console.log();
  }
}

if (process.argv[1]?.endsWith("evalRetrieval.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
