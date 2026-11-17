/**
 * Cercle 3 (3.26, B14) — POST /api/site/content/preview : l'aperçu d'une page en brouillon (docs/contracts/c0_site_v2.md §4.5). Même porte et même clé de publication que les contenus ;
 * `evaluatePreview` (c0v2/ts/src/content.ts) décide. Un aperçu accepté est GARDÉ sous un jeton tiré par le SITE ; il n'est jamais activé, ne touche aucun contenu servi, et n'a pas d'accusé.
 */
import { evaluatePreview, PREVIEW_MAX_BYTES } from "../../c0v2/ts/src/content";
import { isHex64 } from "../../c0/ts/src/formats";
import { SCOPE_PUBLISH, keyHasScope } from "../../c0/ts/src/signing";
import type { Json } from "../../c0/ts/src/jsonc";
import { getActiveGeneration } from "../site-db/generation";
import { savePreview } from "./preview-store";
import { HEADER_KEY_ID, HEADER_SIGNATURE, serverNowUtc, type HeaderSource, type ReceiverDeps, type ReceiverResponse } from "./receiver";
import { utf8 } from "../../c0/ts/src/jsonc";

export const MAX_PREVIEW_BYTES = PREVIEW_MAX_BYTES;

function json(status: number, value: unknown): ReceiverResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: utf8(JSON.stringify(value)) };
}

export async function storePreview(deps: ReceiverDeps, body: Uint8Array, headers: HeaderSource): Promise<ReceiverResponse> {
  const keyId = headers.get(HEADER_KEY_ID);
  const signature = headers.get(HEADER_SIGNATURE);
  if (!keyHasScope(deps.config.keyring, keyId, SCOPE_PUBLISH) || !isHex64(signature)) {
    return json(401, { accepted: false, outcome: "REJECTED", operation: "PREVIEW", error_codes: ["SIGNATURE_INVALID"], stage: "transport_gate" });
  }
  const active = await getActiveGeneration(deps.pool);
  const catalogue: Json = active !== null && active.snapshot !== null ? (active.snapshot as unknown as Json) : { categories: [], families: [], media_refs: [] };
  const now = (deps.now ?? serverNowUtc)();
  const result = evaluatePreview(body, { key_id: keyId as string, signature: signature as string }, catalogue, now, deps.config.keyring);
  if (!result.accepted) {
    return json(result.error_codes[0] === "SIGNATURE_INVALID" ? 401 : 422, { accepted: false, outcome: result.outcome, operation: "PREVIEW", error_codes: result.error_codes, stage: result.stage, detail: result.detail });
  }
  const id = await savePreview(deps.pool, body, result.expires_at_utc as string);
  return json(200, { accepted: true, outcome: "PREVIEW_STORED", path: `/apercu/${id}`, expires_at_utc: result.expires_at_utc });
}
