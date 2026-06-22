import { describe, expect, it } from "vitest";
import {
  formatWegAddress,
  parseWegAddress,
  validateWegAddress,
  type WegAddressFields,
} from "../address";

const BASE_ADDRESS: WegAddressFields = {
  street: "Hauptstraße",
  houseNumber: "42a",
  postalCode: "12345",
  city: "Berlin",
  state: "Berlin",
  country: "Deutschland",
  additional: "Haus A",
};

describe("weg address", () => {
  it("formats structured fields into the persisted display address", () => {
    expect(formatWegAddress(BASE_ADDRESS)).toBe(
      "Hauptstraße 42a\n12345 Berlin\nBerlin\nDeutschland\nHaus A",
    );
  });

  it("parses legacy comma-separated addresses for the edit form", () => {
    expect(parseWegAddress("Crossweg 1, 12345 Teststadt")).toMatchObject({
      street: "Crossweg",
      houseNumber: "1",
      postalCode: "12345",
      city: "Teststadt",
      country: "Deutschland",
    });
  });

  it("requires a German PLZ to use five digits", () => {
    const errors = validateWegAddress({
      ...BASE_ADDRESS,
      postalCode: "1234",
    });

    expect(errors.postalCode).toBeDefined();
  });
});
