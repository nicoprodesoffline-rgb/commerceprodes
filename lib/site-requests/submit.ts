/**
 * Cercle 5 (5.1, 5.5 à 5.14, 5.9, 5.10) : une demande de devis, une commande ou une demande libre avec coordonnées, en UNE transaction PostgreSQL, qui émet UN événement `site_events.v2`
 * (le site n'émet plus d'événement v1 pour ces demandes : attendu D01).
 *
 * Corps reçu : `{ request?: <corps C0 du devis ou de la commande>, extras: {…} }`. Le corps C0 reste jugé tel quel par le C0 gelé (prix, lignes, génération, idempotence) ;
 * ce que le C0 ne connaît pas (adresses, SIRET, règlement, CGV, livraison, mention d'information, message libre) est dans `extras`, contrôlé ici avec les règles nommées du contrat.
 * Ordre : réglages de vente reçus (sinon `SHOP_NOT_READY`) → champ piège → extras → génération active → verdict C0 → idempotence → numéro (même transaction : un retour en arrière le rend)
 * → objet, lignes figées, événement v2 → COMMIT → réponse. Montants : calculés ici, jamais ceux du navigateur ; un TTC affiché différent est refusé (`PRICE_CHANGED`, attendu M05).
 */
import type { Pool, PoolClient } from "pg";
import { Generation, MAX_BYTES, selectPrice, validateOrderSubmit, validateQuoteRequest, type BusinessResult } from "../../c0/ts/src/business";
import { isHex64, isToken } from "../../c0/ts/src/formats";
import { canonicalBytes, digest, isObject, parseBytes, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { asV1 } from "../site-catalog/v1-view";
import { displayName } from "../site-catalog/display-name";
import { isShown } from "../site-catalog/variant-choice";
import { QUOTE_ONLY_CODE, isQuoteOnlyRate } from "../site-catalog/quote-only";
import { readActiveCommerce } from "../site-commerce/store";
import type { CommerceDocument } from "../site-commerce/document";
import { readActiveForUpdate } from "../site-db/generation";
import { PERSISTENCE, appendLog, checkout, errorReason, httpStatusFor, json, jsonWithRaw, newAccessToken, opaqueRef, sha256OfBytes, type TxResponse } from "../site-transactions/common";
import { DELIVERY_APPOINTMENT, DELIVERY_INCLUDED, priceDelivery, priceLine, totals, toCents, type DeliveryOption, type Lot } from "./amounts";
import { buildEventV2, messagePayload, orderPayload, quotePayload, type EventLine, type ProductAbout } from "./event-v2";
import { checkAddress, checkContact, checkCustomerRefs, checkMessage, checkPaymentMethod, checkPrivacyNotice, checkTerms, clean, type Address, type Contact, type Rule } from "./fields";
import { NUMBER_PREFIXES, formatNumber, yearOf, type RequestKind } from "./numbers";

export interface RequestDeps {
  pool: Pool;
  /** Instant serveur au format C0 (`YYYY-MM-DDTHH:MM:SSZ`). Jamais une valeur du client. */
  now: () => string;
  hooks?: { afterValidate?: (client: PoolClient) => Promise<void>; beforeCommit?: (client: PoolClient) => Promise<void> };
}

const LOCK_TIMEOUT = "5s";
const STATEMENT_TIMEOUT = "15s";
const DOMAIN_EXTRAS = "prodes.site.request.extras.v2";
const QUOTE_MESSAGE_MAX = 2000;   // le C0 gelé borne le message d'un devis à 2 000 ; le contrat v2 admet 5 000 pour la demande libre
const MESSAGE_MAX = 5000;
const OPERATION = { quote_request: "QUOTE", order: "ORDER", message: "MESSAGE" } as const;
const EVENT_TYPE = { quote_request: "quote.requested", order: "order.received", message: "message.received" } as const;

type Base = { contract_version: "site_business.v1"; kind: RequestKind; persistence: typeof PERSISTENCE; instant_utc: string };

const refuse = (base: Base, status: number, code: string, extra: Record<string, unknown> = {}): TxResponse =>
  json(status, { ...base, durable: false, accepted: false, outcome: "REJECTED", error_codes: [code], superseded_by: {}, verdict: null, ...extra });

const invalid = (base: Base, rules: Rule[]): TxResponse => refuse(base, 422, "REQUEST_INVALID", { detail: { rules: [...new Set(rules)] } });

/** Ce que le client a le droit d'envoyer en dehors du corps C0. Une clé inconnue est refusée (jamais ignorée). */
const EXTRAS_KEYS = {
  quote_request: ["commerce_sequence", "privacy_notice", "website", "delivery_option", "total_ttc"],
  order: ["commerce_sequence", "privacy_notice", "website", "delivery_option", "total_ttc", "addresses", "customer_refs", "payment_method", "terms"],
  message: ["idempotency_key", "commerce_sequence", "privacy_notice", "website", "contact", "message", "product"],
} as const;

const onlyKeys = (value: JsonObject, allowed: readonly string[]): boolean => Object.keys(value).every((k) => allowed.includes(k));

/** Le champ piège : rempli par un robot, jamais par une personne (il est invisible). */
export const honeypotFilled = (extras: JsonObject): boolean => typeof extras["website"] === "string" && extras["website"].trim() !== "";

/** Réponse d'apparence normale pour un robot : référence et numéro plausibles, RIEN d'enregistré, RIEN d'émis. */
export function decoy(base: Base, kind: RequestKind): TxResponse {
  const year = yearOf(base.instant_utc);
  return json(200, { ...base, durable: true, accepted: true, outcome: "RECEIVED", error_codes: [], receipt_ref: opaqueRef(kind === "order" ? "ORD" : kind === "message" ? "MSG" : "QR"), number: formatNumber(kind, year, 1), access_token: newAccessToken().token, lines: [] });
}

function extrasFingerprint(extras: JsonObject): string {
  const preimage: JsonObject = {};
  for (const key of Object.keys(extras)) if (key !== "website" && key !== "idempotency_key") preimage[key] = extras[key] as Json;
  return digest(DOMAIN_EXTRAS, preimage);
}

type Item = { familyName: string; axes: Record<string, string>; pack: Lot | null };
function catalogueIndex(snapshot: unknown): Map<string, Item> {
  const out = new Map<string, Item>();
  const families = isObject(snapshot as Json) && Array.isArray((snapshot as JsonObject)["families"]) ? ((snapshot as JsonObject)["families"] as JsonObject[]) : [];
  for (const family of families) {
    const items = Array.isArray(family["items"]) ? (family["items"] as JsonObject[]) : [];
    for (const item of items) {
      const pack = isObject(item["pack"] as Json) ? (item["pack"] as JsonObject) : null;
      out.set(item["public_item_key"] as string, {
        familyName: typeof family["name"] === "string" ? displayName(family["name"]) : "Article",
        axes: (item["variant_axes"] ?? {}) as Record<string, string>,
        pack: pack !== null && Number.isInteger(pack["paid_units"]) && Number.isInteger(pack["free_units"]) ? { bought: pack["paid_units"] as number, free: pack["free_units"] as number } : null,
      });
    }
  }
  return out;
}

/** Le nom de l'article tel que le client le voit : le produit, puis ses choix (« Banc d'essai — M, rouge »). */
const labelOf = (item: Item | undefined, axes: Record<string, string>): string => {
  const choices = Object.values(axes).filter(isShown);
  const text = `${item?.familyName ?? "Article"}${choices.length > 0 ? ` — ${choices.join(", ")}` : ""}`;
  return [...text].slice(0, 200).join("");
};

async function nextNumber(client: PoolClient, kind: RequestKind, nowUtc: string): Promise<string> {
  const year = yearOf(nowUtc);
  const { rows } = await client.query<{ last: number }>(
    `INSERT INTO site_number_counter (prefix, year, last) VALUES ($1, $2, 1)
     ON CONFLICT (prefix, year) DO UPDATE SET last = site_number_counter.last + 1 RETURNING last`,
    [NUMBER_PREFIXES[kind], year],
  );
  return formatNumber(kind, year, rows[0]!.last);
}

type Checked = { rules: Rule[] };
const failIf = (c: { ok: boolean }, into: Checked, rules?: Rule[]): void => { if (!c.ok) into.rules.push(...(rules ?? ((c as unknown as { rules: Rule[] }).rules))); };

/** Les extras d'un devis ou d'une commande, contrôlés ; `ok: false` porte les règles nommées en défaut. */
function readExtras(kind: "quote_request" | "order", extras: JsonObject, contactC0: JsonObject, doc: CommerceDocument):
  { ok: true; contact: Contact; option: DeliveryOption; order: null | { addresses: { delivery: Address; billing: Address | null }; refs: { siret: string | null; order_number: string | null; service_code: string | null }; method: "cheque" | "virement" | "mandat_administratif"; terms: { cgv_version: string; accepted: true } } }
  | { ok: false; rules: Rule[] } {
  const problems: Checked = { rules: [] };
  const contact = checkContact({ organisation: contactC0["organisation_name"], name: contactC0["contact_name"], email: contactC0["email"], phone: contactC0["phone"] });
  failIf(contact, problems);
  failIf(checkPrivacyNotice(extras["privacy_notice"], doc.privacy_notice.version), problems);
  const option = extras["delivery_option"] === undefined ? DELIVERY_INCLUDED : extras["delivery_option"];
  if (option !== DELIVERY_INCLUDED && option !== DELIVERY_APPOINTMENT) problems.rules.push("delivery_option");
  let order = null;
  if (kind === "order") {
    const delivery = checkAddress(extras["addresses"] !== undefined && isObject(extras["addresses"] as Json) ? ((extras["addresses"] as JsonObject)["delivery"] as JsonObject) : undefined);
    failIf(delivery, problems);
    const rawBilling = extras["addresses"] !== undefined && isObject(extras["addresses"] as Json) ? (extras["addresses"] as JsonObject)["billing"] : null;
    const billing = rawBilling === null || rawBilling === undefined ? null : checkAddress(rawBilling as JsonObject);
    if (billing !== null) failIf(billing, problems);
    const refs = checkCustomerRefs(extras["customer_refs"] as JsonObject | undefined);
    failIf(refs, problems);
    const method = checkPaymentMethod(extras["payment_method"]);
    failIf(method, problems);
    const terms = checkTerms(extras["terms"], doc.cgv_version);
    failIf(terms, problems);
    if (problems.rules.length === 0 && delivery.ok && refs.ok && method.ok && terms.ok && (billing === null || billing.ok) && contact.ok) {
      order = { addresses: { delivery: delivery.value, billing: billing === null ? null : (billing as { ok: true; value: Address }).value }, refs: refs.value, method: method.value, terms: terms.value };
    }
  }
  if (problems.rules.length > 0 || !contact.ok) return { ok: false, rules: problems.rules };
  return { ok: true, contact: contact.value, option: option as DeliveryOption, order };
}

function c0Validate(kind: "quote_request" | "order", bytes: Uint8Array, generation: Json, register: Json, nowUtc: string): BusinessResult {
  return kind === "order" ? validateOrderSubmit(bytes, generation, register, nowUtc) : validateQuoteRequest(bytes, generation, register, nowUtc);
}

interface RegisterRow { kind: string; idempotency_key: string; request_fingerprint: string; receipt_ref: string; receipt_bytes: Buffer }
const readRegister = async (client: PoolClient, kind: RequestKind, key: string | null): Promise<RegisterRow[]> =>
  key === null ? [] : (await client.query<RegisterRow>("SELECT kind, idempotency_key, request_fingerprint, receipt_ref, receipt_bytes FROM site_idempotency WHERE kind = $1 AND idempotency_key = $2", [kind, key])).rows;
const c0Register = (rows: RegisterRow[]): Json => rows.map((r) => ({ kind: r.kind, idempotency_key: r.idempotency_key, request_fingerprint: r.request_fingerprint, receipt_ref: r.receipt_ref }));

function received(base: Base, outcome: "RECEIVED" | "REPLAY_SAME_RECEIPT", receiptBytes: Uint8Array, token: string | null): TxResponse {
  const receipt = JSON.parse(Buffer.from(receiptBytes).toString("utf8")) as JsonObject;
  const envelope: Record<string, unknown> = {
    ...base, durable: true, accepted: true, outcome, error_codes: [], receipt_ref: receipt["receipt_ref"], number: receipt["number"], request_fingerprint: receipt["request_fingerprint"],
    lines: receipt["lines"] ?? [], amounts: receipt["amounts"] ?? null, delivery: receipt["delivery"] ?? null, payment: receipt["payment"] ?? null,
  };
  if (token !== null) envelope["access_token"] = token;
  return jsonWithRaw(200, envelope, "receipt", receiptBytes, { "x-site-receipt-sha256": sha256OfBytes(receiptBytes) });
}

const dbFailed = (base: Base, reason: string): TxResponse => json(503, { ...base, durable: false, accepted: false, outcome: "REJECTED", error_codes: ["DB_WRITE_FAILED"], detail: { reason }, verdict: null });

/** `POST /api/site/quote`, `/api/site/order` et `/api/site/message` : `bytes` = octets bruts du corps HTTP. */
export async function submitRequest(deps: RequestDeps, kind: RequestKind, bytes: Uint8Array): Promise<TxResponse> {
  const nowUtc = deps.now();
  const operation = OPERATION[kind];
  const base: Base = { contract_version: "site_business.v1", kind, persistence: PERSISTENCE, instant_utc: nowUtc };

  // (0) Lecture du corps extérieur : deux clés au plus, `extras` toujours, `request` pour un devis ou une commande.
  let outer: JsonObject;
  try {
    const parsed = parseBytes(bytes, MAX_BYTES);
    if (!isObject(parsed)) throw new Error("not an object");
    outer = parsed;
  } catch {
    return refuse(base, 400, "PAYLOAD_MALFORMED");
  }
  const extras = outer["extras"];
  const wantsRequest = kind !== "message";
  if (!isObject(extras as Json) || !onlyKeys(outer, wantsRequest ? ["request", "extras"] : ["extras"]) || (wantsRequest && !isObject(outer["request"] as Json))) return refuse(base, 400, "SCHEMA_UNSUPPORTED");
  const ex = extras as JsonObject;
  if (!onlyKeys(ex, EXTRAS_KEYS[kind])) return invalid(base, ["field_length"]);
  if (honeypotFilled(ex)) {
    await appendLog(deps.pool, { operation, outcome: "REJECTED", error_codes: ["HONEYPOT"] });
    return decoy(base, kind);
  }

  let client: PoolClient;
  let release: (failed: boolean) => void;
  try {
    ({ client, release } = await checkout(deps.pool));
  } catch (error) {
    const reason = errorReason(error);
    await appendLog(deps.pool, { operation, outcome: "REJECTED", error_codes: ["DB_WRITE_FAILED"], detail: { reason } });
    return dbFailed(base, reason);
  }

  let broken: unknown = undefined;
  let outcome: { response: TxResponse; log: Parameters<typeof appendLog>[1] } | undefined;
  const finish = async (response: TxResponse, log: Parameters<typeof appendLog>[1], rollback = true): Promise<TxResponse> => {
    if (rollback) await client.query("ROLLBACK");
    outcome = { response, log };
    return response;
  };
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);

    // (1) Réglages de vente reçus ? Sans eux le site ne devine ni taux ni texte (docs/site_commerce_v1.md §3).
    const commerce = await readActiveCommerce(client);
    if (commerce === null) return await finish(refuse(base, 503, "SHOP_NOT_READY", { message: "La boutique n'est pas prête." }), { operation, outcome: "REJECTED", error_codes: ["SHOP_NOT_READY"] });
    const doc = commerce.document;
    // M04 : un panier ouvert sous d'autres réglages demande une nouvelle confirmation avant l'envoi.
    if (ex["commerce_sequence"] !== doc.commerce_sequence) return await finish(refuse(base, 409, "COMMERCE_CHANGED", { commerce_sequence: doc.commerce_sequence }), { operation, outcome: "REJECTED", error_codes: ["COMMERCE_CHANGED"] });

    if (kind === "message") return await submitMessage(deps, client, base, ex, doc, nowUtc, finish);

    // (2) Génération ACTIVE durable, verrou partagé jusqu'au COMMIT/ROLLBACK.
    const active = await readActiveForUpdate(client);
    if (active === null) return await finish(json(503, { ...base, durable: false, accepted: false, site_status: "CATALOG_UNAVAILABLE", reason: "NO_ACTIVE_GENERATION", error_codes: [], verdict: null }), { operation, outcome: "CATALOG_UNAVAILABLE" });
    const generation: Json = { snapshot: asV1(active.snapshot as unknown as Json), status: active.status };
    try { new Generation(generation); } catch {
      return await finish(json(503, { ...base, durable: false, accepted: false, site_status: "CATALOG_UNAVAILABLE", reason: "ACTIVE_GENERATION_UNREADABLE", error_codes: [], verdict: null }), { operation, outcome: "CATALOG_UNAVAILABLE" });
    }

    // (3) Extras contrôlés AVANT toute écriture (règles nommées du contrat).
    const request = outer["request"] as JsonObject;
    const c0Bytes = canonicalBytes(request);
    const key = typeof request["idempotency_key"] === "string" ? request["idempotency_key"] : null;
    let register = await readRegister(client, kind, key);
    let verdict = c0Validate(kind, c0Bytes, generation, c0Register(register), nowUtc);
    const fingerprint = extrasFingerprint(ex);

    if (verdict.accepted && verdict.outcome === "RECEIVED") {
      // Le verdict du C0 (prix, catalogue, forme) passe en premier ; les extras ne sont jugés que pour une demande que le C0 accepte.
      const read = readExtras(kind, ex, (request["contact"] ?? {}) as JsonObject, doc);
      if (!read.ok) return await finish(invalid(base, read.rules), { operation, outcome: "REJECTED", error_codes: ["REQUEST_INVALID"], detail: { rules: read.rules } });
      if (deps.hooks?.afterValidate) await deps.hooks.afterValidate(client);
      const receiptC0 = kind === "quote_request" ? neutralizeQuoteOnlyLines(verdict.receipt as JsonObject) : (verdict.receipt as JsonObject);
      const c0Lines = receiptC0["lines"] as JsonObject[];
      if (kind === "order" && c0Lines.some((l) => isQuoteOnlyRate(l["rate_id"]))) {
        return await finish(json(httpStatusFor([QUOTE_ONLY_CODE]), { ...base, durable: false, accepted: false, outcome: "REJECTED", error_codes: [QUOTE_ONLY_CODE], superseded_by: {}, verdict: null }), { operation, outcome: "REJECTED", error_codes: [QUOTE_ONLY_CODE] });
      }
      // (4) Montants calculés ICI (jamais ceux du navigateur) : lignes, livraison, totaux.
      const index = catalogueIndex(active.snapshot);
      const eventLines: EventLine[] = [];
      for (const l of c0Lines) {
        const priced = kind === "order" ? true : l["priced"] === true;
        const item = index.get(l["public_item_key"] as string);
        const axes = l["variant_axes"] as Record<string, string>;
        eventLines.push({
          public_item_key: l["public_item_key"] as string, variant_axes: axes, item_label: labelOf(item, axes), quantity: l["quantity"] as number,
          rate_id: priced ? (l["rate_id"] as string) : null, lot: item?.pack ?? null,
          ...priceLine({ quantity: l["quantity"] as number, unitHt: priced ? (l["unit_amount"] as string) : null }, doc.tax_rate),
        });
      }
      const delivery = priceDelivery(read.option, read.option === DELIVERY_APPOINTMENT ? doc.delivery_rendez_vous.label : "Livraison incluse", doc.delivery_rendez_vous.amount_ht, doc.tax_rate);
      const amounts = totals(eventLines, delivery, doc.tax_rate);
      // M05 : un TTC affiché que le serveur ne retrouve pas est refusé, comme un prix falsifié.
      if (ex["total_ttc"] !== undefined && ex["total_ttc"] !== null && ex["total_ttc"] !== amounts.total_ttc) {
        return await finish(refuse(base, 409, "PRICE_CHANGED", { superseded_by: {} }), { operation, outcome: "REJECTED", error_codes: ["PRICE_CHANGED"] });
      }
      const ref = opaqueRef(kind === "order" ? "ORD" : "QR");
      const access = newAccessToken();
      const receipt: JsonObject = { ...receiptC0, receipt_ref: ref, created_at_utc: nowUtc };

      // (5a) Numéro (rendu par un retour en arrière), puis idempotence : l'unicité (kind, clé) tranche une course entre deux envois.
      const numbered = await nextNumber(client, kind, nowUtc);
      const shownLines = (receipt["lines"] as JsonObject[]).map((l, i): JsonObject => ({ ...l, item_label: eventLines[i]!.item_label, lot: eventLines[i]!.lot === null ? null : { ...eventLines[i]!.lot }, line_total_ht: eventLines[i]!.line_total_ht, line_tva: eventLines[i]!.line_tva }));
      const fullReceipt: JsonObject = { ...receipt, lines: shownLines, number: numbered, amounts: { ...amounts }, delivery: { ...delivery }, ...(read.order ? { payment: { method: read.order.method, instructions: doc.payment[read.order.method].instructions } } : {}) };
      const receiptBytes = canonicalBytes(fullReceipt);
      const ins = await client.query(
        `INSERT INTO site_idempotency (kind, idempotency_key, request_fingerprint, receipt_ref, receipt_json, receipt_bytes)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (kind, idempotency_key) DO NOTHING`,
        [kind, request["idempotency_key"], receiptC0["request_fingerprint"], ref, JSON.stringify(fullReceipt), Buffer.from(receiptBytes)],
      );
      if (ins.rowCount === 0) {
        register = await readRegister(client, kind, request["idempotency_key"] as string);
        verdict = c0Validate(kind, c0Bytes, generation, c0Register(register), nowUtc);
        const settled = await replayOrRefuse(client, base, verdict, register, fingerprint, operation, active.catalogue_sequence, true);
        return await finish(settled.response, settled.log, false);
      }

      const eventId = opaqueRef("EVT");
      const base2 = { number: numbered, contact: read.contact, message: kind === "quote_request" ? (typeof request["message"] === "string" ? clean(request["message"], true) : null) : null, privacy_notice: doc.privacy_notice.version, lines: eventLines, delivery, amounts };
      const payload = kind === "order"
        ? orderPayload({ ...base2, addresses: read.order!.addresses, customer_refs: read.order!.refs, payment: { method: read.order!.method, instructions: doc.payment[read.order!.method].instructions }, terms: read.order!.terms })
        : quotePayload(base2);
      const event = buildEventV2({ type: EVENT_TYPE[kind], ref, number: numbered, eventId, createdAtUtc: nowUtc, catalogueSequence: kind === "order" ? (receiptC0["catalogue_sequence"] as number) : (receiptC0["catalogue_sequence"] as number | null), payload });

      // (5b) Objet, lignes figées, événement : même transaction.
      const tokenSha = access.sha256;
      if (kind === "order") await insertOrder(client, request, fullReceipt, eventLines, ref, tokenSha, nowUtc, numbered, doc, read, delivery, amounts, fingerprint);
      else await insertQuote(client, generation, request, fullReceipt, eventLines, ref, tokenSha, nowUtc, numbered, doc, read, delivery, amounts, fingerprint, base2.message);
      await client.query(
        `INSERT INTO site_outbox_event (event_id, event_type, event_version, contract_version, created_at_utc, object_ref, idempotency_key, catalogue_sequence, payload, payload_digest, event_bytes, status)
         VALUES ($1, $2, 1, 'site_events.v2', $3, $4, $5, $6, $7::jsonb, $8, $9, 'PENDING')`,
        [event.event["event_id"], event.event["event_type"], event.event["created_at_utc"], event.event["object_ref"], event.event["idempotency_key"], event.event["catalogue_sequence"],
          JSON.stringify(event.event["payload"]), event.event["payload_digest"], Buffer.from(event.bytes)],
      );
      if (deps.hooks?.beforeCommit) await deps.hooks.beforeCommit(client);
      await client.query("COMMIT");
      return await finish(received(base, "RECEIVED", receiptBytes, access.token), { operation, outcome: "RECEIVED", object_ref: ref }, false);
    }
    // Refus ou rejeu du C0 : aucune écriture.
    const settled = await replayOrRefuse(client, base, verdict, register, fingerprint, operation, active.catalogue_sequence, false);
    return await finish(settled.response, settled.log, false);
  } catch (error) {
    broken = error;
    await client.query("ROLLBACK").catch(() => undefined);
    const reason = errorReason(error);
    console.error(`[site-requests] ${operation} échec de persistance code=${reason}`);
    outcome = { response: dbFailed(base, reason), log: { operation, outcome: "REJECTED", error_codes: ["DB_WRITE_FAILED"], detail: { reason } } };
    return outcome.response;
  } finally {
    release(broken !== undefined);
    if (outcome) await appendLog(deps.pool, outcome.log);
  }
}

/** Rejeu ou refus du C0 : toujours un ROLLBACK (rien d'écrit). Un rejeu dont les extras diffèrent est refusé comme une même clé avec un autre contenu. */
async function replayOrRefuse(
  client: PoolClient, base: Base, verdict: BusinessResult, register: RegisterRow[], fingerprint: string, operation: string, catalogueSequence: number, concurrent: boolean,
): Promise<{ response: TxResponse; log: Parameters<typeof appendLog>[1] }> {
  const log = (outcome: string, codes: readonly string[] = [], objectRef?: string) => ({ operation: operation as "QUOTE" | "ORDER", outcome, error_codes: codes, ...(objectRef ? { object_ref: objectRef } : {}), ...(concurrent ? { detail: { concurrent: true } } : {}) });
  if (verdict.accepted && verdict.outcome === "REPLAY_SAME_RECEIPT" && register[0]) {
    const table = base.kind === "order" ? "site_order" : "site_quote_request";
    const column = base.kind === "order" ? "order_ref" : "quote_ref";
    const stored = await client.query<{ extras_fingerprint: string | null }>(`SELECT extras_fingerprint FROM ${table} WHERE ${column} = $1`, [register[0].receipt_ref]);
    const same = stored.rows[0] === undefined || stored.rows[0].extras_fingerprint === null || stored.rows[0].extras_fingerprint === fingerprint;
    await client.query("ROLLBACK");
    if (!same) return { response: refuse(base, 409, "DUPLICATE_KEY_DIFFERENT_PAYLOAD"), log: log("REJECTED", ["DUPLICATE_KEY_DIFFERENT_PAYLOAD"]) };
    return { response: received(base, "REPLAY_SAME_RECEIPT", new Uint8Array(register[0].receipt_bytes), null), log: log("REPLAY_SAME_RECEIPT", [], register[0].receipt_ref) };
  }
  await client.query("ROLLBACK");
  return {
    response: json(httpStatusFor(verdict.error_codes), { ...base, durable: false, catalogue_sequence: catalogueSequence, accepted: false, outcome: verdict.outcome, error_codes: verdict.error_codes, superseded_by: verdict.superseded_by, verdict }),
    log: log(verdict.outcome, verdict.error_codes),
  };
}

const money = (value: string | null): string | null => value;

/**
 * « Prix sur devis » dans une DEMANDE DE DEVIS : une ligne chiffrée par une fenêtre `rq-` est enregistrée NON chiffrée, comme une ligne sans prix (même règle que la transaction v1) ;
 * sans ligne chiffrée, la séquence de catalogue du reçu est nulle.
 */
function neutralizeQuoteOnlyLines(receipt: JsonObject): JsonObject {
  const lines = receipt["lines"] as JsonObject[];
  if (!lines.some((l) => l["priced"] === true && isQuoteOnlyRate(l["rate_id"]))) return receipt;
  const out = lines.map((l): JsonObject => (l["priced"] === true && isQuoteOnlyRate(l["rate_id"]) ? { ...l, priced: false, rate_id: null, unit_amount: null, currency: null, tax_basis_or_status: null } : l));
  return { ...receipt, lines: out, catalogue_sequence: out.some((l) => l["priced"] === true) ? (receipt["catalogue_sequence"] as Json) : null };
}

async function insertQuote(
  client: PoolClient, generation: Json, request: JsonObject, receipt: JsonObject, lines: EventLine[], ref: string, tokenSha: string, nowUtc: string, number: string, doc: CommerceDocument,
  read: { contact: Contact }, delivery: unknown, amounts: unknown, fingerprint: string, message: string | null,
): Promise<void> {
  const c0Lines = receipt["lines"] as JsonObject[];
  if (c0Lines.length < 1) throw Object.assign(new Error("reçu C0 sans ligne"), { code: "RECEIPT_INCONSISTENT" });
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO site_quote_request (quote_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, message, status, access_token_sha256, created_at_utc,
                                     number, privacy_notice, delivery, amounts, commerce_sequence, extras_fingerprint)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'RECEIVED', $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14) RETURNING id`,
    [ref, request["idempotency_key"], receipt["request_fingerprint"], receipt["catalogue_sequence"], JSON.stringify(read.contact), message, tokenSha, nowUtc, number,
      doc.privacy_notice.version, JSON.stringify(delivery), JSON.stringify(amounts), doc.commerce_sequence, fingerprint],
  );
  const quoteId = rows[0]!.id;
  let lineNo = 0;
  for (const [i, l] of c0Lines.entries()) {
    lineNo += 1;
    const v2 = lines[i]!;
    const priced = v2.rate_id !== null;
    await client.query(
      `INSERT INTO site_quote_line (quote_id, line_no, public_item_key, variant_axes, quantity, priced, catalogue_sequence, rate_id, unit_amount, currency, tax_basis_or_status, offer_price_version_public,
                                    item_label, lot, line_total_ht, line_tva)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)`,
      [quoteId, lineNo, l["public_item_key"], JSON.stringify(l["variant_axes"]), l["quantity"], priced, priced ? receipt["catalogue_sequence"] : null, v2.rate_id, money(v2.unit_amount_ht),
        priced ? l["currency"] : null, priced ? l["tax_basis_or_status"] : null, priced ? offerVersion(generation, l, nowUtc) : null,
        v2.item_label, v2.lot === null ? null : JSON.stringify(v2.lot), v2.line_total_ht, v2.line_tva],
    );
  }
  const check = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM site_quote_line WHERE quote_id = $1", [quoteId]);
  if (BigInt(check.rows[0]!.n) !== BigInt(c0Lines.length)) throw Object.assign(new Error("devis incohérent avant COMMIT"), { code: "QUOTE_CHECK_FAILED" });
}

/** `offer_price_version_public` n'est pas dans la ligne de devis C0 : relu par `selectPrice` (C0) sur la même génération au même instant, avec la même fenêtre que celle que le C0 a validée. */
function offerVersion(generation: Json, line: JsonObject, nowUtc: string): string {
  const sel = selectPrice(generation, line["public_item_key"] as Json, line["variant_axes"] as Json, line["quantity"] as Json, nowUtc);
  if (!sel.accepted || sel.selection === null || sel.selection["rate_id"] !== line["rate_id"] || sel.selection["unit_amount"] !== line["unit_amount"]) {
    throw Object.assign(new Error("sélection C0 discordante pour une ligne chiffrée"), { code: "RECEIPT_INCONSISTENT" });
  }
  return sel.selection["offer_price_version_public"] as string;
}

async function insertOrder(
  client: PoolClient, request: JsonObject, receipt: JsonObject, lines: EventLine[], ref: string, tokenSha: string, nowUtc: string, number: string, doc: CommerceDocument,
  read: { contact: Contact; order: null | { addresses: unknown; refs: unknown; method: string; terms: unknown } }, delivery: unknown, amounts: unknown, fingerprint: string,
): Promise<void> {
  const c0Lines = receipt["lines"] as JsonObject[];
  let sum = 0n;
  for (const l of c0Lines) sum += toCents(l["line_total"] as string);
  const total = toCents(receipt["total_amount"] as string);
  if (sum !== total || c0Lines.length < 1 || read.order === null) throw Object.assign(new Error("reçu C0 incohérent"), { code: "RECEIPT_INCONSISTENT" });
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO site_order (order_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, currency, total_amount, total_cents, status, access_token_sha256, created_at_utc,
                             number, privacy_notice, addresses, customer_refs, payment, terms, delivery, amounts, commerce_sequence, extras_fingerprint)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'EUR', $6, $7, 'RECEIVED', $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19) RETURNING id`,
    [ref, request["idempotency_key"], receipt["request_fingerprint"], receipt["catalogue_sequence"], JSON.stringify(read.contact), receipt["total_amount"], total.toString(), tokenSha, nowUtc, number,
      doc.privacy_notice.version, JSON.stringify(read.order.addresses), JSON.stringify(read.order.refs), JSON.stringify({ method: read.order.method, instructions: doc.payment[read.order.method as "cheque"].instructions }),
      JSON.stringify(read.order.terms), JSON.stringify(delivery), JSON.stringify(amounts), doc.commerce_sequence, fingerprint],
  );
  const orderId = rows[0]!.id;
  let lineNo = 0;
  for (const [i, l] of c0Lines.entries()) {
    lineNo += 1;
    const v2 = lines[i]!;
    const unit = toCents(l["unit_amount"] as string);
    const lineTotal = toCents(l["line_total"] as string);
    if (lineTotal !== unit * BigInt(l["quantity"] as number)) throw Object.assign(new Error("ligne C0 incohérente"), { code: "RECEIPT_INCONSISTENT" });
    await client.query(
      `INSERT INTO site_order_line (order_id, line_no, public_item_key, variant_axes, quantity, catalogue_sequence, rate_id, unit_amount, unit_cents, currency, tax_basis_or_status,
                                    offer_price_version_public, line_total, line_total_cents, item_label, lot, line_tva)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)`,
      [orderId, lineNo, l["public_item_key"], JSON.stringify(l["variant_axes"]), l["quantity"], l["catalogue_sequence"], l["rate_id"], l["unit_amount"], unit.toString(), l["currency"],
        l["tax_basis_or_status"], l["offer_price_version_public"], l["line_total"], lineTotal.toString(), v2.item_label, v2.lot === null ? null : JSON.stringify(v2.lot), v2.line_tva],
    );
  }
  const check = await client.query<{ n: string; s: string | null; t: string }>(
    "SELECT count(l.id)::text AS n, sum(l.line_total_cents)::text AS s, o.total_cents::text AS t FROM site_order o LEFT JOIN site_order_line l ON l.order_id = o.id WHERE o.id = $1 GROUP BY o.total_cents", [orderId]);
  const c = check.rows[0];
  if (!c || BigInt(c.n) < 1n || c.s === null || BigInt(c.s) !== BigInt(c.t) || BigInt(c.n) !== BigInt(c0Lines.length)) throw Object.assign(new Error("commande incohérente avant COMMIT"), { code: "ORDER_CHECK_FAILED" });
}

type Finish = (response: TxResponse, log: Parameters<typeof appendLog>[1], rollback?: boolean) => Promise<TxResponse>;

/** La demande libre : pas de génération ni de C0 ; son idempotence est celle de l'empreinte des extras. */
async function submitMessage(deps: RequestDeps, client: PoolClient, base: Base, ex: JsonObject, doc: CommerceDocument, nowUtc: string, finish: Finish): Promise<TxResponse> {
  const operation = "MESSAGE" as const;
  const key = ex["idempotency_key"];
  const problems: Checked = { rules: [] };
  const contact = checkContact(ex["contact"] as JsonObject | undefined);
  failIf(contact, problems);
  const message = checkMessage(ex["message"], true, MESSAGE_MAX);
  failIf(message, problems);
  failIf(checkPrivacyNotice(ex["privacy_notice"], doc.privacy_notice.version), problems);
  let product: ProductAbout | null = null;
  const rawProduct = ex["product"];
  if (rawProduct !== null && rawProduct !== undefined) {
    const p = isObject(rawProduct as Json) ? (rawProduct as JsonObject) : {};
    const label = clean(p["label"]);
    const url = clean(p["url"]);
    const itemKey = p["public_item_key"] === null || p["public_item_key"] === undefined ? null : clean(p["public_item_key"]);
    if (!(label !== "" && [...label].length <= 200 && /^\/(?![/\\])[A-Za-z0-9._~!$&'()*+,;=@%/?#-]{0,498}$/.test(url) && (itemKey === null || /^PI-[0-9A-HJKMNP-TV-Z]{9}$/.test(itemKey)))) problems.rules.push("field_length");
    else product = { public_item_key: itemKey, label, url };
  }
  if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) problems.rules.push("field_length");
  if (problems.rules.length > 0 || !contact.ok || !message.ok || typeof key !== "string") return finish(invalid(base, problems.rules), { operation, outcome: "REJECTED", error_codes: ["REQUEST_INVALID"], detail: { rules: [...new Set(problems.rules)] } });

  const fingerprint = extrasFingerprint({ ...ex, contact: { ...contact.value }, message: message.value, product: product === null ? null : { ...product } } as JsonObject);
  const register = await readRegister(client, "message", key);
  if (register[0]) {
    await client.query("ROLLBACK");
    const same = register[0].request_fingerprint === fingerprint;
    const response = same ? received(base, "REPLAY_SAME_RECEIPT", new Uint8Array(register[0].receipt_bytes), null) : refuse(base, 409, "DUPLICATE_KEY_DIFFERENT_PAYLOAD");
    return finish(response, { operation, outcome: same ? "REPLAY_SAME_RECEIPT" : "REJECTED", ...(same ? { object_ref: register[0].receipt_ref } : { error_codes: ["DUPLICATE_KEY_DIFFERENT_PAYLOAD"] }) }, false);
  }
  if (deps.hooks?.afterValidate) await deps.hooks.afterValidate(client);
  const ref = opaqueRef("MSG");
  const access = newAccessToken();
  const number = await nextNumber(client, "message", nowUtc);
  const receipt: JsonObject = { kind: "message", status: "RECEIVED", receipt_ref: ref, number, created_at_utc: nowUtc, request_fingerprint: fingerprint, catalogue_sequence: null, lines: [] };
  const receiptBytes = canonicalBytes(receipt);
  const ins = await client.query(
    `INSERT INTO site_idempotency (kind, idempotency_key, request_fingerprint, receipt_ref, receipt_json, receipt_bytes) VALUES ('message', $1, $2, $3, $4::jsonb, $5) ON CONFLICT (kind, idempotency_key) DO NOTHING`,
    [key, fingerprint, ref, JSON.stringify(receipt), Buffer.from(receiptBytes)],
  );
  if (ins.rowCount === 0) {
    const again = await readRegister(client, "message", key);
    await client.query("ROLLBACK");
    const same = again[0]?.request_fingerprint === fingerprint;
    return finish(same ? received(base, "REPLAY_SAME_RECEIPT", new Uint8Array(again[0]!.receipt_bytes), null) : refuse(base, 409, "DUPLICATE_KEY_DIFFERENT_PAYLOAD"), { operation, outcome: same ? "REPLAY_SAME_RECEIPT" : "REJECTED", detail: { concurrent: true } }, false);
  }
  const eventId = opaqueRef("EVT");
  const event = buildEventV2({ type: "message.received", ref, number, eventId, createdAtUtc: nowUtc, catalogueSequence: null,
    payload: messagePayload({ number, contact: contact.value, message: message.value as string, privacy_notice: doc.privacy_notice.version, product }) });
  await client.query(
    `INSERT INTO site_message (message_ref, idempotency_key, request_fingerprint, number, contact, message, product, privacy_notice, status, access_token_sha256, created_at_utc)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, 'RECEIVED', $9, $10)`,
    [ref, key, fingerprint, number, JSON.stringify(contact.value), message.value, product === null ? null : JSON.stringify(product), doc.privacy_notice.version, access.sha256, nowUtc],
  );
  await client.query(
    `INSERT INTO site_outbox_event (event_id, event_type, event_version, contract_version, created_at_utc, object_ref, idempotency_key, catalogue_sequence, payload, payload_digest, event_bytes, status)
     VALUES ($1, 'message.received', 1, 'site_events.v2', $2, $3, $4, NULL, $5::jsonb, $6, $7, 'PENDING')`,
    [eventId, nowUtc, ref, event.event["idempotency_key"], JSON.stringify(event.event["payload"]), event.event["payload_digest"], Buffer.from(event.bytes)],
  );
  if (deps.hooks?.beforeCommit) await deps.hooks.beforeCommit(client);
  await client.query("COMMIT");
  return finish(received(base, "RECEIVED", receiptBytes, access.token), { operation, outcome: "RECEIVED", object_ref: ref }, false);
}
