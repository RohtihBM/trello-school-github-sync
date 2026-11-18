import type { Transition, Variants } from "motion/react";

// One easing and one set of durations for the whole product, so motion feels
// like a single hand: fast to start, long soft landing.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const SPRING_SNAP: Transition = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 };
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 260, damping: 30 };

// A group of siblings entering one after another. Keep `stagger` small (the
// list is a workspace, not a showreel) and cap the total with `delayChildren`.
export const staggerParent = (stagger = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
};
