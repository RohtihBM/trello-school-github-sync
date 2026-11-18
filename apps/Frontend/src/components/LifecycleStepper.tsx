import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { Issue } from "../lib/api";
import { cn } from "../lib/cn";
import { EASE_OUT } from "../lib/motion";

type StepState = "done" | "active" | "todo";

// Where this ticket is in its life, derived entirely from its real state: the
// issue is always synced; dependencies resolve when Claude's suggestion (if
// any) is decided; the plan exists once drafted; approval is the status.
export function LifecycleStepper({ issue }: { issue: Issue }) {
  const approved = issue.status === "READY" || issue.status === "DONE";
  const hasPlan = !!issue.plan;
  const awaitingDecision = !!issue.suggestedDependency && !hasPlan;

  // The first not-yet-done step is the active one.
  const current = approved ? 4 : hasPlan ? 3 : awaitingDecision ? 1 : 2;

  const steps = [
    { label: "Synced", short: "Synced", note: "From GitHub" },
    {
      label: "Dependencies",
      note: awaitingDecision ? "Needs a decision" : issue.dependsOn.length > 0 ? `${issue.dependsOn.length} declared` : "None",
    },
    { label: "Plan", short: "Plan", note: hasPlan ? (issue.proposedPlan ? "Revision proposed" : "Drafted") : "Not drafted" },
    { label: "Approved", short: "Approved", note: approved ? (issue.status === "DONE" ? "Done" : "Signed off") : "Awaiting you" },
  ];

  return (
    <ol className="flex w-full items-start" aria-label="Ticket progress">
      {steps.map((step, i) => {
        const state: StepState = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={step.label} className="relative flex min-w-0 flex-1 flex-col items-start" aria-current={state === "active" ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute left-7 right-[-0.25rem] top-[0.6875rem] h-px bg-border-strong">
                <motion.span
                  className="absolute inset-0 origin-left bg-ink"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i < current ? 1 : 0 }}
                  transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 + i * 0.12 }}
                />
              </span>
            )}
            <span
              className={cn(
                "relative z-10 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full text-[0.625rem] font-semibold transition-colors duration-500",
                state === "done" && "bg-ink text-white",
                state === "active" && "bg-surface text-accent-700 ring-2 ring-accent-500",
                state === "todo" && "bg-surface text-neutral-400 ring-1 ring-border-strong",
              )}
            >
              {state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              {state === "active" && <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full" />}
            </span>
            <span className={cn("mt-2 max-w-full truncate text-compact font-medium leading-4", state === "todo" ? "text-neutral-400" : "text-foreground")}><span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.short}</span>
            </span>
            <span className={cn("mt-0.5 hidden font-mono text-xs uppercase tracking-[0.06em] sm:block", state === "active" ? "text-accent-700" : "text-neutral-400")}>{step.note}</span>
          </li>
        );
      })}
    </ol>
  );
}
