import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-600 text-white hover:bg-accent-700 shadow-sm shadow-accent-600/20",
        secondary:
          "bg-surface-raised text-foreground border border-border hover:bg-surface",
        ghost: "text-foreground hover:bg-surface-raised",
        outline: "border border-border bg-transparent hover:bg-surface-raised",
        destructive: "bg-incorrect-500 text-white hover:bg-incorrect-600",
        link: "text-accent-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        // MODIFIED (Phase 14, Part 1 -- Mobile Experience & PWA): 36px ->
        // 40px. Icon-only buttons (nav triggers, dialog close, card
        // actions) are exactly the controls a thumb taps most on a phone;
        // 36px sits noticeably under the ~40-44px touch-target minimum
        // most mobile guidelines recommend. This is a single CVA variant,
        // so the fix applies everywhere `size="icon"` is used (21 call
        // sites) without touching each one individually.
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
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
