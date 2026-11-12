import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { FLOATING_SHADOW } from "./card";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

// Radix handles focus trapping, Escape-to-close, and returning focus to
// the trigger on close — none of which this app has anywhere today
// (there is no modal yet at all), and none of which would be trivial to
// get right by hand.
interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  // For callers rendering their own header/close affordance (the
  // issue-detail full-view dialog has its own close/collapse buttons in
  // IssueDetailContent's header) — without this, two visually
  // overlapping close controls would fight for the same corner.
  hideClose?: boolean;
}

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, hideClose, ...props }, ref) => (
    <DialogPrimitive.Portal>
      {/* Fade/scale transitions deliberately deferred to Phase G (motion
          polish) — tailwindcss-animate is a v3-era plugin that doesn't load
          the same way under Tailwind v4's CSS-first config, and Phase A is
          foundation, not motion. backdrop-blur-sm reads as "a new layer on
          top," not a flat dim — benefits every dialog in the app, not just
          the large issue-detail one this was added for. */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-sm" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5",
          FLOATING_SHADOW,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-semibold text-foreground", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
