import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { Prisma, prisma } from "@repo/db";
import { ensureRepoCloned } from "./repoClone.js";
import { notifyBoard } from "./notifyBoard.js";
import { findOverlappingIssues } from "./fileOverlap.js";
import { wouldCreateCycle } from "./cycleCheck.js";
import { planGenerationQueue } from "./queue.js";

// Claude is asked to end its plan with exactly this one marker line, so
// it can be parsed out deterministically from the response — no second
// Claude call needed for this part, same principle as phase 3's "derive
// actualContract from data already in Postgres." Dependency-finding used
// to live here too (a second marker line) but moved to its own earlier,
// separate, much cheaper step (processDependencyCheck below) — this call
// now only ever writes a plan, never discovers a dependency.
//
// Matches the whole rest of the line after the label, not a specific
// shape like `\{.*\}` — a real bug, found by testing a malformed-JSON
// case, not assumed: requiring the captured value to visibly end with a
// closing brace/bracket meant a genuinely malformed response (e.g. a
// truncated or missing closing brace) failed to match AT ALL, so the raw
// marker line was never stripped and leaked straight into the plan text
// shown to the user. Stripping the line is now unconditional; only the
// VALUE inside it is optionally parsed, with its own separate fallback.
const INTENDED_FILES_LINE = /\n?INTENDED_FILES:[^\n]*$/;

// Chat can now end a reply with this marker, followed by a full revised
// plan — never applied automatically. The route layer only ever writes
// this into `issue.proposedPlan`, a human has to explicitly accept it
// before it becomes the real `issue.plan`, same "AI suggests, human
// confirms" rule as the dependency-suggestion flow. Matched with /s so
// the revised plan (everything after the marker) can itself contain
// blank lines.
const REVISED_PLAN_MARKER = /\n?---REVISED PLAN BELOW---\n?/;

function extractChatReply(rawText: string): { reply: string; proposedPlan: string | null } {
  const match = rawText.match(REVISED_PLAN_MARKER);
  if (!match || match.index === undefined) {
    return { reply: rawText.trim(), proposedPlan: null };
  }
  const reply = rawText.slice(0, match.index).trim();
  const proposedPlan = rawText.slice(match.index + match[0].length).trim();
  return { reply, proposedPlan: proposedPlan || null };
}

export interface SuggestedDependency {
  blockerId: string;
  assumedContract: string;
}

function extractPlanMetadata(rawText: string): { plan: string; intendedFiles: string[] } {
  let remaining = rawText;

  const filesMatch = remaining.match(INTENDED_FILES_LINE);
  let intendedFiles: string[] = [];
  if (filesMatch) {
    remaining = remaining.slice(0, filesMatch.index);
    const valueText = filesMatch[0].replace(/^\n?INTENDED_FILES:/, "").trim();
    try {
      const parsed = JSON.parse(valueText || "[]");
      if (Array.isArray(parsed) && parsed.every((f) => typeof f === "string")) {
        intendedFiles = parsed;
      }
    } catch {
      // Degrade gracefully — never fail the whole job over a formatting
      // miss on what's explicitly an optional extra. The line is still
      // stripped above regardless of this outcome.
    }
  }

  return { plan: remaining.trim(), intendedFiles };
}

// Bounds how long a single run can go before giving up on its own, separate
// from BullMQ's retry count — this caps ONE attempt's length, not how many
// attempts there are in total. Raised from 15 after a real failure: with
// tools properly restricted (see below), the agent can no longer offload
// exploration to a sub-agent, so it genuinely needs more of its own turns.
const MAX_TURNS = 30;

// Shared by both a fresh plan-generation call AND a resumed chat call.
// Verified (not assumed): the SDK's `resume` option only says it "loads the
// conversation history" — nothing about carrying over tools/model/etc. from
// the original session. Every call, resumed or not, must set these itself,
// or a resumed chat message would silently reopen the exact hole fixed for
// plan generation (tools defaulting back to the full claude_code preset).
const RESTRICTED_OPTIONS = {
  // `tools` is the ACTUAL restriction — omitting it defaults to the full
  // `claude_code` preset (sub-agents, Artifact publishing, everything),
  // regardless of allowedTools. `allowedTools` only skips the permission
  // PROMPT for tools already in this list; it removes nothing on its own.
  // Confirmed the hard way: an earlier run with only allowedTools set
  // spawned a real sub-agent and wrote real files to disk.
  tools: ["Read", "Grep", "Glob"],
  allowedTools: ["Read", "Grep", "Glob"],
  model: "claude-haiku-4-5-20251001",
  permissionMode: "default",
  maxTurns: MAX_TURNS,
} satisfies Partial<Options>;

async function runClaudeQuery(
  prompt: string,
  extraOptions: Partial<Options>,
): Promise<{ text: string; sessionId: string | undefined }> {
  let text = "";
  let sessionId: string | undefined;

  const result = query({
    prompt,
    options: { ...RESTRICTED_OPTIONS, ...extraOptions },
  });

  for await (const message of result) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }
    }
    if (message.type === "result") {
      sessionId = message.session_id;
    }
  }

  return { text, sessionId };
}

export async function processPlanJob(jobId: string): Promise<void> {
  const job = await prisma.planGenerationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { issue: true },
  });

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });

  const repoPath = await ensureRepoCloned();

  const prompt = [
    `Ticket: ${job.issue.title}`,
    job.issue.description ? `\n${job.issue.description}` : "",
    "\n\nWrite a concrete implementation plan for this ticket, grounded in",
    "the actual code in this repository. Read whatever files are relevant",
    "before proposing the plan.",
    "\n\nEnd your response with exactly one more line — a JSON array of",
    "repo-relative file paths this plan's implementation would touch, or",
    '[] if none: INTENDED_FILES: ["path/one.ts"]',
  ].join("");

  const { text: rawText, sessionId } = await runClaudeQuery(prompt, {
    cwd: repoPath,
  });

  if (!rawText.trim()) {
    throw new Error("Claude returned an empty plan");
  }

  const { plan: planText, intendedFiles } = extractPlanMetadata(rawText);

  const issue = await prisma.issue.update({
    where: { id: job.issueId },
    data: { plan: planText, intendedFiles, claudeSessionId: sessionId },
  });

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED" },
  });

  const overlaps = await findOverlappingIssues(issue.boardId, issue.id, intendedFiles);

  await notifyBoard(issue.boardId, { type: "plan-ready", issue, overlaps });
}

export async function processChatMessage(jobId: string, message: string): Promise<void> {
  const job = await prisma.planGenerationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { issue: true },
  });

  if (!job.issue.claudeSessionId) {
    // The route already checks this before enqueueing, but the job could
    // theoretically run after something else cleared the session — fail
    // loudly rather than silently starting an unrelated fresh conversation.
    throw new Error("no claudeSessionId to resume for this ticket");
  }

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });

  const repoPath = await ensureRepoCloned();

  // Every chat turn carries this instruction, not just the first — a
  // resumed session only remembers what Claude itself said before, never
  // these formatting rules, since they were never actually said out loud
  // in an earlier turn.
  const prompt = [
    message,
    "\n\nIf — and only if — this message genuinely calls for changing the",
    "implementation plan itself (not just answering a question about it),",
    "end your reply with exactly this marker line on its own, followed by",
    "the complete revised plan (the full plan text, not just a diff or",
    "summary of the change):\n---REVISED PLAN BELOW---\nOtherwise omit the",
    "marker entirely and just reply normally.",
  ].join("");

  const { text: rawText, sessionId } = await runClaudeQuery(prompt, {
    cwd: repoPath,
    resume: job.issue.claudeSessionId,
  });

  if (!rawText.trim()) {
    throw new Error("Claude returned an empty reply");
  }

  const { reply, proposedPlan } = extractChatReply(rawText);

  // Found by actually testing this, not assumed: when Claude's whole
  // reply is the marker + revised plan with nothing conversational
  // before it, `reply` comes back empty — which would otherwise store
  // and render a blank chat bubble. The revised plan itself still shows
  // up fine in its own banner either way, so this is purely about the
  // chat message having something to actually say.
  const assistantMessage = await prisma.planMessage.create({
    data: {
      issueId: job.issueId,
      role: "assistant",
      content: reply || "Updated the plan — see the proposed revision below.",
    },
  });

  // A resumed session can, in principle, come back with a new session id
  // (e.g. if forked) — keep claudeSessionId pointed at whatever id future
  // turns should actually resume, not silently stale. proposedPlan is
  // written here but NEVER into `plan` itself — only the accept-revision
  // route (human-triggered) does that.
  const updatedIssue = await prisma.issue.update({
    where: { id: job.issueId },
    data: {
      claudeSessionId: sessionId ?? job.issue.claudeSessionId,
      ...(proposedPlan ? { proposedPlan } : {}),
    },
  });

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED" },
  });

  await notifyBoard(job.issue.boardId, {
    type: "chat-message",
    message: assistantMessage,
    issue: updatedIssue,
  });
}

// The pre-planning step: "is this ticket blocked by another one?",
// checked and (if found) surfaced for a human to confirm/dismiss BEFORE
// any implementation plan gets written — not alongside it in the same
// call like before. Deliberately NOT given `cwd`/repo access or any
// tools at all: this is a pure reasoning-over-ticket-text question, it
// never needs to read actual code, so it skips the repo clone and the
// Read/Grep/Glob round trips entirely, which is what keeps this step
// genuinely cheap next to a full plan generation.
export async function processDependencyCheck(jobId: string): Promise<void> {
  const job = await prisma.planGenerationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { issue: true },
  });

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });

  const siblingTickets = await prisma.issue.findMany({
    where: { boardId: job.issue.boardId, id: { not: job.issueId } },
    select: { id: true, title: true, description: true },
  });

  let suggestedDependency: SuggestedDependency | null = null;

  if (siblingTickets.length > 0) {
    const prompt = [
      `Ticket: ${job.issue.title}`,
      job.issue.description ? `\n${job.issue.description}` : "",
      "\n\nDoes implementing this ticket genuinely require something from",
      "exactly one of the other tickets listed below first — a real",
      "blocking dependency, not just a vague relation? Answer with ONLY a",
      "single line of JSON, nothing else, no explanation.",
      '\n\nIf yes: {"blockerId": "<id>", "assumedContract": "<what you expect it to provide>"}',
      '\nIf no: {"blockerId": null}',
      "\n\nOther tickets on this board:\n" +
        siblingTickets
          .map((t) => `- id=${t.id}: ${t.title}${t.description ? " — " + t.description : ""}`)
          .join("\n"),
    ].join("");

    const { text: rawText } = await runClaudeQuery(prompt, {
      tools: [],
      allowedTools: [],
    });

    const siblingIds = new Set(siblingTickets.map((t) => t.id));
    try {
      // Claude can still wrap the JSON in prose or a code fence despite
      // being told not to — pull out the first {...} blob rather than
      // assuming the whole response is bare JSON.
      const jsonMatch = rawText.match(/\{[^{}]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (
        parsed &&
        typeof parsed.blockerId === "string" &&
        typeof parsed.assumedContract === "string" &&
        siblingIds.has(parsed.blockerId)
      ) {
        suggestedDependency = { blockerId: parsed.blockerId, assumedContract: parsed.assumedContract };
      }
    } catch {
      // Malformed response — degrade to "no dependency found," never
      // fail the whole pipeline over a formatting miss on this check.
    }

    if (suggestedDependency) {
      const existingEdges = await prisma.ticketDependency.findMany({
        where: { blocked: { boardId: job.issue.boardId } },
        select: { blockedId: true, blockerId: true },
      });
      // Found directly, not assumed: a ticket that already has a
      // confirmed TicketDependency to this exact blocker was still
      // getting re-suggested the SAME dependency as if it were new —
      // Claude correctly re-identifies a real relationship every time
      // it's asked, but there's nothing left to confirm once a human
      // already has. Without this, the detail dialog showed both the
      // "resolve this before planning" banner AND the already-resolved
      // entry (mismatch included) for the identical blocker at once,
      // and clicking "Confirm" would have hit the dependency route's
      // own P2002 duplicate check and failed with a confusing 409.
      const alreadyDeclared = existingEdges.some(
        (e) => e.blockedId === job.issueId && e.blockerId === suggestedDependency!.blockerId,
      );
      if (alreadyDeclared || wouldCreateCycle(existingEdges, job.issueId, suggestedDependency.blockerId)) {
        suggestedDependency = null;
      }
    }
  }

  await prisma.planGenerationJob.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED" },
  });

  if (suggestedDependency) {
    // Found one — write it and stop here. Nothing proceeds to actual
    // plan generation until a human confirms or dismisses this (the
    // existing POST /issues/:id/dependencies and .../dismiss-suggestion
    // routes both now auto-continue into a real "generate-plan" job once
    // that happens, instead of requiring a second manual click).
    const issue = await prisma.issue.update({
      where: { id: job.issueId },
      data: { suggestedDependency: suggestedDependency as unknown as Prisma.InputJsonValue },
    });
    await notifyBoard(issue.boardId, { type: "issue-updated", issue });
    return;
  }

  // Nothing found — no human action to wait on, so this auto-continues
  // straight into real plan generation rather than making someone click
  // "Generate plan" a second time just to confirm "yes, still go ahead."
  const nextJob = await prisma.planGenerationJob.create({
    data: { issueId: job.issueId, requestedById: job.requestedById },
  });
  await planGenerationQueue.add("generate-plan", { jobId: nextJob.id });
}
