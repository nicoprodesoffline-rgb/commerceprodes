/**
 * Cercle 5, ligne 5.21 : la réception des réglages de vente. UNE transaction : verrou, lecture de l'état actif, décision (`decideCommerce`), écriture, journal, COMMIT ;
 * l'accusé signé n'est renvoyé qu'APRÈS le COMMIT. Un refus laisse servis les réglages précédents. Même modèle que les contenus v2 (lib/site-publish/content.ts).
 */
import type { Json } from "../../c0/ts/src/jsonc";
import { canonicalBytes, utf8 } from "../../c0/ts/src/jsonc";
import { isHex64 } from "../../c0/ts/src/formats";
import { serverNowUtc, type ReceiverDeps, type ReceiverResponse } from "../site-publish/receiver";
import { decideCommerce } from "./activation";
import { readActiveCommerce } from "./store";

/** Domaine de signature de la requête pour cette route seulement : il remplace `prodes.c0.transport.request.v1` (docs/site_commerce_v1.md §3). */
export const COMMERCE_REQUEST_DOMAIN = "prodes.site.transport.commerce_activate.v1";
const COMMERCE_LOCK_KEY = 7420202;   // verrou consultatif : une activation à la fois

const json = (status: number, value: unknown, extra: Record<string, string> = {}): ReceiverResponse =>
  ({ status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }, body: utf8(JSON.stringify(value)) });

const STATUS: Record<string, number> = { STALE_SEQUENCE: 409, SEQUENCE_COLLISION: 409, PAYLOAD_MALFORMED: 400, SCHEMA_UNSUPPORTED: 400, INTEGRITY_MISMATCH: 422, DOCUMENT_INVALID: 422 };

export async function activateCommerce(deps: ReceiverDeps, body: Uint8Array): Promise<ReceiverResponse> {
  const client = await deps.pool.connect();
  const log = async (outcome: string, document: Record<string, unknown> | null, codes: readonly string[], rules: readonly string[]): Promise<void> => {
    await client.query(
      `INSERT INTO site_publication_log (operation, publication_id, catalogue_sequence, payload_sha256, outcome, error_codes, stage, detail)
       VALUES ('COMMERCE', $1, $2, $3, $4, $5::jsonb, 'commerce', $6::jsonb)`,
      [document !== null && typeof document["publication_id"] === "string" ? document["publication_id"] : null, document !== null && Number.isSafeInteger(document["commerce_sequence"]) ? document["commerce_sequence"] : null,
        document !== null && isHex64(document["payload_sha256"]) ? document["payload_sha256"] : null, outcome, JSON.stringify(codes), JSON.stringify(rules.length === 0 ? {} : { rules })],
    );
  };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [COMMERCE_LOCK_KEY]);
    const stored = await readActiveCommerce(client);
    const decision = decideCommerce(body, stored === null ? null : { document: stored.document, ack: stored.ack }, (deps.now ?? serverNowUtc)(), deps.config.keyring as Json, deps.config.ackKeyId);
    if (decision.outcome === "REJECTED") {
      await log("REJECTED", null, decision.error_codes, decision.rules);
      await client.query("COMMIT");
      return json(STATUS[decision.error_codes[0]!] ?? 422, { accepted: false, outcome: "REJECTED", operation: "COMMERCE", error_codes: decision.error_codes, detail: { rules: decision.rules } });
    }
    if (decision.outcome === "REPLAY_ACK") {
      await log("REPLAY_ACK", null, [], []);
      await client.query("COMMIT");
      return json(200, decision.ack, { "x-c0-outcome": "REPLAY_ACK" });
    }
    const ackBytes = canonicalBytes(decision.ack as Json);
    const doc = decision.document;
    await client.query(
      `INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes, activated_at)
       VALUES (1, $1, $2, $3, $4, $5, now())
       ON CONFLICT (singleton) DO UPDATE SET commerce_sequence = EXCLUDED.commerce_sequence, publication_id = EXCLUDED.publication_id, payload_sha256 = EXCLUDED.payload_sha256,
         document_bytes = EXCLUDED.document_bytes, ack_bytes = EXCLUDED.ack_bytes, activated_at = EXCLUDED.activated_at`,
      [doc.commerce_sequence, doc.publication_id, doc.payload_sha256, Buffer.from(body), Buffer.from(ackBytes)],
    );
    await log("ACTIVATED", { publication_id: doc.publication_id, commerce_sequence: doc.commerce_sequence, payload_sha256: doc.payload_sha256 }, [], []);
    await client.query("COMMIT");   // l'accusé n'est renvoyé qu'après le COMMIT
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-c0-outcome": "ACTIVATED" }, body: ackBytes };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
