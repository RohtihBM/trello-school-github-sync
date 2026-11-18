import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/cn";

export const TooltipProvider = ({ delayDuration = 250, ...props }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
);
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-4 text-neutral-50 shadow-float ring-1 ring-white/10 data-[state=closed]:animate-menu-out data-[state=delayed-open]:animate-menu-in data-[state=instant-open]:animate-menu-in",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";
