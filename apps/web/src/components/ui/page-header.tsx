import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    { title, description, eyebrow, meta, actions, className, children, ...props },
    ref,
  ) => (
    <header
      ref={ref}
      className={cn(
        "flex flex-col gap-5 border-b border-[color:var(--color-border)] pb-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow ? (
          <div className="text-sm text-[color:var(--color-muted-foreground)]">
            {eyebrow}
          </div>
        ) : null}
        <div className="space-y-2">
          <h1 className="break-words text-2xl font-semibold tracking-normal text-[color:var(--color-foreground)] sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-[color:var(--color-muted-foreground)]">
              {description}
            </p>
          ) : null}
        </div>
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted-foreground)]">
            {meta}
          </div>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  ),
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
