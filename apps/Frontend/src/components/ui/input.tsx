import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// Shared by Input, Textarea and Select so every field in the app has the same
// edge, hover, focus and error treatment. A soft inset gives the field depth;
// focus swaps the edge to ink and adds a wide, quiet halo.
export const FIELD_BASE =
  "w-full rounded-lg bg-surface text-sm text-foreground placeholder:text-neutral-400 shadow-[inset_0_1px_2px_oklch(21%_0.03_165/0.06)] ring-1 ring-inset ring-border-strong transition-[box-shadow,background-color] duration-200 hover:ring-neutral-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink aria-[invalid=true]:ring-danger-500 aria-[invalid=true]:focus-visible:ring-danger-500 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, "h-10 px-3.5", className)} {...props} />
  ),
);
Input.displayName = "Input";
