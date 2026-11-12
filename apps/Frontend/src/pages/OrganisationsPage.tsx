import { useEffect, useState } from "react";
import { api, type Org } from "../lib/api";
import { Card } from "../components/ui/card";
import { toast } from "../hooks/use-toast";

// Real, not a stub — GET /organisations has existed since phase C
// (BoardsList's create-board dialog already uses it to populate the org
// picker) but had no dedicated page to actually view it on. The sidebar
// nav plan explicitly calls for an "Organisations" entry; pointing it at
// a page that doesn't do anything would be exactly the kind of mock
// functionality ruled out, so this is a small but real page instead.
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
    <div className="h-full overflow-y-auto">
      <header className="border-b border-border bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Organisations</h1>
        <p className="text-sm text-muted-foreground">Every organisation you're a member of.</p>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && orgs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You're not a member of any organisation yet — create one from the Boards page.
          </p>
        )}
        <div className="space-y-2">
          {orgs.map((org) => (
            <Card key={org.id} className="p-4">
              <p className="text-sm font-medium text-foreground">{org.name}</p>
              {org.description && <p className="text-xs text-muted-foreground">{org.description}</p>}
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
