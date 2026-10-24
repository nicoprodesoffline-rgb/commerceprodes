import { start, req } from "./lib.mjs";
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: "2026-10-20T09:00:00Z" });
const strip = (t) => t.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
try {
  const home = await req("GET", "/");
  const cats = [...new Set(home.text.match(/\/categorie\/[a-z0-9-]+/g))];
  console.log(`/ ${home.status} montants € visibles=${JSON.stringify(strip(home.text).match(/[0-9]+,[0-9]{2}\s*€[^<]{0,30}/g))}`);
  for (const c of cats) { const r = await req("GET", c); console.log(`${c} ${r.status} montants=${JSON.stringify(strip(r.text).match(/[0-9]+,[0-9]{2}\s*€[^<]{0,30}/g))}`); }
  for (const f of ["/famille/panneau-paliers", "/famille/potelet-paliers"]) { const r = await req("GET", f); const amounts = strip(r.text).match(/[0-9]+,[0-9]{2}\s*€[^0-9]{0,32}/g); const rates = [...r.text.matchAll(/data-rate-id="([^"]+)" data-state="([A-Z]+)"/g)].map((m) => m[1] + ":" + m[2]); console.log(`${f} ${r.status} grille=${rates.join(",")} montants=${JSON.stringify(amounts)}`); }
} finally { await s.stop(); }
