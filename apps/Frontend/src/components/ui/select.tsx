import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { FIELD_BASE } from "./input";

// A styled NATIVE <select>, not Radix Select — every picker in this app is a
// simple flat option list, which native <select> handles correctly (keyboard
// nav, screen readers, the OS picker on mobile) with zero extra code.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(FIELD_BASE, "h-10 cursor-pointer appearance-none pl-3.5 pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = "Select";
