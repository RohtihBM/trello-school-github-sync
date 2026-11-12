import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "./ui/badge";
import { cn } from "../lib/cn";

interface BoardColumnProps {
  sectionId: string;
  title: string;
  issueCount: number;
  children: ReactNode;
}

// No in-app "create issue" affordance here on purpose — tickets only ever
// come from GitHub sync (apps/Backend/src/routes/github.ts), never
// hand-typed in the board itself. A column is a drop target and a list,
// nothing more.
export function BoardColumn({ sectionId, title, issueCount, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-3 rounded-lg border p-3 transition-colors",
        isOver ? "border-accent-400 bg-accent-50" : "border-border bg-neutral-100",
      )}
    >
      <div className="flex items-center gap-2 px-0.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="neutral">{issueCount}</Badge>
      </div>

      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
