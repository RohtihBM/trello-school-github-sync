import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

// An empty state is an invitation, not an error: a drafted-outline panel, a
// title set in the display face, one clear next step.
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface/50 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-neutral-600 shadow-raise ring-1 ring-border">
        <Icon className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="type-subtitle">{title}</p>
        {description && <p className="type-body text-neutral-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
