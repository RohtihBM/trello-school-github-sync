import { cn } from "../lib/cn";

// The mark is the product in three strokes: an issue comes in, a plan is
// drafted, a person signs it off — three nodes on one line, the last one
// lit. It recurs as the pipeline motif on the sign-in screen.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[0.6rem] bg-linear-to-b from-neutral-700 to-neutral-950 shadow-[inset_0_1px_0_oklch(100%_0_0/0.18),0_1px_2px_oklch(21%_0.03_165/0.4)]",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M4 14.5h12" stroke="white" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="5" cy="14.5" r="2" fill="white" fillOpacity=".9" />
        <circle cx="10" cy="9.5" r="2" className="fill-accent-300" />
        <circle cx="15" cy="5.5" r="2.2" fill="white" />
      </svg>
    </span>
  );
}
