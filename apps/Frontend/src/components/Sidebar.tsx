import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, Settings as SettingsIcon } from "lucide-react";
import { api, clearToken } from "../lib/api";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import { cn } from "../lib/cn";

interface Me {
  id: string;
  email: string;
}

const NAV_ITEMS = [
  { label: "Boards", to: "/", match: (path: string) => path === "/" || path.startsWith("/boards") },
  { label: "Organisations", to: "/organisations", match: (path: string) => path.startsWith("/organisations") },
  { label: "Settings", to: "/settings", match: (path: string) => path.startsWith("/settings") },
];

interface SidebarProps {
  // Only meaningful below md — on desktop the sidebar is always visible
  // and these are ignored. Owned by AppShell, not local state here: the
  // hamburger button that toggles this lives in AppShell too (it has to
  // be visible on every page, not just wherever Sidebar happens to
  // render), so the open/closed state has to live at that same level.
  open: boolean;
  onClose: () => void;
}

// New — doesn't exist anywhere in the app today. Every authenticated page
// used a plain per-page header before this; the sidebar is a persistent,
// app-wide structural element now, rendered once by AppShell, not
// per-page.
export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  function handleSignOut() {
    clearToken();
    navigate("/signin");
  }

  return (
    <>
      {/* Backdrop — mobile-only overlay, dismisses the drawer on tap.
          Doesn't exist at all on desktop (md:hidden), where the sidebar
          is part of the normal layout, not an overlay on top of it. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Mobile: fixed-position slide-in drawer, off-screen by default.
          // Desktop (md:): back to being a normal static flex child,
          // always visible, translate reset to 0 regardless of `open`.
          "fixed inset-y-0 left-0 z-50 flex h-full w-55 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-white">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">Trello School</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "border-accent-600 bg-accent-50 font-medium text-accent-700"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground",
                )}
              >
                {item.label === "Settings" && <SettingsIcon className="h-3.5 w-3.5" />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 border-t border-border px-3 py-3 text-left hover:bg-neutral-100"
          aria-label="Sign out"
        >
          <Avatar>
            <AvatarFallback>{me ? initialFromEmail(me.email) : "?"}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {me?.email ?? "..."}
          </span>
          <LogOut className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </aside>
    </>
  );
}
