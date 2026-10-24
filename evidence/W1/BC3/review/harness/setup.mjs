// Harnais reviewer BC3 : remet prodes_site_rv_bc3 à zéro et pose des générations via le receiver BC2 HTTP.
import { createRequire } from "node:module";
const WT = "/Users/nico/Desktop/prodes-w1/review-bc3";
const require = createRequire(WT + "/package.json");
const pg = require("pg");
process.env.SITE_TEST_DATABASE_URL = "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3_test"; // requis par helpers (non utilisé ici)
const { migrate } = await import(WT + "/scripts/db/migrate.mjs");
const { loadCase, mediaHeaders } = await import(WT + "/tests/bc2/helpers.mjs");
const URL_ = "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3";
const [port, mode, ...cases] = process.argv.slice(2);
if (mode === "reset") {
  const c = new pg.Client({ connectionString: URL_ }); await c.connect();
  await c.query("DROP SCHEMA public CASCADE"); await c.query("CREATE SCHEMA public"); await c.end();
  await migrate(URL_, () => undefined); console.log("RESET prodes_site_rv_bc3");
}
const base = `http://127.0.0.1:${port}`;
for (const caseId of cases) {
  const c = loadCase(caseId);
  const sig = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature, "content-type": "application/json" };
  const ctl = JSON.stringify({ publication_id: c.doc.publication_id, catalogue_sequence: c.doc.catalogue_sequence, payload_sha256: c.doc.payload_sha256 });
  const call = async (m, p, b, h) => { const r = await fetch(base + p, { method: m, body: b, headers: h }); return { s: r.status, o: r.headers.get("x-c0-outcome"), t: await r.text() }; };
  const st = await call("POST", "/api/site/publish/stage", c.bytes, sig);
  for (const m of c.media) await call("PUT", `/api/site/publish/media/${m.sha256}`, m.bytes, { ...Object.fromEntries(mediaHeaders(m.sha256, m.bytes.length)), "content-type": "image/png" });
  const v = await call("POST", "/api/site/publish/verify-media", ctl, sig);
  const a = await call("POST", "/api/site/publish/activate", ctl, sig);
  console.log(`${caseId} stage=${st.s} verify=${v.s} activate=${a.s} outcome=${a.o}`);
}
