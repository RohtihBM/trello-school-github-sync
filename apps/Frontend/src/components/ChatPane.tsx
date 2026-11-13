import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, CheckCircle2, Loader2, Sparkles, User } from "lucide-react";
import type { Issue } from "../lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { MARKDOWN_COMPONENTS } from "../lib/markdownComponents";

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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        {suggestion && suggestedBlocker ? (
          // The pre-planning gate: Claude found this before writing any
          // plan, and nothing proceeds until a human addresses it —
          // confirming or dismissing THIS is what continues the
          // pipeline (both routes auto-enqueue the real plan generation
          // once this resolves).
          <div className="w-full max-w-sm space-y-1.5 rounded-md border border-accent-300 bg-accent-50 p-3 text-left text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-accent-700">
              <Bot className="h-3.5 w-3.5" /> Claude found a dependency — resolve this before planning
            </div>
            <p className="text-accent-700">
              Depends on <span className="font-medium">{suggestedBlocker.title}</span> — expects:{" "}
              {suggestion.assumedContract}
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onAddDependency(suggestion.blockerId, suggestion.assumedContract)}
              >
                Confirm this dependency
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDismissSuggestion}>
                Not a real dependency — continue planning
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Generate a plan to start the conversation.
            </p>
            <Button variant="primary" disabled={pending} onClick={onGeneratePlan}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? "Generating..." : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Generate plan
                </>
              )}
            </Button>
          </>
        )}
        {errorMessage && <p className="text-xs text-danger-600">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        role="region"
        tabIndex={0}
        aria-label="Chat messages, scrollable"
        className="flex-1 space-y-2 overflow-y-auto p-3"
      >
        <div className="flex items-start gap-2">
          <Avatar className="bg-neutral-200 text-neutral-700">
            <AvatarFallback>
              <Bot className="h-3 w-3" />
            </AvatarFallback>
          </Avatar>
          <div className="max-w-[85%] min-w-0 space-y-2">
            <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
              <span className="sr-only">Claude: </span>
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{issue.plan}</ReactMarkdown>
            </div>
          </div>
        </div>

        {issue.planMessages.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            Ask Claude anything about this plan.
          </p>
        )}
        {issue.planMessages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <Avatar
              className={m.role === "user" ? "bg-accent-100 text-accent-700" : "bg-neutral-200 text-neutral-700"}
            >
              <AvatarFallback>
                {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              </AvatarFallback>
            </Avatar>
            <div
              className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
                m.role === "user" ? "bg-accent-600 text-white" : "bg-surface border border-border text-foreground"
              }`}
            >
              {/* Role conveyed by side + icon color alone visually — restored
                  non-visually for screen readers, same fix as before. */}
              <span className="sr-only">{m.role === "user" ? "You: " : "Claude: "}</span>
              {/* Markdown for assistant replies, not plain whitespace-pre-wrap
                  — found directly: a real reply used **bold** markdown syntax
                  that was rendering as literal asterisks before this fix.
                  User messages stay plain text, since nobody types markdown
                  into a chat box intending it to render. */}
              {m.role === "assistant" ? (
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              <p className={`mt-0.5 text-[0.65rem] ${m.role === "user" ? "text-accent-100" : "text-muted-foreground"}`}>
                {formatTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {/* A real "Claude is thinking" bubble, not just the small spinner
            already inside the Send button — found directly: that spinner
            is easy to miss entirely, especially once the composer itself
            is out of view while scrolled up reading a long reply. pending
            here only ever means "waiting on a chat reply" (plan
            generation's own pending state is handled by the Generate
            button, in the branch above where no plan exists yet), so this
            is unambiguous. */}
        {pending && (
          <div className="flex items-start gap-2">
            <Avatar className="bg-neutral-200 text-neutral-700">
              <AvatarFallback>
                <Bot className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2.5">
              <span className="sr-only">Claude is thinking</span>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Moved here from directly under the plan message — found
          directly: once a conversation grows past one screen, that
          message scrolls out of view and there's no way to approve (or
          now, resolve a proposed revision) without scrolling back up to
          it. This sits right above the composer instead, so it's always
          on screen alongside the rest of the thread, no scrolling
          needed, and it always reflects the CURRENT state: a revision
          banner if one's pending, otherwise approve/approved for
          whatever `issue.plan` currently holds (the original text, or
          the most recently accepted revision — there's no other copy of
          "the plan" anywhere else for this to go stale against). */}
      <div className="shrink-0 border-t border-border p-2">
        {issue.proposedPlan ? (
          <div className="space-y-1.5 rounded-lg border border-accent-300 bg-accent-50 p-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-accent-700">
              <Bot className="h-3.5 w-3.5" /> Claude proposed an updated plan
            </div>
            <div className="max-h-28 overflow-y-auto rounded-md border border-accent-200 bg-surface p-1.5">
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{issue.proposedPlan}</ReactMarkdown>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" variant="primary" size="sm" onClick={onAcceptRevision}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept revision
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onRejectRevision}>
                Keep current plan
              </Button>
            </div>
          </div>
        ) : issue.status === "READY" || issue.status === "DONE" ? (
          <div className="flex items-center gap-2 rounded-lg border border-success-600/30 bg-success-50 p-2 text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-700" />
            <div className="min-w-0">
              <p className="font-semibold text-success-700">Plan approved</p>
              <p className="text-success-700/80">
                {issue.status === "DONE"
                  ? "This ticket is marked done."
                  : "Ready to be marked done once moved to Completed."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
            <p className="text-xs text-muted-foreground">
              Approving locks this exact plan and is required before the ticket can be
              moved to Completed.
            </p>
            <Button variant="primary" size="sm" onClick={onApprove} className="w-full">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve plan
            </Button>
          </div>
        )}
      </div>

      {errorMessage && <p className="px-3 pb-1 text-xs text-danger-600">{errorMessage}</p>}

      {/* shrink-0 makes "fixed at the bottom" explicit rather than relying
          on default flex behavior — the messages list above is the only
          thing that should ever give up space to scrolling, never this. */}
      <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-1.5 border-t border-border p-3">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            issue.proposedPlan
              ? "Resolve the proposed revision above to keep chatting"
              : "Ask about this plan... (Shift+Enter for a new line)"
          }
          disabled={chatBlocked}
          rows={1}
          className="max-h-32 min-h-8 overflow-y-auto py-1.5 text-xs leading-relaxed"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={chatBlocked}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
        </Button>
      </form>
    </div>
  );
}
