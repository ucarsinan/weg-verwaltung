import { describe, expect, it } from "vitest";
import { evaluateMajority } from "../majority";

describe("evaluateMajority — einfache Mehrheit", () => {
  it("ja > nein → positiv", () => {
    const result = evaluateMajority(
      { ja: 3, nein: 1, enthaltung: 0 },
      "einfach",
    );
    expect(result.outcome).toBe("positiv_beschluss");
    expect(result.fallback_applied).toBe(false);
  });

  it("ja == nein → negativ (Stimmengleichheit lehnt ab)", () => {
    const result = evaluateMajority(
      { ja: 2, nein: 2, enthaltung: 0 },
      "einfach",
    );
    expect(result.outcome).toBe("negativ_beschluss");
  });

  it("Enthaltungen zählen nicht als Nein", () => {
    // 1 ja, 0 nein, 5 Enthaltungen — Mehrheit der "abgegebenen" Stimmen
    // ist 1/1 = 100 %.
    const result = evaluateMajority(
      { ja: 1, nein: 0, enthaltung: 5 },
      "einfach",
    );
    expect(result.outcome).toBe("positiv_beschluss");
  });
});

describe("evaluateMajority — qualifizierte Mehrheit (≥ 75 %)", () => {
  it("75 % erreicht → positiv", () => {
    const result = evaluateMajority(
      { ja: 3, nein: 1, enthaltung: 0 },
      "qualifiziert",
    );
    expect(result.outcome).toBe("positiv_beschluss");
  });

  it("knapp unter 75 % → negativ", () => {
    // 2/3 = 66 % < 75 %
    const result = evaluateMajority(
      { ja: 2, nein: 1, enthaltung: 0 },
      "qualifiziert",
    );
    expect(result.outcome).toBe("negativ_beschluss");
  });

  it("nur Enthaltungen, keine ja/nein → negativ (Division by zero vermeiden)", () => {
    const result = evaluateMajority(
      { ja: 0, nein: 0, enthaltung: 5 },
      "qualifiziert",
    );
    expect(result.outcome).toBe("negativ_beschluss");
  });
});

describe("evaluateMajority — doppelt qualifiziert (§ 21 Abs. 2 Nr. 1)", () => {
  it("Stimmen > 2/3 und MEA > 1/2 → positiv", () => {
    const result = evaluateMajority(
      {
        ja: 7,
        nein: 2,
        enthaltung: 0,
        ja_mea_summe: 600,
        total_mea: 1000,
      },
      "doppelt_qualifiziert",
    );
    expect(result.outcome).toBe("positiv_beschluss");
    expect(result.fallback_applied).toBe(false);
  });

  it("Stimmen-Teil erfüllt, MEA-Teil nicht → negativ", () => {
    const result = evaluateMajority(
      {
        ja: 7,
        nein: 2,
        enthaltung: 0,
        ja_mea_summe: 400, // < 500 (50%)
        total_mea: 1000,
      },
      "doppelt_qualifiziert",
    );
    expect(result.outcome).toBe("negativ_beschluss");
  });

  it("ohne MEA-Daten → Fallback, nur Stimmen-Teil", () => {
    const result = evaluateMajority(
      { ja: 7, nein: 2, enthaltung: 0 },
      "doppelt_qualifiziert",
    );
    expect(result.fallback_applied).toBe(true);
    expect(result.outcome).toBe("positiv_beschluss"); // Stimmen-Teil ok
    expect(result.reasoning).toContain("MEA-Anteil");
  });
});

describe("evaluateMajority — Allstimmigkeit", () => {
  it("alle Stimmberechtigten ja → positiv", () => {
    const result = evaluateMajority(
      { ja: 5, nein: 0, enthaltung: 0, total_eligible: 5 },
      "allstimmig",
    );
    expect(result.outcome).toBe("positiv_beschluss");
  });

  it("eine Enthaltung bricht Allstimmigkeit → negativ", () => {
    const result = evaluateMajority(
      { ja: 4, nein: 0, enthaltung: 1, total_eligible: 5 },
      "allstimmig",
    );
    expect(result.outcome).toBe("negativ_beschluss");
  });

  it("vereinbarungs_aenderung verhält sich wie allstimmig", () => {
    const result = evaluateMajority(
      { ja: 5, nein: 0, enthaltung: 0, total_eligible: 5 },
      "vereinbarungs_aenderung",
    );
    expect(result.outcome).toBe("positiv_beschluss");
  });

  it("ohne total_eligible → konservativer Fallback", () => {
    const result = evaluateMajority(
      { ja: 5, nein: 0, enthaltung: 0 },
      "allstimmig",
    );
    expect(result.fallback_applied).toBe(true);
    expect(result.outcome).toBe("positiv_beschluss");
  });
});
