import * as React from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AttentionItem {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "open" | "done";
}

export interface AttentionListProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  items: AttentionItem[];
}

const AttentionList = React.forwardRef<HTMLDivElement, AttentionListProps>(
  ({ title = "Braucht Aufmerksamkeit", items, className, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        "rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 shadow-sm",
        className,
      )}
      {...props}
    >
      <h2 className="text-sm font-semibold tracking-normal">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => {
          const tone = item.tone ?? "open";

          return (
            <li
              key={index}
              className="flex gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3"
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0 [&_svg]:size-4",
                  tone === "done"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300",
                )}
                aria-hidden="true"
              >
                {tone === "done" ? <CheckCircle2 /> : <CircleAlert />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium">
                  {item.title}
                </span>
                {item.description ? (
                  <span className="mt-1 block break-words text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                    {item.description}
                  </span>
                ) : null}
                {item.action ? <span className="mt-2 block">{item.action}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  ),
);
AttentionList.displayName = "AttentionList";

export { AttentionList };
