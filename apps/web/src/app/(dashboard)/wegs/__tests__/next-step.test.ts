import { describe, expect, it } from "vitest";
import { naechsterSchritt, type WegFortschritt } from "../next-step";

const WEG_ID = "11111111-1111-1111-1111-111111111111";

/** Eine WEG, die alle Stufen hinter sich hat — Ausgangspunkt jedes Tests. */
const VOLLSTAENDIG: WegFortschritt = {
  wegId: WEG_ID,
  hatEinheiten: true,
  hatPersonen: true,
  hatWirtschaftsplan: true,
  hatVersammlungen: true,
  offeneVersammlungId: null,
};

function stand(abweichung: Partial<WegFortschritt>): WegFortschritt {
  return { ...VOLLSTAENDIG, ...abweichung };
}

describe("naechsterSchritt", () => {
  it("fordert zuerst Einheiten", () => {
    const schritt = naechsterSchritt(
      stand({ hatEinheiten: false, hatPersonen: false, hatWirtschaftsplan: false }),
    );

    expect(schritt.title).toBe("Wohneinheiten anlegen");
    expect(schritt.href).toBe(`/wegs/${WEG_ID}/einheiten/new`);
  });

  it("fordert danach Personen", () => {
    const schritt = naechsterSchritt(
      stand({ hatPersonen: false, hatWirtschaftsplan: false }),
    );

    expect(schritt.title).toBe("Personen erfassen");
  });

  it("fordert den Wirtschaftsplan, sobald Einheiten und Personen stehen", () => {
    const schritt = naechsterSchritt(
      stand({ hatWirtschaftsplan: false, hatVersammlungen: false }),
    );

    expect(schritt.title).toBe("Wirtschaftsplan aufstellen");
    expect(schritt.href).toBe(`/wegs/${WEG_ID}/finanzen/new`);
  });

  it("stellt den Wirtschaftsplan VOR die Versammlung", () => {
    // Der fachliche Kern von Befund 8: Die Versammlung beschliesst ueber die
    // Vorschuesse auf Grundlage des Plans (§ 28 Abs. 1 WEG). Ohne Vorlage ist
    // der Termin nicht der naechste sinnvolle Schritt — auch dann nicht, wenn
    // bereits eine Versammlung laeuft.
    const ohnePlanMitOffenerVersammlung = naechsterSchritt(
      stand({
        hatWirtschaftsplan: false,
        offeneVersammlungId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    expect(ohnePlanMitOffenerVersammlung.title).toBe("Wirtschaftsplan aufstellen");
  });

  it("überspringt den Wirtschaftsplan, wenn er nicht ermittelbar war", () => {
    // Der wichtigste Fall. Scheitert die Zaehlabfrage, liefert die Seite null.
    // Das als "kein Plan vorhanden" zu lesen, wuerde jede planende Gemeinschaft
    // zum Neuanlegen auffordern — die Leiter muss sich dann wie vorher
    // verhalten.
    const schritt = naechsterSchritt(
      stand({ hatWirtschaftsplan: null, hatVersammlungen: false }),
    );

    expect(schritt.title).toBe("Erste Versammlung vorbereiten");
  });

  it("fordert die erste Versammlung, sobald der Plan steht", () => {
    const schritt = naechsterSchritt(stand({ hatVersammlungen: false }));

    expect(schritt.title).toBe("Erste Versammlung vorbereiten");
    expect(schritt.href).toBe(`/wegs/${WEG_ID}/versammlungen/new`);
  });

  it("führt eine offene Versammlung fort", () => {
    const meetingId = "33333333-3333-3333-3333-333333333333";
    const schritt = naechsterSchritt(stand({ offeneVersammlungId: meetingId }));

    expect(schritt.title).toBe("Offene Versammlung fortführen");
    expect(schritt.href).toBe(`/versammlungen/${meetingId}`);
    expect(schritt.tone).toBe("default");
  });

  it("meldet eine vollständig aufgestellte WEG als erledigt", () => {
    const schritt = naechsterSchritt(VOLLSTAENDIG);

    expect(schritt.title).toBe("Nächste Versammlung planen");
    expect(schritt.tone).toBe("success");
  });
});
