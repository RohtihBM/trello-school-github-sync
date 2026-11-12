import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { Card } from "./ui/card";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

// Shared by SignIn and SignUp so both pages are visually identical except
// for their actual content — one page shell to change, not two drifting
// copies. No invented product name/wordmark here on purpose: this app
// has never had one (index.html's <title> is still the Vite default
// "frontend"), and naming a product is a real decision for the user to
// make, not something to pick unilaterally while rebuilding auth pages.
// An abstract mark stands in until there's a real one.
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600 text-white">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Card className="p-6">{children}</Card>

        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  );
}
