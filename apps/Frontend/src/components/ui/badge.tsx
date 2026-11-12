import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-neutral-100 text-neutral-700",
        accent: "bg-accent-100 text-accent-700",
        success: "bg-success-100 text-success-700",
        warning: "bg-warning-100 text-warning-700",
        danger: "bg-danger-100 text-danger-700",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Maps directly onto TicketStatus — one lookup, used everywhere a status
// needs to render, so "what color is BLOCKED" is answered in exactly one
// place rather than re-decided per component (the Kanban card, the graph
// node, the PlanPanel status line, etc.).
export const STATUS_BADGE_VARIANT = {
  OPEN: "neutral",
  PLANNING: "accent",
  BLOCKED: "danger",
  READY: "success",
  DONE: "success",
} as const;
