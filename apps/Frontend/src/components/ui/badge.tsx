import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import type { TicketStatus } from "../../lib/api";
import { STATUS_META, StatusIcon } from "./status";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-4 ring-1 ring-inset",
  {
    variants: {
      variant: {
        neutral: "bg-neutral-50 text-neutral-600 ring-neutral-300/70",
        accent: "bg-accent-50 text-accent-700 ring-accent-200/80",
        success: "bg-success-50 text-success-700 ring-success-500/25",
        warning: "bg-warning-50 text-warning-700 ring-warning-500/30",
        danger: "bg-danger-50 text-danger-700 ring-danger-500/25",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

const DOT_COLOR = {
  neutral: "bg-neutral-400",
  accent: "bg-accent-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
} as const;

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT_COLOR[variant ?? "neutral"])} />}
      {children}
    </span>
  );
}

// Maps directly onto TicketStatus — one lookup, used everywhere a status
// needs a tone.
export const STATUS_BADGE_VARIANT = {
  OPEN: "neutral",
  PLANNING: "accent",
  BLOCKED: "danger",
  READY: "success",
  DONE: "success",
} as const;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: STATUS_META.OPEN.label,
  PLANNING: STATUS_META.PLANNING.label,
  BLOCKED: STATUS_META.BLOCKED.label,
  READY: STATUS_META.READY.label,
  DONE: STATUS_META.DONE.label,
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn(badgeVariants({ variant: STATUS_BADGE_VARIANT[status] }), "pl-1.5", className)}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}
