#!/usr/bin/env node
// Recette HTTP du receiver BC2 sur un vrai serveur Next (runtime Node) et la base SITE de dev.
//   BASE_URL=http://127.0.0.1:3331 node tests/bc2/http-smoke.mjs     (après npm run bc2:build)
// Horloge = horloge serveur réelle : l'ACK est comparé à ack_s1.json HORS activated_at_utc et signature,
// puis vérifié par verifyAck (C0) avec le trousseau de test. Base attendue vide au départ.
import { readFileSync } from "node:fs";
import { KEYRING, activation, fixtureBytes, jsonc, loadCase, mediaHeaders } from "./helpers.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3331";
const results = [];
const record = (id, label, pass, obtained) => results.push({ id, label, pass: !!pass, obtained });

async function call(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, { method, body, headers, redirect: "manual" });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: res.status, bytes, json, headers: res.headers };
}
const sig = (t) => ({ "x-c0-key-id": t.key_id, "x-c0-signature": t.signature });
const ctl = (d) => JSON.stringify({ publication_id: d.publication_id, catalogue_sequence: d.catalogue_sequence, payload_sha256: d.payload_sha256 });

const c = loadCase("F_SIMPLE_READY.activate_first");
const h = { ...sig(c.transport), "content-type": "application/json" };

let r = await call("POST", "/api/site/publish/stage", { body: c.bytes, headers: h });
record("H01", "STAGE F_SIMPLE_READY s1 -> 200 STAGED sans ACK", r.status === 200 && r.json?.outcome === "STAGED" && !r.headers.get("x-c0-outcome"), `${r.status} ${r.json?.outcome}`);

r = await call("POST", "/api/site/publish/activate", { body: ctl(c.doc), headers: h });
record("H02", "ACTIVATE avant tout média -> 422 MEDIA_MISSING, pas d'ACK", r.status === 422 && r.json?.error_codes?.[0] === "MEDIA_MISSING" && !r.headers.get("x-c0-outcome"), `${r.status} ${JSON.stringify(r.json?.error_codes)}`);

const m = c.media[0];
const wrong = fixtureBytes("media/full_family_1.png");
r = await call("PUT", `/api/site/publish/media/${m.sha256}`, { body: wrong, headers: Object.fromEntries(mediaHeaders(m.sha256, wrong.length)) });
record("H03", "PUT média octets faux -> 422 MEDIA_HASH_MISMATCH", r.status === 422 && r.json?.error_codes?.[0] === "MEDIA_HASH_MISMATCH", `${r.status} ${JSON.stringify(r.json?.error_codes)}`);

r = await call("PUT", `/api/site/publish/media/${m.sha256}`, { body: m.bytes, headers: { ...Object.fromEntries(mediaHeaders(m.sha256, m.bytes.length)), "content-type": "image/png" } });
record("H04", "PUT média correct -> 201 STORED", r.status === 201 && r.json?.outcome === "STORED", `${r.status} ${r.json?.outcome}`);

r = await call("POST", "/api/site/publish/verify-media", { body: ctl(c.doc), headers: h });
record("H05", "VERIFY_MEDIA -> 200 VERIFIED", r.status === 200 && r.json?.generation?.status === "VERIFIED", `${r.status} ${r.json?.generation?.status}`);

r = await call("POST", "/api/site/publish/activate", { body: ctl(c.doc), headers: { ...sig({ key_id: "c0-test-ack-01", signature: c.transport.signature }), "content-type": "application/json" } });
record("H06", "ACTIVATE avec la clé ACK (hors scope) -> 401 SIGNATURE_INVALID", r.status === 401 && r.json?.error_codes?.[0] === "SIGNATURE_INVALID", `${r.status}`);

const act = await call("POST", "/api/site/publish/activate", { body: ctl(c.doc), headers: h });
const ack = act.json;
const expected = JSON.parse(readFileSync(new URL("../../c0/fixtures/documents/F_SIMPLE_READY/ack_s1.json", import.meta.url), "utf8"));
const strip = (a) => { const o = { ...a }; delete o.activated_at_utc; delete o.signature; return o; };
record("H07", "ACTIVATE -> 200 ACTIVATED, ACK = ack_s1.json hors activated_at_utc/signature", act.status === 200 && act.headers.get("x-c0-outcome") === "ACTIVATED" && JSON.stringify(strip(ack)) === JSON.stringify(strip(expected)), `${act.status} ${act.headers.get("x-c0-outcome")} activated_at=${ack?.activated_at_utc}`);
const verdict = activation.verifyAck(ack, KEYRING, c.doc);
record("H08", "ACK vérifié par verifyAck (C0) -> ACK_VALID ; octets canoniques", verdict.outcome === "ACK_VALID" && Buffer.compare(act.bytes, Buffer.from(jsonc.canonicalBytes(ack))) === 0, verdict.outcome);

r = await call("POST", "/api/site/publish/activate", { body: ctl(c.doc), headers: h });
record("H09", "re-ACTIVATE -> REPLAY_ACK, mêmes octets", r.status === 200 && r.headers.get("x-c0-outcome") === "REPLAY_ACK" && Buffer.compare(r.bytes, act.bytes) === 0, `${r.status} ${r.headers.get("x-c0-outcome")}`);
r = await call("POST", "/api/site/publish/stage", { body: c.bytes, headers: h });
record("H10", "re-STAGE des mêmes octets -> REPLAY_ACK, mêmes octets", r.status === 200 && r.headers.get("x-c0-outcome") === "REPLAY_ACK" && Buffer.compare(r.bytes, act.bytes) === 0, `${r.status} ${r.headers.get("x-c0-outcome")}`);

const q = `/api/site/publish/status?publication_id=${encodeURIComponent(c.doc.publication_id)}&catalogue_sequence=${c.doc.catalogue_sequence}`;
r = await call("GET", q, { headers: sig(c.transport) });
record("H11", "STATUS signé -> 200 ACTIVE, is_active, sans octets", r.status === 200 && r.json?.generation?.status === "ACTIVE" && r.json.generation.is_active === true && !("snapshot_bytes" in r.json.generation), `${r.status} ${r.json?.generation?.status}`);
r = await call("GET", q);
record("H12", "STATUS sans en-têtes -> 401", r.status === 401, `${r.status}`);
r = await call("POST", "/api/site/publish/activate", { body: "{}", headers: h });
record("H13", "ACTIVATE corps invalide -> 400 REQUEST_INVALID", r.status === 400 && r.json?.transport_error === "REQUEST_INVALID", `${r.status}`);
const stale = loadCase("F_SIMPLE_READY.signature_retired_key");
r = await call("POST", "/api/site/publish/stage", { body: stale.bytes, headers: { ...sig(stale.transport), "content-type": "application/json" } });
record("H14", "STAGE clé RETIRED -> 401", r.status === 401, `${r.status}`);
r = await call("POST", "/api/site/publish/stage", { body: fixtureBytes("documents/F_SIMPLE_READY/snapshot_pretty_printed.json"), headers: h });
record("H15", "STAGE octets non canoniques -> 422 INTEGRITY_MISMATCH", r.status === 422 && r.json?.error_codes?.[0] === "INTEGRITY_MISMATCH", `${r.status}`);

for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"} ${x.id} ${x.label} — obtenu: ${x.obtained}`);
const fail = results.filter((x) => !x.pass).length;
console.log(`# HTTP BC2 : ${results.length - fail}/${results.length} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
