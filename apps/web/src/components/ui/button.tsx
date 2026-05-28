import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// § 5.10 — fix shadcn focus-ring contrast gap: full-opacity ring + offset
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] hover:bg-[color:var(--color-primary)]/90",
        destructive:
          "bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)] hover:bg-[color:var(--color-destructive)]/90",
        outline:
          "border border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-secondary-foreground)]",
        secondary:
          "bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)] hover:bg-[color:var(--color-secondary)]/80",
        ghost:
          "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-secondary-foreground)]",
        link: "text-[color:var(--color-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
