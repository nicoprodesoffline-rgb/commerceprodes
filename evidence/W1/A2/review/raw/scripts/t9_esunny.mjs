import { start, req, jpost, line } from "./lib.mjs";
import { readFileSync } from "node:fs";
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_ESUNNY_FORBIDDEN/snapshot_s1.json", SITE_NOW_UTC: "2026-10-20T12:00:00Z" });
const P = (lines) => jpost("/api/site/cart/preview", { lines });
const sum = (r) => r.json?.lines?.map((l) => (l.accepted ? l.selection.rate_id : l.error_codes.join("+"))).join(" | ") ?? JSON.stringify(r.json?.error_codes);
try {
  console.log("## RV-13 ESUNNY : combinaisons");
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc", fixation: "sol" }, quantity: 1 }]); line("blanc/sol (interdite) sur clé blanc/murale", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { fixation: "murale", coloris: "blanc" }, quantity: 1 }]); line("blanc/murale axes en ordre inverse", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc" }, quantity: 1 }]); line("axe manquant", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc", fixation: "murale", taille: "M" }, quantity: 1 }]); line("axe en trop", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "Blanc", fixation: "murale" }, quantity: 1 }]); line("casse de la valeur", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc", fixation: "murale" }, quantity: 1 }, { public_item_key: "PI-0000006BC", variant_axes: { fixation: "murale", coloris: "blanc" }, quantity: 1 }]); line("même ligne, ordre d'axes différent (doublon canonique)", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-0000006BC","variant_axes":{"coloris":"blanc","fixation":"murale"},"quantity":1},{"public_item_key":"PI-0000006BC","variant_axes":{"coloris":"blanc","fixation":"mura\\u006ce"},"quantity":1}]}'); line("doublon via échappement \\u006c", r, JSON.stringify(r.json.error_codes)); }
  const page = await req("GET", "/famille/esunny-demo");
  const sol = page.text.match(/blanc[^<]{0,40}sol|sol[^<]{0,40}blanc/gi);
  console.log(`page famille ${page.status} ; Items rendus=${[...new Set(page.text.match(/PI-0000006[0-9A-Z]{2}/g))].join(",")} ; mention blanc/sol=${JSON.stringify(sol)}`);
  for (const f of ["order_forbidden_combination", "order_allowed_combination"]) { const r = await jpost("/api/site/order", readFileSync(`/Users/nico/Desktop/prodes-w1/review-a2/c0/fixtures/documents/F_ESUNNY_FORBIDDEN/${f}.json`)); line(f, r, `${r.json.verdict.outcome} ${JSON.stringify(r.json.verdict.error_codes)}`); }
} finally { await s.stop(); }
