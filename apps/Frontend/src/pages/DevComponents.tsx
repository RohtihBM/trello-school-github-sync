import { useState } from "react";
import { Link, User } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import { Badge, STATUS_BADGE_VARIANT } from "../components/ui/badge";
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

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Component gallery</h1>
          <p className="text-sm text-muted-foreground">
            Phase A verification only — every primitive and variant, in one place.
          </p>
        </div>

        <Section title="Button">
          <Button variant="primary">Primary</Button>
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
            <Badge key={s} variant={STATUS_BADGE_VARIANT[s]}>{s}</Badge>
          ))}
        </Section>

        <Section title="Badge — semantic variants">
          <Badge variant="neutral">neutral</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
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
          <div className="space-y-1">
            <p className="text-2xl font-semibold">text-2xl semibold</p>
            <p className="text-xl font-semibold">text-xl semibold</p>
            <p className="text-base font-medium">text-base medium</p>
            <p className="text-sm">text-sm regular</p>
            <p className="text-xs text-muted-foreground">text-xs muted</p>
            <p className="font-mono text-xs">font-mono — for hashes, ids, file paths</p>
          </div>
        </Section>
      </div>
    </main>
  );
}
