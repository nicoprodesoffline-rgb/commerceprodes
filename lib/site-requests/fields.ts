/**
 * Cercle 5, lignes 5.8, 5.10, 5.12 à 5.14 : les champs d'une demande saisis sur le site, normalisés (NFC, bords nettoyés) puis contrôlés avec les règles NOMMÉES du contrat
 * `site_events.v2` (§3.1, §3.3) : le site refuse avant d'enregistrer ce que la Factory refuserait à la réception. Module PUR, aucune lecture de base.
 */

export type Rule =
  | "contact_required" | "contact_email" | "message_length" | "message_required" | "privacy_notice_required"
  | "address_required" | "siret_format" | "payment_method" | "terms_required" | "field_length" | "contact_phone" | "delivery_option";

export type Checked<T> = { ok: true; value: T } | { ok: false; rules: Rule[] };

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const EMAIL = /^[^@\s]+@[^@\s]*\.[^@\s]+$/;
const SIRET = /^\d{14}$/;
const PHONE = /^\+?[0-9][0-9 .-]{5,19}$/;   // même forme que le C0 (c0/ts/src/formats.ts) : le corps C0 d'un devis ou d'une commande porte ce téléphone

/** Le texte tel que le site le garde : NFC, bords nettoyés ; `undefined` ou non-texte → chaîne vide. */
export const clean = (value: unknown, multiline = false): string => {
  if (typeof value !== "string") return "";
  const nfc = value.normalize("NFC").replace(/\r\n?/g, "\n");
  return (multiline ? nfc : nfc.replace(/[\t\n]+/g, " ")).trim();
};
const length = (text: string): number => [...text].length;
const sound = (text: string, multiline = false): boolean => !CONTROL.test(multiline ? text.replace(/\n/g, "") : text);

export const PAYMENT_METHODS = ["cheque", "virement", "mandat_administratif"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Contact = { organisation: string | null; name: string; email: string; phone: string | null };
export type Address = { name: string; line1: string; line2: string | null; postal_code: string; city: string; country: "FR" };
export type CustomerRefs = { siret: string | null; order_number: string | null; service_code: string | null };

const bounded = (text: string, min: number, max: number, multiline = false): boolean => length(text) >= min && length(text) <= max && sound(text, multiline);

export function checkContact(raw: Record<string, unknown> | null | undefined): Checked<Contact> {
  const r = raw ?? {};
  const organisation = clean(r["organisation"]);
  const name = clean(r["name"]);
  const email = clean(r["email"]);
  const phone = clean(r["phone"]);
  const rules: Rule[] = [];
  if (!bounded(name, 1, 120)) rules.push("contact_required");
  if (organisation !== "" && !bounded(organisation, 1, 200)) rules.push("field_length");
  if (phone !== "" && !(bounded(phone, 1, 40) && PHONE.test(phone))) rules.push("contact_phone");
  if (!(bounded(email, 3, 254) && EMAIL.test(email))) rules.push("contact_email");
  return rules.length > 0 ? { ok: false, rules } : { ok: true, value: { organisation: organisation || null, name, email, phone: phone || null } };
}

/** Le message : obligatoire pour une demande libre, facultatif pour un devis ; `max` est la borne du type de demande. */
export function checkMessage(raw: unknown, required: boolean, max: number): Checked<string | null> {
  const message = clean(raw, true);
  if (message === "") return required ? { ok: false, rules: ["message_required"] } : { ok: true, value: null };
  return bounded(message, 1, max, true) ? { ok: true, value: message } : { ok: false, rules: ["message_length"] };
}

export function checkAddress(raw: Record<string, unknown> | null | undefined): Checked<Address> {
  const r = raw ?? {};
  const name = clean(r["name"]), line1 = clean(r["line1"]), line2 = clean(r["line2"]), postal = clean(r["postal_code"]), city = clean(r["city"]);
  if (!(bounded(name, 1, 120) && bounded(line1, 1, 200) && bounded(postal, 1, 10) && bounded(city, 1, 100) && (line2 === "" || bounded(line2, 1, 200)))) return { ok: false, rules: ["address_required"] };
  return { ok: true, value: { name, line1, line2: line2 || null, postal_code: postal, city, country: "FR" } };
}

export function checkCustomerRefs(raw: Record<string, unknown> | null | undefined): Checked<CustomerRefs> {
  const r = raw ?? {};
  const siret = clean(r["siret"]).replace(/[ .]/g, "");
  const order = clean(r["order_number"]);
  const service = clean(r["service_code"]);
  const rules: Rule[] = [];
  if (siret !== "" && !SIRET.test(siret)) rules.push("siret_format");
  if ((order !== "" && !bounded(order, 1, 60)) || (service !== "" && !bounded(service, 1, 60))) rules.push("field_length");
  return rules.length > 0 ? { ok: false, rules } : { ok: true, value: { siret: siret || null, order_number: order || null, service_code: service || null } };
}

export function checkPaymentMethod(raw: unknown): Checked<PaymentMethod> {
  return typeof raw === "string" && (PAYMENT_METHODS as readonly string[]).includes(raw) ? { ok: true, value: raw as PaymentMethod } : { ok: false, rules: ["payment_method"] };
}

/** La case des conditions de vente : cochée (`true`) et la version vue par le client connue du site. */
export function checkTerms(raw: unknown, currentVersion: string): Checked<{ cgv_version: string; accepted: true }> {
  const r = (raw ?? {}) as Record<string, unknown>;
  return r["accepted"] === true && clean(r["cgv_version"]) === currentVersion && currentVersion !== "" ? { ok: true, value: { cgv_version: currentVersion, accepted: true } } : { ok: false, rules: ["terms_required"] };
}

/** La version de la mention d'information affichée sous le formulaire ; absente ou autre que la version courante → refus. */
export function checkPrivacyNotice(raw: unknown, currentVersion: string): Checked<string> {
  return clean(raw) === currentVersion && currentVersion !== "" && bounded(currentVersion, 1, 40) ? { ok: true, value: currentVersion } : { ok: false, rules: ["privacy_notice_required"] };
}
