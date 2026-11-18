import { Router, raw } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";
import { boardIdForRepository, upsertGitHubIssue } from "../lib/githubIssues.js";
import { notifyBoard } from "../lib/notifyBoard.js";

export const githubRouter = Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// GitHub needs the RAW bytes to verify the signature, so this route parses
// its own body with express.raw() instead of relying on the global
// express.json() middleware (which would already have consumed/altered it).
githubRouter.post(
  "/webhooks/github",
  raw({ type: "application/json" }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.header("x-hub-signature-256");

    if (!verifySignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    const payload = JSON.parse(rawBody.toString());

    if (payload.action !== "opened" && payload.action !== "edited") {
      return res.status(200).json({ status: "ignored" });
    }

    // Route by repository: the issue goes to the board linked to the repository
    // it was opened in. Repositories no board is linked to are ignored.
    const repoFullName: unknown = payload.repository?.full_name;
    const boardId = typeof repoFullName === "string" ? await boardIdForRepository(repoFullName) : null;
    if (!boardId) {
      return res.status(200).json({ status: "ignored" });
    }

    const githubNodeId = payload.issue.node_id;
    const title = payload.issue.title;
    const description = payload.issue.body ?? null;

    if (payload.action === "opened") {
      const result = await upsertGitHubIssue(boardId, { githubNodeId, title, description });
      if (!result) {
        console.error("no Todo section found on the board linked to", repoFullName);
        return res.status(200).json({ status: "ignored" });
      }
      await notifyBoard(boardId, { type: "issue-created", issue: result.issue });
    } else {
      // "edited"
      const issue = await prisma.issue.update({
        where: { githubNodeId },
        data: { title, description },
      });

      await notifyBoard(boardId, { type: "issue-updated", issue });
    }

    res.status(200).json({ status: "ok" });
  },
);

// Imports a linked repository's open issues straight from GitHub's public API,
// so a board gets its tickets without the GitHub App being installed on that
// repository. The URL is built only from the validated "owner/name" stored on
// the repository record, so the request can only ever go to api.github.com.
// Only the first page (up to 100 issues) is read.
githubRouter.post("/boards/:boardId/sync-issues", requireAuth, async (req, res) => {
  const boardId = req.params.boardId as string;

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { repository: true },
  });
  if (!board) return res.status(404).json({ error: "board not found" });

  const membership = await getMembershipForOrg(req.userId!, board.orgId);
  if (!membership) {
    return res.status(403).json({ error: "you are not a member of this organisation" });
  }
  if (!board.repository) {
    return res.status(409).json({ error: "link this board to a repository first" });
  }

  const response = await fetch(
    `https://api.github.com/repos/${board.repository.fullName}/issues?state=open&per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "trello-school-sync",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    },
  );
  if (!response.ok) {
    return res.status(502).json({ error: `GitHub answered ${response.status} for ${board.repository.fullName}` });
  }

  const items = (await response.json()) as Array<{
    node_id: string;
    title: string;
    body: string | null;
    pull_request?: unknown;
  }>;

  let created = 0;
  let updated = 0;
  // Oldest first, so tickets appear in the order they were opened.
  for (const item of [...items].reverse()) {
    if (item.pull_request) continue; // GitHub lists pull requests as issues too
    const result = await upsertGitHubIssue(board.id, {
      githubNodeId: item.node_id,
      title: item.title,
      description: item.body ?? null,
    });
    if (!result) continue;
    if (result.created) {
      created += 1;
      await notifyBoard(board.id, { type: "issue-created", issue: result.issue });
    } else {
      updated += 1;
      await notifyBoard(board.id, { type: "issue-updated", issue: result.issue });
    }
  }

  res.json({ repository: board.repository.fullName, created, updated });
});
