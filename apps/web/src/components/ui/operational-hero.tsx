import * as React from "react";

import { cn } from "@/lib/utils";

export interface OperationalHeroProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  status?: React.ReactNode;
  insight?: React.ReactNode;
  actions?: React.ReactNode;
}

const OperationalHero = React.forwardRef<HTMLElement, OperationalHeroProps>(
  (
    { title, description, eyebrow, status, insight, actions, className, ...props },
    ref,
  ) => (
    <section
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-card)_92%,var(--color-accent-calm)),var(--color-card)_52%,color-mix(in_oklch,var(--color-surface-subtle)_82%,var(--color-accent-warm)))] shadow-[var(--shadow-card)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,var(--color-accent-calm),var(--color-accent-warm),transparent)] before:content-['']",
        className,
      )}
      {...props}
    >
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            {eyebrow ? (
              <div className="text-xs font-semibold uppercase text-[color:var(--color-muted-foreground)]">
                {eyebrow}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-2xl font-semibold tracking-normal text-[color:var(--color-foreground)] sm:text-3xl">
                {title}
              </h1>
              {status}
            </div>
            {description ? (
              <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                {description}
              </p>
            ) : null}
          </div>
          {insight ? (
            <div className="max-w-3xl rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/72 px-3 py-2 text-sm leading-6 text-[color:var(--color-foreground)] shadow-[0_1px_0_color-mix(in_oklch,white_38%,transparent)_inset]">
              {insight}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  ),
);
OperationalHero.displayName = "OperationalHero";

export { OperationalHero };
