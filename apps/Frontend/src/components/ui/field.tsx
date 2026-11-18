import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

// Label + control + hint/error as one unit, so every form in the app spaces
// and words its fields identically. The error replaces the hint rather than
// stacking under it.
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-compact font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}
