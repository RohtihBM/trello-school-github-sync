import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

// Buttons are tactile: a hairline top highlight, a soft bottom edge, a small
// rise on hover and a real press on click. Hierarchy is by material, not just
// colour — ink (the decisive action), clay (Claude's action), paper
// (everyday), bare (quiet).
const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,background-image,border-color,color,box-shadow,transform] duration-200 ease-out-expo active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-b from-neutral-700 to-neutral-900 text-neutral-50 shadow-[inset_0_1px_0_oklch(100%_0_0/0.16),0_1px_2px_oklch(21%_0.03_165/0.35),0_0_0_1px_oklch(15%_0.026_168)] hover:from-neutral-600 hover:to-neutral-800 hover:shadow-[inset_0_1px_0_oklch(100%_0_0/0.2),0_6px_14px_-4px_oklch(21%_0.03_165/0.45),0_0_0_1px_oklch(15%_0.026_168)]",
        accent:
          "bg-linear-to-b from-accent-500 to-accent-600 text-white shadow-[inset_0_1px_0_oklch(100%_0_0/0.28),0_1px_2px_oklch(46%_0.12_39/0.4),0_0_0_1px_oklch(50%_0.14_40)] hover:from-accent-400 hover:to-accent-500 hover:shadow-[inset_0_1px_0_oklch(100%_0_0/0.3),0_6px_14px_-4px_oklch(56%_0.15_41/0.55),0_0_0_1px_oklch(50%_0.14_40)]",
        secondary:
          "bg-surface text-foreground shadow-raise ring-1 ring-border-strong hover:bg-white hover:shadow-lift hover:ring-neutral-400",
        ghost: "text-neutral-600 hover:bg-neutral-900/[0.06] hover:text-foreground",
        destructive:
          "bg-linear-to-b from-danger-500 to-danger-600 text-white shadow-[inset_0_1px_0_oklch(100%_0_0/0.22),0_1px_2px_oklch(43%_0.17_22/0.4),0_0_0_1px_oklch(46%_0.18_22)] hover:from-danger-500 hover:to-danger-700",
      },
      size: {
        sm: "h-8 px-3 text-compact pointer-coarse:h-11",
        md: "h-9 px-4 pointer-coarse:h-11",
        lg: "h-11 px-5 text-[0.9375rem]",
        "icon-sm": "h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
