// A04 XSS + A06 jeton : devis/commande aux champs piégés, reçu via API ; recherche du jeton dans le journal serveur.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/nico/Desktop/prodes-w1/review-bc3/package.json");
const pg = require("pg");
const db = new pg.Pool({ connectionString: "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3", max: 2 });
const B = "http://127.0.0.1:3364"; const H = { "content-type": "application/json" };
const P = { s: "<script>alert('org')</script>", i: '"><img src=x onerror=alert(1)>', j: "javascript:alert(1)" };
const pv = await (await fetch(B + "/api/site/cart/preview", { method: "POST", headers: H, body: JSON.stringify({ lines: [{ public_item_key: "PI-000000358", variant_axes: { couleur: "rouge", taille: "S" }, quantity: 3 }] }) })).json();
const l0 = pv.lines[0];
const contact = { organisation_name: P.s, contact_name: P.i, email: "x@y.fr", phone: null };
const q = await fetch(B + "/api/site/quote", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote-rv-xss-000001", catalogue_sequence: pv.catalogue_sequence, contact, message: P.j + " " + P.i, lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: 3, displayed: { rate_id: l0.selection.rate_id, unit_amount: l0.selection.unit_amount } }] }) });
const qj = await q.json();
console.log("devis piégé ->", q.status, qj.outcome, qj.receipt_ref, "jeton présent:", typeof qj.access_token === "string");
const o = await fetch(B + "/api/site/order", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "order", idempotency_key: "order-rv-xss-000001", catalogue_sequence: pv.catalogue_sequence, contact, currency: "EUR", total_amount: pv.total_amount, lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: 3, rate_id: l0.selection.rate_id, unit_amount: l0.selection.unit_amount, line_total: l0.line_total }] }) });
const oj = await o.json();
console.log("commande piégée ->", o.status, oj.outcome, oj.receipt_ref, "total", oj.receipt?.total_amount);
const rows = await db.query("SELECT organisation_name, contact_name FROM site_quote_request LIMIT 1").catch((e) => ({ rows: [{ err: e.message }] }));
console.log("stocké tel quel (attendu, l'échappement se fait au rendu) :", JSON.stringify(rows.rows[0]));
for (const [k, j] of [["devis", qj], ["commande", oj]]) {
  const r = await fetch(B + `/api/site/receipt?ref=${encodeURIComponent(j.receipt_ref)}&access_token=${encodeURIComponent(j.access_token)}`);
  const t = await r.text();
  console.log(`reçu ${k} API -> ${r.status} contient contact/message: ${t.includes("onerror") || t.includes("<script>") || t.includes("javascript:")} ; extrait: ${t.slice(0, 200)}`);
  const bad = await fetch(B + `/api/site/receipt?ref=${encodeURIComponent(j.receipt_ref)}&access_token=faux-jeton-000`);
  const none = await fetch(B + `/api/site/receipt?ref=${encodeURIComponent(j.receipt_ref)}`);
  const unk = await fetch(B + `/api/site/receipt?ref=QR-00000000000000000000000000000000&access_token=faux-jeton-000`);
  console.log(`  jeton faux -> ${bad.status} ${(await bad.text()).slice(0, 90)} | sans jeton -> ${none.status} | réf inconnue -> ${unk.status}`);
}
writeFileSync(process.argv[2], JSON.stringify({ q: { ref: qj.receipt_ref, token: qj.access_token }, o: { ref: oj.receipt_ref, token: oj.access_token } }));
const log = readFileSync(process.argv[3], "utf8");
console.log("journal serveur : jeton devis présent =", log.includes(qj.access_token), "; jeton commande présent =", log.includes(oj.access_token), "; e-mail présent =", log.includes("x@y.fr"), "; lignes de journal =", log.split("\n").length);
await db.end();
