import * as React from "react";

import { cn } from "@/lib/utils";

export interface InsightCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const InsightCard = React.forwardRef<HTMLDivElement, InsightCardProps>(
  ({ title, description, icon, action, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-card)_94%,var(--color-accent-calm)),var(--color-card)_58%,color-mix(in_oklch,var(--color-surface-subtle)_84%,var(--color-accent-warm)))] p-4 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      <div className="flex gap-3">
        {icon ? (
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] text-[color:var(--color-foreground)] shadow-[0_1px_0_color-mix(in_oklch,white_34%,transparent)_inset] [&_svg]:size-4"
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-sm font-semibold tracking-normal text-[color:var(--color-foreground)]">
            {title}
          </h2>
          <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
            {description}
          </p>
          {action ? <div className="pt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  ),
);
InsightCard.displayName = "InsightCard";

export { InsightCard };
