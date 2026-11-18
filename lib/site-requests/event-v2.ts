/**
 * Cercle 5, ligne 5.1 : le constructeur de l'événement `site_events.v2` (docs/contracts/site_events_v2.md §2, §3). UNE émission par demande, dans la transaction de la demande ;
 * le site n'émet plus d'événement v1 pour ces demandes (attendu D01). Chaque fonction écrit TOUTES les clés du payload du type, dans cet ordre, et rien d'autre :
 * le contrat refuse une clé inconnue (`unknown_key`). Les montants sont des chaînes « 120.00 », jamais des nombres.
 */
import { canonicalBytes, digest, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import type { Amounts, Delivery, Lot, PricedLine } from "./amounts";
import type { Address, Contact, CustomerRefs, PaymentMethod } from "./fields";
import { NUMBER_FORMAT } from "./numbers";

export const CONTRACT_VERSION = "site_events.v2";
/** Domaine de l'empreinte du payload : celui du v2, jamais celui du v1 (cas `digest_v1_domain`). */
export const DOMAIN_PAYLOAD = "prodes.site_events.v2.payload";

export type EventTypeV2 = "quote.requested" | "order.received" | "message.received";

export type EventLine = PricedLine & {
  public_item_key: string;
  variant_axes: Record<string, string>;
  item_label: string;
  quantity: number;
  rate_id: string | null;
  lot: Lot | null;
};

type Request = { number: string; contact: Contact; message: string | null; privacy_notice: string };
type Priced = { lines: readonly EventLine[]; delivery: Delivery; amounts: Amounts };

const line = (l: EventLine): JsonObject => ({
  public_item_key: l.public_item_key,
  variant_axes: l.variant_axes,
  item_label: l.item_label,
  quantity: l.quantity,
  rate_id: l.rate_id,
  unit_amount_ht: l.unit_amount_ht,
  line_total_ht: l.line_total_ht,
  line_tva: l.line_tva,
  lot: l.lot === null ? null : { bought: l.lot.bought, free: l.lot.free },
});

const common = (r: Request): JsonObject => ({ number: r.number, contact: { ...r.contact }, message: r.message, privacy_notice: r.privacy_notice });
const priced = (p: Priced): JsonObject => ({ lines: p.lines.map(line), delivery: { ...p.delivery }, amounts: { ...p.amounts } });

export function quotePayload(r: Request & Priced): JsonObject {
  return { ...common(r), ...priced(r) };
}

export type OrderExtras = {
  addresses: { delivery: Address; billing: Address | null };
  customer_refs: CustomerRefs;
  payment: { method: PaymentMethod; instructions: string };
  terms: { cgv_version: string; accepted: true };
};

export function orderPayload(r: Request & Priced & OrderExtras): JsonObject {
  return {
    ...common(r),
    ...priced(r),
    status: "RECEIVED",
    addresses: { delivery: { ...r.addresses.delivery }, billing: r.addresses.billing === null ? null : { ...r.addresses.billing } },
    customer_refs: { ...r.customer_refs },
    payment: { method: r.payment.method, instructions: r.payment.instructions },
    terms: { cgv_version: r.terms.cgv_version, accepted: true },
  };
}

export type ProductAbout = { public_item_key: string | null; label: string; url: string };

export function messagePayload(r: { number: string; contact: Contact; message: string; privacy_notice: string; product: ProductAbout | null }): JsonObject {
  return {
    number: r.number,
    contact: { ...r.contact },
    message: r.message,
    privacy_notice: r.privacy_notice,
    product: r.product === null ? null : { public_item_key: r.product.public_item_key, label: r.product.label, url: r.product.url },
  };
}

export type BuiltEvent = { event: JsonObject; bytes: Uint8Array };

/** L'enveloppe du v2 (mêmes dix clés que le v1) ; `idempotency_key = "<type>:<objet>"`. */
export function buildEventV2(input: { type: EventTypeV2; ref: string; number: string; eventId: string; createdAtUtc: string; catalogueSequence: number | null; payload: JsonObject }): BuiltEvent {
  if (!NUMBER_FORMAT.test(input.number) || input.payload["number"] !== input.number) throw Object.assign(new Error("numéro de demande hors format"), { code: "EVENT_BUILD_FAILED" });
  const event: JsonObject = {
    contract_version: CONTRACT_VERSION,
    event_id: input.eventId,
    event_type: input.type,
    event_version: 1,
    created_at_utc: input.createdAtUtc,
    object_ref: input.ref,
    idempotency_key: `${input.type}:${input.ref}`,
    catalogue_sequence: input.catalogueSequence as Json,
    payload: input.payload,
    payload_digest: digest(DOMAIN_PAYLOAD, input.payload),
  };
  return { event, bytes: canonicalBytes(event) };
}
