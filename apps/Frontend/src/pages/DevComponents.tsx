import { useState } from "react";
import { FolderKanban, Link, User } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Field } from "../components/ui/field";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState } from "../components/ui/empty-state";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BrandMark } from "../components/BrandMark";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { Avatar, AvatarFallback, initialFromEmail } from "../components/ui/avatar";
import { toast } from "../hooks/use-toast";
import type { TicketStatus } from "../lib/api";

const STATUSES: TicketStatus[] = ["OPEN", "PLANNING", "BLOCKED", "READY", "DONE"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function DevComponents() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Component gallery</h1>
          <p className="text-sm text-muted-foreground">
            Every primitive and variant, in one place. Not linked from the app.
          </p>
        </div>

        <Section title="Button">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent (Claude)</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </Section>

        <Section title="Input / Textarea / Select">
          <Input placeholder="Input" className="w-48" />
          <Textarea placeholder="Textarea" className="w-48" rows={2} />
          <Select aria-label="Example select" className="w-48" defaultValue="">
            <option value="" disabled>Pick one</option>
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </Select>
        </Section>

        <Section title="Badge — status colors (TicketStatus)">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </Section>

        <Section title="Badge — semantic variants">
          <Badge variant="neutral">neutral</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
        </Section>

        <Section title="Field (label, hint, error)">
          <Field label="Email" htmlFor="dev-email" hint="We never share it" className="w-56">
            <Input id="dev-email" placeholder="you@company.com" />
          </Field>
          <Field label="Password" htmlFor="dev-pass" error="Password is required" className="w-56">
            <Input id="dev-pass" type="password" aria-invalid />
          </Field>
        </Section>

        <Section title="Skeleton / Empty state">
          <div className="w-64 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
          <EmptyState icon={FolderKanban} title="Nothing here yet" description="Explain what goes here and how to add it." className="w-full" />
        </Section>

        <Section title="Brand mark">
          <BrandMark />
          <BrandMark className="h-10 w-10" />
        </Section>

        <Section title="Card (flat, no shadow at rest)">
          <Card className="w-64 p-4">
            <p className="text-sm font-medium">Card title</p>
            <p className="text-xs text-muted-foreground">Flat surface, border only.</p>
          </Card>
        </Section>

        <Section title="Avatar">
          <Avatar>
            <AvatarFallback>{initialFromEmail("teammate@example.com")}</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback><User className="h-3.5 w-3.5" /></AvatarFallback>
          </Avatar>
        </Section>

        <Section title="Tooltip">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm"><Link className="h-3.5 w-3.5" /> Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>A Radix tooltip, keyboard-accessible</TooltipContent>
          </Tooltip>
        </Section>

        <Section title="Dialog (focus-trapped, Escape-to-close)">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Example dialog</DialogTitle>
              <DialogDescription>Radix handles focus trapping and keyboard nav for free.</DialogDescription>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Confirm dialog (replaces window.confirm)">
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Delete something</Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete this ticket?"
            description="This can't be undone."
            confirmLabel="Delete ticket"
            onConfirm={() => toast({ title: "Deleted" })}
          />
        </Section>

        <Section title="Toast">
          <Button variant="secondary" onClick={() => toast({ title: "Saved", description: "Default variant" })}>
            Default toast
          </Button>
          <Button
            variant="destructive"
            onClick={() => toast({ title: "Something went wrong", variant: "destructive" })}
          >
            Destructive toast
          </Button>
        </Section>

        <Section title="Type scale">
          <div className="space-y-1.5">
            <p className="type-title">type-title — page titles</p>
            <p className="type-heading">type-heading — section and card titles</p>
            <p className="type-body">type-body — body text and descriptions</p>
            <p className="type-meta">type-meta — timestamps and supporting detail</p>
            <p className="type-eyebrow">type-eyebrow — small section labels</p>
            <p className="font-mono text-xs">font-mono — for hashes, ids, file paths</p>
          </div>
        </Section>
      </div>
    </main>
  );
}
