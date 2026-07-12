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

  it("makes the product boundaries visible", () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/Keine Bankanbindung, keine Jahresabrechnung und keine Rechtsberatung/i),
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
});
