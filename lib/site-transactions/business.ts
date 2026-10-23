/**
 * Transactions `site_business.v1` du SITE (BC4) : demande de devis et commande DURABLES.
 * Contrat : Factory `docs/contracts/c0_site_v1.md` §10, §10.4, §11.1, §13 ; schéma : docs/SITE_DB_SCHEMA.md (BC4).
 *
 * UNE transaction PostgreSQL par requête :
 *   1. `readActiveForUpdate` (BC2, verrou partagé : aucune activation ne bascule avant notre COMMIT) ;
 *   2. registre d'idempotence = ligne `site_idempotency` de ce `(kind, idempotency_key)` ;
 *   3. `validateQuoteRequest | validateOrderSubmit` du C0 vendu sur les OCTETS BRUTS, instant SERVEUR ;
 *      refus → ROLLBACK, 0 ligne ; `REPLAY_SAME_RECEIPT` → reçu d'origine ;
 *   4. accepté → INSERT idempotence (ON CONFLICT : relecture et nouveau verdict C0), objet, lignes FIGÉES
 *      RENVOYÉES PAR C0 (jamais le corps client), événement outbox §11.1 (octets canoniques, sans PII) ;
 *   5. contrôles avant COMMIT (≥ 1 ligne, Σ centimes) + contraintes différées en base ;
 *   6. COMMIT, PUIS réponse `RECEIVED` (jeton d'accès renvoyé une seule fois, stocké haché).
 * Toute exception (connexion, SQL, COMMIT) → ROLLBACK et `DB_WRITE_FAILED` 503 : jamais `accepted:true` sans COMMIT.
 *
 * Interdits ici : prix du navigateur comme autorité, `Number` pour un montant, TVA, port, statut client, paiement.
 */
import type { Pool, PoolClient } from "pg";
import { Generation, MAX_BYTES, selectPrice, validateOrderSubmit, validateQuoteRequest, type BusinessResult } from "../../c0/ts/src/business";
import { payloadDigest, validateEvent } from "../../c0/ts/src/events";
import { moneyCents } from "../../c0/ts/src/formats";
import { canonicalBytes, isObject, parseBytes, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { readActiveForUpdate } from "../site-db/generation";
import { PERSISTENCE, appendLog, checkout, errorReason, httpStatusFor, json, jsonWithRaw, newAccessToken, opaqueRef, sha256OfBytes, type TxResponse } from "./common";

export type BusinessKind = "quote_request" | "order";

/** Points d'injection de TEST uniquement (jamais fournis par les routes). */
export interface BusinessHooks {
  /** Après la validation C0 acceptée, avant toute écriture (barrière de concurrence des tests). */
  afterValidate?: (client: PoolClient) => Promise<void>;
  /** Après l'INSERT de l'objet (devis/commande), avant lignes et outbox (crash injecté). */
  afterObjectInsert?: (client: PoolClient) => Promise<void>;
  /** Juste avant le COMMIT. */
  beforeCommit?: (client: PoolClient) => Promise<void>;
}

export interface BusinessDeps {
  pool: Pool;
  /** Instant serveur au format C0 (`YYYY-MM-DDTHH:MM:SSZ`). Jamais une valeur venant du client. */
  now: () => string;
  hooks?: BusinessHooks;
}

interface RegisterRow {
  kind: string;
  idempotency_key: string;
  request_fingerprint: string;
  receipt_ref: string;
  receipt_json: JsonObject;
  receipt_bytes: Buffer;
}

const LOCK_TIMEOUT = "5s";
const STATEMENT_TIMEOUT = "15s";

function c0Validate(kind: BusinessKind, bytes: Uint8Array, generation: Json, register: Json, nowUtc: string): BusinessResult {
  return kind === "order"
    ? validateOrderSubmit(bytes, generation, register, nowUtc)
    : validateQuoteRequest(bytes, generation, register, nowUtc);
}

/** Lecture préalable de la clé pour retrouver le registre ; la décision reste celle du C0 (parse strict compris). */
function peekIdempotencyKey(bytes: Uint8Array): string | null {
  try {
    const doc = parseBytes(bytes, MAX_BYTES);
    return isObject(doc) && typeof doc["idempotency_key"] === "string" ? doc["idempotency_key"] : null;
  } catch {
    return null;
  }
}

async function readRegister(client: PoolClient, kind: BusinessKind, key: string | null): Promise<RegisterRow[]> {
  if (key === null) return [];
  const { rows } = await client.query<RegisterRow>(
    "SELECT kind, idempotency_key, request_fingerprint, receipt_ref, receipt_json, receipt_bytes FROM site_idempotency WHERE kind = $1 AND idempotency_key = $2",
    [kind, key],
  );
  return rows;
}

function c0Register(rows: RegisterRow[]): Json {
  return rows.map((r) => ({ kind: r.kind, idempotency_key: r.idempotency_key, request_fingerprint: r.request_fingerprint, receipt_ref: r.receipt_ref }));
}

type Common = { contract_version: "site_business.v1"; kind: BusinessKind; persistence: typeof PERSISTENCE; instant_utc: string };

function refusal(base: Common, v: BusinessResult, catalogueSequence: number | null): TxResponse {
  return json(httpStatusFor(v.error_codes), {
    ...base,
    durable: false,
    catalogue_sequence: catalogueSequence,
    accepted: false,
    outcome: v.outcome,
    error_codes: v.error_codes,
    superseded_by: v.superseded_by,
    verdict: v,
  });
}

function accepted(base: Common, outcome: "RECEIVED" | "REPLAY_SAME_RECEIPT", receiptBytes: Uint8Array, accessToken: string | null): TxResponse {
  const receipt = JSON.parse(Buffer.from(receiptBytes).toString("utf8")) as JsonObject;
  const envelope: Record<string, unknown> = {
    ...base,
    durable: true,
    accepted: true,
    outcome,
    error_codes: [],
    receipt_ref: receipt["receipt_ref"],
    request_fingerprint: receipt["request_fingerprint"],
    lines: receipt["lines"],
  };
  // Jeton d'accès : renvoyé UNE seule fois (à la création) ; un rejeu ne le redonne jamais (il n'est stocké que haché).
  if (accessToken !== null) envelope["access_token"] = accessToken;
  // `receipt` = octets canoniques STOCKÉS (review F-03) : identiques octet pour octet entre création, rejeu et consultation.
  return jsonWithRaw(200, envelope, "receipt", receiptBytes, { "x-site-receipt-sha256": sha256OfBytes(receiptBytes) });
}

function dbFailed(base: Common, reason: string): TxResponse {
  return json(503, {
    ...base,
    durable: false,
    accepted: false,
    outcome: "REJECTED",
    error_codes: ["DB_WRITE_FAILED"],
    detail: { reason },
    verdict: null,
  });
}

function unavailable(base: Common, reason: string): TxResponse {
  return json(503, { ...base, durable: false, accepted: false, site_status: "CATALOG_UNAVAILABLE", reason, error_codes: [], verdict: null });
}

/** Événement `site_events.v1` §11.1 construit UNIQUEMENT depuis les lignes figées (aucune clé de contact possible). */
export function buildEvent(kind: BusinessKind, ref: string, receipt: JsonObject, nowUtc: string, eventId: string): { event: JsonObject; bytes: Uint8Array } {
  const lines = receipt["lines"] as JsonObject[];
  const eventType = kind === "order" ? "order.received" : "quote.requested";
  const payload: JsonObject =
    kind === "order"
      ? {
          order_ref: ref,
          status: "RECEIVED",
          currency: "EUR",
          total_amount: receipt["total_amount"] as string,
          lines: lines.map((l) => ({
            public_item_key: l["public_item_key"] as Json,
            variant_axes: l["variant_axes"] as Json,
            quantity: l["quantity"] as Json,
            rate_id: l["rate_id"] as Json,
            unit_amount: l["unit_amount"] as Json,
            currency: l["currency"] as Json,
            tax_basis_or_status: l["tax_basis_or_status"] as Json,
            line_total: l["line_total"] as Json,
          })),
        }
      : {
          quote_ref: ref,
          lines: lines.map((l) => ({
            public_item_key: l["public_item_key"] as Json,
            variant_axes: l["variant_axes"] as Json,
            quantity: l["quantity"] as Json,
            rate_id: l["priced"] === true ? (l["rate_id"] as Json) : null,
            unit_amount: l["priced"] === true ? (l["unit_amount"] as Json) : null,
          })),
        };
  const event: JsonObject = {
    contract_version: "site_events.v1",
    event_id: eventId,
    event_type: eventType,
    event_version: 1,
    created_at_utc: nowUtc,
    object_ref: ref,
    // Convention des fixtures C0 (`F_QUOTE_ORDER/event_order_received.json`) : `<event_type>:<object_ref>`.
    idempotency_key: `${eventType}:${ref}`,
    catalogue_sequence: receipt["catalogue_sequence"] as Json,
    payload,
    payload_digest: payloadDigest(payload),
  };
  const bytes = canonicalBytes(event);
  // Garde : l'événement émis doit être exactement ce que la Factory acceptera (C0 validateEvent → APPLY).
  const check = validateEvent(bytes, []);
  if (!check.accepted || check.outcome !== "APPLY") throw Object.assign(new Error("événement outbox refusé par C0"), { code: "EVENT_BUILD_FAILED" });
  return { event, bytes };
}

function cents(value: Json | undefined): bigint {
  const c = moneyCents(value);
  if (c === null) throw Object.assign(new Error("montant hors format C0"), { code: "MONEY_FORMAT" });
  return c;
}

async function insertOrder(
  client: PoolClient, hooks: BusinessHooks | undefined, request: JsonObject, receipt: JsonObject, ref: string, tokenSha: string, nowUtc: string,
): Promise<void> {
  const lines = receipt["lines"] as JsonObject[];
  let sum = 0n;
  for (const l of lines) sum += cents(l["line_total"]);
  const total = cents(receipt["total_amount"]);
  if (sum !== total || lines.length < 1) throw Object.assign(new Error("reçu C0 incohérent"), { code: "RECEIPT_INCONSISTENT" });
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO site_order (order_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, currency, total_amount,
                             total_cents, status, access_token_sha256, created_at_utc)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'EUR', $6, $7, 'RECEIVED', $8, $9) RETURNING id`,
    [ref, request["idempotency_key"], receipt["request_fingerprint"], receipt["catalogue_sequence"], JSON.stringify(request["contact"]),
      receipt["total_amount"], total.toString(), tokenSha, nowUtc],
  );
  const orderId = rows[0]!.id;
  if (hooks?.afterObjectInsert) await hooks.afterObjectInsert(client);
  let lineNo = 0;
  for (const l of lines) {
    lineNo += 1;
    const unit = cents(l["unit_amount"]);
    const lineTotal = cents(l["line_total"]);
    if (lineTotal !== unit * BigInt(l["quantity"] as number)) throw Object.assign(new Error("ligne C0 incohérente"), { code: "RECEIPT_INCONSISTENT" });
    await client.query(
      `INSERT INTO site_order_line (order_id, line_no, public_item_key, variant_axes, quantity, catalogue_sequence, rate_id, unit_amount,
                                    unit_cents, currency, tax_basis_or_status, offer_price_version_public, line_total, line_total_cents)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [orderId, lineNo, l["public_item_key"], JSON.stringify(l["variant_axes"]), l["quantity"], l["catalogue_sequence"], l["rate_id"],
        l["unit_amount"], unit.toString(), l["currency"], l["tax_basis_or_status"], l["offer_price_version_public"], l["line_total"],
        lineTotal.toString()],
    );
  }
  // Contrôle explicite avant COMMIT (doublé par la contrainte différée site_order_lines_consistent).
  const check = await client.query<{ n: string; s: string | null; t: string }>(
    "SELECT count(l.id)::text AS n, sum(l.line_total_cents)::text AS s, o.total_cents::text AS t FROM site_order o LEFT JOIN site_order_line l ON l.order_id = o.id WHERE o.id = $1 GROUP BY o.total_cents",
    [orderId],
  );
  const c = check.rows[0];
  if (!c || BigInt(c.n) < 1n || c.s === null || BigInt(c.s) !== BigInt(c.t) || BigInt(c.n) !== BigInt(lines.length)) {
    throw Object.assign(new Error("commande incohérente avant COMMIT"), { code: "ORDER_CHECK_FAILED" });
  }
}

async function insertQuote(
  client: PoolClient, hooks: BusinessHooks | undefined, generation: Json, request: JsonObject, receipt: JsonObject, ref: string, tokenSha: string, nowUtc: string,
): Promise<void> {
  const lines = receipt["lines"] as JsonObject[];
  if (lines.length < 1) throw Object.assign(new Error("reçu C0 sans ligne"), { code: "RECEIPT_INCONSISTENT" });
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO site_quote_request (quote_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, message, status,
                                     access_token_sha256, created_at_utc)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'RECEIVED', $7, $8) RETURNING id`,
    [ref, request["idempotency_key"], receipt["request_fingerprint"], receipt["catalogue_sequence"], JSON.stringify(request["contact"]),
      request["message"], tokenSha, nowUtc],
  );
  const quoteId = rows[0]!.id;
  if (hooks?.afterObjectInsert) await hooks.afterObjectInsert(client);
  let lineNo = 0;
  for (const l of lines) {
    lineNo += 1;
    let offerVersion: Json = null;
    if (l["priced"] === true) {
      // `offer_price_version_public` n'est pas dans la ligne de devis C0 : on le relit par `selectPrice` (C0) sur la
      // même génération au même instant, et on exige la même fenêtre que celle qu'a validée validateQuoteRequest.
      const sel = selectPrice(generation, l["public_item_key"] as Json, l["variant_axes"] as Json, l["quantity"] as Json, nowUtc);
      if (!sel.accepted || sel.selection === null || sel.selection["rate_id"] !== l["rate_id"] || sel.selection["unit_amount"] !== l["unit_amount"]) {
        throw Object.assign(new Error("sélection C0 discordante pour une ligne chiffrée"), { code: "RECEIPT_INCONSISTENT" });
      }
      offerVersion = sel.selection["offer_price_version_public"] as Json;
    }
    await client.query(
      `INSERT INTO site_quote_line (quote_id, line_no, public_item_key, variant_axes, quantity, priced, catalogue_sequence, rate_id,
                                    unit_amount, currency, tax_basis_or_status, offer_price_version_public)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [quoteId, lineNo, l["public_item_key"], JSON.stringify(l["variant_axes"]), l["quantity"], l["priced"] === true,
        l["priced"] === true ? receipt["catalogue_sequence"] : null, l["rate_id"], l["unit_amount"], l["currency"], l["tax_basis_or_status"], offerVersion],
    );
  }
  const check = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM site_quote_line WHERE quote_id = $1", [quoteId]);
  if (BigInt(check.rows[0]!.n) !== BigInt(lines.length)) throw Object.assign(new Error("devis incohérent avant COMMIT"), { code: "QUOTE_CHECK_FAILED" });
}

/**
 * `POST /api/site/quote` (kind `quote_request`) et `POST /api/site/order` (kind `order`).
 * `bytes` = octets bruts du corps HTTP ; aucune autre entrée client.
 */
export async function submitBusiness(deps: BusinessDeps, kind: BusinessKind, bytes: Uint8Array): Promise<TxResponse> {
  const nowUtc = deps.now();
  const operation = kind === "order" ? "ORDER" : "QUOTE";
  const base: Common = { contract_version: "site_business.v1", kind, persistence: PERSISTENCE, instant_utc: nowUtc };
  const key = peekIdempotencyKey(bytes);

  let client: PoolClient;
  let release: (failed: boolean) => void;
  try {
    ({ client, release } = await checkout(deps.pool));
  } catch (error) {
    const reason = errorReason(error);
    console.error(`[site-transactions] ${operation} connexion impossible code=${reason}`);
    await appendLog(deps.pool, { operation, outcome: "REJECTED", error_codes: ["DB_WRITE_FAILED"], detail: { reason } });
    return dbFailed(base, reason);
  }

  let broken: unknown = undefined;
  let outcome: { response: TxResponse; log: Parameters<typeof appendLog>[1] } | undefined;
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);

    // (1) Génération ACTIVE durable, verrou partagé jusqu'au COMMIT/ROLLBACK.
    const active = await readActiveForUpdate(client);
    if (active === null) {
      await client.query("ROLLBACK");
      outcome = { response: unavailable(base, "NO_ACTIVE_GENERATION"), log: { operation, outcome: "CATALOG_UNAVAILABLE", detail: { reason: "NO_ACTIVE_GENERATION" } } };
      return outcome.response;
    }
    const generation: Json = { snapshot: active.snapshot as unknown as Json, status: active.status };
    try {
      new Generation(generation);
    } catch {
      // Octets ACTIVE illisibles : aucune entrée C0 possible, aucun verdict inventé (fail-closed).
      await client.query("ROLLBACK");
      outcome = { response: unavailable(base, "ACTIVE_GENERATION_UNREADABLE"), log: { operation, outcome: "CATALOG_UNAVAILABLE", detail: { reason: "ACTIVE_GENERATION_UNREADABLE" } } };
      return outcome.response;
    }

    // (2) Registre durable de ce (kind, clé) ; (3) verdict C0 sur les octets bruts, instant serveur.
    let register = await readRegister(client, kind, key);
    let verdict = c0Validate(kind, bytes, generation, c0Register(register), nowUtc);

    if (verdict.accepted && verdict.outcome === "RECEIVED") {
      if (deps.hooks?.afterValidate) await deps.hooks.afterValidate(client);
      const request = parseBytes(bytes, MAX_BYTES) as JsonObject; // déjà accepté par C0 : relecture NFC du même document
      const receiptC0 = verdict.receipt as JsonObject;
      const ref = opaqueRef(kind === "order" ? "ORD" : "QR");
      const access = newAccessToken();
      const receipt: JsonObject = { ...receiptC0, receipt_ref: ref, created_at_utc: nowUtc };
      const receiptBytes = canonicalBytes(receipt);
      const { event, bytes: eventBytes } = buildEvent(kind, ref, receipt, nowUtc, opaqueRef("EVT"));

      // (4a) Idempotence d'abord : l'unicité (kind, clé) tranche une course entre deux POST (CE-T03).
      const ins = await client.query(
        `INSERT INTO site_idempotency (kind, idempotency_key, request_fingerprint, receipt_ref, receipt_json, receipt_bytes)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (kind, idempotency_key) DO NOTHING`,
        [kind, request["idempotency_key"], receipt["request_fingerprint"], ref, JSON.stringify(receipt), Buffer.from(receiptBytes)],
      );
      if (ins.rowCount === 0) {
        // Une transaction concurrente a commité cette clé : relecture, puis NOUVEAU verdict C0 avec ce registre
        // (même empreinte → REPLAY_SAME_RECEIPT ; autre empreinte → DUPLICATE_KEY_DIFFERENT_PAYLOAD).
        register = await readRegister(client, kind, request["idempotency_key"] as string);
        verdict = c0Validate(kind, bytes, generation, c0Register(register), nowUtc);
        await client.query("ROLLBACK");
        if (verdict.accepted && verdict.outcome === "REPLAY_SAME_RECEIPT" && register[0]) {
          outcome = {
            response: accepted(base, "REPLAY_SAME_RECEIPT", new Uint8Array(register[0].receipt_bytes), null),
            log: { operation, outcome: "REPLAY_SAME_RECEIPT", object_ref: register[0].receipt_ref, detail: { concurrent: true } },
          };
        } else {
          outcome = { response: refusal(base, verdict, active.catalogue_sequence), log: { operation, outcome: verdict.outcome, error_codes: verdict.error_codes, detail: { concurrent: true } } };
        }
        return outcome.response;
      }

      // (4b) Objet + lignes figées (C0) + outbox, dans la même transaction.
      if (kind === "order") await insertOrder(client, deps.hooks, request, receipt, ref, access.sha256, nowUtc);
      else await insertQuote(client, deps.hooks, generation, request, receipt, ref, access.sha256, nowUtc);
      await client.query(
        `INSERT INTO site_outbox_event (event_id, event_type, event_version, created_at_utc, object_ref, idempotency_key, catalogue_sequence,
                                        payload, payload_digest, event_bytes, status)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7::jsonb, $8, $9, 'PENDING')`,
        [event["event_id"], event["event_type"], event["created_at_utc"], event["object_ref"], event["idempotency_key"], event["catalogue_sequence"],
          JSON.stringify(event["payload"]), event["payload_digest"], Buffer.from(eventBytes)],
      );
      if (deps.hooks?.beforeCommit) await deps.hooks.beforeCommit(client);

      // (5) COMMIT (contraintes différées vérifiées ici), (6) réponse APRÈS le COMMIT seulement.
      await client.query("COMMIT");
      outcome = { response: accepted(base, "RECEIVED", receiptBytes, access.token), log: { operation, outcome: "RECEIVED", object_ref: ref } };
      return outcome.response;
    }

    // Refus ou rejeu : aucune écriture.
    await client.query("ROLLBACK");
    if (verdict.accepted && verdict.outcome === "REPLAY_SAME_RECEIPT" && register[0]) {
      outcome = { response: accepted(base, "REPLAY_SAME_RECEIPT", new Uint8Array(register[0].receipt_bytes), null), log: { operation, outcome: "REPLAY_SAME_RECEIPT", object_ref: register[0].receipt_ref } };
    } else {
      outcome = { response: refusal(base, verdict, active.catalogue_sequence), log: { operation, outcome: verdict.outcome, error_codes: verdict.error_codes } };
    }
    return outcome.response;
  } catch (error) {
    broken = error;
    await client.query("ROLLBACK").catch(() => undefined);
    const reason = errorReason(error);
    console.error(`[site-transactions] ${operation} échec de persistance code=${reason}`);
    outcome = { response: dbFailed(base, reason), log: { operation, outcome: "REJECTED", error_codes: ["DB_WRITE_FAILED"], detail: { reason } } };
    return outcome.response;
  } finally {
    // Une connexion en erreur est détruite, jamais rendue au pool.
    release(broken !== undefined);
    if (outcome) await appendLog(deps.pool, outcome.log);
  }
}
