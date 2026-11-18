import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { motion } from "motion/react";
import { api, clearToken } from "../lib/api";
import { SPRING_SNAP } from "../lib/motion";
import { cn } from "../lib/cn";
import { Avatar, AvatarFallback, initialFromEmail } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { BrandMark } from "./BrandMark";

interface Me {
  id: string;
  email: string;
}

const NAV_ITEMS = [
  { label: "Boards", to: "/", match: (path: string) => path === "/" || path.startsWith("/boards") },
  { label: "Organisations", to: "/organisations", match: (path: string) => path.startsWith("/organisations") },
];

// The product's one persistent chrome: a quiet bar that says where you are
// and gets out of the way. A sliding pill follows the active section
// (shared-layout animation), the account lives in a menu rather than eating a
// permanent column, and the page below owns the whole canvas.
export function TopNav() {
  const { pathname } = useLocation();
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
    <header className="relative z-30 shrink-0 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-6 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg outline-offset-4 pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="Trello School, home">
          <BrandMark />
          <span className="hidden font-display text-[1.5rem] leading-none tracking-[-0.02em] sm:inline">Trello School</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center rounded-lg px-3 text-sm font-medium pointer-coarse:h-11 transition-colors duration-200",
                  active ? "text-foreground" : "text-neutral-500 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={SPRING_SNAP}
                    className="absolute inset-0 rounded-lg bg-neutral-900/[0.07]"
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="group flex items-center gap-2 rounded-full p-0.5 pr-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center transition-colors hover:bg-neutral-900/[0.06] data-[state=open]:bg-neutral-900/[0.07]"
              >
                <Avatar email={me?.email} className="h-7 w-7">
                  <AvatarFallback>{me ? initialFromEmail(me.email) : "?"}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-40 truncate text-compact text-neutral-600 md:inline">{me?.email ?? "…"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <p className="type-eyebrow">Signed in as</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">{me?.email ?? "…"}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <SettingsIcon className="h-4 w-4 text-neutral-500" /> Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogOut className="h-4 w-4 text-neutral-500" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
