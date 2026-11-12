import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// Flat by default — a border, not a shadow (plan rule on elevation: a
// shadow only belongs on something actually floating above the page,
// never on a surface at rest. A card at rest with a shadow is the
// single most common "AI-generated UI" tell). forwardRef so a dragged
// Kanban card (BoardCard) can attach dnd-kit's node ref directly to it.
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// Reserved for anything genuinely floating: a dragged card, a dropdown,
// a modal — see dialog.tsx, which uses this same elevation token.
export const FLOATING_SHADOW = "shadow-lg shadow-neutral-900/10";
