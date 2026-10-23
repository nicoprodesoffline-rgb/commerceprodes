import { start, req } from "./lib.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: "2026-10-20T09:00:00Z" });
const OK = "24b1f4076b8b4155a167f63c51095688ae3953389111bd2f2d365b4323de8b13";
const other = createHash("sha256").update(readFileSync("/Users/nico/Desktop/prodes-w1/review-a2/c0/fixtures/media/esunny_family.png")).digest("hex");
try {
  console.log("## RV-09 route média");
  { const r = await req("GET", "/media/" + OK); console.log(`média de la génération → ${r.status} ${r.headers["content-type"]} len=${r.headers["content-length"]} sha_ok=${createHash("sha256").update(r.buf).digest("hex") === OK} nosniff=${r.headers["x-content-type-options"]} cache=${r.headers["cache-control"]}`); }
  for (const [label, p] of [["MAJUSCULES", "/media/" + OK.toUpperCase()], ["63 hex", "/media/" + OK.slice(1)], ["65 hex", "/media/" + OK + "0"], ["média C0 hors génération (esunny_family.png)", "/media/" + other],
    ["traversée ..%2F", "/media/..%2F..%2Fpackage.json"], ["traversée ../", "/media/../package.json"], ["sha + .png", "/media/" + OK + ".png"], ["sha%00", "/media/" + OK + "%00"], ["nom de fichier C0", "/media/esunny_family.png"], ["c0 direct", "/c0/fixtures/media/esunny_family.png"], ["keys", "/c0/fixtures/keys/test_keyring.json"]]) {
    const r = await req("GET", p); console.log(`${label} → ${r.status} ${r.headers["content-type"] ?? ""} ${r.buf.length}o`);
  }
  { const r = await req("HEAD", "/media/" + OK); console.log(`HEAD média → ${r.status}`); }
  { const r = await req("POST", "/media/" + OK); console.log(`POST média → ${r.status}`); }
  console.log("## RV-10 /article/[key]");
  for (const k of ["PI-000000CHJ", "PI-000000CHK", "pi-000000chj", "PF-000000CHM", "PI-000000CHJ%0d%0aSet-Cookie:%20x=1", "%3Cscript%3Ealert(1)%3C%2Fscript%3E", "..%2F..%2Fpanier", "PI-" + "A".repeat(5000), "%E2%80%AE", "__proto__", "constructor", "%00"]) {
    const r = await req("GET", "/article/" + k); console.log(`${k.slice(0, 60)} → ${r.status} loc=${r.headers.location ?? "-"} set-cookie=${r.headers["set-cookie"] ?? "-"} reflète=${r.text.includes("<script>alert")}`);
  }
  console.log("## RV-11 en-têtes de sécurité (/, /famille, API)");
  for (const p of ["/", "/famille/panneau-paliers", "/panier"]) { const r = await req("GET", p); const h = r.headers; console.log(`${p} ${r.status} xfo=${h["x-frame-options"]} nosniff=${h["x-content-type-options"]} referrer=${h["referrer-policy"]} perms=${h["permissions-policy"]} csp=${h["content-security-policy"] ?? "ABSENT"} hsts=${h["strict-transport-security"] ?? "ABSENT"} powered=${h["x-powered-by"] ?? "absent"} cache=${h["cache-control"]}`); }
  { const r = await req("POST", "/api/site/cart/preview", { body: '{"lines":[]}', headers: { "content-type": "application/json" } }); console.log(`API preview headers : cache=${r.headers["cache-control"]} nosniff=${r.headers["x-content-type-options"]} ctype=${r.headers["content-type"]}`); }
  { const r = await req("GET", "/famille/%3Cscript%3E"); console.log(`/famille/<script> → ${r.status} reflète=${r.text.includes("<script>") && !r.text.includes("<script src")}`); }
  { const r = await req("GET", "/famille/panneau-paliers?article=%3Cscript%3Ealert(1)%3C/script%3E"); console.log(`?article=<script> → ${r.status} reflète=${r.text.includes("<script>alert")}`); }
  { const r = await req("GET", "/categorie/..%2F..%2Fetc"); console.log(`/categorie/../etc → ${r.status}`); }
  console.log("## RV-12 legacy : POST avec cookie et Bearer forgés (échantillon)");
  for (const p of ["/api/admin/auth", "/api/checkout", "/api/checkout/bon-de-commande", "/api/devis", "/api/revalidate", "/admin", "/api/admin/products/1", "/api/cart/share", "/api/site/publish", "/api/site/publish/activate", "/api/site/receipt", "/api/site/order/1"]) {
    const r = await req("POST", p, { body: '{"x":1}', headers: { "content-type": "application/json", cookie: "admin_session=forged; prodes_admin=1", authorization: "Bearer forged.jwt.token" } });
    console.log(`POST ${p} → ${r.status} set-cookie=${r.headers["set-cookie"] ?? "-"}`);
  }
} finally { await s.stop(); }
