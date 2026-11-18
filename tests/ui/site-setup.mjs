// Outil de préparation (tests navigateur BC3, recette manuelle) : remet une base SITE de TEST `prodes_site_*_test` à zéro et
// pose des générations par le VRAI receiver BC2, en HTTP, sur un serveur déjà lancé.
//   node tests/ui/site-setup.mjs <port> <base prodes_site_… | URL postgres locale> <cas C0> [<cas C0>…]
//   ex. node tests/ui/site-setup.mjs 3361 prodes_site_bc3_test F_GMCE_VARIANTS.activate
// Garde (revue BC3 F-13, durcie) : base dont le nom se termine par `_test`, hôte local seulement, jamais JARVIS ni une base de démo (`prodes_site_demo*`) : ces préparatifs
// font `DROP SCHEMA`, suspendent le déclencheur d'immutabilité et réécrivent la génération ACTIVE.
// Prérequis : `npm run bc2:build` (signature des PUT média avec le trousseau de TEST des fixtures C0).
import pg from "pg";
import { migrate } from "../../scripts/db/migrate.mjs";

const DB_RE = /^prodes_site_[a-z0-9_]*_test$/;
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Nom de base ou URL postgres locale → URL vérifiée (base `prodes_site_*_test`, hôte local). */
export function dbUrl(nameOrUrl) {
  const url = nameOrUrl.includes("://") ? nameOrUrl : `postgres://prodes_site:local-dev-only@localhost:54318/${nameOrUrl}`;
  const u = new URL(url);
  const name = u.pathname.slice(1);
  if (!DB_RE.test(name)) throw new Error(`base refusée : ${name} (prodes_site_*_test seulement)`);
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

/**
 * Base de TEST seulement : fait de la famille « gmce-demo » une famille MIXTE : un axe « Type » déclaré en dernier (tous les articles existants = « Produit ») et un accessoire
 * (clé neuve, copie du premier article) qui n'a pas de valeur sur l'axe « Taille » : valeur réservée « rv-none ». Document recanonisé, SHA recalculé ; garde d'immutabilité
 * suspendu le temps de la transaction. Renvoie la clé de l'accessoire.
 */
export async function makeGmceMixed(nameOrUrl) {
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
    const family = doc.families.find((f) => f.slug === "gmce-demo");
    family.axes.push({ axis_key: "type", label: "Type" });
    for (const item of family.items) item.variant_axes.type = "Produit";
    const accessory = JSON.parse(JSON.stringify(family.items[0]));
    accessory.public_item_key = identity.makeKey("item", 7001);
    accessory.variant_axes = { couleur: "rouge", taille: "rv-none", type: "Accessoire" };
    family.items.push(accessory);
    doc.manifest_counts.items += 1;
    doc.payload_sha256 = snapshot.payloadSha256(doc);
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    await client.query("UPDATE site_generation SET snapshot_bytes = $1, snapshot_json = $2::jsonb, payload_sha256 = $3 WHERE id = $4", [Buffer.from(jsonc.canonicalBytes(doc)), JSON.stringify(doc), doc.payload_sha256, row.id]);
    await client.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [doc.payload_sha256]);
    await client.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
    await client.query("COMMIT");
    return accessory.public_item_key;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Conditionnements (MW-04) : la famille « gmce-demo » reçoit l'axe « conditionnement » (ses articles = « Unitaire ») et deux lots du premier article, publiés par la Factory comme des Items
 * ordinaires (clé propre, prix du lot entier) ; une seconde famille « lots-seuls » ne vend que des lots. Les clés des lots sont plus grandes que celles des articles et le « Lot de 20 »
 * précède le « Lot de 11 » (C0 range les Items par clé) : l'ordre d'affichage est donc celui de la vitrine. Montants fictifs. Document recanonisé, SHA recalculé.
 */
export async function makeGmcePacks(nameOrUrl) {
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
    const family = doc.families.find((f) => f.slug === "gmce-demo");
    family.axes.push({ axis_key: "conditionnement", label: "Conditionnement" });
    for (const item of family.items) item.variant_axes.conditionnement = "Unitaire";
    const pack = (source, n, axes, rate, amount) => {
      const item = JSON.parse(JSON.stringify(source));
      item.public_item_key = identity.makeKey("item", n);
      item.variant_axes = axes;
      item.public_sell_price_windows = [{ ...source.public_sell_price_windows[0], rate_id: rate, unit_amount: amount }];
      return item;
    };
    const first = family.items[0];
    const lot20 = pack(first, 7101, { ...first.variant_axes, conditionnement: "Lot de 20" }, "R-PACK-20", "200.00");
    const lot10 = pack(first, 7102, { ...first.variant_axes, conditionnement: "Lot de 11" }, "R-PACK-10", "110.00");
    family.items.push(lot20, lot10);
    const only = JSON.parse(JSON.stringify(family));
    only.public_family_key = identity.makeKey("family", 5201);
    only.slug = "lots-seuls";
    only.name = "STAGING_FIXTURE Lots seuls";
    only.axes = [{ axis_key: "conditionnement", label: "Conditionnement" }];
    only.items = [pack(first, 7201, { conditionnement: "Lot de 13" }, "R-PACK-L13", "90.00"), pack(first, 7202, { conditionnement: "Lot de 7" }, "R-PACK-L7", "50.00")];
    doc.families.push(only);
    doc.manifest_counts.families += 1;
    doc.manifest_counts.items += 4;
    doc.payload_sha256 = snapshot.payloadSha256(doc);
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    await client.query("UPDATE site_generation SET snapshot_bytes = $1, snapshot_json = $2::jsonb, payload_sha256 = $3 WHERE id = $4", [Buffer.from(jsonc.canonicalBytes(doc)), JSON.stringify(doc), doc.payload_sha256, row.id]);
    await client.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [doc.payload_sha256]);
    await client.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
    await client.query("COMMIT");
    return { lot10: lot10.public_item_key, lot20: lot20.public_item_key, unit: first.public_item_key };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
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

/** Le garde d'immutabilité des générations doit être actif (`O`) : à vérifier après tout préparatif qui l'a suspendu le temps d'une transaction. */
export async function assertImmutabilityGuardEnabled(nameOrUrl) {
  const client = new pg.Client({ connectionString: dbUrl(nameOrUrl) });
  await client.connect();
  try {
    const rows = (await client.query("SELECT tgenabled FROM pg_trigger WHERE tgname = 'site_generation_immutable' AND tgrelid = 'site_generation'::regclass")).rows;
    if (rows.length !== 1 || rows[0].tgenabled !== "O") throw new Error(`déclencheur site_generation_immutable non réactivé : ${JSON.stringify(rows)}`);
  } finally {
    await client.end();
  }
}
