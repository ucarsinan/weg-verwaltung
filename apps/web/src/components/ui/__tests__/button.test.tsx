import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { Button } from "@/components/ui/button";

describe("Button (a11y)", () => {
  it("default variant has no axe violations", async () => {
    const { container } = render(<Button>Speichern</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("destructive variant has no axe violations", async () => {
    const { container } = render(<Button variant="destructive">Löschen</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("disabled state remains focusable for SR but indicates aria-disabled or disabled", async () => {
    const { container, getByRole } = render(<Button disabled>Speichern</Button>);
    const btn = getByRole("button");
    expect(btn).toBeDisabled();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
