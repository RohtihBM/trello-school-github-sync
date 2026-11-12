import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn";

export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-100 text-xs font-medium text-accent-700",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

export const AvatarFallback = AvatarPrimitive.Fallback;

// Deterministic from an email, not random on every render — so the same
// person shows the same initial every time they appear, without
// fetching an actual avatar image (this app has no profile photo
// concept at all).
export function initialFromEmail(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "?";
}
