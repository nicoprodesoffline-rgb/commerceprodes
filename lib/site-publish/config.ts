/**
 * Configuration du receiver SITE (BC2). Toute configuration invalide = erreur explicite :
 * le receiver refuse alors chaque opération (HTTP 503 `RECEIVER_CONFIG_INVALID`), il n'active rien.
 *
 *   SITE_ENV                     staging | production (obligatoire)
 *   SITE_KEYRING_PATH            chemin du trousseau C0 (obligatoire, aucune valeur par défaut ;
 *                                tests : c0/fixtures/keys/test_keyring.json, secrets TEST_SECRET_NOT_FOR_PRODUCTION)
 *   SITE_ACK_KEY_ID              clé de scope activation_ack, statut ACTIVE (ex. c0-test-ack-01)
 *   SITE_WITHDRAWAL_HOLD_POLICY  JSON {max_withdrawals_without_release, released_expected_withdrawals_digest}
 *                                max = null (aucun seuil) admis SEULEMENT si SITE_ENV=staging (C0 §8.4, R-11, DF-0090)
 *
 * Aucun seuil n'est choisi ici : la valeur vient de la configuration (décision propriétaire, C0 §16.4).
 */
import { readFileSync } from "node:fs";
import { exactKeys, isCount, isHex64, isToken } from "../../c0/ts/src/formats";
import { isObject, parseBytes, utf8, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { SCOPE_ACK, findKey } from "../../c0/ts/src/signing";

export type SiteEnv = "staging" | "production";

export interface ReceiverConfig {
  env: SiteEnv;
  keyring: Json;
  ackKeyId: string;
  /** Politique passée telle quelle à evaluatePublication. */
  policy: JsonObject;
}

export class ReceiverConfigError extends Error {
  readonly code = "RECEIVER_CONFIG_INVALID";
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const POLICY_KEYS = ["max_withdrawals_without_release", "released_expected_withdrawals_digest"];

function fail(message: string): never {
  throw new ReceiverConfigError(message);
}

export function parsePolicy(raw: string | undefined, env: SiteEnv): JsonObject {
  if (raw === undefined || raw === "") fail("SITE_WITHDRAWAL_HOLD_POLICY absente (C0 §15 : absente = erreur de configuration)");
  let value: Json;
  try {
    value = parseBytes(utf8(raw), MAX_CONFIG_BYTES);
  } catch {
    fail("SITE_WITHDRAWAL_HOLD_POLICY n'est pas un JSON strict");
  }
  if (!exactKeys(value, POLICY_KEYS)) fail("SITE_WITHDRAWAL_HOLD_POLICY : clés attendues max_withdrawals_without_release, released_expected_withdrawals_digest");
  const limit = value["max_withdrawals_without_release"];
  const released = value["released_expected_withdrawals_digest"];
  if (!(limit === null || isCount(limit))) fail("SITE_WITHDRAWAL_HOLD_POLICY.max_withdrawals_without_release : entier >= 0 ou null");
  if (!(released === null || isHex64(released))) fail("SITE_WITHDRAWAL_HOLD_POLICY.released_expected_withdrawals_digest : sha256 hex ou null");
  if (limit === null && env !== "staging") {
    fail("max_withdrawals_without_release=null n'est admis qu'en staging (C0 §8.4 R-11) : configurer un entier en production");
  }
  return value;
}

export function loadReceiverConfig(env: Record<string, string | undefined> = process.env): ReceiverConfig {
  const siteEnv = env["SITE_ENV"];
  if (siteEnv !== "staging" && siteEnv !== "production") fail("SITE_ENV doit valoir staging ou production");
  const keyringPath = env["SITE_KEYRING_PATH"];
  if (keyringPath === undefined || keyringPath === "") fail("SITE_KEYRING_PATH absente (aucune valeur par défaut)");
  let keyring: Json;
  try {
    keyring = parseBytes(readFileSync(keyringPath), MAX_CONFIG_BYTES);
  } catch {
    fail("SITE_KEYRING_PATH illisible ou JSON invalide");
  }
  if (!isObject(keyring) || !Array.isArray(keyring["keys"])) fail("trousseau sans liste keys");
  const ackKeyId = env["SITE_ACK_KEY_ID"];
  if (!isToken(ackKeyId)) fail("SITE_ACK_KEY_ID absente ou mal formée");
  const ackKey = findKey(keyring, ackKeyId);
  if (ackKey === null || ackKey["scope"] !== SCOPE_ACK || ackKey["status"] !== "ACTIVE") {
    fail("SITE_ACK_KEY_ID ne désigne pas une clé valide de scope activation_ack et de statut ACTIVE");
  }
  const policy = parsePolicy(env["SITE_WITHDRAWAL_HOLD_POLICY"], siteEnv);
  return { env: siteEnv, keyring, ackKeyId, policy };
}
