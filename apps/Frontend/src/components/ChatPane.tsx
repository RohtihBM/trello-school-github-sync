import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, CheckCircle2, Loader2, SendHorizontal, Sparkles, User } from "lucide-react";
import type { Issue } from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { MARKDOWN_COMPONENTS } from "../lib/markdownComponents";
import { cn } from "../lib/cn";

interface ChatPaneProps {
  issue: Issue;
  allIssues: Issue[];
  pending: boolean;
  errorMessage?: string;
  onSendChat: (message: string) => void;
  onGeneratePlan: () => void;
  onAddDependency: (blockerId: string, assumedContract: string) => void;
  onDismissSuggestion: () => void;
  onApprove: () => void;
  onAcceptRevision: () => void;
  onRejectRevision: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Split out of the old PlanPanel so chat can sit in its own column beside
// the ticket's details (full view) instead of stacked underneath them.
//
// The generated plan now lives IN this thread as the first message,
// rather than in a separate "Ticket details" card — it's a real Claude
// response (apps/Worker/src/processPlanJob.ts's generate-plan call), not
// a UI fabrication; it's just read from `issue.plan` here rather than
// `issue.planMessages`, since that's the field it's actually persisted
// in. Everything that used to gate "is there a plan yet" (the Generate
// button, the pre-plan dependency-suggestion banner) moved here too,
// since that's the natural start of this same conversation, not a
// separate concern living in a different panel.
export function ChatPane({
  issue,
  allIssues,
  pending,
  errorMessage,
  onSendChat,
  onGeneratePlan,
  onAddDependency,
  onDismissSuggestion,
  onApprove,
  onAcceptRevision,
  onRejectRevision,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Without this, a new message (or the thinking indicator below) could
  // land below the visible scroll area with nothing telling the user it
  // arrived at all — found directly: there was no auto-scroll anywhere
  // in this component before now.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [issue.planMessages.length, pending]);

  const suggestion = issue.suggestedDependency;
  const suggestedBlocker = suggestion
    ? allIssues.find((i) => i.id === suggestion.blockerId)
    : undefined;

  const chatBlocked = pending || !!issue.proposedPlan;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() === "" || chatBlocked) return;
    onSendChat(draft);
    setDraft("");
    // The textarea's own height grows via scrollHeight on input; clearing
    // the value doesn't shrink it back on its own (scrollHeight stays
    // whatever it last grew to), so this is reset by hand right after
    // the message actually sends.
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  // Auto-grow up to a cap (set by the textarea's own max-h-32 class),
  // past which it scrolls internally instead of continuing to grow —
  // resetting to "auto" first is what lets scrollHeight shrink back
  // down too, not just grow, when text is deleted.
  function handleInput(e: FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Enter sends (matching every real chat app); Shift+Enter inserts an
  // actual newline instead — the browser's own default for a textarea,
  // so this only needs to intervene for the plain-Enter case.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() === "" || chatBlocked) return;
      onSendChat(draft);
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }

  if (!issue.plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        {suggestion && suggestedBlocker ? (
          // The pre-planning gate: Claude found this before writing any plan,
          // and nothing proceeds until a human addresses it — confirming or
          // dismissing THIS is what continues the pipeline (both routes
          // auto-enqueue the real plan generation once this resolves).
          <div className="w-full max-w-md space-y-3 rounded-xl border border-accent-200 bg-accent-50 p-4 text-left">
            <div className="flex items-center gap-2 text-compact font-semibold text-accent-700">
              <Bot className="h-4 w-4" /> Claude found a dependency
            </div>
            <p className="text-compact leading-6 text-neutral-700">
              This ticket looks like it depends on <span className="font-medium text-foreground">{suggestedBlocker.title}</span>,
              expecting: {suggestion.assumedContract}
            </p>
            <p className="type-meta">Resolve this to continue — planning starts once you decide.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onAddDependency(suggestion.blockerId, suggestion.assumedContract)}
              >
                Confirm dependency
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onDismissSuggestion}>
                Not a dependency — continue
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="type-heading">No plan yet</p>
              <p className="type-body text-neutral-500">
                Claude will read this ticket and your repository, then draft an implementation plan you can discuss and approve.
              </p>
            </div>
            <Button variant="accent" disabled={pending} onClick={onGeneratePlan}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Generate plan
                </>
              )}
            </Button>
          </>
        )}
        {errorMessage && (
          <p role="alert" className="text-compact text-danger-700">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        role="region"
        tabIndex={0}
        aria-label="Chat messages, scrollable"
        className="flex-1 space-y-4 overflow-y-auto px-5 py-3 sm:px-6"
      >
        <div className="flex items-start gap-3">
          <Avatar className="mt-0.5 h-6 w-6 bg-accent-100 text-accent-700">
            <AvatarFallback>
              <Bot className="h-3.5 w-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 rounded-xl bg-surface px-5 py-4 text-[0.875rem] text-neutral-700 shadow-raise ring-1 ring-border">
            <span className="sr-only">Claude: </span>
            <p className="mb-2 flex items-center gap-1.5 type-eyebrow text-accent-700">
              <Sparkles aria-hidden className="h-3 w-3" /> Implementation plan
            </p>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>{issue.plan}</ReactMarkdown>
          </div>
        </div>

        {issue.planMessages.length === 0 && (
          <p className="py-2 text-center type-meta">Ask Claude anything about this plan.</p>
        )}
        {issue.planMessages.map((m) => (
          <div key={m.id} className={cn("flex items-start gap-3", m.role === "user" && "flex-row-reverse")}>
            <Avatar
              className={cn(
                "mt-0.5 h-6 w-6",
                m.role === "user" ? "bg-neutral-200 text-neutral-700" : "bg-accent-100 text-accent-700",
              )}
            >
              <AvatarFallback>
                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 text-compact",
                m.role === "user"
                  ? "bg-neutral-900 text-neutral-50"
                  : "border border-border bg-surface text-neutral-700",
              )}
            >
              {/* Role conveyed by side + colour visually — restored for
                  screen readers. */}
              <span className="sr-only">{m.role === "user" ? "You: " : "Claude: "}</span>
              {/* Markdown for assistant replies; user messages stay plain
                  text, since nobody types markdown into a chat box intending
                  it to render. */}
              {m.role === "assistant" ? (
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap leading-6">{m.content}</p>
              )}
              <p className={cn("mt-1 text-xs tabular-nums", m.role === "user" ? "text-neutral-400" : "text-neutral-400")}>
                {formatTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {/* A real "Claude is thinking" bubble, not just the small spinner
            inside the Send button — that one is easy to miss once the
            composer is out of view. pending here only ever means "waiting on
            a chat reply" (plan generation's own pending state is handled by
            the Generate button above). */}
        {pending && (
          <div className="flex items-start gap-3" role="status">
            <Avatar className="mt-0.5 h-6 w-6 bg-accent-100 text-accent-700">
              <AvatarFallback>
                <Bot className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3.5 py-3.5">
              <span className="sr-only">Claude is thinking</span>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Sits right above the composer so it's always on screen alongside the
          thread: a revision banner if one's pending, otherwise
          approve/approved for whatever `issue.plan` currently holds. */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3 sm:px-6">
        {issue.proposedPlan ? (
          <div className="space-y-2.5 rounded-xl border border-accent-200 bg-accent-50 p-3 text-compact">
            <div className="flex items-center gap-1.5 font-semibold text-accent-700">
              <Bot className="h-4 w-4" /> Claude proposed an updated plan
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-accent-200 bg-surface p-2.5 text-neutral-700">
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{issue.proposedPlan}</ReactMarkdown>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="accent" size="sm" onClick={onAcceptRevision}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept revision
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onRejectRevision}>
                Keep current plan
              </Button>
            </div>
          </div>
        ) : issue.status === "READY" || issue.status === "DONE" ? (
          <div className="flex items-center gap-3 rounded-xl border border-success-500/30 bg-success-50 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" />
            <div className="min-w-0 text-compact">
              <p className="font-semibold text-success-700">Plan approved</p>
              <p className="text-success-700/80">
                {issue.status === "DONE"
                  ? "This ticket is marked done."
                  : "Ready to be marked done once moved to Completed."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-neutral-500 sm:max-w-sm">
              Approving locks this exact plan. It's required before the ticket can move to Completed.
            </p>
            <Button variant="primary" size="sm" onClick={onApprove} className="shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve plan
            </Button>
          </div>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="px-5 pb-1 text-compact text-danger-700 sm:px-6">
          {errorMessage}
        </p>
      )}

      {/* shrink-0 makes "fixed at the bottom" explicit — the messages list
          above is the only thing that should ever give up space to
          scrolling, never this. */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-border px-5 py-3 sm:px-6">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            aria-label="Message Claude about this plan"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              issue.proposedPlan
                ? "Resolve the proposed revision above to keep chatting"
                : "Ask Claude about this plan…"
            }
            disabled={chatBlocked}
            rows={1}
            className="max-h-32 min-h-9 overflow-y-auto py-2 text-compact leading-5"
          />
          <Button type="submit" variant="primary" size="md" disabled={chatBlocked || draft.trim() === ""} aria-label="Send message">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
            Send
          </Button>
        </div>
        <p className="mt-1.5 hidden text-xs text-neutral-400 sm:block">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
