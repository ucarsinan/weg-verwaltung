import { describe, expect, it } from "vitest";

import { buildAbstimmungState } from "../abstimmung";
import { evaluateMajority } from "../majority";

describe("buildAbstimmungState", () => {
  it("aggregates one vote per ownership into the tally", () => {
    const { voteByOwnership, tally } = buildAbstimmungState(
      [
        { ownership_id: "o1", wert: "ja" },
        { ownership_id: "o2", wert: "nein" },
        { ownership_id: "o3", wert: "ja" },
        { ownership_id: "o4", wert: "enthaltung" },
      ],
      { totalEligible: 6 },
    );

    expect(tally).toEqual({
      ja: 2,
      nein: 1,
      enthaltung: 1,
      total_eligible: 6,
    });
    expect(voteByOwnership.get("o1")).toBe("ja");
    expect(voteByOwnership.size).toBe(4);
  });

  it("ignores malformed wert values instead of miscounting them", () => {
    const { voteByOwnership, tally } = buildAbstimmungState([
      { ownership_id: "o1", wert: "ja" },
      { ownership_id: "o2", wert: "JA " },
      { ownership_id: "o3", wert: "unbekannt" },
    ]);

    expect(tally.ja).toBe(1);
    expect(tally.nein).toBe(0);
    expect(voteByOwnership.has("o2")).toBe(false);
  });

  it("keeps only the last vote per ownership (upsert semantics)", () => {
    const { tally } = buildAbstimmungState([
      { ownership_id: "o1", wert: "nein" },
      { ownership_id: "o1", wert: "ja" },
    ]);

    expect(tally).toMatchObject({ ja: 1, nein: 0 });
  });

  it("feeds evaluateMajority through the same seam the page uses", () => {
    const { tally } = buildAbstimmungState(
      [
        { ownership_id: "o1", wert: "ja" },
        { ownership_id: "o2", wert: "ja" },
        { ownership_id: "o3", wert: "nein" },
      ],
      { totalEligible: 3 },
    );

    const evaluation = evaluateMajority(tally, "einfach");
    expect(evaluation.outcome).toBe("positiv_beschluss");
    expect(evaluation.fallback_applied).toBe(false);
  });
});
