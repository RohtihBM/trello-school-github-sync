import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "../lib/cn";
import { SPRING_SNAP } from "../lib/motion";

export interface TabItem {
  label: string;
  to: string;
  active: boolean;
  icon?: ReactNode;
}

// Link tabs with a hover plate that slides between them (shared layout) and a
// fixed ink rule under the current one. The hover plate previews where the
// pointer is going without moving anything that's already selected.
export function NavTabs({ items, label }: { items: TabItem[]; label: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav aria-label={label} className="-mb-px flex gap-1" onMouseLeave={() => setHovered(null)}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={item.active ? "page" : undefined}
          onMouseEnter={() => setHovered(item.to)}
          className={cn(
            "relative inline-flex h-11 items-center gap-2 border-b-2 px-3 text-compact font-medium transition-colors duration-200",
            item.active ? "border-ink text-foreground" : "border-transparent text-neutral-500 hover:text-foreground",
          )}
        >
          {hovered === item.to && !item.active && (
            <motion.span
              layoutId="tab-hover"
              transition={SPRING_SNAP}
              className="absolute inset-x-0 inset-y-1.5 -z-10 rounded-lg bg-neutral-900/[0.05]"
            />
          )}
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
