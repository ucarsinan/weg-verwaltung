import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

import { AttentionList } from "@/components/ui/attention-list";
import { NextStepPanel } from "@/components/ui/next-step-panel";
import { OperationalHero } from "@/components/ui/operational-hero";

describe("Guided operations components", () => {
  it("renders an operational hero without axe violations", async () => {
    const { container } = render(
      <OperationalHero
        title="Dashboard"
        description="Operativer Einstieg"
        insight="Heute gibt es zwei offene Vorgänge."
      />,
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders a next step panel", () => {
    render(
      <NextStepPanel
        title="Einladung versenden"
        description="Die Versammlung ist noch im Entwurf."
      />,
    );

    expect(screen.getByText("Nächster Schritt")).toBeVisible();
    expect(screen.getByText("Einladung versenden")).toBeVisible();
  });

  it("renders attention items", () => {
    render(
      <AttentionList
        items={[
          {
            title: "Keine Einheiten erfasst",
            description: "Stimmrechte können noch nicht abgebildet werden.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Keine Einheiten erfasst")).toBeVisible();
  });
});
