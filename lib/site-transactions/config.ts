/**
 * Configuration BC4, relue à chaque requête. Invalide = erreur explicite (HTTP 503), jamais une valeur par défaut.
 *
 *   SITE_BUSINESS_PERSISTENCE  absent → routes devis/commande A2 inchangées (`NONE_UNTIL_BC4`, jamais durables) ;
 *                              `postgresql` → transactions BC4 durables sur SITE_DATABASE_URL ; autre valeur → 503.
 *   SITE_DATABASE_URL          base `prodes_site*` (lib/site-db/pool.ts, BC2).
 *   SITE_KEYRING_PATH          trousseau C0 pour poll/ACK (tests : c0/fixtures/keys/test_keyring.json).
 */
import { readFileSync } from "node:fs";
import { isObject, parseBytes, type Json } from "../../c0/ts/src/jsonc";

export class TransactionsConfigError extends Error {
  readonly code = "TRANSACTIONS_CONFIG_INVALID";
}

export type BusinessMode = "none_until_bc4" | "postgresql";

export function businessMode(env: Record<string, string | undefined> = process.env): BusinessMode {
  const raw = env["SITE_BUSINESS_PERSISTENCE"];
  if (raw === undefined || raw === "") return "none_until_bc4";
  if (raw === "postgresql") return "postgresql";
  throw new TransactionsConfigError(`SITE_BUSINESS_PERSISTENCE doit être absente ou valoir « postgresql » (reçu : ${JSON.stringify(raw)})`);
}

export function loadEventsKeyring(env: Record<string, string | undefined> = process.env): Json {
  const path = env["SITE_KEYRING_PATH"];
  if (path === undefined || path === "") throw new TransactionsConfigError("SITE_KEYRING_PATH absente (aucune valeur par défaut)");
  let keyring: Json;
  try {
    keyring = parseBytes(readFileSync(path), 1024 * 1024);
  } catch {
    throw new TransactionsConfigError("SITE_KEYRING_PATH illisible ou JSON invalide");
  }
  if (!isObject(keyring) || !Array.isArray(keyring["keys"])) throw new TransactionsConfigError("trousseau sans liste keys");
  return keyring;
}
