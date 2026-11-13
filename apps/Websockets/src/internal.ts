import type { IncomingMessage, ServerResponse } from "node:http";
import { publishToBoard } from "./pubsub.js";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Backend and Websockets are separate processes that otherwise never talk to
// each other. This is the one exception: when Backend writes something to the
// database on its own (e.g. a GitHub webhook creating a ticket), it needs a
// way to tell Websockets "push this to whoever is live on this board" — this
// handler is that notification channel.
//
// Used to run its own dedicated server on a separate internal-only port,
// reachable only over Render's private network — but Render's free tier
// (what this app actually deploys to) lets a service SEND private-network
// requests but not RECEIVE them, so Backend/Worker (senders) were fine but
// Websockets (the receiver) genuinely could not be reached that way on the
// free tier. Fixed by attaching this handler to the SAME http.Server the
// public WebSocket upgrade already uses (see index.ts) — one Render-exposed
// port, both concerns. It's still safe to expose publicly: the shared-secret
// check below is the actual security boundary, not which port this runs on.
export function handleInternalRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST" || req.url !== "/internal/broadcast") {
    res.writeHead(404).end();
    return;
  }

  if (req.headers["x-internal-secret"] !== INTERNAL_API_SECRET) {
    res.writeHead(401).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const { boardId, message } = JSON.parse(body);
      // This is the call that most needed fixing in an earlier phase:
      // with a single instance, calling broadcastToBoard directly here
      // happened to work, because INTERNAL_BROADCAST_URL only ever
      // pointed at that one process anyway. With two instances behind
      // it, only ONE would ever receive this HTTP call — so a GitHub
      // webhook event, or a Worker's plan-ready result, would silently
      // never reach clients connected to the other instance. Publishing
      // instead means every instance's own subscriber delivers it to
      // its own locally-held sockets, including this one.
      await publishToBoard(boardId, message);
      res.writeHead(200).end();
    } catch {
      res.writeHead(400).end();
    }
  });
}
