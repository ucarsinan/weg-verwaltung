import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/modules/settings/actions", () => ({
  logoutAction: vi.fn(),
}));

import AppShell from "@/components/shell/app-shell";

afterEach(() => cleanup());

describe("AppShell settings sub-navigation", () => {
  it("does not render the settings sub-items outside the settings section", () => {
    mocks.pathname = "/dashboard";
    render(<AppShell userEmail="admin@example.test">content</AppShell>);

    expect(screen.queryByText("Mitglieder & Rollen")).toBeNull();
  });

  it("renders the sub-items and marks the active one inside the settings section", () => {
    mocks.pathname = "/einstellungen/person";
    render(<AppShell userEmail="admin@example.test">content</AppShell>);

    // Desktop + mobile nav each render the sub-items, so expect at least one of each.
    for (const label of [
      "Konto",
      "Person",
      "Mandant",
      "Sicherheit",
      "Mitglieder & Rollen",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const activeLinks = screen
      .getAllByRole("link", { name: /Person/ })
      .filter((el) => el.getAttribute("href") === "/einstellungen/person");
    expect(activeLinks.length).toBeGreaterThan(0);
    expect(activeLinks[0]).toHaveAttribute("aria-current", "page");
  });
});
