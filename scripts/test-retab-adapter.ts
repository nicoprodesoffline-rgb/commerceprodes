import { readFileSync } from "fs";
import path from "path";
import { adaptRetabToSupabase, type RetabInput } from "../lib/retab/adapter";

// ─── Validated extracted files (per contracts, regression suite 1062 pass) ───
// These are the source-of-truth files, NOT the stale run_*_expanded.json files.

const RETAB_OUTPUTS_DIR =
  process.env.RETAB_OUTPUTS_DIR ??
  path.resolve(process.cwd(), "..", "..", "retab-extraction", "outputs");

const fixtures: Record<string, { path: string; fournisseur: string }> = {
  MOTTEZ: {
    path: path.join(RETAB_OUTPUTS_DIR, "MOTTEZ_1_3_extracted.json"),
    fournisseur: "MOTTEZ",
  },
  SOCOMIX: {
    path: path.join(RETAB_OUTPUTS_DIR, "socomix_tarif_p1_2_extracted.json"),
    fournisseur: "SOCOMIX",
  },
  GMCE: {
    path: path.join(
      RETAB_OUTPUTS_DIR,
      "gmce_tarifs_chaises_p1_3_extracted.json",
    ),
    fournisseur: "GMCE",
  },
  GROSFILLEX: {
    path: path.join(
      RETAB_OUTPUTS_DIR,
      "GROSFILLEX_TRAIN_KONCILE_extracted.json",
    ),
    fournisseur: "GROSFILLEX",
  },
};

console.log("=== RETAB ADAPTER VALIDATION (extracted files, schema v15) ===\n");

for (const [name, fixture] of Object.entries(fixtures)) {
  const raw = JSON.parse(readFileSync(fixture.path, "utf-8"));
  // Pass fournisseur alongside the data (extracted files don't include it)
  const data = { ...raw, fournisseur: fixture.fournisseur } as RetabInput;
  const result = adaptRetabToSupabase(data);
  const s = result.summary;

  console.log(`── ${name} ──`);
  console.log(`  Families:  ${s.families_count}`);
  console.log(`  Products:  ${s.products_count}`);
  console.log(`  Variants:  ${s.variants_count}`);
  console.log(`  Profiles:  ${s.pricing_profiles_count}`);
  console.log(
    `  Lot offers: ${s.lot_offers_count} (should be 0 — supplier lots not mapped)`,
  );
  console.log(`  Registry:  ${s.registry_entries_count} attrs`);
  console.log(`  Warnings:  ${s.warnings_count}`);
  console.log(`  Suppliers: ${JSON.stringify(s.by_supplier)}`);

  const byLevel: Record<string, number> = {};
  for (const w of result.warnings) {
    byLevel[w.level] = (byLevel[w.level] ?? 0) + 1;
  }
  if (Object.keys(byLevel).length > 0) {
    console.log(`  Warning breakdown: ${JSON.stringify(byLevel)}`);
  }

  for (const w of result.warnings.slice(0, 3)) {
    console.log(
      `    [${w.level}] ${w.product_ref}${w.variant_ref ? "/" + w.variant_ref : ""}: ${w.message}`,
    );
  }

  const withAttrs = result.variants.filter(
    (v) => Object.keys(v.attributs_prix).length > 0,
  ).length;
  console.log(
    `  Attr coverage: ${withAttrs}/${s.variants_count} variants have attributs_prix`,
  );

  if (result.pricing_profiles.length > 0) {
    const pp = result.pricing_profiles[0]!;
    console.log(`  Sample profile: "${pp.label}" → ${pp.base_price_ht}€`);
  }

  // Show a sample variant with attributs_prix
  const sample = result.variants.find(
    (v) => Object.keys(v.attributs_prix).length > 0,
  );
  if (sample) {
    console.log(
      `  Sample variant: ${sample.sku} → attributs_prix=${JSON.stringify(sample.attributs_prix)}`,
    );
    console.log(
      `    price_branch=${JSON.stringify(sample._price_branch)}, style_branch=${JSON.stringify(sample._style_branch)}`,
    );
  }

  console.log();
}

console.log("=== DONE ===");
