/**
 * Cercle 5 (docs/site_events_v2.md §5) : la porte des routes de la Factory vers le site. Contrôles, dans cet ordre :
 *   HTTPS hors boucle locale -> 403 `HTTPS_REQUIRED` ;
 *   clé du trousseau des routes, de CETTE portée, ACTIVE ou VERIFY_ONLY ; en-têtes datés bien formés ; signature sur
 *   {method, path, body_sha256, issued_at_utc, nonce} avec le domaine de la route ; |horloge − issued_at| ≤ 300 s ; nonce jamais vu pour
 *   cette clé (table `site_request_nonce`, celle du cercle 4) -> tout refus est un 401 `SIGNATURE_INVALID`, le détail ne sort pas.
 * Le journal garde la raison interne et l'identifiant de clé, jamais le corps (P05).
 */
import { HEADER_ISSUED_AT, HEADER_NONCE, HEADER_REQUEST_SIGNATURE, NONCE_RETENTION_SECONDS, WINDOW_SECONDS, sha256Hex, type Headerish, type NonceStore } from "../site-publish/transport-gate";
import { keyCanVerify, verifyRoute, type RouteKeyring, type RouteScope } from "./keyring";

const ISSUED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const LOOPBACK = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export type GateRefusal = "KEY_OUT_OF_SCOPE" | "REQUEST_UNDATED" | "SIGNATURE_WRONG" | "REQUEST_STALE" | "REQUEST_REPLAYED";

/** HTTPS vu par le site (directement ou annoncé par le frontal), ou boucle locale. */
export function transportSecure(url: string, headers: Headerish): boolean {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") return true;
  if (headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  return LOOPBACK.has(parsed.hostname);
}

/** `null` = la requête est acceptée et son nonce retenu ; sinon la raison interne du refus. */
export async function checkRouteRequest(
  keyring: RouteKeyring,
  store: NonceStore,
  headers: Headerish,
  scope: RouteScope,
  method: string,
  path: string,
  body: Uint8Array,
  now: Date,
): Promise<GateRefusal | null> {
  const keyId = headers.get("x-c0-key-id");
  if (!keyCanVerify(keyring, keyId, scope)) return "KEY_OUT_OF_SCOPE";
  const issuedAt = headers.get(HEADER_ISSUED_AT);
  const nonce = headers.get(HEADER_NONCE);
  const signature = headers.get(HEADER_REQUEST_SIGNATURE);
  if (issuedAt === null || nonce === null || signature === null || !ISSUED_AT_RE.test(issuedAt) || !NONCE_RE.test(nonce) || Number.isNaN(Date.parse(issuedAt))) {
    return "REQUEST_UNDATED";
  }
  const context = { method, path, body_sha256: sha256Hex(body), issued_at_utc: issuedAt, nonce };
  if (!verifyRoute(keyring, keyId, signature, scope, context)) return "SIGNATURE_WRONG";
  if (Math.abs(now.getTime() - Date.parse(issuedAt)) > WINDOW_SECONDS * 1000) return "REQUEST_STALE";
  await store.query("DELETE FROM site_request_nonce WHERE issued_at < $1", [new Date(now.getTime() - NONCE_RETENTION_SECONDS * 1000).toISOString()]);
  const seen = await store.query(
    "INSERT INTO site_request_nonce (credential_key_id, nonce, issued_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING nonce",
    [keyId, nonce, issuedAt],
  );
  return seen.rowCount === 1 ? null : "REQUEST_REPLAYED";
}
