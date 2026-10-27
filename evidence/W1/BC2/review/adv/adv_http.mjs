// Reviewer BC2 — attaques HTTP réelles sur le serveur Next du reviewer (port 3332, base prodes_site_rv_bc2).
import { KEYRING, activation, derive, jsonc, loadCase, rec, signing, summary } from "./common.mjs";
const BASE = process.env.BASE_URL;
async function call(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, { method, body, headers });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null; try { json = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: res.status, json, text: bytes.toString("utf8"), headers: res.headers };
}
const c = loadCase("F_SIMPLE_READY.activate_first");
const sig = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature };
const ctl = JSON.stringify({ publication_id: c.doc.publication_id, catalogue_sequence: c.doc.catalogue_sequence, payload_sha256: c.doc.payload_sha256 });
const leaks = [];
const noLeak = (r) => { const t = r.text; const bad = [c.transport.signature, "TEST_SECRET", "local-dev-only", "/Users/"].filter((s) => t.includes(s)); if (bad.length) leaks.push(bad); return bad.length === 0; };

let r = await call("POST", "/api/site/publish/stage", { body: c.bytes });
rec("H-R01", "STAGE sans en-têtes -> (s1 déjà ACTIVE) ", true, `${r.status} ${r.headers.get("x-c0-outcome") ?? JSON.stringify(r.json?.error_codes)} stage=${r.json?.stage}`);
// document neuf (s2) pour que la signature soit réellement évaluée
const s2 = derive(c, { seq: 2, prevDoc: c.doc, pub: "PUB-RV-HTTP-s2" });
r = await call("POST", "/api/site/publish/stage", { body: s2.bytes });
rec("H-R02", "STAGE document neuf sans en-têtes -> 401 SIGNATURE_INVALID", r.status === 401 && noLeak(r), `${r.status} ${r.text}`);
r = await call("POST", "/api/site/publish/stage", { body: s2.bytes, headers: { "x-c0-key-id": "c0-test-publish-02, c0-test-publish-02", "x-c0-signature": s2.transport.signature } });
rec("H-R03", "en-tête x-c0-key-id dupliqué (deux valeurs) -> 401", r.status === 401, `${r.status} ${JSON.stringify(r.json?.error_codes)}`);
r = await call("POST", "/api/site/publish/stage", { body: s2.bytes, headers: { "x-c0-key-id": "c0-test-publish-02", "x-c0-signature": s2.transport.signature.toUpperCase() } });
rec("H-R04", "signature en majuscules -> 401", r.status === 401, `${r.status}`);
r = await call("POST", "/api/site/publish/stage", { body: s2.bytes, headers: { "x-c0-key-id": "inconnue-01", "x-c0-signature": s2.transport.signature } });
rec("H-R05", "key_id inconnu -> 401, pas d'écho de la signature", r.status === 401 && noLeak(r), `${r.status} ${r.text}`);
r = await call("POST", "/api/site/publish/stage", { body: "not json at all", headers: sig });
rec("H-R06", "STAGE corps non-JSON -> 400 PAYLOAD_MALFORMED", r.status === 400 && r.json?.error_codes?.[0] === "PAYLOAD_MALFORMED", `${r.status} ${r.text}`);
r = await call("POST", "/api/site/publish/activate", { body: "{\"publication_id\":", headers: sig });
rec("H-R07", "ACTIVATE corps non-JSON -> 400 REQUEST_INVALID", r.status === 400 && r.json?.transport_error === "REQUEST_INVALID", `${r.status}`);
r = await call("POST", "/api/site/publish/activate", { body: JSON.stringify({ publication_id: "x' OR '1'='1", catalogue_sequence: 1, payload_sha256: c.doc.payload_sha256 }), headers: sig });
rec("H-R08", "ACTIVATE publication_id injection SQL -> 400 (jeton C0 refusé)", r.status === 400, `${r.status} ${r.json?.transport_error}`);
r = await call("GET", `/api/site/publish/status?publication_id=${encodeURIComponent("x' OR 1=1--")}&catalogue_sequence=1`, { headers: sig });
rec("H-R09", "STATUS publication_id injection SQL -> 400", r.status === 400, `${r.status} ${r.json?.transport_error}`);
r = await call("GET", `/api/site/publish/status?publication_id=${c.doc.publication_id}&catalogue_sequence=1e0`, { headers: sig });
rec("H-R10", "STATUS séquence non décimale -> 400", r.status === 400, `${r.status}`);
r = await call("GET", `/api/site/publish/status?publication_id=${c.doc.publication_id}&catalogue_sequence=1`, { headers: sig });
rec("H-R11", "STATUS signé -> 200 sans octets ni signature", r.status === 200 && !r.text.includes("snapshot_bytes") && noLeak(r), `${r.status} keys=${Object.keys(r.json?.generation ?? {}).join(",")}`);
r = await call("GET", `/api/site/publish/status?publication_id=${c.doc.publication_id}&catalogue_sequence=1`, { headers: { "x-c0-key-id": s2.transport.key_id, "x-c0-signature": s2.transport.signature } });
rec("H-R12", "STATUS avec la signature d'une autre génération -> 401", r.status === 401, `${r.status}`);
// PRODUCTION en staging : s2 réétiqueté
const prod = structuredClone(s2.doc); prod.data_label = "PRODUCTION";
const { snapshot } = await import("./common.mjs");
prod.payload_sha256 = snapshot.payloadSha256(prod);
const pbytes = jsonc.canonicalBytes(prod);
const psig = signing.sign(KEYRING, "c0-test-publish-02", signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, activation.signatureContext(prod));
r = await call("POST", "/api/site/publish/stage", { body: pbytes, headers: { "x-c0-key-id": "c0-test-publish-02", "x-c0-signature": psig } });
rec("H-R13", "data_label PRODUCTION sur receiver staging -> 422 SNAPSHOT_INVALID envelope.data_label_environment", r.status === 422 && r.json?.detail?.rules?.[0] === "envelope.data_label_environment", `${r.status} ${JSON.stringify(r.json?.detail)}`);
r = await call("POST", "/api/site/publish/activate", { body: JSON.stringify({ publication_id: "PUB-RV-none", catalogue_sequence: 99, payload_sha256: "0".repeat(64) }) });
rec("H-R14", "ACTIVATE génération inconnue sans signature -> 404 GENERATION_NOT_STAGED (avant toute vérif de signature)", r.status === 404, `${r.status} ${r.json?.transport_error}`);
r = await call("POST", "/api/site/publish/verify-media", { body: JSON.stringify({ publication_id: c.doc.publication_id, catalogue_sequence: 1, payload_sha256: c.doc.payload_sha256 }) });
rec("H-R15", "VERIFY_MEDIA sans signature sur génération existante -> ", true, `${r.status} ${r.headers.get("x-c0-outcome") ?? JSON.stringify(r.json?.error_codes)} (non signé)`);
rec("H-R16", "aucune réponse d'erreur ne contient signature/secret/mot de passe/chemin", leaks.length === 0, JSON.stringify(leaks));
summary("adv_http");
