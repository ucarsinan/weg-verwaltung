import * as React from "react";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NextStepPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description: React.ReactNode;
  reason?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "success" | "warning";
}

function ToneIcon({ tone }: { tone: NonNullable<NextStepPanelProps["tone"]> }) {
  if (tone === "success") return <CheckCircle2 />;
  if (tone === "warning") return <CircleAlert />;
  return <ArrowRight />;
}

const TONE_CLASS: Record<NonNullable<NextStepPanelProps["tone"]>, string> = {
  default: "text-[color:var(--color-primary)]",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
};

const NextStepPanel = React.forwardRef<HTMLDivElement, NextStepPanelProps>(
  (
    {
      title,
      description,
      reason,
      action,
      tone = "default",
      className,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 shadow-sm",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-secondary)] [&_svg]:size-4",
              TONE_CLASS[tone],
            )}
            aria-hidden="true"
          >
            <ToneIcon tone={tone} />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
              Nächster Schritt
            </p>
            <h2 className="break-words text-base font-semibold tracking-normal">
              {title}
            </h2>
            <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
              {description}
            </p>
            {reason ? (
              <p className="text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                {reason}
              </p>
            ) : null}
          </div>
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  ),
);
NextStepPanel.displayName = "NextStepPanel";

export { NextStepPanel };
