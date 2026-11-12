// The phase-1 internal-broadcast mechanism (apps/Websockets/src/internal.ts
// is the receiving end). Extracted here now that a second route in this app
// (chat, alongside the GitHub webhook) needs it — not worth a third inline
// copy, unlike the smaller helpers that got duplicated across apps.
const INTERNAL_BROADCAST_URL = process.env.INTERNAL_BROADCAST_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export async function notifyBoard(boardId: string, message: unknown) {
  if (!INTERNAL_BROADCAST_URL) return;
  try {
    await fetch(INTERNAL_BROADCAST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ boardId, message }),
    });
  } catch (err) {
    console.error("failed to notify Websockets:", err);
  }
}
