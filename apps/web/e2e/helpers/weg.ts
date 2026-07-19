import { expect, type Page } from "@playwright/test";

import { getSupabaseRequestContext } from "./fixtures";

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
  const resolvedAddress = { ...DEFAULT_ADDRESS, ...address };
  const adresse = [
    [resolvedAddress.street, resolvedAddress.houseNumber].filter(Boolean).join(" "),
    [resolvedAddress.postalCode, resolvedAddress.city].filter(Boolean).join(" "),
    resolvedAddress.state,
    resolvedAddress.country,
    resolvedAddress.additional,
  ]
    .filter(Boolean)
    .join("\n");
  const { token, url, key } = await getSupabaseRequestContext(page);

  const response = await page.request.post(`${url}/rest/v1/weg?select=id`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: { name, adresse },
  });
  expect(response.ok()).toBe(true);
  const [created] = (await response.json()) as Array<{ id: string }>;
  expect(created?.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

  await page.goto(`/wegs/${created.id}`);
  await expect(page).toHaveURL(new RegExp(`/wegs/${created.id}$`));
  return created.id;
}
