import * as React from "react";

import { cn } from "@/lib/utils";

// § 5.10 — fix shadcn focus-ring contrast gap: full-opacity ring + offset.
// aria-invalid carries a red border AND a red focus-ring. WCAG 1.4.1 — state
// must be perceivable without colour, so we also escalate the border width
// via data-[invalid] to give a non-colour signal.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-1 text-sm text-[color:var(--color-foreground)] shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[color:var(--color-foreground)]",
          "placeholder:text-[color:var(--color-muted-foreground)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-[color:var(--color-destructive)] aria-[invalid=true]:focus-visible:ring-[color:var(--color-destructive)]",
          "data-[invalid]:border-2",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
