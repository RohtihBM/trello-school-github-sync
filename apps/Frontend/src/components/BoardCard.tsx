import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Trash2 } from "lucide-react";
import type { Issue } from "../lib/api";
import { Card, FLOATING_SHADOW } from "./ui/card";
import { Badge, STATUS_BADGE_VARIANT } from "./ui/badge";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/cn";

interface BoardCardProps {
  issue: Issue;
  isSelected: boolean;
  // True for a brief moment right after this card's "issue-moved"
  // broadcast actually lands — the one piece of drag feedback that was
  // missing: without it, a successful drop has no visual confirmation
  // beyond the card silently reappearing in the new column.
  justMoved: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// Always compact now — no more inline-expanding panel pushing the column
// taller (that was the actual root cause of the scroll/drag interaction
// bug found while verifying phase D/H). Clicking the card opens the full
// ticket dialog directly; see IssueDetailContent.
export function BoardCard({ issue, isSelected, justMoved, onSelect, onDelete }: BoardCardProps) {
  // A dedicated drag handle, not the whole card — the card is now also
  // click-to-select, so a draggable-everywhere surface would make a
  // plain click ambiguous with starting a drag. Only the grip icon below
  // has {...listeners}.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
  });

  return (
    <Card
      ref={setNodeRef}
      onClick={onSelect}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        // Named properties, not transition-all — transform is set via
        // inline style for the live drag position, and transitioning
        // THAT would fight dnd-kit's own real-time movement. This stays
        // unconditional so the ring fading back OUT (justMoved flipping
        // to false) has something to animate between in that same render.
        "cursor-pointer transition-[border-color,box-shadow] duration-700 hover:border-accent-300",
        isSelected && "border-accent-500 ring-1 ring-accent-500",
        // Real elevation while dragging — scale, not just the shadow, so
        // the card visibly lifts off the board rather than just darkening.
        isDragging && `z-10 scale-[1.03] opacity-90 ${FLOATING_SHADOW}`,
        // The success cue for a completed drop: a brief accent ring that
        // fades out, timed from the "issue-moved" broadcast actually
        // landing (not from the drag ending — those aren't the same
        // moment, since the move is a round trip through the server).
        justMoved && "ring-2 ring-success-500 ring-offset-1",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to move"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{issue.title}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="shrink-0 text-muted-foreground hover:text-danger-600"
              aria-label={`Delete ${issue.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[issue.status]}>{issue.status}</Badge>
            {issue.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {issue.assignees.map((a) => (
                  <Tooltip key={a.user.id}>
                    <TooltipTrigger asChild>
                      <Avatar className="h-5 w-5 border border-surface text-[0.6rem]">
                        <AvatarFallback>{initialFromEmail(a.user.email)}</AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>{a.user.email}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          {issue.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{issue.description}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
