import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "../page";
import PricesPage from "../preise/page";

describe("LandingPage", () => {
  it("addresses self-managed WEGs and directs visitors to registration", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: "Eure WEG. Gemeinsam organisiert." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Für selbstverwaltete WEGs mit 3–20 Einheiten")).toBeInTheDocument();

    const registrationLinks = screen.getAllByRole("link", {
      name: /30 Tage kostenlos starten/i,
    });

    expect(registrationLinks).not.toHaveLength(0);
    expect(registrationLinks[0]).toHaveAttribute("href", "/registrieren");
  });

  it("advertises the document store with its § 18 Abs. 4 WEG boundary", () => {
    render(<LandingPage />);

    // Pins the substance, not just the heading: what it does (ablegen,
    // versionieren, Aufbewahrungsfrist) and what it explicitly is not (kein
    // Eigentümerportal, keine Erfüllung von § 18 Abs. 4 WEG durch Versand).
    expect(
      screen.getByText(
        /Unterlagen je WEG ablegen, versionieren und mit Aufbewahrungsfrist führen/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kein Eigentümerportal/i)).toBeInTheDocument();
    expect(
      screen.getByText(/§ 18 Abs\. 4 WEG gewährt weiterhin der Verwalter/i),
    ).toBeInTheDocument();
  });

  it("makes the remaining product boundaries visible", () => {
    render(<LandingPage />);

    // Dokumentenablage left this list on 2026-09-23 — it is now a shipped
    // feature (pinned separately above), not a boundary.
    expect(
      screen.getByText(/Keine Bankanbindung, kein Mahnwesen und keine Rechtsberatung/i),
    ).toBeInTheDocument();
    expect(screen.getByText("12,90 €")).toBeInTheDocument();
    expect(screen.getByText("Für 3–10 Einheiten")).toBeInTheDocument();
  });
});

describe("PricesPage", () => {
  it("shows both published monthly plans with registration links", () => {
    render(<PricesPage />);

    expect(screen.getByRole("heading", { name: "3–10 Einheiten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "11–20 Einheiten" })).toBeInTheDocument();
    expect(screen.getByText("12,90 €")).toBeInTheDocument();
    expect(screen.getByText("24,90 €")).toBeInTheDocument();

    expect(
      screen
        .getAllByRole("link", { name: /30 Tage kostenlos starten/i })
        .some((link) => link.getAttribute("href") === "/registrieren?plan=start"),
    ).toBe(true);
  });

  it("carries the same document store and boundary copy as the landing page", () => {
    render(<PricesPage />);

    // preise/page.tsx received the identical text as page.tsx (Task 6). This
    // pins that mirror explicitly, so an edit to one page without the other
    // fails a test instead of only drifting silently.
    expect(
      screen.getByText(
        /Unterlagen je WEG ablegen, versionieren und mit Aufbewahrungsfrist führen/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kein Eigentümerportal/i)).toBeInTheDocument();
    expect(
      screen.getByText(/§ 18 Abs\. 4 WEG gewährt weiterhin der Verwalter/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Keine Bankanbindung, kein Mahnwesen und keine Rechtsberatung/i),
    ).toBeInTheDocument();
  });
});
