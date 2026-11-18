import { useDraggable } from "@dnd-kit/core";
import { AlertTriangle, FileText, GitMerge, GripVertical, Trash2 } from "lucide-react";
import type { Issue } from "../lib/api";
import { FLOATING_SHADOW } from "./ui/card";
import { StatusIcon, STATUS_META } from "./ui/status";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/cn";
import { plainPreview } from "../lib/text";

interface BoardCardProps {
  issue: Issue;
  // Position in its lane — only used to stagger the entrance.
  index?: number;
  isSelected: boolean;
  // True for a brief moment right after this card's "issue-moved" broadcast
  // actually lands — confirms a drop worked, since the move is a round trip
  // through the server.
  justMoved: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// An index card: the state glyph leads, the title does the work, and the
// footer carries only facts that exist (a plan, dependencies, a contract
// mismatch, who owns it). The title is a real button so the card opens by
// keyboard; grip and delete reveal on hover/focus (always on touch).
export function BoardCard({ issue, index = 0, isSelected, justMoved, onSelect, onDelete }: BoardCardProps) {
  // A dedicated drag handle, not the whole card — the card is also
  // click-to-select, so a draggable-everywhere surface would make a plain
  // click ambiguous with starting a drag.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.id,
  });

  const mismatch = issue.dependsOn.some((d) => d.mismatchFlag);
  const reveal =
    "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
      className={cn(
        "group relative animate-rise cursor-pointer rounded-lg bg-surface py-3 pl-5 pr-3.5 pointer-coarse:pl-8 shadow-raise ring-1 ring-border transition-[box-shadow,translate,rotate,scale] duration-300 ease-out-expo hover:-translate-y-px hover:shadow-lift hover:ring-neutral-400/70",
        isSelected && "ring-2 ring-ink hover:ring-ink",
        // The card itself is carried by the DragOverlay (so a lane's scroll
        // container can't clip it); what stays behind is a faded ghost.
        isDragging && "opacity-35 shadow-none",
        justMoved && "ring-2 ring-success-500",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute left-0.5 top-3 flex h-6 w-4 pointer-coarse:top-1.5 pointer-coarse:h-11 pointer-coarse:w-7 cursor-grab touch-none items-center justify-center rounded-sm text-neutral-400 hover:text-neutral-700 active:cursor-grabbing",
          reveal,
          isDragging && "opacity-100",
        )}
        aria-label={`Drag to move ${issue.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="space-y-2">
        <div className="flex items-start gap-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-[0.1875rem] inline-flex">
                <StatusIcon status={issue.status} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">{STATUS_META[issue.status].label}</TooltipContent>
          </Tooltip>
          <button type="button" className="min-w-0 flex-1 cursor-pointer rounded-sm text-left text-[0.875rem] font-medium leading-[1.375rem] tracking-[-0.005em] text-foreground">
            <span className="line-clamp-3">{issue.title}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={cn(
              "-mr-1.5 -mt-0.5 flex h-6 w-6 shrink-0 pointer-coarse:-mr-3 pointer-coarse:-my-2.5 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-md text-neutral-400 hover:bg-danger-50 hover:text-danger-600",
              reveal,
            )}
            aria-label={`Delete ${issue.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {issue.description && (
          <p className="line-clamp-2 pl-[1.625rem] text-compact leading-[1.25rem] text-neutral-500">{plainPreview(issue.description)}</p>
        )}

        {(issue.plan || issue.dependsOn.length > 0 || issue.assignees.length > 0) && (
          <div className="flex items-center justify-between gap-2 pl-[1.625rem] pt-0.5">
            <div className="flex items-center gap-2.5 text-neutral-400">
              {issue.plan && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                      <FileText aria-hidden className="h-3.5 w-3.5" /> Plan
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>A plan has been drafted</TooltipContent>
                </Tooltip>
              )}
              {issue.dependsOn.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", mismatch ? "text-danger-600" : "text-neutral-500")}>
                      {mismatch ? <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> : <GitMerge aria-hidden className="h-3.5 w-3.5" />}
                      {issue.dependsOn.length}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {mismatch ? "A dependency's contract doesn't match" : `Depends on ${issue.dependsOn.length} ticket${issue.dependsOn.length === 1 ? "" : "s"}`}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {issue.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {issue.assignees.map((a) => (
                  <Tooltip key={a.user.id}>
                    <TooltipTrigger asChild>
                      <Avatar email={a.user.email} className="h-5 w-5 border-2 border-surface text-[0.5625rem]">
                        <AvatarFallback>{initialFromEmail(a.user.email)}</AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>{a.user.email}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// The card as it looks while being carried: lifted, tilted a hair, floating
// above every lane. Purely presentational — the real card keeps the drag
// handlers.
export function BoardCardOverlay({ issue }: { issue: Issue }) {
  return (
    <div
      className={cn(
        "w-[17.25rem] cursor-grabbing rotate-[1.5deg] rounded-lg bg-surface py-3 pl-5 pr-3.5 ring-1 ring-neutral-400",
        FLOATING_SHADOW,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-[0.1875rem] inline-flex">
          <StatusIcon status={issue.status} />
        </span>
        <p className="min-w-0 flex-1 line-clamp-3 text-[0.875rem] font-medium leading-[1.375rem] tracking-[-0.005em] text-foreground">{issue.title}</p>
      </div>
      {issue.description && (
        <p className="mt-2 line-clamp-2 pl-[1.625rem] text-compact leading-[1.25rem] text-neutral-500">{plainPreview(issue.description)}</p>
      )}
    </div>
  );
}
