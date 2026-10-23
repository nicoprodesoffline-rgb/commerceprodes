/**
 * Receiver SITE (BC2) : STAGE / MEDIA / VERIFY_MEDIA / ACTIVATE / STATUS sur la base SITE PostgreSQL.
 * Transport : docs/SITE_TRANSPORT_STAGING.md. Schéma : docs/SITE_DB_SCHEMA.md.
 *
 * Règle d'or : AUCUNE règle C0 n'est réécrite ici. Chaque opération appelle `evaluatePublication`
 * (c0/ts/src/activation.ts, vendu, gelé) avec l'état voulu et interprète l'étape d'arrêt (`stage`) :
 *   - STAGE        : store média vide ; arrêt avant `media` -> refus (rien persisté sauf le journal),
 *                    REPLAY_ACK -> ACK stocké, sinon -> ligne STAGED (pas d'ACK).
 *   - VERIFY_MEDIA : store = octets des media_refs présents en base ; arrêt à `media` -> MEDIA_*, sinon VERIFIED.
 *   - ACTIVATE     : UNE transaction, pointeur ACTIVE verrouillé FOR UPDATE, ACTIVE relue dans le verrou,
 *                    horloge serveur, appel complet ; ACK renvoyé APRÈS le COMMIT, jamais avant.
 * Seul ajout : le contrôle d'environnement `data_label` (C0 §15, contrôle receiver), appliqué quand
 * l'évaluation a dépassé l'étape `shape` (donc après `shape`, avant `semantic`).
 */
import type { Pool, PoolClient } from "pg";
import { evaluatePublication, signatureContext, type Active, type ActivationResult } from "../../c0/ts/src/activation";
import { rejected } from "../../c0/ts/src/errors";
import { exactKeys, isCount, isHex64, isToken } from "../../c0/ts/src/formats";
import { canonicalBytes, isObject, parseBytes, sha256Hex, utf8, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { DOMAIN_SIG_SNAPSHOT, SCOPE_PUBLISH, keyHasScope, verify } from "../../c0/ts/src/signing";
import { MAX_BYTES, MAX_MEDIA_SIZE, type Snapshot } from "../../c0/ts/src/snapshot";
import { toSafeInt } from "../site-db/generation";
import type { ReceiverConfig } from "./config";

/** Domaine HMAC du PUT média : STAGING_TRANSPORT, hors contrat C0 (transport DEFERRED_FOR_PROD, C0 §15). */
export const MEDIA_TRANSPORT_DOMAIN = "prodes.c0.transport.media.v1";
export const HEADER_KEY_ID = "x-c0-key-id";
export const HEADER_SIGNATURE = "x-c0-signature";
export const HEADER_OUTCOME = "x-c0-outcome";
/** Corps de contrôle (verify-media, activate) : même plafond que les couches business/events (C0 §4). */
export const MAX_CONTROL_BYTES = 256 * 1024;
const LOCK_TIMEOUT = "15s";

export interface HeaderSource {
  get(name: string): string | null;
}

export interface ReceiverHooks {
  /** TEST SEULEMENT : appelé dans la transaction d'activation, après toutes les écritures, avant COMMIT. */
  beforeCommit?: (context: { operation: "ACTIVATE"; backendPid: number }) => Promise<void> | void;
}

export interface ReceiverDeps {
  pool: Pool;
  config: ReceiverConfig;
  /** Horloge serveur (format C0 §6). Injectable pour rejouer l'instant d'une fixture. */
  now?: () => string;
  hooks?: ReceiverHooks;
}

export interface ReceiverResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Horloge serveur du SITE au format C0 `YYYY-MM-DDTHH:MM:SSZ` (jamais une valeur fournie par le client). */
export function serverNowUtc(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/** Statut HTTP indicatif C0 §13 (choix de transport documenté : premier code de la liste triée). */
export const HTTP_BY_CODE: Readonly<Record<string, number>> = {
  PAYLOAD_MALFORMED: 400,
  SCHEMA_UNSUPPORTED: 400,
  SNAPSHOT_INVALID: 422,
  INTEGRITY_MISMATCH: 422,
  MANIFEST_COUNTS_MISMATCH: 422,
  FAMILY_WITHOUT_ITEMS: 422,
  CATEGORY_UNKNOWN: 422,
  SIGNATURE_INVALID: 401,
  IDENTITY_CONFLICT: 409,
  PRICE_WINDOW_OVERLAP: 422,
  SELL_MISSING: 422,
  MEDIA_MISSING: 422,
  MEDIA_HASH_MISMATCH: 422,
  MEDIA_TYPE_REJECTED: 415,
  STALE_SEQUENCE: 409,
  SEQUENCE_COLLISION: 409,
  COVERAGE_UNPROVEN: 422,
  STAGE_HOLD: 202,
  CATALOG_UNSAFE: 409,
};

export function httpStatusFor(codes: readonly string[]): number {
  return codes.length > 0 ? (HTTP_BY_CODE[codes[0] as string] ?? 422) : 422;
}

// --- petites briques ---------------------------------------------------------------------------

const EARLY_STAGES = new Set(["parse", "canonical", "version", "shape"]);
/** Étapes dont un arrêt est un refus au STAGE (C0 §8.2 : étapes 1–7, plus le contrôle d'environnement). */
const STAGE_REFUSAL_STAGES = new Set([...EARLY_STAGES, "environment", "semantic", "integrity", "signature", "sequence"]);
const MUTABLE_STATUSES = ["STAGED", "VERIFIED", "HOLD", "REJECTED"];

function json(status: number, value: unknown, extra: Record<string, string> = {}): ReceiverResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
    body: utf8(JSON.stringify(value)),
  };
}

function ackResponse(ackBytes: Uint8Array, outcome: "ACTIVATED" | "REPLAY_ACK"): ReceiverResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", [HEADER_OUTCOME]: outcome },
    body: ackBytes,
  };
}

function transportError(status: number, code: string, operation: string): ReceiverResponse {
  return json(status, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: code, error_codes: [] });
}

function transportFromHeaders(headers: HeaderSource): JsonObject {
  const transport: JsonObject = {};
  const keyId = headers.get(HEADER_KEY_ID);
  const signature = headers.get(HEADER_SIGNATURE);
  if (keyId !== null) transport["key_id"] = keyId;
  if (signature !== null) transport["signature"] = signature;
  return transport;
}

function tryParse(bytes: Uint8Array, max: number): Json | undefined {
  try {
    return parseBytes(bytes, max);
  } catch {
    return undefined;
  }
}

interface Correlation {
  publication_id: string | null;
  catalogue_sequence: number | null;
  payload_sha256: string | null;
}

/** Corrélation du journal : seulement des valeurs au format C0 (jamais de contenu). */
function correlate(doc: Json | undefined): Correlation {
  const o = isObject(doc) ? doc : {};
  return {
    publication_id: isToken(o["publication_id"]) ? (o["publication_id"] as string) : null,
    catalogue_sequence: isCount(o["catalogue_sequence"], 1) ? (o["catalogue_sequence"] as number) : null,
    payload_sha256: isHex64(o["payload_sha256"]) ? (o["payload_sha256"] as string) : null,
  };
}

/** Contrôle receiver C0 §15 : staging refuse PRODUCTION, production refuse STAGING_FIXTURE. */
function applyEnvironment(result: ActivationResult, doc: Json | undefined, env: ReceiverConfig["env"]): ActivationResult {
  if (EARLY_STAGES.has(result.stage) || !isObject(doc)) return result;
  const label = doc["data_label"];
  const refused = (env === "staging" && label === "PRODUCTION") || (env === "production" && label === "STAGING_FIXTURE");
  if (!refused) return result;
  return { ...rejected(["SNAPSHOT_INVALID"]), stage: "environment", ack: null, detail: { rules: ["envelope.data_label_environment"] } };
}

function publicResult(result: ActivationResult): JsonObject {
  return {
    accepted: result.accepted,
    outcome: result.outcome,
    error_codes: result.error_codes,
    stage: result.stage,
    detail: result.detail as JsonObject,
  };
}

function refusal(operation: string, result: ActivationResult): ReceiverResponse {
  const body: JsonObject = { ...publicResult(result), operation };
  if (result.detail.hold_reason !== undefined) body["hold_reason"] = result.detail.hold_reason;
  return json(result.outcome === "STAGE_HOLD" ? 202 : httpStatusFor(result.error_codes), body);
}

// --- journal (append-only, sans PII, sans secret, sans octets) ---------------------------------

type Querier = Pool | PoolClient;

interface LogEntry extends Correlation {
  operation: "STAGE" | "MEDIA_PUT" | "VERIFY_MEDIA" | "ACTIVATE" | "ACTIVATE_ABORTED";
  outcome: string;
  error_codes?: readonly string[];
  stage?: string | null;
  detail?: Record<string, string | number | boolean | readonly string[] | null>;
}

async function log(q: Querier, entry: LogEntry): Promise<void> {
  await q.query(
    `INSERT INTO site_publication_log (operation, publication_id, catalogue_sequence, payload_sha256, outcome, error_codes, stage, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
    [
      entry.operation,
      entry.publication_id,
      entry.catalogue_sequence,
      entry.payload_sha256,
      entry.outcome,
      JSON.stringify(entry.error_codes ?? []),
      entry.stage ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  );
}

function resultDetail(result: ActivationResult, keyId: unknown): LogEntry["detail"] {
  const detail: NonNullable<LogEntry["detail"]> = {};
  if (result.detail.rules !== undefined) detail["rules"] = result.detail.rules;
  if (result.detail.hold_reason !== undefined) detail["hold_reason"] = result.detail.hold_reason;
  if (isToken(keyId)) detail["key_id"] = keyId as string;
  return detail;
}

// --- lecture des lignes -----------------------------------------------------------------------

interface GenerationRow {
  id: number;
  publication_id: string;
  projection_id: string;
  scope_key: string;
  catalogue_sequence: number;
  payload_sha256: string;
  status: string;
  bytes: Uint8Array;
  ackBytes: Uint8Array | null;
  staged_at: string | null;
  verified_at: string | null;
  activated_at: string | null;
  last_result: Json;
}

const GENERATION_COLUMNS = `id, publication_id, projection_id, scope_key, catalogue_sequence, payload_sha256, status,
  snapshot_bytes, ack_bytes, last_result,
  to_char(staged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS staged_at,
  to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS verified_at,
  to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS activated_at`;

function toGeneration(row: any): GenerationRow {
  return {
    id: toSafeInt(row.id),
    publication_id: row.publication_id,
    projection_id: row.projection_id,
    scope_key: row.scope_key,
    catalogue_sequence: toSafeInt(row.catalogue_sequence),
    payload_sha256: row.payload_sha256,
    status: row.status,
    bytes: new Uint8Array(row.snapshot_bytes),
    ackBytes: row.ack_bytes === null ? null : new Uint8Array(row.ack_bytes),
    staged_at: row.staged_at,
    verified_at: row.verified_at,
    activated_at: row.activated_at,
    last_result: row.last_result,
  };
}

async function generationByKey(q: Querier, sequence: number, sha: string, lock: boolean): Promise<GenerationRow | null> {
  const { rows } = await q.query(
    `SELECT ${GENERATION_COLUMNS} FROM site_generation WHERE catalogue_sequence = $1 AND payload_sha256 = $2${lock ? " FOR UPDATE" : ""}`,
    [sequence, sha],
  );
  return rows.length === 1 ? toGeneration(rows[0]) : null;
}

interface ActiveState {
  row: GenerationRow;
  c0: Active;
  ackBytes: Uint8Array;
}

/** Génération ACTIVE relue en base (pointeur -> ligne). `lockPointer` = FOR UPDATE (activation). */
async function loadActive(q: Querier, lockPointer: boolean): Promise<ActiveState | null> {
  const pointer = await q.query(`SELECT generation_id FROM site_active_pointer WHERE singleton = 1${lockPointer ? " FOR UPDATE" : ""}`);
  if (pointer.rows.length !== 1) throw new Error("site_active_pointer : ligne unique absente");
  const id = pointer.rows[0].generation_id;
  if (id === null) return null;
  const { rows } = await q.query(`SELECT ${GENERATION_COLUMNS} FROM site_generation WHERE id = $1`, [id]);
  if (rows.length !== 1) throw new Error("site_active_pointer : génération pointée introuvable");
  const row = toGeneration(rows[0]);
  if (row.status !== "ACTIVE" || row.ackBytes === null) throw new Error("site_active_pointer : la génération pointée n'est pas ACTIVE");
  const snapshot = parseBytes(row.bytes, MAX_BYTES) as unknown as Snapshot;
  const ack = parseBytes(row.ackBytes, MAX_CONTROL_BYTES);
  return { row, c0: { snapshot, ack }, ackBytes: row.ackBytes };
}

/** Store média de l'évaluation : octets présents en base pour les media_refs du document. */
async function mediaStoreFor(q: Querier, doc: Json | undefined): Promise<Map<string, Uint8Array>> {
  const store = new Map<string, Uint8Array>();
  if (!isObject(doc) || !Array.isArray(doc["media_refs"])) return store;
  const shas = doc["media_refs"].map((ref) => (isObject(ref) ? ref["sha256"] : null)).filter(isHex64);
  if (shas.length === 0) return store;
  const { rows } = await q.query("SELECT sha256, bytes FROM site_media WHERE sha256 = ANY($1::char(64)[])", [shas]);
  for (const row of rows) store.set(row.sha256, new Uint8Array(row.bytes));
  return store;
}

interface ControlBody {
  publication_id: string;
  catalogue_sequence: number;
  payload_sha256: string;
}

function parseControl(bytes: Uint8Array): ControlBody | null {
  const value = tryParse(bytes, MAX_CONTROL_BYTES);
  if (!exactKeys(value, ["publication_id", "catalogue_sequence", "payload_sha256"])) return null;
  if (!isToken(value["publication_id"]) || !isCount(value["catalogue_sequence"], 1) || !isHex64(value["payload_sha256"])) return null;
  return value as unknown as ControlBody;
}

function generationSummary(row: GenerationRow): JsonObject {
  return {
    publication_id: row.publication_id,
    projection_id: row.projection_id,
    scope_key: row.scope_key,
    catalogue_sequence: row.catalogue_sequence,
    payload_sha256: row.payload_sha256,
    status: row.status,
  };
}

function corrOf(row: GenerationRow): Correlation {
  return { publication_id: row.publication_id, catalogue_sequence: row.catalogue_sequence, payload_sha256: row.payload_sha256 };
}

function evaluate(deps: ReceiverDeps, bytes: Uint8Array, transport: Json, active: ActiveState | null, store: Map<string, Uint8Array>, now: string): ActivationResult {
  const c = deps.config;
  return evaluatePublication(bytes, transport, active === null ? null : active.c0, store, c.policy, now, c.keyring, c.ackKeyId);
}

// --- STAGE -------------------------------------------------------------------------------------

export async function stage(deps: ReceiverDeps, bytes: Uint8Array, headers: HeaderSource): Promise<ReceiverResponse> {
  const transport = transportFromHeaders(headers);
  const doc = tryParse(bytes, MAX_BYTES);
  const corr = correlate(doc);
  const active = await loadActive(deps.pool, false);
  const now = (deps.now ?? serverNowUtc)();
  // Store média VIDE : les médias se vérifient à VERIFY_MEDIA (C0 §9.1) ; l'ACK éventuel de cet appel est jeté.
  const result = applyEnvironment(evaluate(deps, bytes, transport, active, new Map(), now), doc, deps.config.env);
  const detail = resultDetail(result, transport["key_id"]);

  if (result.outcome === "REPLAY_ACK" && active !== null) {
    await log(deps.pool, { operation: "STAGE", ...corr, outcome: "REPLAY_ACK", stage: result.stage, detail });
    return ackResponse(active.ackBytes, "REPLAY_ACK");
  }
  if (!result.accepted && STAGE_REFUSAL_STAGES.has(result.stage)) {
    await log(deps.pool, { operation: "STAGE", ...corr, outcome: result.outcome, error_codes: result.error_codes, stage: result.stage, detail });
    return refusal("STAGE", result);
  }
  // Arrêt à `media` ou au-delà (ou ACTIVATED à blanc) : le document a passé les étapes 1–7.
  const d = doc as JsonObject;
  const lastResult = JSON.stringify({ operation: "STAGE", at_utc: now, ...publicResult(result) });
  const inserted = await deps.pool.query(
    `INSERT INTO site_generation (publication_id, projection_id, scope_key, catalogue_sequence, payload_sha256,
       snapshot_bytes, snapshot_json, transport_json, status, last_result, staged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'STAGED', $9::jsonb, $10)
     ON CONFLICT (catalogue_sequence, payload_sha256) DO NOTHING
     RETURNING id`,
    [d["publication_id"], d["projection_id"], d["scope_key"], d["catalogue_sequence"], d["payload_sha256"], Buffer.from(bytes), JSON.stringify(d), JSON.stringify(transport), lastResult, now],
  );
  const idempotent = inserted.rows.length === 0;
  const row = await generationByKey(deps.pool, d["catalogue_sequence"] as number, d["payload_sha256"] as string, false);
  if (row === null) throw new Error("STAGE : ligne introuvable après insertion");
  await log(deps.pool, { operation: "STAGE", ...corr, outcome: idempotent ? "STAGED_IDEMPOTENT" : "STAGED", stage: result.stage, detail: { ...detail, generation_status: row.status } });
  return json(200, { accepted: true, outcome: "STAGED", operation: "STAGE", idempotent, generation: generationSummary(row) });
}

// --- MEDIA (STAGING_TRANSPORT) -----------------------------------------------------------------

export async function putMedia(deps: ReceiverDeps, sha256: string, bytes: Uint8Array, headers: HeaderSource, contentType: string | null): Promise<ReceiverResponse> {
  if (!isHex64(sha256)) return transportError(400, "MEDIA_PATH_INVALID", "MEDIA_PUT");
  const keyId = headers.get(HEADER_KEY_ID);
  const signature = headers.get(HEADER_SIGNATURE);
  const context = { sha256, size: bytes.length };
  const base: LogEntry = { operation: "MEDIA_PUT", publication_id: null, catalogue_sequence: null, payload_sha256: null, outcome: "" };
  const detail = { media_sha256: sha256, size: bytes.length, ...(isToken(keyId) ? { key_id: keyId } : {}) };
  if (!verify(deps.config.keyring, keyId, signature, SCOPE_PUBLISH, MEDIA_TRANSPORT_DOMAIN, context)) {
    await log(deps.pool, { ...base, outcome: "REJECTED", error_codes: ["SIGNATURE_INVALID"], detail });
    return json(401, { accepted: false, outcome: "REJECTED", operation: "MEDIA_PUT", error_codes: ["SIGNATURE_INVALID"] });
  }
  if (bytes.length < 1 || bytes.length > MAX_MEDIA_SIZE) {
    await log(deps.pool, { ...base, outcome: "TRANSPORT_ERROR", detail: { ...detail, transport_error: "MEDIA_SIZE_OUT_OF_RANGE" } });
    return transportError(413, "MEDIA_SIZE_OUT_OF_RANGE", "MEDIA_PUT");
  }
  if (sha256Hex(bytes) !== sha256) {
    await log(deps.pool, { ...base, outcome: "REJECTED", error_codes: ["MEDIA_HASH_MISMATCH"], detail });
    return json(422, { accepted: false, outcome: "REJECTED", operation: "MEDIA_PUT", error_codes: ["MEDIA_HASH_MISMATCH"] });
  }
  const mime = contentType !== null && ["image/png", "image/jpeg", "image/webp"].includes(contentType) ? contentType : null;
  const buffer = Buffer.from(bytes);
  const inserted = await deps.pool.query(
    "INSERT INTO site_media (sha256, mime, size, bytes) VALUES ($1, $2, $3, $4) ON CONFLICT (sha256) DO NOTHING RETURNING sha256",
    [sha256, mime, bytes.length, buffer],
  );
  let outcome = "STORED";
  if (inserted.rows.length === 0) {
    // Déjà présent : les octets vérifiés réparent une ligne altérée (adressage par contenu), sinon no-op.
    const repaired = await deps.pool.query(
      "UPDATE site_media SET bytes = $2, size = $3, received_at = now() WHERE sha256 = $1 AND bytes IS DISTINCT FROM $2 RETURNING sha256",
      [sha256, buffer, bytes.length],
    );
    outcome = repaired.rows.length === 1 ? "REPAIRED" : "ALREADY_STORED";
  }
  await log(deps.pool, { ...base, outcome, detail });
  return json(outcome === "STORED" ? 201 : 200, { accepted: true, outcome, operation: "MEDIA_PUT", sha256, size: bytes.length });
}

// --- VERIFY_MEDIA ------------------------------------------------------------------------------

export async function verifyMedia(deps: ReceiverDeps, body: Uint8Array, headers: HeaderSource): Promise<ReceiverResponse> {
  const control = parseControl(body);
  if (control === null) return transportError(400, "REQUEST_INVALID", "VERIFY_MEDIA");
  const row = await generationByKey(deps.pool, control.catalogue_sequence, control.payload_sha256, false);
  if (row === null || row.publication_id !== control.publication_id) return transportError(404, "GENERATION_NOT_STAGED", "VERIFY_MEDIA");
  const transport = transportFromHeaders(headers);
  const doc = tryParse(row.bytes, MAX_BYTES);
  const active = await loadActive(deps.pool, false);
  const store = await mediaStoreFor(deps.pool, doc);
  const now = (deps.now ?? serverNowUtc)();
  const result = applyEnvironment(evaluate(deps, row.bytes, transport, active, store, now), doc, deps.config.env);
  const detail = resultDetail(result, transport["key_id"]);
  const corr = corrOf(row);

  if (result.outcome === "REPLAY_ACK" && active !== null) {
    await log(deps.pool, { operation: "VERIFY_MEDIA", ...corr, outcome: "REPLAY_ACK", stage: result.stage, detail });
    return ackResponse(active.ackBytes, "REPLAY_ACK");
  }
  const lastResult = JSON.stringify({ operation: "VERIFY_MEDIA", at_utc: now, ...publicResult(result) });
  if (result.stage === "media") {
    await deps.pool.query("UPDATE site_generation SET status = 'STAGED', last_result = $2::jsonb WHERE id = $1 AND status IN ('STAGED','VERIFIED')", [row.id, lastResult]);
    await log(deps.pool, { operation: "VERIFY_MEDIA", ...corr, outcome: result.outcome, error_codes: result.error_codes, stage: result.stage, detail });
    return refusal("VERIFY_MEDIA", result);
  }
  if (!result.accepted && STAGE_REFUSAL_STAGES.has(result.stage)) {
    // Signature des en-têtes, séquence (ACTIVE déplacée depuis le STAGE) ou environnement : refus, état inchangé.
    await log(deps.pool, { operation: "VERIFY_MEDIA", ...corr, outcome: result.outcome, error_codes: result.error_codes, stage: result.stage, detail });
    return refusal("VERIFY_MEDIA", result);
  }
  // Étape `media` franchie : les octets de tous les media_refs sont présents et conformes.
  await deps.pool.query(
    "UPDATE site_generation SET status = 'VERIFIED', verified_at = $2, last_result = $3::jsonb WHERE id = $1 AND status = 'STAGED'",
    [row.id, now, lastResult],
  );
  const after = await generationByKey(deps.pool, row.catalogue_sequence, row.payload_sha256, false);
  await log(deps.pool, { operation: "VERIFY_MEDIA", ...corr, outcome: "MEDIA_VERIFIED", stage: result.stage, detail: { ...detail, generation_status: after?.status ?? null } });
  return json(200, { accepted: true, outcome: "MEDIA_VERIFIED", operation: "VERIFY_MEDIA", generation: generationSummary(after ?? row) });
}

// --- ACTIVATE ----------------------------------------------------------------------------------

export async function activate(deps: ReceiverDeps, body: Uint8Array, headers: HeaderSource): Promise<ReceiverResponse> {
  const control = parseControl(body);
  if (control === null) return transportError(400, "REQUEST_INVALID", "ACTIVATE");
  const transport = transportFromHeaders(headers);
  const corrRequest: Correlation = { ...control };
  const client = await deps.pool.connect();
  // Une connexion perdue pendant la transaction émet `error` sur le client : on la traite comme un abandon
  // (rollback côté serveur PostgreSQL), jamais comme une exception non capturée du processus.
  const onClientError = (): void => undefined;
  client.on("error", onClientError);
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    // 1. Verrou exclusif du pointeur, puis relecture de l'ACTIVE DANS le verrou.
    const active = await loadActive(client, true);
    const target = await generationByKey(client, control.catalogue_sequence, control.payload_sha256, true);
    if (target === null || target.publication_id !== control.publication_id) {
      await client.query("ROLLBACK");
      return transportError(404, "GENERATION_NOT_STAGED", "ACTIVATE");
    }
    const doc = tryParse(target.bytes, MAX_BYTES);
    const store = await mediaStoreFor(client, doc);
    // 2. Horloge serveur, politique receiver, appel complet de la fonction pure.
    const now = (deps.now ?? serverNowUtc)();
    const result = applyEnvironment(evaluate(deps, target.bytes, transport, active, store, now), doc, deps.config.env);
    const detail = resultDetail(result, transport["key_id"]);
    const corr = corrOf(target);
    const lastResult = JSON.stringify({ operation: "ACTIVATE", at_utc: now, ...publicResult(result) });

    if (result.outcome === "ACTIVATED") {
      const ackBytes = canonicalBytes(result.ack);
      if (active !== null) {
        await client.query("UPDATE site_generation SET status = 'SUPERSEDED' WHERE id = $1 AND status = 'ACTIVE'", [active.row.id]);
      }
      await client.query(
        `UPDATE site_generation SET status = 'ACTIVE', activated_at = $2, verified_at = COALESCE(verified_at, $2),
           ack_json = $3::jsonb, ack_bytes = $4, last_result = $5::jsonb WHERE id = $1`,
        [target.id, now, JSON.stringify(result.ack), Buffer.from(ackBytes), lastResult],
      );
      await client.query(
        "UPDATE site_active_pointer SET generation_id = $1, catalogue_sequence = $2, payload_sha256 = $3, activated_at = $4 WHERE singleton = 1",
        [target.id, target.catalogue_sequence, target.payload_sha256, now],
      );
      await log(client, {
        operation: "ACTIVATE", ...corr, outcome: "ACTIVATED", stage: result.stage,
        detail: { ...detail, superseded_sequence: active === null ? null : active.row.catalogue_sequence },
      });
      if (deps.hooks?.beforeCommit !== undefined) {
        const pid = await client.query("SELECT pg_backend_pid() AS pid");
        await deps.hooks.beforeCommit({ operation: "ACTIVATE", backendPid: pid.rows[0].pid as number });
      }
      await client.query("COMMIT");
      // 3. ACK renvoyé seulement APRÈS le COMMIT durable.
      return ackResponse(ackBytes, "ACTIVATED");
    }
    if (result.outcome === "REPLAY_ACK" && active !== null) {
      await log(client, { operation: "ACTIVATE", ...corr, outcome: "REPLAY_ACK", stage: result.stage, detail: { ...detail, second_effect: false } });
      await client.query("COMMIT");
      return ackResponse(active.ackBytes, "REPLAY_ACK");
    }
    if (result.outcome === "STAGE_HOLD") {
      await client.query(
        `UPDATE site_generation SET status = 'HOLD', last_result = $2::jsonb WHERE id = $1 AND status = ANY($3::text[])`,
        [target.id, lastResult, MUTABLE_STATUSES],
      );
    } else if (result.stage === "media") {
      await client.query("UPDATE site_generation SET status = 'STAGED', last_result = $2::jsonb WHERE id = $1 AND status = 'VERIFIED'", [target.id, lastResult]);
    } else if (result.stage !== "signature") {
      // Refus définitif à l'activation (séquence, identité, couverture, sûreté, environnement) : REJECTED consigné.
      // Une génération ACTIVE ou SUPERSEDED garde son statut (jamais de re-pointage).
      await client.query(
        `UPDATE site_generation SET status = 'REJECTED', last_result = $2::jsonb WHERE id = $1 AND status = ANY($3::text[])`,
        [target.id, lastResult, MUTABLE_STATUSES],
      );
    }
    await log(client, { operation: "ACTIVATE", ...corr, outcome: result.outcome, error_codes: result.error_codes, stage: result.stage, detail });
    await client.query("COMMIT");
    return refusal("ACTIVATE", result);
  } catch (error) {
    broken = true;
    await client.query("ROLLBACK").catch(() => undefined);
    const code = typeof (error as { code?: unknown }).code === "string" ? ((error as { code: string }).code) : "ERROR";
    await log(deps.pool, { operation: "ACTIVATE_ABORTED", ...corrRequest, outcome: "ROLLED_BACK", detail: { reason: code } }).catch(() => undefined);
    return transportError(503, "ACTIVATION_ABORTED", "ACTIVATE");
  } finally {
    client.removeListener("error", onClientError);
    client.release(broken);
  }
}

// --- STATUS ------------------------------------------------------------------------------------

const SEQUENCE_RE = /^[1-9][0-9]{0,15}$/;

export async function status(deps: ReceiverDeps, publicationId: string | null, sequenceText: string | null, headers: HeaderSource): Promise<ReceiverResponse> {
  if (!isToken(publicationId) || sequenceText === null || !SEQUENCE_RE.test(sequenceText) || !Number.isSafeInteger(Number(sequenceText))) {
    return transportError(400, "REQUEST_INVALID", "STATUS");
  }
  const keyId = headers.get(HEADER_KEY_ID);
  const signature = headers.get(HEADER_SIGNATURE);
  if (!keyHasScope(deps.config.keyring, keyId, SCOPE_PUBLISH)) {
    return json(401, { accepted: false, outcome: "REJECTED", operation: "STATUS", error_codes: ["SIGNATURE_INVALID"] });
  }
  const { rows } = await deps.pool.query(
    `SELECT ${GENERATION_COLUMNS} FROM site_generation WHERE publication_id = $1 AND catalogue_sequence = $2 ORDER BY id`,
    [publicationId, Number(sequenceText)],
  );
  if (rows.length === 0) return transportError(404, "GENERATION_NOT_STAGED", "STATUS");
  // Même signature que la publication (contexte C0 §7 de la génération stockée).
  const row = rows.map(toGeneration).find((g) => {
    const doc = tryParse(g.bytes, MAX_BYTES);
    return isObject(doc) && verify(deps.config.keyring, keyId, signature, SCOPE_PUBLISH, DOMAIN_SIG_SNAPSHOT, signatureContext(doc as unknown as Snapshot));
  });
  if (row === undefined) return json(401, { accepted: false, outcome: "REJECTED", operation: "STATUS", error_codes: ["SIGNATURE_INVALID"] });
  const pointer = await deps.pool.query("SELECT generation_id FROM site_active_pointer WHERE singleton = 1");
  const pointed = pointer.rows[0]?.generation_id;
  return json(200, {
    accepted: true,
    outcome: "STATUS",
    operation: "STATUS",
    generation: {
      ...generationSummary(row),
      is_active: pointed !== null && pointed !== undefined && toSafeInt(pointed) === row.id,
      staged_at_utc: row.staged_at,
      verified_at_utc: row.verified_at,
      activated_at_utc: row.activated_at,
      has_ack: row.ackBytes !== null,
      last_result: row.last_result,
    },
  });
}
