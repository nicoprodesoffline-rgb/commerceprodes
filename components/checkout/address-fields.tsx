"use client";

/**
 * Cercle 5, 5.12 : une adresse (livraison ou facturation) : nom ou service destinataire, adresse, complément, code postal, ville. Pays : France (le contrat ne connaît que « FR »).
 * Aide à la saisie seulement : le serveur revalide tout avec les mêmes règles nommées (`address_required`).
 */
export type AddressDraft = { name: string; line1: string; line2: string; postal_code: string; city: string };
export const EMPTY_ADDRESS: AddressDraft = { name: "", line1: "", line2: "", postal_code: "", city: "" };

const FIELDS: [keyof AddressDraft, string, number, string, boolean][] = [
  ["name", "Nom ou service destinataire", 120, "name", true],
  ["line1", "Adresse", 200, "address-line1", true],
  ["line2", "Complément d'adresse (facultatif)", 200, "address-line2", false],
  ["postal_code", "Code postal", 10, "postal-code", true],
  ["city", "Ville", 100, "address-level2", true],
];

export function AddressFields({ prefix, legend, value, onChange, error, showError }: { prefix: string; legend: string; value: AddressDraft; onChange: (a: AddressDraft) => void; error: string | undefined; showError: boolean }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2" data-testid={`${prefix}-address`}>
      <legend className="mb-2 text-lg font-semibold">{legend}</legend>
      {FIELDS.map(([f, label, max, auto, required]) => (
        <div key={f} className={f === "line1" || f === "line2" ? "sm:col-span-2" : undefined}>
          <label htmlFor={`f-${prefix}-${f}`} className="block text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</label>
          <input
            id={`f-${prefix}-${f}`}
            name={`${prefix}_${f}`}
            type="text"
            autoComplete={`${prefix === "billing" ? "billing " : "shipping "}${auto}`}
            maxLength={max}
            required={required}
            value={value[f]}
            aria-invalid={showError && error ? true : undefined}
            onChange={(e) => onChange({ ...value, [f]: e.target.value })}
            className={`mt-1 block h-[44px] w-full rounded-[9px] border bg-white px-3 ${showError && error ? "border-signal" : "border-line-strong"}`}
          />
        </div>
      ))}
      {showError && error && <p id={`f-${prefix}-address-err`} className="text-sm text-signal sm:col-span-2">{error}</p>}
      <p className="text-xs text-ink-3 sm:col-span-2">Livraison en France.</p>
    </fieldset>
  );
}
