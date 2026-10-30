// Friction 14 (V5.1) — famille RÉELLEMENT mixte : un document `site_snapshot.v1` dérivé de F_GMCE_VARIANTS/snapshot_s1.json (même famille, trois variantes) dont UNE variante
// (PI-000000363) est vendue HT, les deux autres en base « non précisée ». `payload_sha256` est recalculé avec le code C0 compilé (npm run c0:build). Écrit TEMPORAIREMENT sous
// c0/fixtures/documents/F_BASIS_MIXED/ (emplacement exigé par FixtureSource), jamais versionné : `removeBasisFixture()` le supprime.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const SOURCE = path.join(ROOT, "c0/fixtures/documents/F_GMCE_VARIANTS/snapshot_s1.json");
const DIR = path.join(ROOT, "c0/fixtures/documents/F_BASIS_MIXED");
export const FIXTURE = "F_BASIS_MIXED";
export const FILE = "snapshot_mixed.json";
export const HT_ITEM = "PI-000000363";

export function writeBasisFixture() {
  const { canonicalBytes } = require(path.join(ROOT, "c0/ts/dist/src/jsonc.js"));
  const { payloadSha256 } = require(path.join(ROOT, "c0/ts/dist/src/snapshot.js"));
  const doc = JSON.parse(readFileSync(SOURCE, "utf8"));
  let changed = 0;
  for (const family of doc.families) for (const item of family.items) {
    if (item.public_item_key !== HT_ITEM) continue;
    for (const window of item.public_sell_price_windows) { window.tax_basis_or_status = "HT"; changed += 1; }
  }
  if (changed === 0) throw new Error("variante à passer en HT introuvable");
  doc.payload_sha256 = payloadSha256(doc);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, FILE), canonicalBytes(doc));
}

export function removeBasisFixture() {
  rmSync(DIR, { recursive: true, force: true });
}

// --- textes de famille hostiles (revue f1) : nom, description courte et longue contiennent du HTML et du script. Le site doit les afficher TELS QUELS, en texte.
const ESCAPE_DIR = path.join(ROOT, "c0/fixtures/documents/F_BASIS_ESCAPE");
export const ESCAPE_FIXTURE = "F_BASIS_ESCAPE";
export const ESCAPE_FILE = "snapshot_escape.json";
export const HOSTILE = {
  name: 'Chaise <b>gras</b> & "guillemets" <img src=x onerror="window.__pwned=\'nom\'">',
  short: "Courte <b><img src=x onerror=\"window.__pwned='courte'\">",
  long: "Longue </p><h1>titre injecté</h1><script>window.__pwned='longue'</script>\n<a href=\"javascript:window.__pwned='lien'\">lien</a> <svg onload=\"window.__pwned='svg'\"></svg>",
};

export function writeEscapeFixture() {
  const { canonicalBytes } = require(path.join(ROOT, "c0/ts/dist/src/jsonc.js"));
  const { payloadSha256 } = require(path.join(ROOT, "c0/ts/dist/src/snapshot.js"));
  const doc = JSON.parse(readFileSync(SOURCE, "utf8"));
  const family = doc.families[0];
  family.name = HOSTILE.name;
  family.description_short = HOSTILE.short;
  family.description_long = HOSTILE.long;
  doc.payload_sha256 = payloadSha256(doc);
  mkdirSync(ESCAPE_DIR, { recursive: true });
  writeFileSync(path.join(ESCAPE_DIR, ESCAPE_FILE), canonicalBytes(doc));
}

export function removeEscapeFixture() {
  rmSync(ESCAPE_DIR, { recursive: true, force: true });
}
