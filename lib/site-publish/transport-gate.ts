/**
 * Cercle 4, lot T (4.4, 4.5) : anti-rejeu daté des requêtes de la Factory et signature des réponses du SITE.
 * Règles : docs/contracts/c0_transport_v1.md §3 et §5 (hors contrat C0 : `x-c0-key-id` / `x-c0-signature` inchangés).
 *
 * Chaque requête signée porte `x-c0-issued-at`, `x-c0-nonce` et `x-c0-request-signature` =
 *   hex(HMAC-SHA256(secret de x-c0-key-id, "prodes.c0.transport.request.v1" 0x00 canonical({method, path, body_sha256, issued_at_utc, nonce}))).
 * Contrôles, dans cet ordre : clé connue (ACTIVE ou VERIFY_ONLY) -> `KEY_UNKNOWN` ; en-têtes présents -> `REQUEST_UNDATED` ;
 * signature -> `REQUEST_SIGNATURE_INVALID` ; |horloge − issued_at| ≤ 300 s -> `REQUEST_STALE` ; nonce jamais vu pour cette clé
 * (table `site_request_nonce`, migration 021, gardée une heure : survit à un redémarrage) -> `REQUEST_REPLAYED`. Tout refus
 * est un 401 qui porte `server_time_utc`.
 *
 * Toute réponse à une requête qui porte un nonce est signée par la clé d'accusé du SITE (`SITE_ACK_KEY_ID`) :
 * `x-c0-response-key-id`, `x-c0-response-signature` = HMAC("prodes.c0.transport.response.v1", {request_nonce, http_status, body_sha256}).
 */
import { createHash } from "node:crypto";
import { findKey, sign, verify, SCOPE_ACK } from "../../c0/ts/src/signing";
import type { Json } from "../../c0/ts/src/jsonc";

export const REQUEST_DOMAIN = "prodes.c0.transport.request.v1";
export const RESPONSE_DOMAIN = "prodes.c0.transport.response.v1";
export const WINDOW_SECONDS = 300;
/** Les nonces sont gardés au moins une heure (au-delà de la fenêtre, quelle que soit la dérive). */
export const NONCE_RETENTION_SECONDS = 3600;
export const HEADER_ISSUED_AT = "x-c0-issued-at";
export const HEADER_NONCE = "x-c0-nonce";
export const HEADER_REQUEST_SIGNATURE = "x-c0-request-signature";
export const HEADER_RESPONSE_KEY_ID = "x-c0-response-key-id";
export const HEADER_RESPONSE_SIGNATURE = "x-c0-response-signature";

const ISSUED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const NONCE_RE = /^[0-9a-f]{32}$/;

export type DatedRefusal = "KEY_UNKNOWN" | "REQUEST_UNDATED" | "REQUEST_SIGNATURE_INVALID" | "REQUEST_STALE" | "REQUEST_REPLAYED";

export interface Headerish {
  get(name: string): string | null;
}

export interface NonceStore {
  query(text: string, values: unknown[]): Promise<{ rowCount: number | null }>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function instant(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Clé connue du trousseau et utilisable pour vérifier (ACTIVE ou VERIFY_ONLY) : sinon le SITE ne la connaît pas (L10). */
export function keyKnown(keyring: Json, keyId: string | null): boolean {
  const entry = findKey(keyring, keyId);
  return entry !== null && (entry["status"] === "ACTIVE" || entry["status"] === "VERIFY_ONLY");
}

/** Le contrôle daté d'une requête dont le corps est lu ; `null` = accepté (et son nonce est retenu). */
export async function checkDated(
  keyring: Json,
  store: NonceStore,
  headers: Headerish,
  method: string,
  path: string,
  body: Uint8Array,
  now: Date = new Date(),
  { remember = true, domain = REQUEST_DOMAIN }: { remember?: boolean; domain?: string } = {},
): Promise<DatedRefusal | null> {
  const keyId = headers.get("x-c0-key-id");
  if (!keyKnown(keyring, keyId)) return "KEY_UNKNOWN";
  const issuedAt = headers.get(HEADER_ISSUED_AT);
  const nonce = headers.get(HEADER_NONCE);
  const signature = headers.get(HEADER_REQUEST_SIGNATURE);
  if (issuedAt === null || nonce === null || signature === null || !ISSUED_AT_RE.test(issuedAt) || !NONCE_RE.test(nonce) || Number.isNaN(Date.parse(issuedAt))) {
    return "REQUEST_UNDATED";
  }
  const scope = findKey(keyring, keyId)?.["scope"] as string;
  const context = { method, path, body_sha256: sha256Hex(body), issued_at_utc: issuedAt, nonce };
  if (!verify(keyring, keyId, signature, scope, domain, context)) return "REQUEST_SIGNATURE_INVALID";
  if (Math.abs(now.getTime() - Date.parse(issuedAt)) > WINDOW_SECONDS * 1000) return "REQUEST_STALE";
  if (!remember) return null;
  // Insertion atomique : de deux requêtes concurrentes au même nonce, une seule passe. Les nonces anciens partent au passage.
  await store.query("DELETE FROM site_request_nonce WHERE issued_at < $1", [new Date(now.getTime() - NONCE_RETENTION_SECONDS * 1000).toISOString()]);
  const seen = await store.query(
    "INSERT INTO site_request_nonce (credential_key_id, nonce, issued_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING nonce",
    [keyId, nonce, issuedAt],
  );
  return seen.rowCount === 1 ? null : "REQUEST_REPLAYED";
}

/** Le chemin signé : chemin et requête tels que reçus. */
export function signedPath(request: Request): string {
  const url = new URL(request.url);
  return url.pathname + url.search;
}

export function refusal(code: DatedRefusal, operation: string, now: Date = new Date()): Response {
  const body = { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: code, error_codes: [] as string[], server_time_utc: instant(now) };
  return new Response(JSON.stringify(body), { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** Signe une réponse du SITE (4.5) quand la requête portait un nonce bien formé ; sinon la rend telle quelle. */
export async function signResponse(keyring: Json, ackKeyId: string, requestHeaders: Headerish, response: Response): Promise<Response> {
  const nonce = requestHeaders.get(HEADER_NONCE);
  if (nonce === null || !NONCE_RE.test(nonce)) return response;
  const ack = findKey(keyring, ackKeyId);
  if (ack === null || ack["scope"] !== SCOPE_ACK || ack["status"] !== "ACTIVE") return response;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = sign(keyring, ackKeyId, SCOPE_ACK, RESPONSE_DOMAIN, { request_nonce: nonce, http_status: response.status, body_sha256: sha256Hex(bytes) });
  const headers = new Headers(response.headers);
  headers.set(HEADER_RESPONSE_KEY_ID, ackKeyId);
  headers.set(HEADER_RESPONSE_SIGNATURE, signature);
  return new Response(bytes, { status: response.status, headers });
}
