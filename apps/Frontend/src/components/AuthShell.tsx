import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BrandMark } from "./BrandMark";
import { StatusIcon } from "./ui/status";
import { EASE_OUT } from "../lib/motion";
import type { TicketStatus } from "../lib/api";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

const LANES = ["Issue", "Plan", "Approved"] as const;
const LANE_STATUS: TicketStatus[] = ["OPEN", "PLANNING", "DONE"];
// Left offset (as % of the track) of the travelling ticket in each lane.
const LANE_LEFT = ["2%", "35.3%", "68.6%"];

// An abstract board that tells the product's story without inventing data: a
// ticket enters as an issue, gets drafted into a plan, and is signed off. It
// loops slowly; under reduced motion it rests on the final, approved state.
function PipelineIllustration() {
  const reduce = useReducedMotion();
  const [lane, setLane] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setLane((l) => (l + 1) % 3), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const status = LANE_STATUS[lane];

  return (
    <div aria-hidden className="relative">
      <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {LANES.map((name, i) => (
          <div key={name} className="h-60 border-r border-white/10 p-3 last:border-r-0">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/45">{name}</p>
            {/* Ghost tickets: the lane is populated, the live one travels. */}
            <div className="mt-3 space-y-2">
              {[0, 1].map((g) => (
                <div
                  key={g}
                  className="h-12 rounded-lg border border-dashed border-white/10"
                  style={{ opacity: 1 - g * 0.4 - i * 0.05 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <motion.div
        className="absolute top-[3.1rem] w-[30%] rounded-lg bg-surface p-2.5 shadow-float"
        initial={false}
        animate={{ left: LANE_LEFT[lane] }}
        transition={{ duration: 0.9, ease: EASE_OUT }}
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={status} className="h-4 w-4" />
          <div className="h-2 flex-1 rounded-full bg-neutral-900/15" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-neutral-900/[0.08]" />
          <div className="h-1.5 w-2/3 rounded-full bg-neutral-900/[0.08]" />
        </div>
        <motion.div
          className="mt-2.5 flex items-center gap-1.5"
          animate={{ opacity: lane === 2 ? 1 : 0, y: lane === 2 ? 0 : 4 }}
          transition={{ duration: 0.4, delay: lane === 2 ? 0.5 : 0 }}
        >
          <svg viewBox="0 0 40 12" className="h-3 w-10 text-success-600" fill="none">
            <path d="M2 8c3-6 5 4 8-1s4-4 6 0 4 3 8-2 4 1 6-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-success-600">signed</span>
        </motion.div>
      </motion.div>
    </div>
  );
}

// Shared by SignIn and SignUp so both pages are identical except for their
// actual content. The form column is the only thing that scrolls on small
// screens; the story panel appears from lg up.
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <main className="relative flex flex-col bg-glow px-6 py-8 sm:px-14">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[1.5rem] leading-none tracking-[-0.02em]">Trello School</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <h1 className="type-display" style={{ fontSize: "clamp(2.25rem, 4vw, 3rem)" }}>
              {title}
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-6 text-neutral-500">{subtitle}</p>

            <div className="mt-9">{children}</div>

            <p className="mt-8 text-sm text-neutral-500">{footer}</p>
          </motion.div>
        </div>
      </main>

      <aside
        aria-label="About Trello School"
        className="relative hidden flex-col justify-center overflow-hidden bg-neutral-950 px-14 text-neutral-50 lg:flex xl:px-20"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(48rem_30rem_at_85%_-5%,oklch(56%_0.15_41/0.42),transparent_65%),radial-gradient(40rem_26rem_at_-10%_105%,oklch(50%_0.115_152/0.28),transparent_65%)]"
        />
        <div aria-hidden className="bg-grain absolute inset-0 opacity-[0.07]" />

        <motion.div
          className="relative max-w-xl space-y-12"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE_OUT }}
        >
          <div className="space-y-5">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent-300">Plan, then approve</p>
            <h2 className="font-display text-[3.75rem] leading-[0.98] tracking-[-0.03em]">
              Claude drafts.
              <br />
              <span className="italic text-accent-300">You decide.</span>
            </h2>
            <p className="max-w-md text-base leading-7 text-neutral-400">
              Every GitHub issue becomes a ticket with a plan grounded in your code. Nothing is marked done until a
              person has signed it off.
            </p>
          </div>

          <PipelineIllustration />
        </motion.div>
      </aside>
    </div>
  );
}
