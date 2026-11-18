// Corps LÉGITIMES de grande taille pour les routes machine signées (revue I1 D-02) — partagé par
// `tests/http/storefront.test.mjs` (section 4) et `tests/http/machine-routes-probe.mjs` (sorties brutes).
// Aucune règle métier ici : les octets sont produits par les fonctions C0 vendorisées (`jsonc`, `snapshot`, `signing`,
// `activation`) compilées par `npm run bc2:build`, à partir d'un cas C0 nommé.
import { createHash, randomBytes } from "node:crypto";
import { activation, datedHeaders, jsonc, KEYRING, loadCase, mediaHeaders, signing, snapshot } from "../bc2/helpers.mjs";

// Cercle 4 (4.4) : toute requête signée de la Factory porte l'anti-rejeu daté (`x-c0-issued-at`, `x-c0-nonce`, `x-c0-request-signature`) ; une requête sans eux reçoit REQUEST_UNDATED (401).
const PUBLISH_KEY = "c0-test-publish-02";

export const MiB = 1 << 20;

/** Média PNG signé (domaine média BC2) de `size` octets : en-tête PNG + octets aléatoires, Content-Length exact. */
export function bigMedia(size) {
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(size - 8)]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256, headers: { ...Object.fromEntries(mediaHeaders(sha256, size)), ...datedHeaders(PUBLISH_KEY, "PUT", `/api/site/publish/media/${sha256}`, new Uint8Array(bytes)), "content-type": "image/png" } };
}

/**
 * Snapshot `site_snapshot.v1` VALIDE, canonique et signé, d'environ `targetBytes` octets : le cas `F_SIMPLE_READY`
 * complété de catégories racines de remplissage (clés triées, sans famille), puis `payload_sha256` recalculé et
 * signature C0 refaite avec la clé de publication du cas. Le receiver BC2 doit le mettre en STAGED (200).
 */
export function bigSnapshot(targetBytes, caseId = "F_SIMPLE_READY.activate_first") {
  const c = loadCase(caseId);
  const doc = structuredClone(c.doc);
  const name = "STAGING_FIXTURE catégorie de remplissage ".padEnd(190, "x");
  const base = jsonc.canonicalBytes(doc).length;
  const per = jsonc.canonicalBytes({ category_key: "zz-pad-0000000", name, parent_category_key: null }).length + 1;
  const n = Math.max(0, Math.floor((targetBytes - base) / per));
  const pad = [];
  for (let i = 0; i < n; i++) pad.push({ category_key: `zz-pad-${String(i).padStart(7, "0")}`, name, parent_category_key: null });
  doc.categories = [...doc.categories, ...pad].sort((a, b) => (a.category_key < b.category_key ? -1 : a.category_key > b.category_key ? 1 : 0));
  doc.payload_sha256 = snapshot.payloadSha256(doc);
  const bytes = Buffer.from(jsonc.canonicalBytes(doc));
  const signature = signing.sign(KEYRING, c.transport.key_id, signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, activation.signatureContext(doc));
  return { bytes, doc, headers: { "x-c0-key-id": c.transport.key_id, "x-c0-signature": signature, ...datedHeaders(c.transport.key_id, "POST", "/api/site/publish/stage", new Uint8Array(bytes)), "content-type": "application/json" } };
}

/** JSON valide mais hors contrat (`{"x":"aaa…"}`) de `size` octets exacts, en-têtes signés du cas : entier → refus de
 *  forme/version (`SCHEMA_UNSUPPORTED`) ; tronqué par un proxy → `PAYLOAD_MALFORMED` (discriminant de la revue I1). */
export function jsonOfSize(size, caseId = "F_SIMPLE_READY.activate_first") {
  const c = loadCase(caseId);
  const bytes = Buffer.from(`{"x":"${"a".repeat(size - 8)}"}`);
  return { bytes, headers: { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature, ...datedHeaders(c.transport.key_id, "POST", "/api/site/publish/stage", new Uint8Array(bytes)), "content-type": "application/json" } };
}
