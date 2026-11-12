import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearToken } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "../hooks/use-toast";

interface Me {
  id: string;
  email: string;
}

// Minimal but real — the sidebar nav plan calls for a Settings entry;
// this is deliberately small (account info + sign out) rather than
// inventing preferences the backend has nowhere to store, consistent
// with "no mock functionality in production screens."
export function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<Me>("/me")
      .then(setMe)
      .catch((err) =>
        toast({
          title: "Failed to load account",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        }),
      );
  }, []);

  function handleSignOut() {
    clearToken();
    navigate("/signin");
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-border bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </header>

      <main className="mx-auto max-w-xl p-6">
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Signed in as</p>
            <p className="text-sm text-foreground">{me?.email ?? "Loading..."}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </Card>
      </main>
    </div>
  );
}
