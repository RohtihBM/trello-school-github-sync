import { motion } from "motion/react";
import type { Issue, TicketStatus } from "../lib/api";
import { STATUS_META, StatusIcon } from "./ui/status";
import { AnimatedNumber } from "./AnimatedNumber";
import { EASE_OUT } from "../lib/motion";

const ORDER: TicketStatus[] = ["DONE", "READY", "PLANNING", "BLOCKED", "OPEN"];
const SEGMENT: Record<TicketStatus, string> = {
  DONE: "bg-success-600",
  READY: "bg-success-500",
  PLANNING: "bg-accent-500",
  BLOCKED: "bg-danger-500",
  OPEN: "bg-neutral-300",
};

// The board's state at a glance: one bar, every ticket in it, coloured by
// status — computed from the live issues, so it moves as plans are drafted
// and tickets approved. Widths animate; counts tween.
export function StatusMeter({ issues }: { issues: Issue[] }) {
  const counts = ORDER.map((s) => ({ status: s, n: issues.filter((i) => i.status === s).length }));
  const total = issues.length;
  const done = counts.find((c) => c.status === "DONE")!.n + counts.find((c) => c.status === "READY")!.n;

  if (total === 0) return null;

  return (
    <div className="w-full max-w-md" role="group" aria-label={`${total} tickets: ${counts.filter((c) => c.n).map((c) => `${c.n} ${STATUS_META[c.status].label.toLowerCase()}`).join(", ")}`}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="text-xs text-neutral-500">
          <span className="type-numeral text-[1.375rem] leading-none text-foreground">
            <AnimatedNumber value={done} />
          </span>{" "}
          <span className="text-neutral-400">of</span> {total} approved
        </p>
        <ul className="hidden items-center gap-3 sm:flex">
          {counts
            .filter((c) => c.n > 0)
            .map((c) => (
              <li key={c.status} className="flex items-center gap-1 text-xs text-neutral-500">
                <StatusIcon status={c.status} className="h-3 w-3" />
                <span className="tabular-nums">{c.n}</span>
              </li>
            ))}
        </ul>
      </div>
      <div aria-hidden className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-900/[0.06]">
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <motion.div
              key={c.status}
              layout
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: c.n }}
              transition={{ duration: 0.8, ease: EASE_OUT }}
              className={`h-full basis-0 rounded-full ${SEGMENT[c.status]}`}
            />
          ))}
      </div>
    </div>
  );
}
