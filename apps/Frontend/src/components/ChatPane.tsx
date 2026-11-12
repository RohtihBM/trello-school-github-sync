import { useState, type FormEvent } from "react";
import { Bot, Loader2, User } from "lucide-react";
import type { Issue } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback } from "./ui/avatar";

interface ChatPaneProps {
  issue: Issue;
  pending: boolean;
  onSendChat: (message: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Split out of the old PlanPanel so chat can sit in its own column beside
// the ticket's details (full view) instead of stacked underneath them —
// the compact docked panel still stacks the two vertically, but this
// component itself doesn't need to know which layout it's in.
export function ChatPane({ issue, pending, onSendChat }: ChatPaneProps) {
  const [draft, setDraft] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() === "" || pending) return;
    onSendChat(draft);
    setDraft("");
  }

  if (!issue.plan) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Generate a plan first to start chatting about it.
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
              <p className="whitespace-pre-wrap">{m.content}</p>
              <p className={`mt-0.5 text-[0.65rem] ${m.role === "user" ? "text-accent-100" : "text-muted-foreground"}`}>
                {formatTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* shrink-0 makes "fixed at the bottom" explicit rather than relying
          on default flex behavior — the messages list above is the only
          thing that should ever give up space to scrolling, never this. */}
      <form onSubmit={handleSubmit} className="flex shrink-0 gap-1.5 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about this plan..."
          disabled={pending}
          className="h-8 text-xs"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
        </Button>
      </form>
    </div>
  );
}
