/**
 * Cercle 5, ligne 5.21 : la décision du site sur un document `site_commerce.v1` reçu (docs/site_commerce_v1.md §2, §3). PURE : elle lit les octets, l'état actif, le trousseau, et rend
 * le verdict et l'accusé signé ; la route écrit l'état dans UNE transaction et ne répond qu'après le COMMIT.
 * Séquence : plus ancienne que celle servie → `STALE_SEQUENCE` ; la même avec la même empreinte → rejeu (même accusé) ; la même avec une autre empreinte → `SEQUENCE_COLLISION`.
 */
import { SCOPE_ACK, sign, verify } from "../../c0/ts/src/signing";
import type { Json, JsonObject } from "../../c0/ts/src/jsonc";
import { CONTRACT_VERSION, validateCommerce, type CommerceDocument } from "./document";

/** Domaine de la signature de l'accusé : celui du réglage de vente, jamais celui du contenu. */
export const DOMAIN_ACK = "prodes.site.transport.commerce_ack.v1";
const ACK_KEYS = ["contract_version", "commerce_sequence", "payload_sha256", "activated_at_utc"] as const;

export type ActiveCommerce = { document: CommerceDocument; ack: JsonObject };

export type CommerceDecision =
  | { outcome: "ACTIVATED"; document: CommerceDocument; ack: JsonObject }
  | { outcome: "REPLAY_ACK"; ack: JsonObject }
  | { outcome: "REJECTED"; error_codes: string[]; rules: string[] };

function ackContext(document: CommerceDocument, activatedAtUtc: string): JsonObject {
  return { contract_version: CONTRACT_VERSION, commerce_sequence: document.commerce_sequence, payload_sha256: document.payload_sha256, activated_at_utc: activatedAtUtc };
}

export function buildAck(document: CommerceDocument, activatedAtUtc: string, keyring: Json, ackKeyId: string): JsonObject {
  const context = ackContext(document, activatedAtUtc);
  return { ...context, signature: sign(keyring, ackKeyId, SCOPE_ACK, DOMAIN_ACK, context) };
}

/** L'accusé relu : forme exacte et signature de la clé d'accusé du site (la Factory fait la même vérification avant d'afficher « reçus par le site »). */
export function verifyAck(ack: Json, keyring: Json, ackKeyId: string, document: CommerceDocument): boolean {
  if (typeof ack !== "object" || ack === null || Array.isArray(ack)) return false;
  const keys = Object.keys(ack);
  if (keys.length !== ACK_KEYS.length + 1 || ![...ACK_KEYS, "signature"].every((k) => keys.includes(k))) return false;
  const context: JsonObject = {};
  for (const key of ACK_KEYS) context[key] = (ack as JsonObject)[key] as Json;
  return context["contract_version"] === CONTRACT_VERSION && context["commerce_sequence"] === document.commerce_sequence && context["payload_sha256"] === document.payload_sha256
    && verify(keyring, ackKeyId, (ack as JsonObject)["signature"], SCOPE_ACK, DOMAIN_ACK, context);
}

export function decideCommerce(bytes: Uint8Array, active: ActiveCommerce | null, nowUtc: string, keyring: Json, ackKeyId: string): CommerceDecision {
  const verdict = validateCommerce(bytes);
  if (!verdict.accepted) return { outcome: "REJECTED", error_codes: verdict.error_codes, rules: verdict.rules };
  const document = verdict.document;
  if (active !== null) {
    const previous = active.document;
    if (document.commerce_sequence < previous.commerce_sequence) return { outcome: "REJECTED", error_codes: ["STALE_SEQUENCE"], rules: [] };
    if (document.commerce_sequence === previous.commerce_sequence) {
      return document.payload_sha256 === previous.payload_sha256 ? { outcome: "REPLAY_ACK", ack: active.ack } : { outcome: "REJECTED", error_codes: ["SEQUENCE_COLLISION"], rules: [] };
    }
  }
  return { outcome: "ACTIVATED", document, ack: buildAck(document, nowUtc, keyring, ackKeyId) };
}
