import * as React from "react";
import { Check, Circle, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkflowStepStatus = "pending" | "current" | "complete" | "blocked";

export interface WorkflowStep {
  label: React.ReactNode;
  description?: React.ReactNode;
  status: WorkflowStepStatus;
}

export interface WorkflowTimelineProps
  extends React.HTMLAttributes<HTMLOListElement> {
  steps: WorkflowStep[];
}

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "complete") return <Check />;
  if (status === "blocked") return <CircleAlert />;
  return <Circle />;
}

const STEP_STYLE: Record<WorkflowStepStatus, string> = {
  pending:
    "border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-muted-foreground)]",
  current:
    "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]",
  complete:
    "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  blocked:
    "border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)]",
};

const WorkflowTimeline = React.forwardRef<HTMLOListElement, WorkflowTimelineProps>(
  ({ steps, className, ...props }, ref) => (
    <ol
      ref={ref}
      className={cn(
        "grid gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3 shadow-sm md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]",
        className,
      )}
      {...props}
    >
      {steps.map((step, index) => (
        <li
          key={index}
          className="relative flex min-w-0 gap-3 rounded-md p-2"
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5",
              STEP_STYLE[step.status],
            )}
            aria-hidden="true"
          >
            <StepIcon status={step.status} />
          </span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium text-[color:var(--color-foreground)]">
              {step.label}
            </span>
            {step.description ? (
              <span className="mt-1 block break-words text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                {step.description}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  ),
);
WorkflowTimeline.displayName = "WorkflowTimeline";

export { WorkflowTimeline };
