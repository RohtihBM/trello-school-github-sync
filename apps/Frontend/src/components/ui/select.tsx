import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

// A styled NATIVE <select>, not Radix Select — a deliberate Phase A scope
// call: every picker in this app today is a simple flat option list
// (move-to-section, pick-a-blocker), which native <select> already
// handles correctly (keyboard nav, screen readers, mobile OS picker UI)
// with zero extra code. Worth revisiting with Radix Select only if a
// picker ever needs rich option rendering (icons, descriptions) that
// native <option> can't express.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = "Select";
