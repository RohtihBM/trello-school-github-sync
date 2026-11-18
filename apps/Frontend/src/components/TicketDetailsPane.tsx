import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, X } from "lucide-react";
import type { BoardMember, Issue, OverlapInfo } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import { cn } from "../lib/cn";
import { MARKDOWN_COMPONENTS } from "../lib/markdownComponents";

interface TicketDetailsPaneProps {
  issue: Issue;
  allIssues: Issue[];
  boardMembers: BoardMember[];
  overlaps: OverlapInfo[];
  onAddDependency: (blockerId: string, assumedContract: string) => void;
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
  overlaps,
  onAddDependency,
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

  // The description box scrolls on wide screens (the panel is split in two
  // columns there). A fade at its foot shows only while more text is below, so
  // a line is never cut off with no sign that the box scrolls.
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMoreBelow = useCallback(() => {
    const el = descriptionRef.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    checkMoreBelow();
    window.addEventListener("resize", checkMoreBelow);
    return () => window.removeEventListener("resize", checkMoreBelow);
  }, [issue.description, checkMoreBelow]);

  return (
    <div className="space-y-6 px-5 pb-6 pt-2 sm:px-6">
      {issue.description && (
        <div
          ref={descriptionRef}
          onScroll={checkMoreBelow}
          className={cn(
            "rounded-xl bg-surface p-5 text-[0.875rem] leading-6 text-neutral-700 shadow-raise ring-1 ring-border md:max-h-80 md:overflow-y-auto",
            moreBelow && "md:[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]",
          )}
        >
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{issue.description}</ReactMarkdown>
        </div>
      )}

      <section className="space-y-2.5" aria-labelledby="assignees-heading">
        <h4 id="assignees-heading" className="type-eyebrow">
          Assignees
        </h4>

        {issue.assignees.length === 0 && <p className="type-meta">Nobody is assigned yet.</p>}

        {issue.assignees.length > 0 && (
          <ul className="space-y-1.5">
            {issue.assignees.map((a) => (
              <li
                key={a.user.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface py-1.5 pl-2.5 pr-1.5 shadow-raise ring-1 ring-border"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar email={a.user.email} className="h-6 w-6">
                    <AvatarFallback>{initialFromEmail(a.user.email)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-compact text-foreground">{a.user.email}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() => onUnassign(a.user.id)}
                  aria-label={`Unassign ${a.user.email}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {unassignedMembers.length > 0 && (
          <form onSubmit={handleAssignSubmit} className="flex gap-2">
            <Select
              aria-label="Add an assignee"
              value={addingAssigneeId}
              onChange={(e) => setAddingAssigneeId(e.target.value)}
              className="h-8 text-compact"
            >
              <option value="">Assign someone…</option>
              {unassignedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm" disabled={addingAssigneeId === ""}>
              Assign
            </Button>
          </form>
        )}
      </section>

      {overlaps.length > 0 && (
        <div role="status" className="space-y-1.5 rounded-lg border border-warning-500/30 bg-warning-50 p-3 text-compact">
          <div className="flex items-center gap-1.5 font-medium text-warning-700">
            <AlertTriangle className="h-3.5 w-3.5" /> File overlap warning
          </div>
          {overlaps.map((o) => (
            <p key={o.id} className="leading-5 text-warning-700">
              Shares <span className="font-mono text-xs">{o.sharedFiles.join(", ")}</span> with{" "}
              <span className="font-medium">{o.title}</span>
            </p>
          ))}
        </div>
      )}

      <section className="space-y-2.5" aria-labelledby="deps-heading">
        <div className="flex items-center gap-2">
          <h4 id="deps-heading" className="type-eyebrow">
            Depends on
          </h4>
          {issue.dependsOn.length > 0 && <Badge variant="neutral">{issue.dependsOn.length}</Badge>}
        </div>

        {issue.dependsOn.length === 0 && <p className="type-meta">No dependencies declared.</p>}

        {issue.dependsOn.length > 0 && (
          <ul className="space-y-2">
            {issue.dependsOn.map((dep) => {
              const state = dependencyBadge(dep);
              const badge = DEPENDENCY_BADGE_CONFIG[state];
              const isMismatch = state === "mismatch";
              return (
                <li
                  key={dep.id}
                  className={cn(
                    "space-y-1.5 rounded-lg border p-3.5 text-compact",
                    isMismatch ? "border-danger-500/40 bg-danger-50" : "border-transparent bg-surface shadow-raise ring-1 ring-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium leading-5 text-foreground">
                      {isMismatch && <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-danger-700" />}
                      {dep.blocker.title}
                    </span>
                    <Badge variant={badge.variant} dot>
                      {badge.label}
                    </Badge>
                  </div>
                  <dl className={cn("space-y-0.5 leading-5", isMismatch ? "text-danger-700" : "text-neutral-500")}>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 font-medium text-foreground">Assumed</dt>
                      <dd>{dep.assumedContract}</dd>
                    </div>
                    {dep.actualContract !== null && (
                      <div className="flex gap-1.5">
                        <dt className="shrink-0 font-medium text-foreground">Actual</dt>
                        <dd>{dep.actualContract}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}

        {candidateBlockers.length > 0 && (
          <form onSubmit={handleAddDependency} className="space-y-2 rounded-lg border border-dashed border-border-strong p-3">
            <p className="text-xs font-medium text-neutral-600">Declare a dependency</p>
            <Select
              aria-label="Depends on which ticket?"
              value={blockerId}
              onChange={(e) => setBlockerId(e.target.value)}
              className="h-8 text-compact"
            >
              <option value="">Depends on which ticket?</option>
              {candidateBlockers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Input
                aria-label="What do you expect this ticket to provide?"
                value={assumedContract}
                onChange={(e) => setAssumedContract(e.target.value)}
                placeholder="What do you expect it to provide?"
                className="h-8 text-compact"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={blockerId === "" || assumedContract.trim() === ""}
              >
                Add
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
