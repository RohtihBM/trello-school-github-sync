import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { motion } from "motion/react";
import { api, type Org } from "../lib/api";
import { riseIn, staggerParent } from "../lib/motion";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState } from "../components/ui/empty-state";
import { PageIntro } from "../components/PageIntro";
import { toast } from "../hooks/use-toast";

function since(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Real, not a stub — GET /organisations backs the create-board dialog's org
// picker and this page lists everything the signed-in user belongs to.
export function OrganisationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Org[]>("/organisations")
      .then(setOrgs)
      .catch((err) =>
        toast({
          title: "Failed to load organisations",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageIntro eyebrow="Workspace" title="Organisations" description="Every organisation you're a member of. Boards live inside one." />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-8">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading organisations">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organisations yet"
            description="You're not a member of any organisation. Create one from the Boards page."
          />
        ) : (
          <motion.ul variants={staggerParent(0.07)} initial="hidden" animate="show" className="border-t border-border-strong">
            {orgs.map((org) => (
              <motion.li
                key={org.id}
                variants={riseIn}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-6 border-b border-border py-7 transition-colors duration-300 hover:bg-white/60"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-950 font-display text-[2rem] leading-none text-accent-300 shadow-raise transition-transform duration-500 ease-out-expo group-hover:-rotate-6">
                  {org.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="type-title truncate">{org.name}</p>
                  <p className="mt-1 truncate text-sm text-neutral-500">{org.description ?? "No description"}</p>
                </div>
                <p className="type-eyebrow hidden text-right sm:block">Since {since(org.createdAt)}</p>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </main>
    </div>
  );
}
