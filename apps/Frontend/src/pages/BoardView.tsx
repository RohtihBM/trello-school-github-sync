import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ArrowLeft, Network, Pencil, RefreshCw } from "lucide-react";
import {
  api,
  getToken,
  type Board,
  type BoardMember,
  type ConnectedUser,
  type Issue,
  type OverlapInfo,
  type Section,
} from "../lib/api";
import { BoardColumn } from "../components/BoardColumn";
import { BoardCard } from "../components/BoardCard";
import { IssueDetailContent } from "../components/IssueDetailContent";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback, initialFromEmail } from "../components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { toast } from "../hooks/use-toast";

// Same pattern as API_BASE in lib/api.ts — the deployed Websockets URL
// has to be known at Vercel build time via VITE_WS_URL. Render's
// free/paid web services are served over HTTPS, so the real deployed
// value here will be wss://, not ws:// — the scheme has to come from
// the env var itself, not be hardcoded.
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8081";

// Several broadcasts (plan-ready, issue-moved) return an issue straight from
// a Prisma query that never asked for planMessages — not because it's
// deleted, just because that particular query didn't fetch it. A plain
// replace would wipe an already-loaded chat history off the screen the
// moment any such event fires. This keeps whichever side actually has them.
function mergeIssue(existing: Issue, incoming: Issue): Issue {
  return {
    ...incoming,
    planMessages: incoming.planMessages ?? existing.planMessages,
    // Same gap as planMessages: issue-moved's prisma.issue.update() and the
    // step-6 READY-flip update neither ask for dependsOn, so a bare replace
    // would wipe an already-loaded dependency list off the screen every
    // time a card is simply dragged to a new column.
    dependsOn: incoming.dependsOn ?? existing.dependsOn,
    // Same gap again: issue-moved's bare update() doesn't ask for
    // assignees either, so a drag-to-column would otherwise wipe the
    // assignee avatar off the card until the next full reload.
    assignees: incoming.assignees ?? existing.assignees,
  };
}

function errorToast(title: string, err: unknown) {
  toast({ title, description: err instanceof Error ? err.message : undefined, variant: "destructive" });
}

export function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  // Replaces the old per-card inline expansion — exactly one ticket's
  // detail is ever shown at a time, in the docked panel (or, if expanded,
  // the full-view dialog). Clicking a card sets this; it no longer grows
  // the card itself or the column around it.
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [pendingIssueIds, setPendingIssueIds] = useState<Set<string>>(new Set());
  const [issueErrors, setIssueErrors] = useState<Record<string, string>>({});
  // Live-only, deliberately not persisted — phase 4 is "a query, not a
  // model" (no schema for this), computed fresh each time a plan is
  // generated. That also means this is lost on refresh until a relevant
  // ticket's plan is regenerated; a known, accepted consequence of that
  // design, not a bug introduced here.
  const [fileOverlaps, setFileOverlaps] = useState<Record<string, OverlapInfo[]>>({});
  // Who's assignable on this board — a plain REST fetch, independent of
  // the WebSocket join: the org's membership list doesn't change live
  // nearly as often as issues do, and it's needed before any card is even
  // opened (the assignee picker reads from it).
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  // Which card just landed from a successful move — drives the brief
  // success ring in BoardCard, cleared again after its fade finishes.
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRepository, setEditRepository] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [savingBoardEdit, setSavingBoardEdit] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  // Bookkeeping for tickets waiting on a live "plan-ready"/chat reply, so a
  // broadcast this tab missed cannot leave them stuck on "Generating...".
  const forceReconnectRef = useRef<(() => void) | null>(null);
  const pendingSinceRef = useRef<Map<string, number>>(new Map());
  const baselineRef = useRef<Map<string, { plan: string | null; messages: number }>>(new Map());

  // A drag only activates after 8px of real movement — without this, a
  // plain click anywhere on the handle would register as a (zero-distance)
  // drag every time, which is harmless functionally but fights the
  // browser's own click/focus handling in subtle ways.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function send(message: object) {
    socketRef.current?.send(JSON.stringify(message));
  }

  // Marks a ticket as waiting, remembering what it looked like at that moment
  // so a later board-state can tell whether the awaited result already landed.
  function markPending(issueId: string) {
    const issue = sections.flatMap((s) => s.issues).find((i) => i.id === issueId);
    pendingSinceRef.current.set(issueId, Date.now());
    baselineRef.current.set(issueId, { plan: issue?.plan ?? null, messages: issue?.planMessages?.length ?? 0 });
    setPendingIssueIds((prev) => new Set(prev).add(issueId));
  }

  function clearPending(issueId: string) {
    pendingSinceRef.current.delete(issueId);
    baselineRef.current.delete(issueId);
    setPendingIssueIds((prev) => {
      const next = new Set(prev);
      next.delete(issueId);
      return next;
    });
  }

  async function handleGeneratePlan(issueId: string) {
    setIssueErrors((prev) => ({ ...prev, [issueId]: "" }));
    markPending(issueId);
    try {
      await api(`/issues/${issueId}/generate-plan`, { method: "POST" });
      // intentionally NOT cleared here — stays pending until the live
      // "plan-ready" or "job-failed" broadcast actually arrives, since the
      // 202 response only means "queued," not "done."
    } catch (err) {
      clearPending(issueId);
      errorToast("Failed to request a plan", err);
    }
  }

  async function handleSendChat(issueId: string, message: string) {
    markPending(issueId);
    try {
      await api(`/issues/${issueId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    } catch (err) {
      clearPending(issueId);
      errorToast("Failed to send message", err);
    }
  }

  async function handleAddDependency(issueId: string, blockerId: string, assumedContract: string) {
    try {
      await api(`/issues/${issueId}/dependencies`, {
        method: "POST",
        body: JSON.stringify({ blockerId, assumedContract }),
      });
      // Not applying the response locally on purpose — the route broadcasts
      // the updated issue (with dependsOn) over the same WebSocket every
      // other write goes through, so the "issue-updated" case below is
      // what actually updates this screen, same as every other action here.
    } catch (err) {
      errorToast("Failed to add dependency", err);
    }
  }

  async function handleApprove(issueId: string) {
    try {
      await api(`/issues/${issueId}/approve`, { method: "POST" });
    } catch (err) {
      errorToast("Failed to approve", err);
    }
  }

  async function handleDismissSuggestion(issueId: string) {
    try {
      await api(`/issues/${issueId}/dependencies/dismiss-suggestion`, { method: "POST" });
    } catch (err) {
      errorToast("Failed to dismiss suggestion", err);
    }
  }

  async function handleAcceptRevision(issueId: string) {
    try {
      await api(`/issues/${issueId}/plan/accept-revision`, { method: "POST" });
    } catch (err) {
      errorToast("Failed to accept the revised plan", err);
    }
  }

  async function handleRejectRevision(issueId: string) {
    try {
      await api(`/issues/${issueId}/plan/reject-revision`, { method: "POST" });
    } catch (err) {
      errorToast("Failed to keep the current plan", err);
    }
  }

  async function handleAssign(issueId: string, userId: string) {
    try {
      await api(`/issues/${issueId}/assignees`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      // Same as handleAddDependency — the route broadcasts the updated
      // issue over the WebSocket, so "issue-updated" below is what
      // actually applies this, not the response here.
    } catch (err) {
      errorToast("Failed to assign", err);
    }
  }

  async function handleUnassign(issueId: string, userId: string) {
    try {
      await api(`/issues/${issueId}/assignees/${userId}`, { method: "DELETE" });
    } catch (err) {
      errorToast("Failed to unassign", err);
    }
  }

  function openEditBoard() {
    if (!board) return;
    setEditTitle(board.title);
    setEditDescription(board.description ?? "");
    setEditRepository(board.repository ?? "");
    setEditBoardOpen(true);
  }

  // No live broadcast for board-level edits (unlike issues) — applying
  // the PATCH response straight to local state, the same way BoardsList
  // already does for the same route.
  // Imports the linked repository's open GitHub issues as tickets. New tickets
  // arrive through the board's live broadcast, so no local list update is needed.
  async function handleSyncIssues() {
    if (!board || syncing) return;
    setSyncing(true);
    try {
      const r = await api<{ repository: string; created: number; updated: number }>(
        `/boards/${board.id}/sync-issues`,
        { method: "POST" },
      );
      toast({ title: `Synced ${r.repository}`, description: `${r.created} new, ${r.updated} updated` });
    } catch (err) {
      errorToast("Failed to sync issues", err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveBoardEdit(e: FormEvent) {
    e.preventDefault();
    if (!board || editTitle.trim() === "" || savingBoardEdit) return;
    setSavingBoardEdit(true);
    try {
      const updated = await api<Board>(`/boards/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle, description: editDescription, repository: editRepository.trim() }),
      });
      setBoard(updated);
      setEditBoardOpen(false);
    } catch (err) {
      errorToast("Failed to update board", err);
    } finally {
      setSavingBoardEdit(false);
    }
  }

  function handleDeleteIssue(issue: Issue) {
    if (window.confirm(`Delete "${issue.title}"?`)) {
      send({ type: "delete-issue", issueId: issue.id });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const issueId = String(active.id);
    const targetSectionId = String(over.id);
    const current = sections.flatMap((s) => s.issues).find((i) => i.id === issueId);
    if (!current || current.sectionId === targetSectionId) return;

    // Optimistic — move it locally the instant it's dropped, rather than
    // waiting on the full WebSocket round trip (send -> server write ->
    // broadcast back) before anything visibly happens. Without this, the
    // card's drag `transform` resets the moment the drag ends (dnd-kit's
    // own behavior) while the real section change hasn't landed yet,
    // which reads as "snap back, pause, then teleport" instead of one
    // continuous move. The later "issue-moved" broadcast still arrives
    // and is still what actually drives the success ring + any
    // server-decided fields (status flip, final position) — this just
    // stops the UI from waiting on it to show the move at all.
    setSections((prev) =>
      prev
        .map((s) => ({ ...s, issues: s.issues.filter((i) => i.id !== issueId) }))
        .map((s) =>
          s.id === targetSectionId
            ? { ...s, issues: [...s.issues, { ...current, sectionId: targetSectionId }] }
            : s,
        ),
    );

    send({ type: "move-issue", issueId, sectionId: targetSectionId });
  }

  useEffect(() => {
    if (!boardId) return;
    api<BoardMember[]>(`/boards/${boardId}/members`)
      .then(setBoardMembers)
      .catch((err) => errorToast("Failed to load board members", err));
  }, [boardId]);

  // A live connection can go quiet without ever closing (a sleeping laptop, a
  // background tab, a proxy dropping it). If a ticket has been waiting well
  // past a normal plan, reconnect: the join returns the current board state.
  const hasPending = pendingIssueIds.size > 0;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const stale = [...pendingSinceRef.current.values()].some((t) => now - t > 45_000);
      if (!stale) return;
      for (const id of pendingSinceRef.current.keys()) pendingSinceRef.current.set(id, now);
      forceReconnectRef.current?.();
    }, 15_000);
    return () => clearInterval(timer);
  }, [hasPending]);

  useEffect(() => {
    if (!boardId) return;

    let cancelled = false;
    let attempt = 0;
    let warned = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // Opens (or re-opens) the live connection. Every successful join makes the
    // server send a fresh "board-state", so reconnecting also re-syncs
    // anything that was broadcast while this tab was not listening.
    function connect() {
      const token = getToken();
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        warned = false;
        socket.send(JSON.stringify({ type: "join", boardId, token }));
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "board-state": {
            setBoard(message.board);
            setSections(message.sections);
            setUsers(message.users);
            // Fresh state from the server: anything this tab was still waiting
            // on that has already landed (a new plan, or a new assistant reply)
            // is no longer pending, even though its live message never arrived.
            const fresh: Issue[] = (message.sections as Section[]).flatMap((sec) => sec.issues);
            for (const id of [...pendingSinceRef.current.keys()]) {
              const issue = fresh.find((i) => i.id === id);
              const base = baselineRef.current.get(id);
              if (!issue || !base) continue;
              const messages = issue.planMessages ?? [];
              const replied =
                messages.length > base.messages && messages[messages.length - 1]?.role === "assistant";
              if (issue.plan !== base.plan || replied) clearPending(id);
            }
            break;
          }
          case "user-joined":
            setUsers((prev) => [...prev, message.user]);
            break;
          case "user-left":
            setUsers((prev) => prev.filter((u) => u.userId !== message.userId));
            break;
          case "issue-created":
            // A genuinely brand-new issue — prisma.issue.create() never
            // returns relations, so planMessages is missing from this
            // payload entirely, not just empty. mergeIssue doesn't apply
            // here (there's no existing issue to fall back to), so default
            // it explicitly, or PlanPanel would crash reading .map() on
            // undefined the moment someone opens this card's panel.
            setSections((prev) =>
              prev.map((s) =>
                s.id === message.issue.sectionId
                  ? {
                      ...s,
                      issues: [
                        ...s.issues,
                        { ...message.issue, planMessages: [], dependsOn: [], assignees: [] },
                      ],
                    }
                  : s,
              ),
            );
            break;
          case "issue-updated":
          case "plan-ready":
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                issues: s.issues.map((i) =>
                  i.id === message.issue.id ? mergeIssue(i, message.issue) : i,
                ),
              })),
            );
            // A dependency suggestion arriving means Claude's turn for this
            // click is over — it's waiting on a human now (confirm/dismiss
            // in the pane), not still generating anything. Without this,
            // "Generating..." would keep spinning on the button that no
            // longer even renders, right through the exact moment the real
            // next action (the suggestion banner) appears.
            if (message.type === "issue-updated" && message.issue.suggestedDependency) {
              clearPending(message.issue.id);
            }
            if (message.type === "plan-ready") {
              clearPending(message.issue.id);
              // A single broadcast carries enough to update BOTH sides of
              // the overlap live, for every connected client — no second
              // message needed: this ticket's own list comes straight from
              // message.overlaps, and each ticket named in there gets this
              // one added back to ITS list, since a file overlap is always
              // symmetric.
              const overlaps: OverlapInfo[] = message.overlaps ?? [];
              if (overlaps.length > 0) {
                setFileOverlaps((prev) => {
                  const next: Record<string, OverlapInfo[]> = {
                    ...prev,
                    [message.issue.id]: overlaps,
                  };
                  for (const other of overlaps) {
                    const reciprocal: OverlapInfo = {
                      id: message.issue.id,
                      title: message.issue.title,
                      sharedFiles: other.sharedFiles,
                    };
                    const existing = next[other.id] ?? [];
                    next[other.id] = [
                      ...existing.filter((o) => o.id !== message.issue.id),
                      reciprocal,
                    ];
                  }
                  return next;
                });
              }
            }
            break;
          case "chat-message":
            // The user's own message broadcast (sent the instant they hit
            // Send, before Claude has replied) carries no `issue` — only
            // the later assistant-reply broadcast does, since that's the
            // only one that can ever change proposedPlan.
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                issues: s.issues.map((i) =>
                  i.id === message.message.issueId
                    ? {
                        ...(message.issue ? mergeIssue(i, message.issue) : i),
                        planMessages: [...i.planMessages, message.message],
                      }
                    : i,
                ),
              })),
            );
            clearPending(message.message.issueId);
            break;
          case "job-failed":
            clearPending(message.issueId);
            setIssueErrors((prev) => ({ ...prev, [message.issueId]: message.error }));
            toast({ title: "Plan generation failed", description: message.error, variant: "destructive" });
            break;
          case "issue-deleted":
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                issues: s.issues.filter((i) => i.id !== message.issueId),
              })),
            );
            break;
          case "issue-moved":
            setSections((prev) => {
              const existing = prev
                .flatMap((s) => s.issues)
                .find((i) => i.id === message.issue.id);
              const merged = existing
                ? mergeIssue(existing, message.issue)
                : {
                    ...message.issue,
                    planMessages: message.issue.planMessages ?? [],
                    dependsOn: message.issue.dependsOn ?? [],
                    assignees: message.issue.assignees ?? [],
                  };

              return prev
                .map((s) => ({
                  ...s,
                  issues: s.issues.filter((i) => i.id !== message.issue.id),
                }))
                .map((s) =>
                  s.id === merged.sectionId
                    ? { ...s, issues: [...s.issues, merged] }
                    : s,
                );
            });
            // The success cue — timed from the move actually landing, not
            // from the local drag ending (dropping and the server
            // confirming the move are two different moments, connected by
            // a WebSocket round trip, not something to fake as instant).
            setJustMovedId(message.issue.id);
            setTimeout(() => {
              setJustMovedId((id) => (id === message.issue.id ? null : id));
            }, 700);
            break;
          case "dependency-mismatch":
            // Only carries the edge's keys + contracts, not a full issue —
            // patch just the matching dependsOn entry on the blocked ticket
            // rather than requiring every broadcast to ship a whole Issue.
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                issues: s.issues.map((i) =>
                  i.id === message.blockedId
                    ? {
                        ...i,
                        dependsOn: i.dependsOn.map((d) =>
                          d.blockerId === message.blockerId
                            ? { ...d, actualContract: message.actualContract, mismatchFlag: true }
                            : d,
                        ),
                      }
                    : i,
                ),
              })),
            );
            break;
          case "error":
            toast({ title: "Something went wrong", description: message.message, variant: "destructive" });
            break;
          case "move-rejected":
            // Revert the optimistic move handleDragEnd already applied —
            // the server is telling us where the issue actually still is,
            // since the drop itself never happened server-side. Reads the
            // issue out of `prev` itself (the current, already-optimistic
            // state), not the outer `allIssues` — that's a stale closure
            // from whenever this WebSocket effect last ran, not "right now."
            setSections((prev) => {
              const found = prev.flatMap((s) => s.issues).find((i) => i.id === message.issueId);
              if (!found) return prev;
              return prev
                .map((s) => ({ ...s, issues: s.issues.filter((i) => i.id !== message.issueId) }))
                .map((s) =>
                  s.id === message.sectionId
                    ? { ...s, issues: [...s.issues, { ...found, sectionId: s.id }] }
                    : s,
                );
            });
            toast({ title: "Can't move ticket", description: message.message, variant: "destructive" });
            break;
        }
      };

      // onerror is always followed by onclose, which is where the retry lives.
      socket.onclose = () => {
        if (cancelled || socketRef.current !== socket) return;
        if (!warned) {
          warned = true;
          toast({ title: "Connection lost", description: "Reconnecting to the live board...", variant: "destructive" });
        }
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
        attempt += 1;
      };
    }

    // Drops the current socket without triggering its retry path and opens a
    // fresh one right away. Used when a connection looks alive but has gone
    // quiet (see the pending-ticket check below) or the tab comes back.
    forceReconnectRef.current = () => {
      if (cancelled) return;
      const old = socketRef.current;
      if (old) {
        old.onclose = null;
        old.onmessage = null;
        old.close();
      }
      clearTimeout(retryTimer);
      attempt = 0;
      connect();
    };

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const open = socketRef.current?.readyState === WebSocket.OPEN;
      if (!open || pendingSinceRef.current.size > 0) forceReconnectRef.current?.();
    }
    document.addEventListener("visibilitychange", onVisible);

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      forceReconnectRef.current = null;
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [boardId]);

  const allIssues = sections.flatMap((s) => s.issues);
  const selectedIssue = allIssues.find((i) => i.id === selectedIssueId) ?? null;

  // Deep link from the dependency graph — a node click there navigates
  // here with ?issue=<id> instead of just dumping you on the board with
  // no indication of which ticket you came to look at. Runs once the
  // issue actually shows up in `sections` (the WebSocket join hasn't
  // necessarily resolved yet on first render), then clears the param so
  // navigating away and back doesn't reopen it from a stale URL.
  useEffect(() => {
    const targetId = searchParams.get("issue");
    if (!targetId) return;
    const target = allIssues.find((i) => i.id === targetId);
    if (!target) return;
    setSelectedIssueId(targetId);
    setFullViewOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("issue");
      return next;
    });
  }, [searchParams, allIssues, setSearchParams]);

  function closeDetail() {
    setSelectedIssueId(null);
    setFullViewOpen(false);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              {/* Text labels hidden below sm — four header items (back,
                  title, graph link, presence avatars) genuinely don't
                  fit in one row at phone width with all of them spelled
                  out; icons stay, since the icon alone is still a clear
                  enough target at this size, same bar the rest of this
                  app's compact UI already holds to. */}
              <Link to="/">
                <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Boards</span>
              </Link>
            </Button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-sm font-semibold text-foreground">
                  {board?.title ?? "Loading..."}
                </h1>
                {board && (
                  <button
                    onClick={openEditBoard}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Edit board"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {board?.description && (
                <p className="hidden truncate text-xs text-muted-foreground sm:block">{board.description}</p>
              )}
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {board?.repository ? `Repository: ${board.repository}` : "No repository linked"}
              </p>
            </div>
            {board?.repository && (
              <Button variant="ghost" size="sm" onClick={handleSyncIssues} disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />{" "}
                <span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync issues"}</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/boards/${boardId}/graph`}>
                <Network className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Dependency graph</span>
              </Link>
            </Button>
          </div>

          <div className="flex shrink-0 items-center -space-x-2">
            {users.map((u) => (
              <Tooltip key={u.userId}>
                <TooltipTrigger asChild>
                  {/* tabIndex + aria-label so who's online is reachable by
                      keyboard/screen reader too, not just mouse hover —
                      Avatar renders a plain span by default, outside the
                      tab order, and Radix Tooltip also shows on focus once
                      the trigger is actually focusable. */}
                  <Avatar tabIndex={0} aria-label={u.email} className="border-2 border-surface">
                    <AvatarFallback>{initialFromEmail(u.email)}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{u.email}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </header>

      <Dialog open={editBoardOpen} onOpenChange={setEditBoardOpen}>
        <DialogContent>
          <DialogTitle>Edit board</DialogTitle>
          <form onSubmit={handleSaveBoardEdit} className="mt-4 space-y-3">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Board title"
              disabled={savingBoardEdit}
              autoFocus
            />
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              disabled={savingBoardEdit}
            />
            <Input
              value={editRepository}
              onChange={(e) => setEditRepository(e.target.value)}
              placeholder="GitHub repository, e.g. owner/name (optional)"
              disabled={savingBoardEdit}
            />
            <Button type="submit" variant="primary" disabled={savingBoardEdit} className="w-full">
              {savingBoardEdit ? "Saving..." : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-x-auto overflow-y-auto p-6">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex items-start gap-4">
              {sections.map((section) => (
                <BoardColumn
                  key={section.id}
                  sectionId={section.id}
                  title={section.title}
                  issueCount={section.issues.length}
                >
                  {section.issues.map((issue) => (
                    <BoardCard
                      key={issue.id}
                      issue={issue}
                      isSelected={selectedIssueId === issue.id}
                      justMoved={justMovedId === issue.id}
                      onSelect={() => {
                        setSelectedIssueId(issue.id);
                        setFullViewOpen(true);
                      }}
                      onDelete={() => handleDeleteIssue(issue)}
                    />
                  ))}
                </BoardColumn>
              ))}
            </div>
          </DndContext>
        </main>
      </div>

      {/* Selecting a card opens this directly — a focused dialog over a
          dimmed board, showing only that one ticket's title, description,
          plan, and chat. No intermediate docked panel: this is the only
          detail surface a card click leads to. */}
      <Dialog open={fullViewOpen && !!selectedIssue} onOpenChange={(open) => !open && closeDetail()}>
        {/* Full-screen below sm — a focused dialog floating over a dimmed
            board makes sense with room to spare on desktop; on a phone
            it would just be a cramped box inside an already-small
            screen, so it becomes the whole screen instead.

            Sized much closer to the actual viewport on desktop too
            (95vh/95vw up to a 6xl cap, not 85vh/90vw/4xl) — reading a
            real description with acceptance criteria, a generated plan,
            and chatting all at once needs real room, not a modal that
            leaves most of the screen as dimmed backdrop. */}
        <DialogContent
          hideClose
          className="flex h-screen w-screen max-w-none flex-col overflow-hidden rounded-none p-0 sm:h-[95vh] sm:w-[95vw] sm:max-w-6xl sm:rounded-lg"
        >
          {selectedIssue && (
            <IssueDetailContent
              issue={selectedIssue}
              allIssues={allIssues}
              boardMembers={boardMembers}
              pending={pendingIssueIds.has(selectedIssue.id)}
              errorMessage={issueErrors[selectedIssue.id]}
              overlaps={fileOverlaps[selectedIssue.id] ?? []}
              onGeneratePlan={() => handleGeneratePlan(selectedIssue.id)}
              onSendChat={(message) => handleSendChat(selectedIssue.id, message)}
              onAddDependency={(blockerId, assumedContract) =>
                handleAddDependency(selectedIssue.id, blockerId, assumedContract)
              }
              onApprove={() => handleApprove(selectedIssue.id)}
              onDismissSuggestion={() => handleDismissSuggestion(selectedIssue.id)}
              onAcceptRevision={() => handleAcceptRevision(selectedIssue.id)}
              onRejectRevision={() => handleRejectRevision(selectedIssue.id)}
              onAssign={(userId) => handleAssign(selectedIssue.id, userId)}
              onUnassign={(userId) => handleUnassign(selectedIssue.id, userId)}
              onClose={closeDetail}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
