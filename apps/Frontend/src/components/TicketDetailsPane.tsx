import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import type { BoardMember, Issue, OverlapInfo } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, STATUS_BADGE_VARIANT } from "./ui/badge";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import { cn } from "../lib/cn";

interface TicketDetailsPaneProps {
  issue: Issue;
  allIssues: Issue[];
  boardMembers: BoardMember[];
  pending: boolean;
  errorMessage?: string;
  overlaps: OverlapInfo[];
  onGeneratePlan: () => void;
  onAddDependency: (blockerId: string, assumedContract: string) => void;
  onApprove: () => void;
  onDismissSuggestion: () => void;
  onAssign: (userId: string) => void;
  onUnassign: (userId: string) => void;
}

type DependencyBadge = "waiting" | "done-no-contract" | "mismatch" | "resolved";

// The actual fix for the "waiting forever" gap: knowing only
// actualContract === null used to mean "still blocked," even once the
// blocker genuinely finished without ever having a plan to diff against.
// blocker.status is what makes the distinction possible at all.
function dependencyBadge(dep: Issue["dependsOn"][number]): DependencyBadge {
  if (dep.actualContract !== null) return dep.mismatchFlag ? "mismatch" : "resolved";
  return dep.blocker.status === "DONE" ? "done-no-contract" : "waiting";
}

// Only "mismatch" gets a tinted row background + icon below — it's the
// one state that means something actually needs a human's attention
// (the blocker shipped something different than this ticket assumed).
// The other three are informational, so they stay visually quiet: a
// plain row with just the badge, same as before.
const DEPENDENCY_BADGE_CONFIG: Record<
  DependencyBadge,
  { label: string; variant: "warning" | "danger" | "success" | "neutral" }
> = {
  waiting: { label: "waiting", variant: "warning" },
  "done-no-contract": { label: "done, no contract", variant: "neutral" },
  mismatch: { label: "mismatch", variant: "danger" },
  resolved: { label: "resolved", variant: "success" },
};

// Split out of the old PlanPanel — this is the "what is this ticket, and
// what does it depend on" half; ChatPane is the other half. Kept
// separate so the full view can lay them out side by side instead of one
// long stacked column.
export function TicketDetailsPane({
  issue,
  allIssues,
  boardMembers,
  pending,
  errorMessage,
  overlaps,
  onGeneratePlan,
  onAddDependency,
  onApprove,
  onDismissSuggestion,
  onAssign,
  onUnassign,
}: TicketDetailsPaneProps) {
  const [blockerId, setBlockerId] = useState("");
  const [assumedContract, setAssumedContract] = useState("");
  const [addingAssigneeId, setAddingAssigneeId] = useState("");

  const assignedIds = new Set(issue.assignees.map((a) => a.user.id));
  const unassignedMembers = boardMembers.filter((m) => !assignedIds.has(m.id));

  function handleAssignSubmit(e: FormEvent) {
    e.preventDefault();
    if (addingAssigneeId === "") return;
    onAssign(addingAssigneeId);
    setAddingAssigneeId("");
  }

  const suggestion = issue.suggestedDependency;
  const suggestedBlocker = suggestion
    ? allIssues.find((i) => i.id === suggestion.blockerId)
    : undefined;

  const candidateBlockers = allIssues.filter(
    (i) => i.id !== issue.id && i.boardId === issue.boardId,
  );

  function handleAddDependency(e: FormEvent) {
    e.preventDefault();
    if (blockerId === "" || assumedContract.trim() === "") return;
    onAddDependency(blockerId, assumedContract);
    setBlockerId("");
    setAssumedContract("");
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Assignees</p>

        {issue.assignees.length === 0 && (
          <p className="text-xs text-muted-foreground">Unassigned</p>
        )}

        {issue.assignees.length > 0 && (
          <div className="space-y-1">
            {issue.assignees.map((a) => (
              <div
                key={a.user.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1"
              >
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5 text-[0.6rem]">
                    <AvatarFallback>{initialFromEmail(a.user.email)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-foreground">{a.user.email}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onUnassign(a.user.id)}
                  aria-label={`Unassign ${a.user.email}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {unassignedMembers.length > 0 && (
          <form onSubmit={handleAssignSubmit} className="flex gap-1.5">
            <Select
              aria-label="Add an assignee"
              value={addingAssigneeId}
              onChange={(e) => setAddingAssigneeId(e.target.value)}
              className="h-8 text-xs"
            >
              <option value="">Assign someone...</option>
              {unassignedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm">
              Add
            </Button>
          </form>
        )}
      </div>

      {errorMessage && <p className="text-xs text-danger-600">{errorMessage}</p>}

      {overlaps.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning-700/20 bg-warning-50 p-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-warning-700">
            <AlertTriangle className="h-3.5 w-3.5" /> File overlap warning
          </div>
          {overlaps.map((o) => (
            <p key={o.id} className="text-warning-700">
              Shares <span className="font-mono">{o.sharedFiles.join(", ")}</span> with{" "}
              <span className="font-medium">{o.title}</span>
            </p>
          ))}
        </div>
      )}

      {issue.plan ? (
        <>
          <div className="prose-plan rounded-md border border-border bg-surface p-3 text-xs">
            <ReactMarkdown
              components={{
                // Headings get real visual weight — a border-left accent
                // plus a size/weight jump from body text, not just a
                // slightly-bolder paragraph. This is the concrete fix for
                // "scannable": without it, a plan with several sections
                // reads as one undifferentiated block of text, and
                // finding "the testing section" means reading everything.
                h1: (p) => (
                  <p
                    className="mb-1.5 mt-3 border-l-2 border-accent-400 pl-2 text-sm font-semibold text-foreground first:mt-0"
                    {...p}
                  />
                ),
                h2: (p) => (
                  <p
                    className="mb-1.5 mt-3 border-l-2 border-accent-400 pl-2 text-sm font-semibold text-foreground first:mt-0"
                    {...p}
                  />
                ),
                h3: (p) => (
                  <p className="mb-1 mt-2.5 text-xs font-semibold text-foreground first:mt-0" {...p} />
                ),
                p: (p) => <p className="mb-1.5 leading-relaxed last:mb-0" {...p} />,
                ul: (p) => <ul className="mb-1.5 list-disc space-y-1 pl-4 last:mb-0" {...p} />,
                ol: (p) => <ol className="mb-1.5 list-decimal space-y-1 pl-4 last:mb-0" {...p} />,
                li: (p) => <li {...p} />,
                strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
                code: (p) => (
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.7rem]" {...p} />
                ),
                pre: (p) => (
                  <pre
                    tabIndex={0}
                    className="mb-1.5 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[0.7rem] text-neutral-100 last:mb-0"
                    {...p}
                  />
                ),
                a: (p) => <a className="text-accent-600 underline" {...p} />,
              }}
            >
              {issue.plan}
            </ReactMarkdown>
          </div>

          {/* Given real visual weight, not a small inline button —
              approval is the one action in this whole pane that
              actually unlocks something (the Completed-column gate),
              so it reads that way: its own card, a full-width primary
              button, a line stating what it actually does. */}
          {issue.status === "READY" || issue.status === "DONE" ? (
            <div className="flex items-center gap-2 rounded-lg border border-success-600/30 bg-success-50 p-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success-700" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-success-700">Plan approved</p>
                <p className="text-xs text-success-700/80">
                  {issue.status === "DONE" ? "This ticket is marked done." : "Ready to be marked done once moved to Completed."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <Badge variant={STATUS_BADGE_VARIANT[issue.status]}>{issue.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Approving locks this exact plan and is required before the ticket can be moved
                to Completed.
              </p>
              <Button variant="primary" onClick={onApprove} className="w-full">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve plan
              </Button>
            </div>
          )}
        </>
      ) : suggestion && suggestedBlocker ? (
        // The pre-planning gate: Claude found this before writing any
        // plan, and nothing proceeds until a human addresses it — there
        // is no "Generate plan" button to show here anymore; confirming
        // or dismissing THIS is what continues the pipeline (both routes
        // now auto-enqueue the real plan generation once this resolves).
        <div className="space-y-1.5 rounded-md border border-accent-300 bg-accent-50 p-3 text-xs">
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
        <Button variant="primary" disabled={pending} onClick={onGeneratePlan} className="w-full">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Generating..." : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Generate plan
            </>
          )}
        </Button>
      )}

      {/* Its own card, not a plain list folded under a border-t line —
          matches the same elevated-card language the dialog's own
          Details/Chat split already uses, so this reads as a first-class
          section rather than an afterthought at the bottom of the pane. */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
          <p className="text-xs font-semibold text-foreground">Depends on</p>
          {issue.dependsOn.length > 0 && (
            <Badge variant="neutral">{issue.dependsOn.length}</Badge>
          )}
        </div>

        <div className="space-y-1.5 p-2.5">
          {/* No pending-suggestion banner here anymore — it can't coexist
              with a plan under the new pipeline (the suggestion is always
              resolved, one way or another, before a plan ever gets
              written), so it only ever needs to render once, above, in
              the pre-plan slot. */}
          {issue.dependsOn.length === 0 && (
            <p className="text-xs text-muted-foreground">No dependencies declared</p>
          )}

          {issue.dependsOn.map((dep) => {
            const state = dependencyBadge(dep);
            const badge = DEPENDENCY_BADGE_CONFIG[state];
            const isMismatch = state === "mismatch";
            return (
              <div
                key={dep.id}
                className={cn(
                  "space-y-0.5 rounded-md border p-2 text-xs",
                  isMismatch ? "border-danger-600 bg-danger-50" : "border-border bg-surface",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    {isMismatch && <AlertTriangle className="h-3.5 w-3.5 text-danger-700" />}
                    {dep.blocker.title}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className={isMismatch ? "text-danger-700" : "text-muted-foreground"}>
                  <span className="font-medium text-foreground">Assumed: </span>
                  {dep.assumedContract}
                </p>
                {dep.actualContract !== null && (
                  <p className={isMismatch ? "text-danger-700" : "text-muted-foreground"}>
                    <span className="font-medium text-foreground">Actual: </span>
                    {dep.actualContract}
                  </p>
                )}
              </div>
            );
          })}

          {candidateBlockers.length > 0 && (
            <form onSubmit={handleAddDependency} className="space-y-1.5">
              <Select
                aria-label="Depends on which ticket?"
                value={blockerId}
                onChange={(e) => setBlockerId(e.target.value)}
              >
                <option value="">Depends on which ticket?</option>
                {candidateBlockers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </Select>
              <div className="flex gap-1.5">
                <Input
                  value={assumedContract}
                  onChange={(e) => setAssumedContract(e.target.value)}
                  placeholder="What do you expect this ticket to provide?"
                  className="h-8 text-xs"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Add
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
