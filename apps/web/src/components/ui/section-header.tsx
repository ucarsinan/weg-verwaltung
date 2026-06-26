import * as React from "react";

import { cn } from "@/lib/utils";

export interface SectionHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

const SectionHeader = React.forwardRef<HTMLElement, SectionHeaderProps>(
  ({ title, description, meta, actions, className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-base font-semibold tracking-normal text-[color:var(--color-foreground)]">
            {title}
          </h2>
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted-foreground)]">
              {meta}
            </div>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-[color:var(--color-muted-foreground)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  ),
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
