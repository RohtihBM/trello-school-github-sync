import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { FLOATING_SHADOW } from "./card";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// Radix handles focus trapping, Escape-to-close, and returning focus to the
// trigger on close.
interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  // For callers rendering their own header/close affordance (the issue-detail
  // dialog has its own close button) — avoids two overlapping close controls.
  hideClose?: boolean;
  // "sheet" docks the panel to the right edge and slides it in, so the page
  // behind stays visible as context — used for the ticket.
  variant?: "center" | "sheet";
}

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, hideClose, variant = "center", ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-950/45 backdrop-blur-[2px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          variant === "sheet"
            ? "fixed inset-y-0 right-0 z-50 h-dvh w-full bg-surface outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
            : "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          FLOATING_SHADOW,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-foreground">
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
  return <DialogPrimitive.Title className={cn("type-subtitle", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 type-body text-neutral-500", className)} {...props} />;
}
