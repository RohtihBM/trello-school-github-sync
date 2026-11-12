import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

// Rendered once, wrapping every authenticated page via a nested route in
// App.tsx — the sidebar is a persistent, app-wide structural element now,
// not something each page builds its own copy of. Child pages fill the
// remaining height (h-full, not h-screen — they're no longer assumed to
// own the whole viewport, just whatever's left after the sidebar).
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Closes the drawer on any navigation, including ones that don't go
  // through Sidebar's own links (e.g. the graph view's node-click deep
  // link into BoardView) — without this, navigating past the sidebar
  // some other way would leave it stuck open over the new page.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Only exists below md — on desktop the sidebar is already
            visible, so there's nothing to toggle. A fixed top bar rather
            than floating over page content: every page's own header
            already reserves space at the top, this just becomes part of
            that same row on mobile instead of overlapping it. */}
        <div className="flex shrink-0 items-center border-b border-border bg-surface px-3 py-2 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
