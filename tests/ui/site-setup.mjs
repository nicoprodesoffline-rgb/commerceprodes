// Outil de préparation (tests navigateur BC3, recette manuelle) : remet une base SITE `prodes_site_bc3*` à zéro et
// pose des générations par le VRAI receiver BC2, en HTTP, sur un serveur déjà lancé.
//   node tests/ui/site-setup.mjs <port> <base prodes_site_bc3…> <cas C0> [<cas C0>…]
//   ex. node tests/ui/site-setup.mjs 3361 prodes_site_bc3 F_GMCE_VARIANTS.activate
// Prérequis : `npm run bc2:build` (signature des PUT média avec le trousseau de TEST des fixtures C0).
import pg from "pg";
import { migrate } from "../../scripts/db/migrate.mjs";

const DB_RE = /^prodes_site_bc3(_test)?$/; // jamais la base d'un autre lot

export function dbUrl(name) {
  if (!DB_RE.test(name)) throw new Error(`base refusée : ${name} (BC3 seulement)`);
  return `postgres://prodes_site:local-dev-only@localhost:54318/${name}`;
}

export async function resetSiteDb(name) {
  const url = dbUrl(name);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
  await migrate(url, () => undefined);
}

export async function activateOverHttp(base, caseId) {
  process.env.SITE_TEST_DATABASE_URL ??= dbUrl("prodes_site_bc3_test");
  const { loadCase, mediaHeaders } = await import("../bc2/helpers.mjs");
  const c = loadCase(caseId);
  const sig = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature, "content-type": "application/json" };
  const ctl = JSON.stringify({ publication_id: c.doc.publication_id, catalogue_sequence: c.doc.catalogue_sequence, payload_sha256: c.doc.payload_sha256 });
  const call = async (method, p, body, headers) => {
    const r = await fetch(base + p, { method, body, headers });
    return { status: r.status, outcome: r.headers.get("x-c0-outcome"), text: await r.text() };
  };
  const st = await call("POST", "/api/site/publish/stage", c.bytes, sig);
  if (st.status !== 200) throw new Error(`${caseId} STAGE ${st.status} ${st.text.slice(0, 200)}`);
  for (const m of c.media) {
    const r = await call("PUT", `/api/site/publish/media/${m.sha256}`, m.bytes, { ...Object.fromEntries(mediaHeaders(m.sha256, m.bytes.length)), "content-type": "image/png" });
    if (![200, 201].includes(r.status)) throw new Error(`${caseId} PUT ${r.status}`);
  }
  const v = await call("POST", "/api/site/publish/verify-media", ctl, sig);
  if (v.status !== 200) throw new Error(`${caseId} VERIFY ${v.status} ${v.text.slice(0, 200)}`);
  const a = await call("POST", "/api/site/publish/activate", ctl, sig);
  if (a.outcome !== "ACTIVATED") throw new Error(`${caseId} ACTIVATE ${a.status} ${a.text.slice(0, 200)}`);
  return c;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [port, name, ...cases] = process.argv.slice(2);
  await resetSiteDb(name);
  for (const id of cases) {
    await activateOverHttp(`http://127.0.0.1:${port}`, id);
    console.log(`ACTIVATED ${id} sur ${name}`);
  }
}
