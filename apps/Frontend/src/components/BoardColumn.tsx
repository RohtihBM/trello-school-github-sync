import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "../lib/cn";

interface BoardColumnProps {
  sectionId: string;
  title: string;
  issueCount: number;
  children: ReactNode;
  // The per-column "No tickets" placeholder is noise when the whole board is
  // empty (the board shows its own empty state), so the board turns it off.
  emptyHint?: boolean;
}

// A lane, not a box: full height, divided from its neighbours by a hairline,
// scrolling on its own. Only the tickets are objects; the lane is the space
// they sit in. No in-app "create issue" here on purpose — tickets only come
// from GitHub sync (apps/Backend/src/routes/github.ts).
export function BoardColumn({ sectionId, title, issueCount, children, emptyHint = true }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${title}, ${issueCount} ticket${issueCount === 1 ? "" : "s"}`}
      className={cn(
        "relative flex h-full w-[19.5rem] shrink-0 flex-col px-3 transition-colors duration-300",
        isOver && "bg-accent-100/50",
      )}
    >
      <div className="flex items-baseline gap-2.5 px-1 pb-3 pt-5">
        <h2 className="text-compact font-semibold tracking-[-0.005em] text-foreground">{title}</h2>
        <span className="font-mono text-xs tabular-nums text-neutral-400">{String(issueCount).padStart(2, "0")}</span>
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 pb-8 pt-0.5">
        {children}
        {issueCount === 0 && emptyHint && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-neutral-400">
            Drop a ticket here
          </div>
        )}
      </div>
    </section>
  );
}
