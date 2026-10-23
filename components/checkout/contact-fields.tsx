"use client";

/**
 * Coordonnées C0 §10.2 (organisation, contact, e-mail, téléphone facultatif) + message (devis). Contrôles côté
 * client = aide à la saisie SEULEMENT, avec les expressions du C0 vendu (`EMAIL`, `PHONE`, longueurs) : le serveur
 * revalide tout et reste l'autorité (refus `INVALID_DATA`). Erreurs : résumé + message sous le champ (DA §10).
 */
import { EMAIL, PHONE } from "@/c0/ts/src/formats";

export type Contact = { organisation_name: string; contact_name: string; email: string; phone: string };
export const EMPTY_CONTACT: Contact = { organisation_name: "", contact_name: "", email: "", phone: "" };
export type FieldErrors = Partial<Record<keyof Contact | "message", string>>;

const BLANK = /^[\t\n\x0b\x0c\r ]*$/;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const len = (s: string) => [...s].length;

export function validateContact(c: Contact, message: string | null): FieldErrors {
  const e: FieldErrors = {};
  const text = (v: string, max: number, label: string, multiline = false): string | undefined => {
    if (BLANK.test(v)) return `${label} : champ obligatoire.`;
    if (len(v) > max) return `${label} : ${max} caractères au maximum (actuellement ${len(v)}).`;
    if (CONTROL.test(v) || (!multiline && /[\t\n\r]/.test(v))) return `${label} : caractères non admis.`;
    return undefined;
  };
  e.organisation_name = text(c.organisation_name, 200, "Organisation");
  e.contact_name = text(c.contact_name, 200, "Nom du contact");
  if (!EMAIL.test(c.email) || c.email.length > 254) e.email = "E-mail : adresse invalide (exemple : achats@mairie-exemple.fr).";
  if (c.phone.trim() !== "" && !PHONE.test(c.phone)) e.phone = "Téléphone : 6 à 20 chiffres, espaces, points ou tirets (exemple : 04 00 00 00 00).";
  if (message !== null && message.trim() !== "") e.message = len(message) > 2000 ? `Message : 2 000 caractères au maximum (actuellement ${len(message)}).` : CONTROL.test(message) ? "Message : caractères non admis." : undefined;
  for (const k of Object.keys(e) as (keyof FieldErrors)[]) if (e[k] === undefined) delete e[k];
  return e;
}

/** Corps `contact` C0 : téléphone vide → `null`. */
export function contactBody(c: Contact) {
  return { organisation_name: c.organisation_name, contact_name: c.contact_name, email: c.email.trim(), phone: c.phone.trim() === "" ? null : c.phone.trim() };
}

const FIELDS: [keyof Contact, string, string, number, string, string][] = [
  ["organisation_name", "Organisation", "text", 200, "organization", "Mairie, école, association…"],
  ["contact_name", "Nom du contact", "text", 200, "name", ""],
  ["email", "E-mail", "email", 254, "email", ""],
  ["phone", "Téléphone (facultatif)", "tel", 20, "tel", ""],
];

export function ContactFields({ value, onChange, errors, showErrors }: { value: Contact; onChange: (c: Contact) => void; errors: FieldErrors; showErrors: boolean }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-lg font-semibold">Vos coordonnées</legend>
      {FIELDS.map(([f, label, type, max, auto, hint]) => {
        const err = showErrors ? errors[f] : undefined;
        return (
          <div key={f}>
            <label htmlFor={`f-${f}`} className="block text-sm font-medium">
              {label}
              {f !== "phone" && <span aria-hidden="true"> *</span>}
            </label>
            {hint && <p id={`f-${f}-hint`} className="text-xs text-ink-3">{hint}</p>}
            <input
              id={`f-${f}`}
              name={f}
              type={type}
              autoComplete={auto}
              maxLength={max}
              required={f !== "phone"}
              value={value[f]}
              aria-invalid={err ? true : undefined}
              aria-describedby={[hint ? `f-${f}-hint` : "", err ? `f-${f}-err` : ""].filter(Boolean).join(" ") || undefined}
              onChange={(e) => onChange({ ...value, [f]: e.target.value })}
              className={`mt-1 block h-[42px] w-full rounded-[9px] border bg-white px-3 ${err ? "border-signal" : "border-line-strong"}`}
            />
            {err && <p id={`f-${f}-err`} className="mt-1 text-sm text-signal">{err}</p>}
          </div>
        );
      })}
      <p className="text-xs text-ink-3 sm:col-span-2"><span aria-hidden="true">* </span>Champ obligatoire.</p>
    </fieldset>
  );
}

export function ErrorSummary({ errors, id }: { errors: FieldErrors; id: string }) {
  const list = Object.entries(errors) as [string, string][];
  if (list.length === 0) return null;
  return (
    <div id={id} tabIndex={-1} role="alert" className="rounded-[14px] border-2 border-signal bg-white p-4" data-testid="error-summary">
      <p className="font-semibold">Corrigez {list.length === 1 ? "le champ suivant" : `les ${list.length} champs suivants`} :</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {list.map(([k, msg]) => (
          <li key={k}><a href={`#f-${k}`} className="underline">{msg}</a></li>
        ))}
      </ul>
    </div>
  );
}
