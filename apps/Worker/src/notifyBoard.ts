// Same internal-broadcast mechanism built in phase 1 (apps/Backend/src/routes/github.ts
// has the original). Duplicated here rather than extracted into a shared
// package — it's ~10 lines, same precedent as getJwtSecret being duplicated
// across apps instead of factored out.
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
    console.error("failed to notify Websockets of plan update:", err);
  }
}
