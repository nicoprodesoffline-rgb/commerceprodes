import { start, req, jpost } from "./lib.mjs";
for (const now of ["2026-10-20T08:00:00+02:00", "2026-02-30T00:00:00Z", "2026-10-20T09:00:00.000Z"]) {
  const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: now });
  try {
    const home = await req("GET", "/");
    const pv = await jpost("/api/site/cart/preview", { lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10 }] });
    const md = await req("GET", "/media/24b1f4076b8b4155a167f63c51095688ae3953389111bd2f2d365b4323de8b13");
    console.log(`SITE_NOW_UTC=${now}\n   / ${home.status} prix servis=${/R-401/.test(home.text) || /€/.test(home.text)} trace dans le corps=${/at .*\(|node_modules|Error:/.test(home.text)}\n   preview ${pv.status} ${JSON.stringify(pv.text.slice(0, 160))}\n   media ${md.status}`);
    console.log("   journal : " + JSON.stringify(s.logs.join("").split("\n").filter((l) => /SITE_NOW|Error/.test(l)).slice(0, 2).map((l) => l.slice(0, 200))));
  } catch (e) { console.log(`SITE_NOW_UTC=${now} → erreur client ${e.message}`); } finally { await s.stop(); }
}
