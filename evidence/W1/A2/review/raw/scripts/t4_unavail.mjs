import { start, req, jpost } from "./lib.mjs";
const SHA = "24b1f4076b8b4155a167f63c51095688ae3953389111bd2f2d365b4323de8b13";
const envs = [
  ["source absente", {}],
  ["source=FIXTURE (casse)", { SITE_CATALOG_SOURCE: "FIXTURE", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json" }],
  ["source=db", { SITE_CATALOG_SOURCE: "db" }],
  ["fixture vide", { SITE_CATALOG_SOURCE: "fixture" }],
  ["../../package.json", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "../../package.json" }],
  ["/etc/passwd", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "/etc/passwd" }],
  ["F_SELL_WINDOWS/../../../package.json", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/../../../package.json" }],
  ["%2e%2e encodé", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/%2e%2e%2fx.json" }],
  ["s7 + saut de ligne final", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json\n" }],
  ["s7 + octet nul", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json\u0001" }],
  ["fixture inexistante", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/missing.json" }],
  ["document non-snapshot (order_valid)", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_QUOTE_ORDER/order_valid.json" }],
  ["snapshot_overlap (cas exclu select_on_overlap)", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_overlap.json", SITE_NOW_UTC: "2026-03-29T01:00:00Z" }],
  ["SITE_NOW_UTC à offset (cas exclu select_offset_instant)", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: "2026-10-20T08:00:00+02:00" }],
];
const leak = (t) => ["Panneau", "Potelet", "€", "R-401", "PI-000000", "/Users/", "jarvis", "LOCALAPPDATA", "c0/fixtures"].filter((w) => t.includes(w));
for (const [label, env] of envs) {
  let s;
  try { s = await start({ ...env }); } catch (e) { console.log(`${label} → démarrage refusé : ${String(e.message).slice(0, 200)}`); continue; }
  try {
    const home = await req("GET", "/"); const fam = await req("GET", "/famille/panneau-paliers");
    const pv = await jpost("/api/site/cart/preview", { lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10 }] });
    const od = await jpost("/api/site/order", "{}");
    const md = await req("GET", "/media/" + SHA); const ar = await req("GET", "/article/PI-000000CHJ");
    console.log(`${label}\n   / ${home.status} « indisponible » dans HTML=${/Catalogue indisponible/.test(home.text)} fuites=${JSON.stringify(leak(home.text))} taille=${home.buf.length}` +
      `\n   /famille ${fam.status} fuites=${JSON.stringify(leak(fam.text))}\n   preview ${pv.status} ${pv.text.slice(0, 160)}\n   order ${od.status} ${od.text.slice(0, 160)}\n   media ${md.status} ${md.text.slice(0, 40)} | article ${ar.status} ${ar.headers.location ?? ""}`);
    const logs = s.logs.join("").split("\n").filter((l) => /site-catalog|Error|SITE_NOW/.test(l)).slice(0, 2).map((l) => l.slice(0, 220));
    console.log(`   journal serveur : ${JSON.stringify(logs)}`);
    if (label === "source absente") { console.log("   --- HTML / (extrait, 600 o) ---\n" + home.text.slice(0, 600).replace(/\n/g, " ")); console.log("   --- texte visible sans script : " + JSON.stringify(home.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300))); }
  } finally { await s.stop(); }
}
