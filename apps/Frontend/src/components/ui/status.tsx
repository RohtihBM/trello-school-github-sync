import { cn } from "../../lib/cn";
import type { TicketStatus } from "../../lib/api";

// One glyph per ticket state. Colour is never the only signal: each status
// has its own shape (dashed, half-filled, barred, checked, filled-check), so
// the board still reads for anyone who can't tell clay from crimson, and the
// whole app speaks one icon language.
export const STATUS_META: Record<TicketStatus, { label: string; text: string }> = {
  OPEN: { label: "Open", text: "text-neutral-500" },
  PLANNING: { label: "Planning", text: "text-accent-600" },
  BLOCKED: { label: "Blocked", text: "text-danger-600" },
  READY: { label: "Ready", text: "text-success-600" },
  DONE: { label: "Done", text: "text-success-600" },
};

export function StatusIcon({ status, className }: { status: TicketStatus; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-4 w-4 shrink-0", STATUS_META[status].text, className)}>
      {status === "OPEN" && <circle cx="8" cy="8" r="6" {...common} strokeDasharray="2.6 2.6" />}
      {status === "PLANNING" && (
        <>
          <circle cx="8" cy="8" r="6" {...common} />
          <path d="M8 4.2a3.8 3.8 0 0 1 0 7.6z" fill="currentColor" />
        </>
      )}
      {status === "BLOCKED" && (
        <>
          <circle cx="8" cy="8" r="6" {...common} />
          <path d="M5.4 8h5.2" {...common} strokeWidth={1.8} />
        </>
      )}
      {status === "READY" && (
        <>
          <circle cx="8" cy="8" r="6" {...common} />
          <path d="m5.6 8.2 1.7 1.7 3.2-3.5" {...common} />
        </>
      )}
      {status === "DONE" && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" />
          <path d="m5.5 8.2 1.8 1.8 3.2-3.6" fill="none" stroke="white" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
