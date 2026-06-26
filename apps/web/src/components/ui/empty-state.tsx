import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ title, description, icon, action, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/30 px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          className="mb-4 flex size-10 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-muted-foreground)] [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
