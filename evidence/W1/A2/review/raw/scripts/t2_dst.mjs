import { start, jpost, req, line } from "./lib.mjs";
const instants = ["2026-03-28T22:59:59Z", "2026-03-28T23:00:00Z", "2026-03-29T00:59:59Z", "2026-03-29T01:00:00Z", "2026-03-29T21:59:59Z", "2026-03-29T22:00:00Z",
  "2026-10-24T21:59:59Z", "2026-10-24T22:00:00Z", "2026-10-25T00:59:59Z", "2026-10-25T01:00:00Z", "2026-10-25T22:59:59Z", "2026-10-25T23:00:00Z"];
for (const now of instants) {
  const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: now });
  try {
    const out = [];
    for (const q of [1, 9, 10]) { const r = await jpost("/api/site/cart/preview", { lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: q }] }); const l = r.json.lines[0]; out.push(`q${q}=${l.accepted ? l.selection.rate_id + ":" + l.selection.unit_amount : l.error_codes}`); }
    const page = await req("GET", "/famille/panneau-paliers");
    const active = [...page.text.matchAll(/data-rate-id="([^"]+)" data-state="([A-Z]+)"/g)].map(m => `${m[1]}:${m[2]}`).join(",");
    console.log(`${now} → ${out.join(" ")} | page ${page.status} grille ${active}`);
  } finally { await s.stop(); }
}
