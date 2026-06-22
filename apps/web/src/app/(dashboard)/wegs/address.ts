export interface WegAddressFields {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  additional: string;
}

export type WegAddressFieldName = keyof WegAddressFields;

export type WegAddressErrors = Partial<Record<WegAddressFieldName, string[]>>;

export const ADDRESS_MAX = 500;
export const ADDRESS_LIMITS = {
  street: 120,
  houseNumber: 20,
  postalCode: 10,
  city: 120,
  state: 80,
  country: 80,
  additional: 160,
} as const satisfies Record<WegAddressFieldName, number>;

const EMPTY_ADDRESS: WegAddressFields = {
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  state: "",
  country: "Deutschland",
  additional: "",
};

const GERMAN_POSTAL_CODE_RE = /^\d{5}$/;

function trimInput(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function compactAddressLine(parts: string[]): string {
  return parts.filter(Boolean).join(" ").trim();
}

export function readWegAddressFormData(formData: FormData): WegAddressFields {
  return {
    street: trimInput(formData.get("addressStreet")),
    houseNumber: trimInput(formData.get("addressHouseNumber")),
    postalCode: trimInput(formData.get("addressPostalCode")),
    city: trimInput(formData.get("addressCity")),
    state: trimInput(formData.get("addressState")),
    country: trimInput(formData.get("addressCountry")) || "Deutschland",
    additional: trimInput(formData.get("addressAdditional")),
  };
}

export function isWegAddressEmpty(address: WegAddressFields): boolean {
  return (
    address.street === "" &&
    address.houseNumber === "" &&
    address.postalCode === "" &&
    address.city === "" &&
    address.state === "" &&
    address.additional === "" &&
    (address.country === "" || address.country === "Deutschland")
  );
}

export function formatWegAddress(address: WegAddressFields): string | null {
  if (isWegAddressEmpty(address)) {
    return null;
  }

  return [
    compactAddressLine([address.street, address.houseNumber]),
    compactAddressLine([address.postalCode, address.city]),
    address.state,
    address.country,
    address.additional,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateWegAddress(
  address: WegAddressFields,
): WegAddressErrors {
  const errors: WegAddressErrors = {};

  for (const [fieldName, maxLength] of Object.entries(ADDRESS_LIMITS) as [
    WegAddressFieldName,
    number,
  ][]) {
    if (address[fieldName].length > maxLength) {
      errors[fieldName] = [`Darf höchstens ${maxLength} Zeichen lang sein.`];
    }
  }

  if (isWegAddressEmpty(address)) {
    return errors;
  }

  if (address.street === "") {
    errors.street = ["Straße ist erforderlich, sobald eine Adresse erfasst wird."];
  }
  if (address.houseNumber === "") {
    errors.houseNumber = [
      "Hausnummer ist erforderlich, sobald eine Adresse erfasst wird.",
    ];
  }
  if (address.postalCode === "") {
    errors.postalCode = ["PLZ ist erforderlich, sobald eine Adresse erfasst wird."];
  } else if (
    address.country.toLocaleLowerCase("de-DE") === "deutschland" &&
    !GERMAN_POSTAL_CODE_RE.test(address.postalCode)
  ) {
    errors.postalCode = ["PLZ muss für Deutschland aus 5 Ziffern bestehen."];
  }
  if (address.city === "") {
    errors.city = ["Stadt ist erforderlich, sobald eine Adresse erfasst wird."];
  }

  const formattedAddress = formatWegAddress(address);
  if (formattedAddress && formattedAddress.length > ADDRESS_MAX) {
    errors.additional = [
      `Adresse darf insgesamt höchstens ${ADDRESS_MAX} Zeichen lang sein.`,
    ];
  }

  return errors;
}

export function parseWegAddress(value: string | null): WegAddressFields {
  if (!value) {
    return { ...EMPTY_ADDRESS };
  }

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const commaSeparatedMatch = value.match(
    /^(.+?)\s+([^\s,]+),\s*(\d{5})\s+(.+)$/,
  );

  if (commaSeparatedMatch) {
    return {
      ...EMPTY_ADDRESS,
      street: commaSeparatedMatch[1] ?? "",
      houseNumber: commaSeparatedMatch[2] ?? "",
      postalCode: commaSeparatedMatch[3] ?? "",
      city: commaSeparatedMatch[4] ?? "",
    };
  }

  const [streetLine = "", cityLine = "", state = "", country = "", additional = ""] =
    lines;
  const streetMatch = streetLine.match(/^(.+?)\s+([^\s]+)$/);
  const cityMatch = cityLine.match(/^(\d{5})\s+(.+)$/);

  return {
    street: streetMatch?.[1] ?? streetLine,
    houseNumber: streetMatch?.[2] ?? "",
    postalCode: cityMatch?.[1] ?? "",
    city: cityMatch?.[2] ?? cityLine,
    state,
    country: country || "Deutschland",
    additional,
  };
}
