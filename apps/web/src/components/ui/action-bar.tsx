import * as React from "react";

import { cn } from "@/lib/utils";

export interface ActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  destructive?: React.ReactNode;
}

const ActionBar = React.forwardRef<HTMLDivElement, ActionBarProps>(
  ({ primary, secondary, destructive, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {secondary}
        {children}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {destructive ? (
          <div className="flex flex-wrap items-center gap-2 sm:mr-2">
            {destructive}
          </div>
        ) : null}
        {primary}
      </div>
    </div>
  ),
);
ActionBar.displayName = "ActionBar";

export { ActionBar };
