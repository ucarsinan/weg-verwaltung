import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        neutral:
          "border-[color:var(--color-border)] bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)]",
        info:
          "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-200",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200",
        warning:
          "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200",
        danger:
          "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200",
        ai:
          "border-[color:var(--color-ai-violet)]/25 bg-[color:var(--color-ai-violet)]/10 text-[color:var(--color-ai-violet)]",
        user:
          "border-[color:var(--color-user-slate)]/25 bg-[color:var(--color-user-slate)]/10 text-[color:var(--color-user-slate)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  icon?: React.ReactNode;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, variant, icon, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(statusBadgeVariants({ variant, className }))}
      {...props}
    >
      {icon ? (
        <span className="shrink-0 [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  ),
);
StatusBadge.displayName = "StatusBadge";

const LIFECYCLE_VARIANTS = {
  entwurf: "neutral",
  eingeladen: "info",
  laufend: "warning",
  beendet: "success",
  abgesagt: "danger",
  offen: "warning",
  erledigt: "success",
  review: "info",
  ki: "ai",
  user: "user",
} as const satisfies Record<string, NonNullable<StatusBadgeProps["variant"]>>;

export interface LifecycleBadgeProps
  extends Omit<StatusBadgeProps, "variant"> {
  status: keyof typeof LIFECYCLE_VARIANTS;
}

function LifecycleBadge({ status, children, ...props }: LifecycleBadgeProps) {
  return (
    <StatusBadge variant={LIFECYCLE_VARIANTS[status]} {...props}>
      {children}
    </StatusBadge>
  );
}

export { LifecycleBadge, StatusBadge, statusBadgeVariants };
