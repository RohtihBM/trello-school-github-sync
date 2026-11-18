import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generatePlan, type ConfiguredStrategy, type PlanResult } from "../processPlanJob.js";
import { ensureRepoCloned } from "../repoClone.js";
import { DEFAULT_REPO, findOrCreateRepository } from "../repositories.js";

// End-to-end plan evaluation on the labelled tickets in
// docs/eval/retrieval-tickets.json. The question it answers is the one file
// recall alone cannot: does a plan written from a bounded slice of the repo
// name the files a change would actually touch, and what does it cost?
//
//   DRY=1 npx tsx src/scripts/evalPlans.ts        free: prompt sizes and
//                                                 retrieval coverage, no Claude
//   SPEND=1 npx tsx src/scripts/evalPlans.ts      real Claude calls (costs money)
//
// Optional: STRATEGIES=full,retrieval  TICKETS=remove-dependency,multi-tab

interface EvalTicket {
  id: string;
  title: string;
  description: string;
  files: string[];
}

const DEFAULT_TICKETS = ["remove-dependency", "queue-position", "multi-tab", "delete-board"];

function recall(truth: string[], named: string[]): number {
  if (truth.length === 0) return 1;
  const set = new Set(named);
  return truth.filter((f) => set.has(f)).length / truth.length;
}

function mentionRecall(truth: string[], planText: string): number {
  if (truth.length === 0) return 1;
  return truth.filter((f) => planText.includes(f) || planText.includes(f.split("/").pop() ?? f)).length / truth.length;
}

async function main() {
  const dry = process.env.DRY === "1";
  if (!dry && process.env.SPEND !== "1") {
    console.error("Refusing to run: set DRY=1 for a free check, or SPEND=1 to make real Claude calls.");
    process.exit(1);
  }

  const all: EvalTicket[] = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "../../docs/eval/retrieval-tickets.json"), "utf8"),
  ).tickets;
  const wanted = (process.env.TICKETS?.split(",") ?? DEFAULT_TICKETS).map((s) => s.trim());
  const tickets = wanted.map((id) => {
    const t = all.find((x) => x.id === id);
    if (!t) throw new Error(`unknown ticket id: ${id}`);
    return t;
  });
  const strategies = (process.env.STRATEGIES?.split(",") ?? ["full", "retrieval"]).map(
    (s) => s.trim() as ConfiguredStrategy,
  );

  const repository = await findOrCreateRepository(process.env.REPO ?? DEFAULT_REPO);
  const repoPath = await ensureRepoCloned(repository);
  const rows: Array<Record<string, unknown>> = [];

  for (const t of tickets) {
    for (const strategy of strategies) {
      const r: PlanResult = await generatePlan({
        title: t.title,
        description: t.description,
        repoPath,
        repositoryId: repository.id,
        record: false,
        strategy,
        dryRun: dry,
      });
      const row = {
        ticket: t.id,
        strategy: r.strategy,
        requests: r.requests,
        costUsd: Number(r.costUsd.toFixed(4)),
        seconds: Number((r.durationMs / 1000).toFixed(1)),
        promptTokens: r.promptTokens,
        truthFiles: t.files.length,
        shownRecall: r.strategy === "retrieval" ? Number(recall(t.files, r.shownFiles).toFixed(2)) : null,
        planNamedRecall: dry ? null : Number(recall(t.files, r.intendedFiles).toFixed(2)),
        planMentionRecall: dry ? null : Number(mentionRecall(t.files, r.plan).toFixed(2)),
        namedFiles: r.intendedFiles.length,
        planChars: r.plan.length,
      };
      rows.push({ ...row, plan: r.plan, intendedFiles: r.intendedFiles });
      console.log(JSON.stringify(row));
    }
  }

  if (!dry) {
    const out = path.resolve("/tmp/claude-501", `eval-plans-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`\nfull plans saved to ${out}`);
    const byStrategy = new Map<string, { cost: number; n: number; named: number; mention: number; secs: number }>();
    for (const r of rows) {
      const k = String(r.strategy);
      const cur = byStrategy.get(k) ?? { cost: 0, n: 0, named: 0, mention: 0, secs: 0 };
      cur.cost += Number(r.costUsd);
      cur.n += 1;
      cur.named += Number(r.planNamedRecall);
      cur.mention += Number(r.planMentionRecall);
      cur.secs += Number(r.seconds);
      byStrategy.set(k, cur);
    }
    console.log("\n=== averages per ticket ===");
    for (const [k, v] of byStrategy) {
      console.log(
        `${k.padEnd(10)} cost $${(v.cost / v.n).toFixed(3)}  time ${(v.secs / v.n).toFixed(0)}s  plan-named recall ${(100 * v.named / v.n).toFixed(0)}%  plan-mention recall ${(100 * v.mention / v.n).toFixed(0)}%   total $${v.cost.toFixed(3)} over ${v.n} plans`,
      );
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
