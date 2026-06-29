import { expect, type Page } from "@playwright/test";

interface WegAddressInput {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  additional?: string;
}

const DEFAULT_ADDRESS: Required<WegAddressInput> = {
  street: "Teststraße",
  houseNumber: "1",
  postalCode: "12345",
  city: "Testheim",
  state: "",
  country: "Deutschland",
  additional: "",
};

export async function fillWegAddress(
  page: Page,
  input: WegAddressInput = {},
): Promise<Required<WegAddressInput>> {
  const address = { ...DEFAULT_ADDRESS, ...input };

  await page.getByLabel("Straße", { exact: true }).fill(address.street);
  await page.getByLabel("Hausnummer", { exact: true }).fill(address.houseNumber);
  await page.getByLabel("PLZ", { exact: true }).fill(address.postalCode);
  await page.getByLabel("Stadt", { exact: true }).fill(address.city);
  await page.getByLabel("Bundesland", { exact: true }).fill(address.state);
  await page.getByLabel("Land", { exact: true }).fill(address.country);
  await page
    .getByLabel("Zusatzbezeichnungen", { exact: true })
    .fill(address.additional);

  return address;
}

export async function createWegFixture(
  page: Page,
  name: string,
  address?: WegAddressInput,
): Promise<string> {
  await page.goto("/wegs/new");
  await page.getByLabel(/Name der WEG/).fill(name);
  await fillWegAddress(page, address);
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const match = page.url().match(/\/wegs\/([0-9a-f-]{36})/);
  if (!match) {
    throw new Error("Could not extract WEG ID from URL");
  }
  return match[1];
}
