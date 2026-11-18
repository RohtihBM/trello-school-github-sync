import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn";

// A person's tone is derived from their email, so the same teammate is the
// same colour on every screen — a quiet way to tell people apart at a glance
// without fetching images (this app has no profile photos). Lightness and
// chroma are fixed, so every tone sits comfortably on the paper palette.
function toneFor(seed: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return { backgroundColor: `oklch(91% 0.055 ${hue})`, color: `oklch(36% 0.08 ${hue})` };
}

interface AvatarProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  // When given, the avatar takes that person's tone.
  email?: string;
}

export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, email, style, ...props }, ref) => (
    <AvatarPrimitive.Root
      ref={ref}
      style={email ? { ...toneFor(email), ...style } : style}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700 ring-1 ring-inset ring-neutral-900/10",
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = "Avatar";

export const AvatarFallback = AvatarPrimitive.Fallback;

// Deterministic from an email, not random on every render.
export function initialFromEmail(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "?";
}
