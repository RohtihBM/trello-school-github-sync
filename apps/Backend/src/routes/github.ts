import { Router, raw } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@repo/db";
import { notifyBoard } from "../lib/notifyBoard.js";

export const githubRouter = Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const SYNC_BOARD_ID = process.env.GITHUB_SYNC_BOARD_ID;

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

    if (!SYNC_BOARD_ID) {
      console.error("GITHUB_SYNC_BOARD_ID is not set; dropping webhook");
      return res.status(200).json({ status: "ignored" });
    }

    const githubNodeId = payload.issue.node_id;
    const title = payload.issue.title;
    const description = payload.issue.body;

    if (payload.action === "opened") {
      const todoSection = await prisma.section.findFirst({
        where: { boardId: SYNC_BOARD_ID, title: "Todo" },
      });
      if (!todoSection) {
        console.error("no Todo section found on the sync board");
        return res.status(200).json({ status: "ignored" });
      }

      // Not a plain count: positions have gaps once issues get deleted, so
      // "how many issues exist" can collide with a position already in use.
      // "highest position + 1" is the correct next slot, same fix already
      // applied in apps/Websockets/src/handlers.ts.
      const { _max } = await prisma.issue.aggregate({
        where: { sectionId: todoSection.id },
        _max: { position: true },
      });
      const position = (_max.position ?? -1) + 1;

      const issue = await prisma.issue.upsert({
        where: { githubNodeId },
        update: { title, description },
        create: {
          title,
          description,
          githubNodeId,
          position,
          boardId: SYNC_BOARD_ID,
          sectionId: todoSection.id,
        },
      });

      await notifyBoard(SYNC_BOARD_ID, { type: "issue-created", issue });
    } else {
      // "edited"
      const issue = await prisma.issue.update({
        where: { githubNodeId },
        data: { title, description },
      });

      await notifyBoard(SYNC_BOARD_ID, { type: "issue-updated", issue });
    }

    res.status(200).json({ status: "ok" });
  },
);
