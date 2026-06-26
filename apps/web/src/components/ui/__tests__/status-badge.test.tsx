import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";

import { LifecycleBadge, StatusBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renders badge text", () => {
    render(<StatusBadge variant="success">Erledigt</StatusBadge>);
    expect(document.body).toHaveTextContent("Erledigt");
  });

  it("maps lifecycle states to badge variants without axe violations", async () => {
    const { container } = render(
      <LifecycleBadge status="eingeladen">Eingeladen</LifecycleBadge>,
    );

    expect(document.body).toHaveTextContent("Eingeladen");
    expect(await axe(container)).toHaveNoViolations();
  });
});
