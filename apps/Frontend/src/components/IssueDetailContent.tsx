import { X } from "lucide-react";
import type { BoardMember, Issue, OverlapInfo } from "../lib/api";
import { Badge, STATUS_BADGE_VARIANT } from "./ui/badge";
import { Button } from "./ui/button";
import { DialogTitle } from "./ui/dialog";
import { TicketDetailsPane } from "./TicketDetailsPane";
import { ChatPane } from "./ChatPane";

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
      <div className="flex items-start justify-between gap-2 border-b border-border bg-surface p-4">
        <div className="min-w-0 space-y-1">
          {/* A real Radix DialogTitle, not a plain <p> — found by an
              actual axe-core scan (Phase 6), not assumed: a plain <p>
              has no aria-labelledby link to the dialog, so the dialog
              itself has no accessible name at all for a screen reader.
              Same visual result, className override keeps it identical
              to what was here before. */}
          <DialogTitle className="truncate text-sm font-semibold text-foreground">
            {issue.title}
          </DialogTitle>
          <Badge variant={STATUS_BADGE_VARIANT[issue.status]}>{issue.status}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Two distinct elevated panels, not one pane split by a border
          line — details and chat each read as their own self-contained
          surface, the same bordered/shadowed card language the rest of
          the app already uses (BoardsList's board cards, etc.), not a
          new pattern invented just for this dialog. */}
      {/* Stacked (one column, two equal rows) below sm, side by side from
          sm up — grid-rows-2 on the stacked case matters just as much as
          grid-cols-1: without it, both panels would want their natural
          content height in a container that doesn't scroll, pushing the
          chat composer off screen instead of splitting the space. */}
      <div className="grid flex-1 grid-cols-1 grid-rows-2 gap-2 overflow-hidden p-2 sm:grid-cols-2 sm:grid-rows-1">
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {/* Compact, fixed header — the description itself now lives in
              the scrollable body below as its own section (see
              TicketDetailsPane), not here, since a real description with
              an acceptance-criteria list needs room to grow rather than
              a header strip that would otherwise keep expanding with it. */}
          <div className="shrink-0 border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">Ticket details</p>
          </div>
          <div className="flex-1 overflow-y-auto">{detailsPane}</div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="shrink-0 border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">Chat</p>
          </div>
          <div className="flex-1 overflow-hidden">{chatPane}</div>
        </div>
      </div>
    </div>
  );
}
