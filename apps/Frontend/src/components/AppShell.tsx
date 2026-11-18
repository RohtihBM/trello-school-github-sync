import { Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { TopNav } from "./TopNav";
import { EASE_OUT } from "../lib/motion";

// Rendered once, wrapping every authenticated page. The page below fills the
// remaining height and owns its own scrolling. Each route change gives the
// new page a short rise-and-fade so navigation reads as moving to a new
// place, not a hard swap; under reduced motion the app-level MotionConfig
// makes it inert.
export function AppShell() {
  const { pathname } = useLocation();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TopNav />
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <Outlet />
      </motion.div>
    </div>
  );
}
