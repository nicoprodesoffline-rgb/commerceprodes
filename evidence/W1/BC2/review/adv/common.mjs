// Outils du reviewer : réutilise tests/bc2/helpers.mjs (receiver compilé .bc2-build, C0 vendu), base prodes_site_rv_bc2_test.
export * from "../../../../../tests/bc2/helpers.mjs";
import { KEYRING, activation, jsonc, signing, snapshot, loadCase } from "../../../../../tests/bc2/helpers.mjs";

export const out = [];
export function rec(id, label, pass, obtained) {
  out.push({ id, label, pass: !!pass, obtained });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label} — obtenu: ${typeof obtained === "string" ? obtained : JSON.stringify(obtained)}`);
}
export function summary(tag) {
  const f = out.filter((r) => !r.pass).length;
  console.log(`# ${tag} : ${out.length - f}/${out.length} attendus, ${f} écart(s)`);
}

/** Document synthétique dérivé d'un document C0 (séquence, base), re-haché et re-signé avec les fonctions C0. */
export function derive(baseCase, { seq, prevDoc, pub }) {
  const doc = structuredClone(baseCase.doc);
  doc.publication_id = pub;
  doc.projection_id = pub.replace("PUB", "PRJ");
  doc.catalogue_sequence = seq;
  doc.coverage.previous_catalogue_sequence = prevDoc.catalogue_sequence;
  doc.coverage.previous_payload_sha256 = prevDoc.payload_sha256;
  // retraits = clés READY de la base absentes du nouveau document
  const keys = (d) => new Set(d.families.flatMap((f) => f.items.map((i) => i.public_item_key)));
  const now = keys(doc);
  doc.coverage.expected_withdrawals = Array.from(keys(prevDoc)).filter((k) => !now.has(k)).sort().map((k) => ({ public_item_key: k, reason: "COMMERCIAL_WITHDRAWAL" }));
  doc.coverage.expected_withdrawals_digest = snapshot.withdrawalsDigest(doc.coverage);
  doc.payload_sha256 = snapshot.payloadSha256(doc);
  const bytes = jsonc.canonicalBytes(doc);
  const signature = signing.sign(KEYRING, "c0-test-publish-02", signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, activation.signatureContext(doc));
  return { ...baseCase, caseId: `RV.${pub}`, bytes, doc, transport: { key_id: "c0-test-publish-02", signature } };
}
export { loadCase };
