import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/cn";
import { SPRING_SNAP } from "../../lib/motion";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}

// A segmented control whose thumb glides between options (a shared-layout
// animation) instead of the selection jumping.
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-lg bg-neutral-900/[0.06] p-0.5", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative h-7 rounded-md px-3 text-compact font-medium transition-colors",
              active ? "text-foreground" : "text-neutral-500 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING_SNAP}
                className="absolute inset-0 rounded-md bg-surface shadow-raise ring-1 ring-border"
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
