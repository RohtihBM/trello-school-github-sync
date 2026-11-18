import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

// A count that tweens to its new value instead of snapping — used where the
// number itself is the message (ticket counts, status totals). Under reduced
// motion it simply shows the value.
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = String(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
