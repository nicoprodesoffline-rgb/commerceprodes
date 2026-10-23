/**
 * Validation `site_business.v1` côté serveur SITE — module réutilisable (W1/A2).
 *
 * Fonctions PURES (aucune I/O, aucune persistance) : elles appellent les fonctions C0 vendues
 * (`validateQuoteRequest`, `validateOrderSubmit`, `selectPrice`) sur les OCTETS BRUTS de la
 * requête, la génération servie, un registre d'idempotence et l'instant serveur.
 *
 * Aujourd'hui : registre d'idempotence VIDE (`EMPTY_REGISTER`) et `persistence: "NONE_UNTIL_BC4"`
 * — un verdict accepté n'est JAMAIS un `RECEIVED` durable. BC4 branchera la persistance
 * (registre réel, objet + lignes + outbox en une transaction) derrière ces mêmes fonctions.
 *
 * Interdit ici : calcul PBQ, remise, TVA, port, arrondi ; prix du navigateur comme autorité.
 * Le seul calcul est `unit_amount × quantity` en centimes BigInt (formats C0) pour l'aperçu.
 */
import { selectPrice, validateOrderSubmit, validateQuoteRequest, MAX_BYTES } from "@/c0/ts/src/business";
import { centsToMoney, moneyCents } from "@/c0/ts/src/formats";
import { MalformedPayload, hasDuplicateLines, isObject, parseBytes, type Json, type JsonObject } from "@/c0/ts/src/jsonc";

export const PERSISTENCE = "NONE_UNTIL_BC4" as const;
export const BUSINESS_MAX_BYTES = MAX_BYTES;

/** Registre d'idempotence vide : tant que BC4 n'existe pas, aucun reçu n'est connu. */
export const EMPTY_REGISTER: Json = [];

export type C0Generation = { snapshot: Json; status: "ACTIVE" | "UNSAFE" };

/** HTTP indicatif de C0 §13 (business). Plusieurs codes de statuts différents → 409. */
const HTTP_BY_CODE: Record<string, number> = {
  PAYLOAD_MALFORMED: 400,
  SCHEMA_UNSUPPORTED: 400,
  INVALID_DATA: 422,
  DUPLICATE_LINE: 422,
  INVALID_VARIANT: 422,
  DUPLICATE_KEY_DIFFERENT_PAYLOAD: 409,
  CATALOG_UNSAFE: 503,
  CART_STALE: 409,
  PRICE_CHANGED: 409,
  CATALOG_CHANGED: 409,
  PRICE_WINDOW_UNAVAILABLE: 409,
  PRICE_WINDOW_OVERLAP: 409,
  ITEM_SUPERSEDED: 409,
  ITEM_RETIRED: 410,
  ITEM_NOT_PUBLISHED: 404,
};

export function httpStatusFor(accepted: boolean, codes: string[]): number {
  if (accepted) return 200;
  const statuses = new Set(codes.map((c) => HTTP_BY_CODE[c] ?? 422));
  return statuses.size === 1 ? [...statuses][0]! : 409;
}

export type BusinessResponse = {
  status: number;
  body: {
    contract_version: "site_business.v1";
    kind: "quote_request" | "order";
    persistence: typeof PERSISTENCE;
    durable: false;
    catalogue_sequence: number;
    instant_utc: string;
    verdict: JsonObject;
  };
};

type Input = { bytes: Uint8Array; generation: C0Generation; catalogueSequence: number; register?: Json; nowUtc: string };

function respond(kind: "quote_request" | "order", input: Input, verdict: JsonObject): BusinessResponse {
  const accepted = verdict["accepted"] === true;
  return {
    status: httpStatusFor(accepted, verdict["error_codes"] as string[]),
    body: {
      contract_version: "site_business.v1",
      kind,
      persistence: PERSISTENCE,
      durable: false,
      catalogue_sequence: input.catalogueSequence,
      instant_utc: input.nowUtc,
      verdict,
    },
  };
}

/** `POST /api/site/quote` : verdict C0 `validateQuoteRequest`, sans persistance. */
export function validateQuote(input: Input): BusinessResponse {
  const v = validateQuoteRequest(input.bytes, input.generation, input.register ?? EMPTY_REGISTER, input.nowUtc);
  return respond("quote_request", input, v as unknown as JsonObject);
}

/** `POST /api/site/order` : verdict C0 `validateOrderSubmit`, sans persistance. */
export function validateOrder(input: Input): BusinessResponse {
  const v = validateOrderSubmit(input.bytes, input.generation, input.register ?? EMPTY_REGISTER, input.nowUtc);
  return respond("order", input, v as unknown as JsonObject);
}

// ── Aperçu de panier ─────────────────────────────────────────────────────────

export type PreviewLine = {
  public_item_key: Json;
  variant_axes: Json;
  quantity: Json;
  accepted: boolean;
  error_codes: string[];
  superseded_by: Record<string, string>;
  selection: JsonObject | null;
  line_total: string | null;
};

export type PreviewResponse = {
  status: number;
  body: {
    persistence: "NONE";
    catalogue_sequence: number;
    instant_utc: string;
    accepted: boolean;
    outcome: string;
    error_codes: string[];
    lines: PreviewLine[];
    currency: string | null;
    total_amount: string | null;
  };
};

const PREVIEW_KEYS = ["lines"];
const PREVIEW_LINE_KEYS = ["public_item_key", "variant_axes", "quantity"];

function exact(value: Json | undefined, keys: string[]): value is JsonObject {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

/**
 * `POST /api/site/cart/preview` : `{lines:[{public_item_key, variant_axes, quantity}]}`.
 * Ordre : parse (`PAYLOAD_MALFORMED`) → forme (`INVALID_DATA`) → doublons (`DUPLICATE_LINE`, C0 R-01 :
 * une ligne par `(clé, axes)`, le palier se choisit sur la quantité de la ligne) → `selectPrice` par ligne
 * à l'instant serveur. Le résultat n'est qu'un affichage : devis et commande revalident tout.
 */
export function previewCart(input: Omit<Input, "register">): PreviewResponse {
  const base = { persistence: "NONE" as const, catalogue_sequence: input.catalogueSequence, instant_utc: input.nowUtc };
  const refuse = (code: string): PreviewResponse => ({
    status: httpStatusFor(false, [code]),
    body: { ...base, accepted: false, outcome: "REJECTED", error_codes: [code], lines: [], currency: null, total_amount: null },
  });
  let request: Json;
  try {
    request = parseBytes(input.bytes, BUSINESS_MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return refuse("PAYLOAD_MALFORMED");
    throw error;
  }
  if (!exact(request, PREVIEW_KEYS)) return refuse("INVALID_DATA");
  const raw = request["lines"];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 200) return refuse("INVALID_DATA");
  for (const line of raw) {
    if (!exact(line, PREVIEW_LINE_KEYS) || !isObject(line["variant_axes"])) return refuse("INVALID_DATA");
    if (!Object.values(line["variant_axes"]).every((v) => typeof v === "string")) return refuse("INVALID_DATA");
  }
  const lines = raw as JsonObject[];
  if (hasDuplicateLines(lines)) return refuse("DUPLICATE_LINE");

  const out: PreviewLine[] = [];
  const codes = new Set<string>();
  let total = 0n;
  for (const line of lines) {
    const r = selectPrice(input.generation, line["public_item_key"]!, line["variant_axes"]!, line["quantity"]!, input.nowUtc);
    for (const c of r.error_codes) codes.add(c);
    let lineTotal: string | null = null;
    if (r.accepted && r.selection) {
      const cents = (moneyCents(r.selection["unit_amount"]) as bigint) * BigInt(r.selection["quantity"] as number);
      total += cents;
      lineTotal = centsToMoney(cents);
    }
    out.push({
      public_item_key: line["public_item_key"]!,
      variant_axes: line["variant_axes"]!,
      quantity: line["quantity"]!,
      accepted: r.accepted,
      error_codes: r.error_codes,
      superseded_by: r.superseded_by,
      selection: r.selection,
      line_total: lineTotal,
    });
  }
  const all = out.every((l) => l.accepted);
  return {
    status: 200,
    body: {
      ...base,
      accepted: all,
      outcome: all ? "SELECTED" : "PARTIAL",
      error_codes: [...codes].sort(),
      lines: out,
      currency: all ? "EUR" : null,
      total_amount: all ? centsToMoney(total) : null,
    },
  };
}
