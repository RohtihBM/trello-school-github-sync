import type { ReactNode } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "../lib/motion";

interface PageIntroProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

// The opening of a list-style page: a mono eyebrow, a display title, and one
// line of context — the same composition on Organisations and Settings so
// they read as siblings, while Boards and the board itself get their own.
export function PageIntro({ eyebrow, title, description, actions }: PageIntroProps) {
  return (
    <div className="bg-glow">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-10 sm:px-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="space-y-3">
          <p className="type-eyebrow">{eyebrow}</p>
          <h1 className="type-display">{title}</h1>
          {description && <p className="max-w-lg text-[0.9375rem] leading-6 text-neutral-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2.5">{actions}</div>}
      </motion.div>
    </div>
  );
}
