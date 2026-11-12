import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { FLOATING_SHADOW } from "./card";

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm",
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  cn("relative flex items-start gap-2 rounded-lg border p-3 pr-8", FLOATING_SHADOW),
  {
    variants: {
      variant: {
        default: "border-border bg-surface",
        destructive: "border-danger-600/20 bg-danger-50",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitive.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />
));
Toast.displayName = "Toast";

export function ToastTitle({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function ToastDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToastPrimitive.Description>) {
  return <ToastPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function ToastClose({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      className={cn("absolute right-2 top-2 text-muted-foreground hover:text-foreground", className)}
      aria-label="Dismiss"
      {...props}
    >
      <X className="h-3.5 w-3.5" />
    </ToastPrimitive.Close>
  );
}
