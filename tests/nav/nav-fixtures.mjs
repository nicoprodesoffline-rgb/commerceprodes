// CAT-07 — documents `site_snapshot.v1` de test dérivés de F_FULL_CORRUPT/snapshot_s10_active.json (4 familles, données
// STAGING_FIXTURE) : seules `categories` et le classement des familles changent, `payload_sha256` est recalculé avec le
// code C0 compilé (npm run c0:build). Écrits TEMPORAIREMENT sous c0/fixtures/documents/F_NAV_*/ (nom exigé par
// FixtureSource), jamais versionnés : `removeNavFixtures()` les supprime.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const BASE = path.join(ROOT, "c0/fixtures/documents/F_FULL_CORRUPT/snapshot_s10_active.json");
const DOCS = path.join(ROOT, "c0/fixtures/documents");

const c = (category_key, name, parent_category_key = null) => ({ category_key, name, parent_category_key });
// Familles de la base, dans l'ordre du DTO : famille-full-1 .. 4.
export const SCENARIOS = {
  F_NAV_L2: {
    categories: [c("mobilier", "Mobilier"), c("mobilier-chaises", "Chaises", "mobilier"), c("signaletique", "Signalétique"), c("vide", "Rubrique vide")],
    classement: [["mobilier-chaises", []], ["mobilier", []], ["signaletique", []], ["mobilier-chaises", ["signaletique"]]],
  },
  F_NAV_L3: {
    categories: [
      c("mobilier", "Mobilier"), c("mobilier-chaises", "Chaises", "mobilier"), c("mobilier-chaises-bureau", "Chaises de bureau", "mobilier-chaises"),
      c("mobilier-chaises-vide", "Chaises vides", "mobilier-chaises"), c("signaletique", "Signalétique"),
    ],
    classement: [["mobilier-chaises-bureau", []], ["mobilier-chaises", []], ["signaletique", []], ["mobilier-chaises-bureau", ["signaletique"]]],
  },
  F_NAV_L4: {
    categories: [
      c("mobilier", "Mobilier"), c("mobilier-chaises", "Chaises", "mobilier"), c("mobilier-chaises-bureau", "Chaises de bureau", "mobilier-chaises"),
      c("mobilier-chaises-bureau-roulettes", "Quatrième niveau", "mobilier-chaises-bureau"),
      c("mobilier-chaises-bureau-roulettes-xl", "Cinquième niveau", "mobilier-chaises-bureau-roulettes"), c("signaletique", "Signalétique"),
    ],
    // famille-full-2 : principale au niveau 4 ; famille-full-4 : principale niveau 1 et secondaire au niveau 5.
    classement: [["mobilier-chaises-bureau", []], ["mobilier-chaises-bureau-roulettes", []], ["signaletique", []], ["mobilier", ["mobilier-chaises-bureau-roulettes-xl"]]],
  },
};

export function writeNavFixtures() {
  const { canonicalBytes } = require(path.join(ROOT, "c0/ts/dist/src/jsonc.js"));
  const { payloadSha256, validateSnapshotBytes } = require(path.join(ROOT, "c0/ts/dist/src/snapshot.js"));
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const doc = JSON.parse(readFileSync(BASE, "utf8"));
    doc.categories = [...sc.categories].sort((a, b) => (a.category_key < b.category_key ? -1 : 1));
    doc.families.forEach((f, i) => {
      f.primary_category_key = sc.classement[i][0];
      f.secondary_category_keys = [...sc.classement[i][1]].sort();
    });
    doc.payload_sha256 = payloadSha256(doc);
    const bytes = canonicalBytes(doc);
    const codes = validateSnapshotBytes(bytes);
    if (codes.length) throw new Error(`${name} refusé par C0 : ${codes.join(",")}`);
    mkdirSync(path.join(DOCS, name), { recursive: true });
    writeFileSync(path.join(DOCS, name, "snapshot_nav.json"), bytes);
  }
}

export function removeNavFixtures() {
  for (const name of Object.keys(SCENARIOS)) rmSync(path.join(DOCS, name), { recursive: true, force: true });
}
