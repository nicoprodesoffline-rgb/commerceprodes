// Cas adversariaux reviewer BC3 (HTTP) sur 127.0.0.1:3364, base prodes_site_rv_bc3, génération F_GMCE_VARIANTS.
import { createRequire } from "node:module";
const require = createRequire("/Users/nico/Desktop/prodes-w1/review-bc3/package.json");
const pg = require("pg");
const db = new pg.Pool({ connectionString: "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3", max: 2 });
const B = "http://127.0.0.1:3364";
const out = (...a) => console.log(...a);
const counts = async () => {
  const r = await db.query("SELECT (SELECT count(*) FROM site_quote_request) q, (SELECT count(*) FROM site_order) o, (SELECT count(*) FROM site_idempotency) i, (SELECT count(*) FROM site_outbox_event) e");
  return r.rows[0];
};
const post = async (p, body, headers = {}) => {
  const r = await fetch(B + p, { method: "POST", body, headers, redirect: "manual" });
  const t = await r.text();
  return { s: r.status, t: t.slice(0, 160) };
};
const pv = await (await fetch(B + "/api/site/cart/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: [{ public_item_key: "PI-000000358", variant_axes: { couleur: "rouge", taille: "S" }, quantity: 3 }] }) })).json();
out("preview de référence :", JSON.stringify(pv).slice(0, 400));
const contact = { organisation_name: "Mairie", contact_name: "Jean", email: "a@b.fr", phone: null };
const quoteBody = (k) => JSON.stringify({ contract_version: "site_business.v1", kind: "quote_request", idempotency_key: k, catalogue_sequence: null, contact, message: null, lines: [{ public_item_key: pv.lines[0].public_item_key, variant_axes: pv.lines[0].variant_axes, quantity: 3, displayed: null }] });
const l0 = pv.lines[0];
const orderBody = (k) => JSON.stringify({ contract_version: "site_business.v1", kind: "order", idempotency_key: k, catalogue_sequence: pv.catalogue_sequence, contact, currency: "EUR", total_amount: pv.total_amount, lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: l0.quantity, rate_id: l0.selection?.rate_id, unit_amount: l0.selection?.unit_amount, line_total: l0.line_total }] });

out("\n## A03 CSRF — matrice (route × en-têtes), comptage des lignes avant/après");
const c0 = await counts(); out("lignes avant :", JSON.stringify(c0));
const H = { "content-type": "application/json" };
const variants = [
  ["sans Content-Type", {}],
  ["text/plain", { "content-type": "text/plain" }],
  ["form-urlencoded", { "content-type": "application/x-www-form-urlencoded" }],
  ["multipart", { "content-type": "multipart/form-data; boundary=x" }],
  ["json + Origin étranger", { ...H, origin: "https://evil.example" }],
  ["json + Origin null", { ...H, origin: "null" }],
  ["json + Origin même hôte autre port", { ...H, origin: "http://127.0.0.1:9999" }],
  ["json + Origin suffixe trompeur", { ...H, origin: "http://127.0.0.1:3364.evil.example" }],
  ["json + Origin userinfo", { ...H, origin: "http://127.0.0.1:3364@evil.example" }],
  ["json + Sec-Fetch-Site cross-site", { ...H, "sec-fetch-site": "cross-site" }],
  ["json + Sec-Fetch-Site same-site", { ...H, "sec-fetch-site": "same-site" }],
  ["'application/json, text/plain'", { "content-type": "application/json, text/plain" }],
  ["text/plain;application/json", { "content-type": "text/plain; x=application/json" }],
];
for (const route of ["/api/site/cart/preview", "/api/site/quote", "/api/site/order"]) {
  for (const [name, h] of variants) {
    const body = route.endsWith("quote") ? quoteBody("csrf-q-" + Math.random().toString(36).slice(2, 12)) : route.endsWith("order") ? orderBody("csrf-o-" + Math.random().toString(36).slice(2, 12)) : JSON.stringify({ lines: [] });
    const r = await post(route, body, h);
    out(`${route} | ${name} -> ${r.s} ${r.t.slice(0, 70)}`);
  }
}
// contournements de chemin
for (const p of ["/api/site/order/", "/api/site//order", "/api/site/./order", "/api/site/order%2F", "/API/site/order", "/api/site/order?x=1", "/api/site/%6Frder"]) {
  const r = await post(p, orderBody("csrf-p-" + Math.random().toString(36).slice(2, 12)), { "content-type": "text/plain" });
  out(`chemin ${p} text/plain -> ${r.s} ${r.t.slice(0, 80)}`);
}
const c1 = await counts(); out("lignes après :", JSON.stringify(c1), JSON.stringify(c0) === JSON.stringify(c1) ? "=> 0 ligne écrite" : "=> ÉCRITURE !");

out("\n## A12 aperçu : entrées falsifiées / limites");
const pvq = async (lines, extra = {}) => post("/api/site/cart/preview", JSON.stringify({ lines, ...extra }), H);
const L = (q, axes = l0.variant_axes, k = l0.public_item_key) => ({ public_item_key: k, variant_axes: axes, quantity: q });
for (const [n, body] of [
  ["quantité 0", [L(0)]], ["quantité 1000001", [L(1000001)]], ["quantité 2.5", [L(2.5)]], ["quantité '3'", [L("3")]],
  ["doublon", [L(1), L(2)]], ["axes forgés (couleur: bleu, taille: M)", [L(1, { couleur: "bleu", taille: "M" })]],
  ["axes absents", [L(1, {})]], ["clé alphabet interdit PI-00000035I", [L(1, l0.variant_axes, "PI-00000035I")]],
]) { const r = await pvq(body); out(`${n} -> ${r.s} ${r.t.slice(0, 140)}`); }
{ const r = await pvq([L(1)], { unit_amount: "0.01" }); out(`prix client injecté -> ${r.s} ${r.t.slice(0, 140)}`); }
{ const r = await post("/api/site/order", orderBody("order-rv-falsified-0001").replace(/"unit_amount":"[0-9.]+"/, '"unit_amount":"0.01"'), H); out(`commande prix falsifié -> ${r.s} ${r.t.slice(0, 160)}`); }
out("lignes :", JSON.stringify(await counts()));

out("\n## A02 en-têtes / HSTS");
for (const [p, h] of [["/", {}], ["/", { "x-forwarded-proto": "https" }], ["/api/site/receipt", {}], ["/recu", {}]]) {
  const r = await fetch(B + p, { headers: h });
  out(`${p} ${JSON.stringify(h)} -> ${r.status} HSTS=${r.headers.get("strict-transport-security")} nosniff=${r.headers.get("x-content-type-options")} fa=${/frame-ancestors 'none'/.test(r.headers.get("content-security-policy") ?? "")} script-unsafe-inline=${/script-src[^;]*unsafe-inline/.test(r.headers.get("content-security-policy") ?? "")} referrer=${r.headers.get("referrer-policy")}`);
}
const m = (await (await fetch(B + "/famille/gmce-demo")).text()).match(/\/media\/([0-9a-f]{64})/);
if (m) { const r = await fetch(B + "/media/" + m[1]); out(`/media/${m[1].slice(0, 12)}… -> ${r.status} ${r.headers.get("content-type")} nosniff=${r.headers.get("x-content-type-options")} cc=${r.headers.get("cache-control")}`); }

out("\n## A05 redirections ouvertes");
for (const p of ["//evil.example/", "/%2F%2Fevil.example", "/\\evil.example", "/famille/gmce-demo/", "//evil.example/%2e%2e", "/article/%2F%2Fevil.example", "/article/PI-000000358", "/article/https:%2F%2Fevil.example", "/recherche/?q=1", "/famille/gmce-demo?article=//evil.example"]) {
  const r = await fetch(B + p, { redirect: "manual" });
  out(`${p} -> ${r.status} location=${r.headers.get("location")}`);
}
const r2 = await fetch(B + "/article/PI-000000358", { redirect: "manual", headers: { "x-forwarded-host": "evil.example", host: "evil.example" } });
out(`/article/PI-000000358 avec Host/X-Forwarded-Host forgés -> ${r2.status} location=${r2.headers.get("location")}`);

out("\n## A14 recherche : échappement côté serveur");
for (const q of ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:alert(1)', "PI-000000358", "pi-000000358", "x".repeat(5000)]) {
  const r = await fetch(B + "/recherche?q=" + encodeURIComponent(q));
  const t = await r.text();
  out(`q=${q.slice(0, 40)} -> ${r.status} brut=${t.includes(q) && q.length < 100 && /[<>"]/.test(q) ? "PRÉSENT NON ÉCHAPPÉ" : "absent/échappé"} img-onerror=${/<img src=x onerror/.test(t)} script-alert=${/<script>alert/.test(t)} taille=${t.length} résultat-gmce=${t.includes("/famille/gmce-demo")}`);
}
await db.end();
