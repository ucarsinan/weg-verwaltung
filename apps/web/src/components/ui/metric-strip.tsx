import * as React from "react";

import { cn } from "@/lib/utils";

export interface MetricStripItem {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}

export interface MetricStripProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MetricStripItem[];
}

const MetricStrip = React.forwardRef<HTMLDivElement, MetricStripProps>(
  ({ items, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      {...props}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="relative min-h-28 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-card)_96%,white),var(--color-card))] p-4 shadow-[var(--shadow-card)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[linear-gradient(90deg,var(--color-accent-calm),color-mix(in_oklch,var(--color-accent-warm)_70%,transparent),transparent)] before:content-['']"
        >
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-xs font-semibold uppercase text-[color:var(--color-muted-foreground)]">
                {item.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums tracking-normal text-[color:var(--color-foreground)]">
                {item.value}
              </p>
            </div>
            {item.icon ? (
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] text-[color:var(--color-foreground)] shadow-[0_1px_0_color-mix(in_oklch,white_34%,transparent)_inset] [&_svg]:size-4"
                aria-hidden="true"
              >
                {item.icon}
              </div>
            ) : null}
          </div>
          {item.hint ? (
            <p className="relative mt-3 line-clamp-2 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  ),
);
MetricStrip.displayName = "MetricStrip";

export { MetricStrip };
