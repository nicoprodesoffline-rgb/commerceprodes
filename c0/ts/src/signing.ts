// HMAC-SHA256 signatures over domain-separated canonical contexts (contract §7). Twin of signing.py.

import { createHmac, timingSafeEqual } from "node:crypto";
import { exactKeys, isHex64, isToken } from "./formats";
import { Json, JsonObject, canonicalBytes, concat, isObject, utf8 } from "./jsonc";

export const SCOPE_PUBLISH = "site_snapshot.publish";
export const SCOPE_ACK = "activation_ack";
export const SCOPE_EVENTS_READ = "site_events.read";
export const MIN_SECRET_BYTES = 32;
const KEY_ENTRY_KEYS = ["key_id", "scope", "status", "secret_utf8"];
const SCOPES = [SCOPE_PUBLISH, SCOPE_ACK, SCOPE_EVENTS_READ];
const KEY_STATUSES = ["ACTIVE", "VERIFY_ONLY", "RETIRED"];
export const DOMAIN_SIG_SNAPSHOT = "prodes.c0.sig.site_snapshot.v1";
export const DOMAIN_SIG_ACK = "prodes.c0.sig.activation_ack.v1";

function entryOk(entry: JsonObject): boolean {
  return (
    exactKeys(entry, KEY_ENTRY_KEYS) &&
    isToken(entry["key_id"]) &&
    typeof entry["scope"] === "string" && SCOPES.includes(entry["scope"]) &&
    typeof entry["status"] === "string" && KEY_STATUSES.includes(entry["status"]) &&
    typeof entry["secret_utf8"] === "string" && utf8(entry["secret_utf8"]).length >= MIN_SECRET_BYTES
  );
}

/** Diagnostic for detail.rules: key_id_duplicate when the key_id appears more than once. */
export function keyProblem(keyring: Json, keyId: unknown): string | null {
  if (!isObject(keyring) || !Array.isArray(keyring["keys"]) || typeof keyId !== "string") return null;
  const count = keyring["keys"].filter((entry) => isObject(entry) && entry["key_id"] === keyId).length;
  return count > 1 ? "key_id_duplicate" : null;
}

/** The single valid entry named keyId, or null (unknown, duplicated or malformed) - review R-02. */
export function findKey(keyring: Json, keyId: unknown): JsonObject | null {
  if (!isObject(keyring) || !Array.isArray(keyring["keys"]) || typeof keyId !== "string") return null;
  const matches = keyring["keys"].filter((entry): entry is JsonObject => isObject(entry) && entry["key_id"] === keyId);
  if (matches.length !== 1 || !entryOk(matches[0] as JsonObject)) return null;
  return matches[0] as JsonObject;
}

function mac(secret: string, domain: string, context: unknown): string {
  return createHmac("sha256", utf8(secret)).update(concat(utf8(domain), new Uint8Array([0]), canonicalBytes(context))).digest("hex");
}

export function sign(keyring: Json, keyId: string, scope: string, domain: string, context: unknown): string {
  const entry = findKey(keyring, keyId);
  if (entry === null || entry["scope"] !== scope || entry["status"] !== "ACTIVE") throw new Error("this key cannot sign for this scope");
  return mac(entry["secret_utf8"] as string, domain, context);
}

export function verify(keyring: Json, keyId: unknown, signature: unknown, scope: string, domain: string, context: unknown): boolean {
  const entry = findKey(keyring, keyId);
  if (entry === null || entry["scope"] !== scope || (entry["status"] !== "ACTIVE" && entry["status"] !== "VERIFY_ONLY")) return false;
  if (!isHex64(signature)) return false;
  const expected = mac(entry["secret_utf8"] as string, domain, context);
  return timingSafeEqual(utf8(expected), utf8(signature));
}

export function keyHasScope(keyring: Json, keyId: unknown, scope: string): boolean {
  const entry = findKey(keyring, keyId);
  return entry !== null && entry["scope"] === scope && (entry["status"] === "ACTIVE" || entry["status"] === "VERIFY_ONLY");
}
