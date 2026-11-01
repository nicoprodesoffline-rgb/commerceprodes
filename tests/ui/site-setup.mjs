// Outil de préparation (tests navigateur BC3, recette manuelle) : remet une base SITE `prodes_site_bc3*` à zéro et
// pose des générations par le VRAI receiver BC2, en HTTP, sur un serveur déjà lancé.
//   node tests/ui/site-setup.mjs <port> <base prodes_site_… | URL postgres locale> <cas C0> [<cas C0>…]
//   ex. node tests/ui/site-setup.mjs 3361 prodes_site_bc3 F_GMCE_VARIANTS.activate
// Garde (revue BC3 F-13, paramétrable sans copie) : base `prodes_site_*` sur hôte local seulement, jamais JARVIS.
// Prérequis : `npm run bc2:build` (signature des PUT média avec le trousseau de TEST des fixtures C0).
import pg from "pg";
import { migrate } from "../../scripts/db/migrate.mjs";

const DB_RE = /^prodes_site_[a-z0-9_]+$/;
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Nom de base ou URL postgres locale → URL vérifiée (base `prodes_site_*`, hôte local). */
export function dbUrl(nameOrUrl) {
  const url = nameOrUrl.includes("://") ? nameOrUrl : `postgres://prodes_site:local-dev-only@localhost:54318/${nameOrUrl}`;
  const u = new URL(url);
  const name = u.pathname.slice(1);
  if (!DB_RE.test(name)) throw new Error(`base refusée : ${name} (prodes_site_* seulement)`);
  if (!LOCAL.has(u.hostname)) throw new Error(`hôte refusé : ${u.hostname} (local seulement)`);
  return url;
}

export async function resetSiteDb(nameOrUrl) {
  const url = dbUrl(nameOrUrl);
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

/**
 * Base de TEST seulement : réécrit en « rq- » / montant de convention les fenêtres du potelet de F_SELL_WINDOWS (« Prix sur devis »),
 * dans la génération ACTIVE (document recanonisé, SHA recalculé). Le garde d'immutabilité est suspendu le temps de la transaction, puis réactivé.
 */
export async function makePoteletQuoteOnly(nameOrUrl, rateId = "rq-402", amount = "0.01") {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const snapshot = require("../../c0/ts/dist/src/snapshot.js");
  const jsonc = require("../../c0/ts/dist/src/jsonc.js");
  const client = new pg.Client({ connectionString: dbUrl(nameOrUrl) });
  await client.connect();
  try {
    const row = (await client.query("SELECT id, snapshot_bytes FROM site_generation WHERE status = 'ACTIVE'")).rows[0];
    const doc = jsonc.parseBytes(new Uint8Array(row.snapshot_bytes), 1 << 24);
    // Toutes les fenêtres du potelet passent en « rq- » : la variante est « sur devis » à toute quantité, quel que soit l'instant du serveur (R-402-F s'ouvre le 2026-11-01).
    for (const [index, w] of doc.families[1].items[0].public_sell_price_windows.entries()) {
      w.rate_id = `${rateId}-${index}`;
      w.unit_amount = amount;
    }
    doc.payload_sha256 = snapshot.payloadSha256(doc);
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    await client.query("UPDATE site_generation SET snapshot_bytes = $1, snapshot_json = $2::jsonb, payload_sha256 = $3 WHERE id = $4", [Buffer.from(jsonc.canonicalBytes(doc)), JSON.stringify(doc), doc.payload_sha256, row.id]);
    await client.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [doc.payload_sha256]);
    await client.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Base de TEST seulement : ajoute `count` catégories racines de nom long, chacune avec une famille clonée (1 article), pour faire déborder la barre des catégories du haut.
 * Même mécanique que `addCloneFamilies` (clés valides, document recanonisé, SHA recalculé, garde d'immutabilité suspendu le temps de la transaction).
 */
export async function addRootCategories(nameOrUrl, count) {
  return addClones(nameOrUrl, count, true);
}

/**
 * Base de TEST seulement : ajoute `count` familles clonées (1 article chacune, même catégorie que « panneau-paliers ») à la génération ACTIVE, pour qu'une fiche porte
 * 8 produits similaires et plus. Clés publiques valides (contrôle C0), document recanonisé, SHA recalculé ; garde d'immutabilité suspendu le temps de la transaction.
 * Renvoie `[{ slug, key }]` (clé de famille).
 */
export async function addCloneFamilies(nameOrUrl, count) {
  return addClones(nameOrUrl, count, false);
}

async function addClones(nameOrUrl, count, ownCategory) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const snapshot = require("../../c0/ts/dist/src/snapshot.js");
  const jsonc = require("../../c0/ts/dist/src/jsonc.js");
  const identity = require("../../c0/ts/dist/src/identity.js");
  const client = new pg.Client({ connectionString: dbUrl(nameOrUrl) });
  await client.connect();
  try {
    const row = (await client.query("SELECT id, snapshot_bytes FROM site_generation WHERE status = 'ACTIVE'")).rows[0];
    const doc = jsonc.parseBytes(new Uint8Array(row.snapshot_bytes), 1 << 24);
    const base = doc.families[0];
    const made = [];
    for (let i = 1; i <= count; i += 1) {
      const key = identity.makeKey("family", 5000 + i);
      const clone = JSON.parse(JSON.stringify(base));
      clone.public_family_key = key;
      clone.slug = `clone-${i}`;
      clone.name = `STAGING_FIXTURE Clone ${i}`;
      if (ownCategory) {
        doc.categories.push({ category_key: `cat-clone-${i}`, name: `STAGING_FIXTURE Catégorie numéro ${i} à nom long`, parent_category_key: null });
        clone.primary_category_key = `cat-clone-${i}`;
        clone.secondary_category_keys = [];
      }
      clone.items = clone.items.map((item, n) => ({ ...item, public_item_key: identity.makeKey("item", 6000 + i * 10 + n) }));
      doc.families.push(clone);
      made.push({ slug: clone.slug, key });
    }
    doc.manifest_counts.families += count;
    doc.manifest_counts.items += count * base.items.length;
    doc.payload_sha256 = snapshot.payloadSha256(doc);
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    await client.query("UPDATE site_generation SET snapshot_bytes = $1, snapshot_json = $2::jsonb, payload_sha256 = $3 WHERE id = $4", [Buffer.from(jsonc.canonicalBytes(doc)), JSON.stringify(doc), doc.payload_sha256, row.id]);
    await client.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [doc.payload_sha256]);
    await client.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
    await client.query("COMMIT");
    return made;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function activateOverHttp(base, caseId) {
  process.env.SITE_TEST_DATABASE_URL ??= dbUrl("prodes_site_bc3_test"); // lu par tests/bc2/helpers.mjs à l'import
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
