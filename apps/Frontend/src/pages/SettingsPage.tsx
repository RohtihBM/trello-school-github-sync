import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { motion } from "motion/react";
import { api, clearToken } from "../lib/api";
import { riseIn, staggerParent } from "../lib/motion";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, initialFromEmail } from "../components/ui/avatar";
import { Skeleton } from "../components/ui/skeleton";
import { PageIntro } from "../components/PageIntro";
import { toast } from "../hooks/use-toast";

interface Me {
  id: string;
  email: string;
}

// One row = one thing: what it is on the left, the value or action on the
// right, hairlines between — a settings sheet, not a stack of boxes.
function Row({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <motion.div variants={riseIn} className="grid gap-4 border-b border-border py-8 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-12">
      <div>
        <h2 className="type-heading">{label}</h2>
        <p className="mt-1 text-compact leading-5 text-neutral-500">{description}</p>
      </div>
      <div className="flex items-center">{children}</div>
    </motion.div>
  );
}

// Account info and sign out — deliberately small rather than inventing
// preferences the backend has nowhere to store.
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
    <div className="flex h-full flex-col overflow-y-auto">
      <PageIntro eyebrow="Account" title="Settings" description="Who you're signed in as on this device." />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-8">
        <motion.div variants={staggerParent(0.08)} initial="hidden" animate="show" className="border-t border-border-strong">
          <Row label="Identity" description="Your email is how teammates see you on boards and tickets.">
            <div className="flex items-center gap-4">
              <Avatar email={me?.email} className="h-14 w-14 text-xl">
                <AvatarFallback>{me ? initialFromEmail(me.email) : "?"}</AvatarFallback>
              </Avatar>
              {me ? <p className="font-display text-[1.75rem] leading-8 tracking-[-0.015em]">{me.email}</p> : <Skeleton className="h-7 w-64" />}
            </div>
          </Row>
          <Row label="Session" description="Signing out only affects this browser. You'll need your email and password to come back.">
            <Button variant="secondary" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </Row>
        </motion.div>
      </main>
    </div>
  );
}
