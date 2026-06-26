import * as React from "react";

import { cn } from "@/lib/utils";
import {
  WorkflowTimeline,
  type WorkflowTimelineProps,
} from "@/components/ui/workflow-timeline";

export interface ProcessRailProps
  extends Omit<WorkflowTimelineProps, "aria-label"> {
  label: string;
  summary?: React.ReactNode;
}

const ProcessRail = React.forwardRef<HTMLOListElement, ProcessRailProps>(
  ({ label, summary, steps, className, ...props }, ref) => (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
            Prozess
          </p>
          <h2 className="text-base font-semibold tracking-normal">{label}</h2>
        </div>
        {summary ? (
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            {summary}
          </p>
        ) : null}
      </div>
      <WorkflowTimeline
        ref={ref}
        aria-label={label}
        steps={steps}
        className={cn("shadow-none", className)}
        {...props}
      />
    </section>
  ),
);
ProcessRail.displayName = "ProcessRail";

export { ProcessRail };
