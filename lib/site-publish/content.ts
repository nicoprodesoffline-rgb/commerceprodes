/**
 * Cercle 3 (3.2) — réception des contenus v2 par le canal signé : POST /api/site/content/activate, un seul appel, corps = octets canoniques de `site_content.v2`
 * (docs/contracts/c0_site_v2.md §4.4). Même modèle que le catalogue : un état ACTIF (octets + accusé signé), un refus laisse servis les contenus précédents.
 * Aucune règle du contrat n'est réécrite ici : `evaluateContent` (c0v2/ts/src/content.ts) décide ; ce module lit l'état, l'écrit dans UNE transaction et répond.
 * Les références (rubriques, familles, images) se vérifient contre le catalogue actif.
 */
import type { Pool, PoolClient } from "pg";
import { evaluateContent, type ActiveContent } from "../../c0v2/ts/src/content";
import { isHex64 } from "../../c0/ts/src/formats";
import { canonicalBytes, isCanonical, isObject, parseBytes, utf8, type Json } from "../../c0/ts/src/jsonc";
import { SCOPE_PUBLISH, keyHasScope } from "../../c0/ts/src/signing";
import { getActiveGeneration } from "../site-db/generation";
import { HEADER_KEY_ID, HEADER_OUTCOME, HEADER_SIGNATURE, MAX_CONTROL_BYTES, serverNowUtc, type HeaderSource, type ReceiverDeps, type ReceiverResponse } from "./receiver";

/** Plafond du corps : celui du contrat (8 Mio). */
export const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
const CONTENT_LOCK_KEY = 7420201;   // verrou consultatif de l'activation des contenus (une activation à la fois)

function json(status: number, value: unknown, extra: Record<string, string> = {}): ReceiverResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }, body: utf8(JSON.stringify(value)) };
}

interface StoredContent {
  content: Record<string, any>;
  ack: Json;
  ackBytes: Uint8Array;
}

/** Les contenus ACTIFS relus et revérifiés (octets canoniques, empreinte) ; `null` s'il n'y en a pas ou s'ils sont altérés (fail-closed : jamais servis). */
export async function readActiveContent(q: Pool | PoolClient): Promise<StoredContent | null> {
  const { rows } = await q.query("SELECT content_bytes, ack_bytes, payload_sha256 FROM site_content_active WHERE singleton = 1");
  if (rows.length !== 1) return null;
  try {
    const bytes = new Uint8Array(rows[0].content_bytes);
    const doc = parseBytes(bytes, MAX_CONTENT_BYTES);
    if (!isObject(doc) || !isCanonical(bytes, doc) || doc["payload_sha256"] !== rows[0].payload_sha256) return null;
    const ackBytes = new Uint8Array(rows[0].ack_bytes);
    return { content: doc as Record<string, any>, ack: parseBytes(ackBytes, MAX_CONTROL_BYTES), ackBytes };
  } catch {
    return null;
  }
}

async function activeCatalogue(q: Pool | PoolClient): Promise<Json> {
  const active = await getActiveGeneration(q);
  // Aucun catalogue actif : seules les références sont vides, une page sans référence reste acceptable.
  return active !== null && active.snapshot !== null ? (active.snapshot as unknown as Json) : { categories: [], families: [], media_refs: [] };
}

async function log(q: Pool | PoolClient, outcome: string, doc: Json | undefined, codes: readonly string[], stage: string | null, rules: readonly string[] | undefined): Promise<void> {
  const o = isObject(doc as Json) ? (doc as Record<string, any>) : {};
  await q.query(
    `INSERT INTO site_publication_log (operation, publication_id, catalogue_sequence, payload_sha256, outcome, error_codes, stage, detail)
     VALUES ('CONTENT', $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
    [typeof o["publication_id"] === "string" && o["publication_id"].length <= 200 ? o["publication_id"] : null, Number.isSafeInteger(o["content_sequence"]) ? o["content_sequence"] : null,
      isHex64(o["payload_sha256"]) ? o["payload_sha256"] : null, outcome, JSON.stringify(codes), stage, JSON.stringify(rules === undefined ? {} : { rules })],
  );
}

export async function activateContent(deps: ReceiverDeps, body: Uint8Array, headers: HeaderSource): Promise<ReceiverResponse> {
  const keyId = headers.get(HEADER_KEY_ID);
  const signature = headers.get(HEADER_SIGNATURE);
  if (!keyHasScope(deps.config.keyring, keyId, SCOPE_PUBLISH) || !isHex64(signature)) {
    return json(401, { accepted: false, outcome: "REJECTED", operation: "CONTENT", error_codes: ["SIGNATURE_INVALID"], stage: "transport_gate" });
  }
  const transport: Record<string, string> = { key_id: keyId as string, signature: signature as string };
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [CONTENT_LOCK_KEY]);
    const stored = await readActiveContent(client);
    const active: ActiveContent | null = stored === null ? null : { content: stored.content, ack: stored.ack };
    const now = (deps.now ?? serverNowUtc)();
    const result = evaluateContent(body, transport, active, await activeCatalogue(client), now, deps.config.keyring, deps.config.ackKeyId);
    let doc: Json | undefined;
    try { doc = parseBytes(body, MAX_CONTENT_BYTES); } catch { doc = undefined; }
    if (result.outcome === "REPLAY_ACK" && stored !== null) {
      await log(client, "REPLAY_ACK", doc, [], result.stage, undefined);
      await client.query("COMMIT");
      return { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", [HEADER_OUTCOME]: "REPLAY_ACK" }, body: stored.ackBytes };
    }
    if (!result.accepted) {
      await log(client, result.outcome, doc, result.error_codes, result.stage, result.detail.rules);
      await client.query("COMMIT");
      return json(result.error_codes[0] === "SIGNATURE_INVALID" ? 401 : result.error_codes[0] === "STALE_SEQUENCE" || result.error_codes[0] === "SEQUENCE_COLLISION" ? 409 : 422,
        { accepted: false, outcome: result.outcome, operation: "CONTENT", error_codes: result.error_codes, stage: result.stage, detail: result.detail });
    }
    const document = doc as Record<string, any>;
    const ackBytes = canonicalBytes(result.ack as Json);
    await client.query(
      `INSERT INTO site_content_active (singleton, content_sequence, publication_id, payload_sha256, content_bytes, ack_bytes, activated_at)
       VALUES (1, $1, $2, $3, $4, $5, now())
       ON CONFLICT (singleton) DO UPDATE SET content_sequence = EXCLUDED.content_sequence, publication_id = EXCLUDED.publication_id, payload_sha256 = EXCLUDED.payload_sha256,
         content_bytes = EXCLUDED.content_bytes, ack_bytes = EXCLUDED.ack_bytes, activated_at = EXCLUDED.activated_at`,
      [document["content_sequence"], document["publication_id"], document["payload_sha256"], Buffer.from(body), Buffer.from(ackBytes)],
    );
    await log(client, "ACTIVATED", doc, [], result.stage, undefined);
    await client.query("COMMIT");   // l'accusé n'est renvoyé qu'après le COMMIT
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", [HEADER_OUTCOME]: "ACTIVATED" }, body: ackBytes };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
