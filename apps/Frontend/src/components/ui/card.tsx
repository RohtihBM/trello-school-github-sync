import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// A hairline-bordered sheet of paper with a whisper of lift. Used only where
// grouping genuinely helps (a ticket, a panel) — not as a default wrapper.
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl bg-surface shadow-raise ring-1 ring-border", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// Reserved for anything genuinely floating: a dragged card, a dropdown, a
// modal.
export const FLOATING_SHADOW = "shadow-float";
