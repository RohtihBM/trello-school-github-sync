import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui pattern: clsx handles conditional classes, twMerge
// resolves conflicting Tailwind utilities (e.g. a caller passing
// className="p-4" against a component default of "p-2" — without this,
// both would end up in the DOM and the LAST one in source order wins by
// CSS cascade accident, not by intent).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
