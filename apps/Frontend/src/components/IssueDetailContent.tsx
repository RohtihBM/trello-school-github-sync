import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import type { BoardMember, Issue, OverlapInfo } from "../lib/api";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { DialogTitle } from "./ui/dialog";
import { TicketDetailsPane } from "./TicketDetailsPane";
import { ChatPane } from "./ChatPane";
import { LifecycleStepper } from "./LifecycleStepper";

interface IssueDetailContentProps {
  issue: Issue;
  allIssues: Issue[];
  boardMembers: BoardMember[];
  pending: boolean;
  errorMessage?: string;
  overlaps: OverlapInfo[];
  onGeneratePlan: () => void;
  onSendChat: (message: string) => void;
  onAddDependency: (blockerId: string, assumedContract: string) => void;
  onApprove: () => void;
  onDismissSuggestion: () => void;
  onAcceptRevision: () => void;
  onRejectRevision: () => void;
  onAssign: (userId: string) => void;
  onUnassign: (userId: string) => void;
  onClose: () => void;
}

export function IssueDetailContent({
  issue,
  allIssues,
  boardMembers,
  pending,
  errorMessage,
  overlaps,
  onGeneratePlan,
  onSendChat,
  onAddDependency,
  onApprove,
  onDismissSuggestion,
  onAcceptRevision,
  onRejectRevision,
  onAssign,
  onUnassign,
  onClose,
}: IssueDetailContentProps) {
  // Below lg there is room for one pane at a time; a switch beats two cramped
  // half-height panes. From lg up both show side by side and this is ignored.
  const [tab, setTab] = useState<"details" | "chat">("details");
  const detailsPane = (
    <TicketDetailsPane
      issue={issue}
      allIssues={allIssues}
      boardMembers={boardMembers}
      overlaps={overlaps}
      onAddDependency={onAddDependency}
      onAssign={onAssign}
      onUnassign={onUnassign}
    />
  );
  const chatPane = (
    <ChatPane
      issue={issue}
      allIssues={allIssues}
      pending={pending}
      errorMessage={errorMessage}
      onSendChat={onSendChat}
      onGeneratePlan={onGeneratePlan}
      onAddDependency={onAddDependency}
      onDismissSuggestion={onDismissSuggestion}
      onApprove={onApprove}
      onAcceptRevision={onAcceptRevision}
      onRejectRevision={onRejectRevision}
    />
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="relative shrink-0 border-b border-border bg-glow px-5 pb-5 pt-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <StatusBadge status={issue.status} />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close ticket" className="-mr-2 -mt-1 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* A real Radix DialogTitle: without it the dialog has no accessible
            name for a screen reader. */}
        <DialogTitle className="mt-3 max-w-3xl text-[1.75rem] leading-9 sm:text-[2.125rem] sm:leading-10">{issue.title}</DialogTitle>
        <div className="mt-6">
          <LifecycleStepper issue={issue} />
        </div>
      </div>

      <div role="tablist" aria-label="Ticket sections" className="flex shrink-0 gap-1 border-b border-border px-4 lg:hidden">
        {(
          [
            ["details", "Details"],
            ["chat", "Plan & conversation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`ticket-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`ticket-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px h-10 border-b-2 px-2.5 text-compact font-medium transition-colors",
              tab === id ? "border-ink text-foreground" : "border-transparent text-neutral-500 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* One column below lg (the active pane only), two columns from lg up. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section
          id="ticket-panel-details"
          role="tabpanel"
          aria-labelledby="ticket-details-heading"
          className={cn("min-h-0 flex-col bg-background", tab === "details" ? "flex" : "hidden lg:flex")}
        >
          <h3 id="ticket-details-heading" className="sr-only">
            Details
          </h3>
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">{detailsPane}</div>
        </section>

        <section
          id="ticket-panel-chat"
          role="tabpanel"
          aria-labelledby="ticket-chat-heading"
          className={cn("min-h-0 flex-col lg:border-l lg:border-border", tab === "chat" ? "flex" : "hidden lg:flex")}
        >
          <h3 id="ticket-chat-heading" className="type-eyebrow shrink-0 px-5 pb-2 pt-4 max-lg:sr-only sm:px-6">
            Plan &amp; conversation
          </h3>
          <div className="min-h-0 flex-1 overflow-hidden">{chatPane}</div>
        </section>
      </div>
    </div>
  );
}
