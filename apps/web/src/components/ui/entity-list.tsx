import * as React from "react";

import { cn } from "@/lib/utils";

export interface EntityListProps
  extends React.HTMLAttributes<HTMLUListElement> {
  "aria-label": string;
}

const EntityList = React.forwardRef<HTMLUListElement, EntityListProps>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      className={cn(
        "divide-y divide-[color:var(--color-border)] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
EntityList.displayName = "EntityList";

export interface EntityListItemProps
  extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}

const EntityListItem = React.forwardRef<HTMLLIElement, EntityListItemProps>(
  (
    {
      title,
      description,
      meta,
      badges,
      actions,
      leading,
      className,
      ...props
    },
    ref,
  ) => (
    <li
      ref={ref}
      className={cn(
        "flex flex-col gap-3 p-4 transition-colors hover:bg-[color:var(--color-secondary)]/45 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 gap-3">
        {leading ? (
          <div className="mt-0.5 shrink-0 text-[color:var(--color-muted-foreground)]">
            {leading}
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 break-words text-sm font-medium text-[color:var(--color-foreground)]">
              {title}
            </div>
            {badges ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {badges}
              </div>
            ) : null}
          </div>
          {description ? (
            <div className="whitespace-pre-line break-words text-xs leading-5 text-[color:var(--color-muted-foreground)]">
              {description}
            </div>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-muted-foreground)]">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </li>
  ),
);
EntityListItem.displayName = "EntityListItem";

export { EntityList, EntityListItem };
