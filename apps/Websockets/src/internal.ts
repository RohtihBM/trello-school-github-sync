import { createServer } from "node:http";
import { publishToBoard } from "./pubsub.js";

const INTERNAL_PORT = process.env.INTERNAL_PORT
  ? Number(process.env.INTERNAL_PORT)
  : 8082;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Backend and Websockets are separate processes that otherwise never talk to
// each other. This is the one exception: when Backend writes something to the
// database on its own (e.g. a GitHub webhook creating a ticket), it needs a
// way to tell Websockets "push this to whoever is live on this board" — this
// server is that notification channel. It is internal-only: nothing outside
// this machine should ever be able to reach it, which is why it's gated by a
// shared secret rather than exposed the way the public WebSocket port is.
export function startInternalServer() {
  const server = createServer((req, res) => {
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
        // This is the call that most needed fixing in this whole phase:
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
  });

  server.listen(INTERNAL_PORT, () => {
    console.log(`Internal broadcast server listening on port ${INTERNAL_PORT}`);
  });
}
