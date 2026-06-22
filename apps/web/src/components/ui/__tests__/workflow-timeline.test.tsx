import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

import { WorkflowTimeline } from "@/components/ui/workflow-timeline";

describe("WorkflowTimeline", () => {
  it("marks the current step", async () => {
    const { container } = render(
      <WorkflowTimeline
        aria-label="Versammlungsstatus"
        steps={[
          { label: "Entwurf", status: "complete" },
          { label: "Einladung", status: "current" },
          { label: "Durchführung", status: "pending" },
        ]}
      />,
    );

    expect(screen.getByText("Einladung").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
