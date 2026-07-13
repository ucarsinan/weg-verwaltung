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

describe("AppShell vorgänge sub-navigation", () => {
  it("renders the Vorgänge sub-items and marks Inbox active, without mixing in Einstellungen items", () => {
    mocks.pathname = "/vorgaenge/inbox";
    render(<AppShell userEmail="admin@example.test">content</AppShell>);

    for (const label of ["Übersicht", "Inbox", "Reviews"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Mitglieder & Rollen")).toBeNull();

    const activeLinks = screen
      .getAllByRole("link", { name: /Inbox/ })
      .filter((el) => el.getAttribute("href") === "/vorgaenge/inbox");
    expect(activeLinks.length).toBeGreaterThan(0);
    expect(activeLinks[0]).toHaveAttribute("aria-current", "page");
  });

  it("does not render any sub-items outside a section that has a subnav", () => {
    mocks.pathname = "/wegs";
    render(<AppShell userEmail="admin@example.test">content</AppShell>);

    expect(screen.queryByText("Inbox")).toBeNull();
    expect(screen.queryByText("Mitglieder & Rollen")).toBeNull();
  });
});
