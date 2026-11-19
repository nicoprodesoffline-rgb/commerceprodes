/**
 * Cercle 5 (docs/site_events_v2.md §5) : le trousseau des routes de la Factory vers le site, HORS C0. La liste des portées du C0 est fermée
 * et le C0 est gelé : ces routes ont leur propre trousseau (un fichier dont le chemin est `SITE_REQUESTS_KEYRING_PATH`, jamais dans Git) et
 * leur propre signature, une portée par route. Une clé de lecture des événements ne peut ni effacer, ni déposer, ni mettre de côté.
 *
 * Entrée : `{key_id, scope, status, secret_utf8}` (même forme que le C0), secret d'au moins 32 octets ; statut ACTIVE, VERIFY_ONLY ou RETIRED.
 * Signature de la requête : `x-c0-request-signature` = hex(HMAC-SHA256(secret, utf8(DOMAINE) 0x00 canonical({method, path, body_sha256,
 * issued_at_utc, nonce}))), avec le domaine propre à la route. Jumeau Python : `integrations/site_requests_client.py` (Factory).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { exactKeys, isHex64, isToken } from "../../c0/ts/src/formats";
import { canonicalBytes, concat, parseBytes, utf8, type Json, type JsonObject } from "../../c0/ts/src/jsonc";

export const SCOPE_ERASE = "site_requests.erase";
export const SCOPE_DOCUMENTS = "site_requests.documents";
export const SCOPE_SET_ASIDE = "site_events.set_aside";
export const SCOPE_MAIL_STATUS = "site_requests.mail_status";
export const ROUTE_SCOPES = [SCOPE_ERASE, SCOPE_DOCUMENTS, SCOPE_SET_ASIDE, SCOPE_MAIL_STATUS] as const;
export type RouteScope = (typeof ROUTE_SCOPES)[number];

/** Domaine de signature de chaque portée (contrat §5). */
export const ROUTE_DOMAINS: Record<RouteScope, string> = {
  [SCOPE_ERASE]: "prodes.site.transport.requests_erase.v1",
  [SCOPE_DOCUMENTS]: "prodes.site.transport.requests_document.v1",
  [SCOPE_SET_ASIDE]: "prodes.site.transport.events_set_aside.v1",
  [SCOPE_MAIL_STATUS]: "prodes.site.transport.requests_mail_status.v1",
};

export const KEYRING_ENV = "SITE_REQUESTS_KEYRING_PATH";
export const MIN_SECRET_BYTES = 32;
const MAX_KEYRING_BYTES = 1 << 20;
const ENTRY_KEYS = ["key_id", "scope", "status", "secret_utf8"];
const STATUSES = ["ACTIVE", "VERIFY_ONLY", "RETIRED"];

export class RequestsKeyringError extends Error {
  readonly code = "REQUESTS_KEYRING_INVALID";
}

export type RouteKeyring = { keys: JsonObject[] };

function entryOk(entry: Json): entry is JsonObject {
  return exactKeys(entry, ENTRY_KEYS) && isToken(entry["key_id"])
    && typeof entry["scope"] === "string" && (ROUTE_SCOPES as readonly string[]).includes(entry["scope"])
    && typeof entry["status"] === "string" && STATUSES.includes(entry["status"])
    && typeof entry["secret_utf8"] === "string" && utf8(entry["secret_utf8"]).length >= MIN_SECRET_BYTES;
}

/** Le trousseau lu tel quel : `{keys:[entrées]}`, chaque entrée bien formée, chaque `key_id` unique ; sinon une erreur de configuration. */
export function parseRouteKeyring(bytes: Uint8Array): RouteKeyring {
  let doc: Json;
  try {
    doc = parseBytes(bytes, MAX_KEYRING_BYTES);
  } catch {
    throw new RequestsKeyringError("trousseau des routes illisible");
  }
  if (!exactKeys(doc, ["keys"]) || !Array.isArray(doc["keys"]) || !doc["keys"].every(entryOk)) throw new RequestsKeyringError("trousseau des routes mal formé");
  const keys = doc["keys"] as JsonObject[];
  if (new Set(keys.map((k) => k["key_id"])).size !== keys.length) throw new RequestsKeyringError("key_id en double dans le trousseau des routes");
  return { keys };
}

/** Le trousseau du serveur, relu à chaque requête (une rotation ne demande pas de redémarrage). Absent : erreur de configuration (503). */
export function loadRouteKeyring(env: Record<string, string | undefined> = process.env): RouteKeyring {
  const file = env["SITE_REQUESTS_KEYRING_PATH"];
  if (file === undefined || file === "") throw new RequestsKeyringError(`${KEYRING_ENV} n'est pas réglé`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(file));
  } catch {
    throw new RequestsKeyringError("trousseau des routes introuvable");
  }
  return parseRouteKeyring(bytes);
}

function mac(secret: string, domain: string, context: unknown): string {
  return createHmac("sha256", utf8(secret)).update(concat(utf8(domain), new Uint8Array([0]), canonicalBytes(context))).digest("hex");
}

function entryFor(keyring: RouteKeyring, keyId: unknown): JsonObject | null {
  if (typeof keyId !== "string") return null;
  return keyring.keys.find((k) => k["key_id"] === keyId) ?? null;
}

/** La clé peut-elle vérifier une requête de cette portée (ACTIVE ou VERIFY_ONLY) ? */
export function keyCanVerify(keyring: RouteKeyring, keyId: unknown, scope: RouteScope): boolean {
  const entry = entryFor(keyring, keyId);
  return entry !== null && entry["scope"] === scope && (entry["status"] === "ACTIVE" || entry["status"] === "VERIFY_ONLY");
}

export function verifyRoute(keyring: RouteKeyring, keyId: unknown, signature: unknown, scope: RouteScope, context: unknown): boolean {
  const entry = entryFor(keyring, keyId);
  if (entry === null || !keyCanVerify(keyring, keyId, scope) || !isHex64(signature)) return false;
  return timingSafeEqual(utf8(mac(entry["secret_utf8"] as string, ROUTE_DOMAINS[scope], context)), utf8(signature));
}

/** Signe une requête (côté Factory, et pour les tests) : seule une clé ACTIVE de la portée signe. */
export function signRoute(keyring: RouteKeyring, keyId: string, scope: RouteScope, context: unknown): string {
  const entry = entryFor(keyring, keyId);
  if (entry === null || entry["scope"] !== scope || entry["status"] !== "ACTIVE") throw new Error("cette clé ne signe pas pour cette portée");
  return mac(entry["secret_utf8"] as string, ROUTE_DOMAINS[scope], context);
}
