import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-shimmer rounded-md bg-neutral-900/[0.07]", className)} {...props} />;
}
