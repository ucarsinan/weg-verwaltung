import type { InputHTMLAttributes } from "react";
import type { WegAddressErrors, WegAddressFields } from "./address";

interface WegAddressFieldsProps {
  defaultValue?: WegAddressFields;
  errors?: WegAddressErrors;
}

const DEFAULT_COUNTRY = "Deutschland";

export function WegAddressFields({
  defaultValue,
  errors,
}: WegAddressFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Adresse</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <AddressInput
          id="addressStreet"
          name="addressStreet"
          label="Straße"
          defaultValue={defaultValue?.street}
          autoComplete="address-line1"
          error={errors?.street}
        />
        <AddressInput
          id="addressHouseNumber"
          name="addressHouseNumber"
          label="Hausnummer"
          defaultValue={defaultValue?.houseNumber}
          autoComplete="address-line2"
          error={errors?.houseNumber}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <AddressInput
          id="addressPostalCode"
          name="addressPostalCode"
          label="PLZ"
          defaultValue={defaultValue?.postalCode}
          inputMode="numeric"
          autoComplete="postal-code"
          error={errors?.postalCode}
        />
        <AddressInput
          id="addressCity"
          name="addressCity"
          label="Stadt"
          defaultValue={defaultValue?.city}
          autoComplete="address-level2"
          error={errors?.city}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AddressInput
          id="addressState"
          name="addressState"
          label="Bundesland"
          defaultValue={defaultValue?.state}
          autoComplete="address-level1"
          error={errors?.state}
        />
        <AddressInput
          id="addressCountry"
          name="addressCountry"
          label="Land"
          defaultValue={defaultValue?.country ?? DEFAULT_COUNTRY}
          autoComplete="country-name"
          error={errors?.country}
        />
      </div>
      <AddressInput
        id="addressAdditional"
        name="addressAdditional"
        label="Zusatzbezeichnungen"
        defaultValue={defaultValue?.additional}
        autoComplete="off"
        placeholder="z. B. Haus A, Eingang 2, Ortsteil"
        error={errors?.additional}
      />
    </fieldset>
  );
}

interface AddressInputProps {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  defaultValue?: string;
  error?: string[];
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}

function AddressInput({
  id,
  name,
  label,
  autoComplete,
  defaultValue,
  error,
  inputMode,
  placeholder,
}: AddressInputProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode={inputMode}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {error.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
