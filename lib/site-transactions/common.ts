/**
 * Outils communs BC4 (transactions SITE) : identifiants opaques, jetons d'accès, statut HTTP indicatif C0 §13,
 * réponses JSON, journal sans PII. Aucune règle métier : les décisions viennent du C0 vendu.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const PERSISTENCE = "POSTGRESQL_SITE_LOCAL" as const;

/** Réponse transport (corps = octets exacts). */
export interface TxResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export function json(status: number, value: unknown): TxResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

/**
 * Référence opaque non prévisible (C0 §6 jeton opaque, §10.5 : aucune fuite sur une référence prévisible).
 * 128 bits aléatoires en hexadécimal : `ORD-…`, `QR-…`, `EVT-…`, `CUR-…` (≤ 64 caractères).
 */
export function opaqueRef(prefix: "ORD" | "QR" | "EVT" | "CUR"): string {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

/** Jeton d'accès au reçu : 256 bits, base64url. Renvoyé UNE fois, stocké haché (SHA-256 hex de l'UTF-8). */
export function newAccessToken(): { token: string; sha256: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, sha256: createHash("sha256").update(token, "utf8").digest("hex") };
}

/** HTTP indicatif C0 §13 (mêmes valeurs que lib/site-business/validate.ts pour les codes communs). */
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
  DB_WRITE_FAILED: 503,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CURSOR_INVALID: 400,
  EVENT_UNAUTHORIZED: 401,
};

export function httpStatusFor(codes: readonly string[]): number {
  const statuses = new Set(codes.map((c) => HTTP_BY_CODE[c] ?? 422));
  return statuses.size === 1 ? [...statuses][0]! : 409;
}

export type LogOperation = "QUOTE" | "ORDER" | "RECEIPT" | "EVENTS_POLL" | "EVENTS_ACK";

export interface LogEntry {
  operation: LogOperation;
  outcome: string;
  error_codes?: readonly string[];
  object_ref?: string | null;
  detail?: Record<string, unknown>;
}

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/**
 * Journal append-only `site_transaction_log`, HORS transaction métier, au mieux : un échec d'écriture du journal
 * ne change jamais la réponse (la vérité est l'objet commité, pas le journal). Jamais de PII ni de secret ici.
 */
export async function appendLog(pool: Pool, entry: LogEntry): Promise<void> {
  try {
    const ref = typeof entry.object_ref === "string" && REF_RE.test(entry.object_ref) ? entry.object_ref : null;
    await pool.query(
      "INSERT INTO site_transaction_log (operation, outcome, error_codes, object_ref, detail) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)",
      [entry.operation, entry.outcome, JSON.stringify([...(entry.error_codes ?? [])].sort()), ref, JSON.stringify(entry.detail ?? {})],
    );
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-transactions] journal non écrit code=${code}`);
  }
}

/** Code d'erreur PostgreSQL (SQLSTATE) ou classe générique, pour le journal et `detail.reason` (jamais le message). */
export function errorReason(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) return code;
  return "INTERNAL";
}

/**
 * Emprunte une connexion avec un écouteur `error` actif pendant l'emprunt : une connexion coupée pendant la
 * transaction (redémarrage, `pg_terminate_backend`) ne doit jamais devenir une exception non capturée qui arrêterait
 * le processus. `release(failed)` détruit la connexion en erreur au lieu de la rendre au pool.
 */
export async function checkout(pool: Pool): Promise<{ client: PoolClient; release: (failed: boolean) => void }> {
  const client = await pool.connect();
  let lost = false;
  const onError = (error: unknown): void => {
    lost = true;
    console.error(`[site-transactions] connexion perdue pendant l'emprunt code=${errorReason(error)}`);
  };
  client.on("error", onError);
  return {
    client,
    release: (failed: boolean) => {
      client.removeListener("error", onError);
      client.release(failed || lost ? true : undefined);
    },
  };
}
