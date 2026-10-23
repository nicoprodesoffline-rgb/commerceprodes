// A07 UNSAFE (pointeur altéré) + A09 média altéré, base prodes_site_rv_bc3.
import { createRequire } from "node:module";
const require = createRequire("/Users/nico/Desktop/prodes-w1/review-bc3/package.json");
const pg = require("pg");
const db = new pg.Pool({ connectionString: "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3", max: 2 });
const B = "http://127.0.0.1:3364"; const H = { "content-type": "application/json" };
const counts = async () => JSON.stringify((await db.query("SELECT (SELECT count(*) FROM site_quote_request) q, (SELECT count(*) FROM site_order) o, (SELECT count(*) FROM site_idempotency) i, (SELECT count(*) FROM site_outbox_event) e")).rows[0]);
const pv = await (await fetch(B + "/api/site/cart/preview", { method: "POST", headers: H, body: JSON.stringify({ lines: [{ public_item_key: "PI-000000358", variant_axes: { couleur: "rouge", taille: "S" }, quantity: 2 }] }) })).json();
const l0 = pv.lines[0];
// A09 d'abord : média altéré
const html = await (await fetch(B + "/famille/gmce-demo")).text();
const shas = [...new Set([...html.matchAll(/\/media\/([0-9a-f]{64})/g)].map((m) => m[1]))];
console.log("## A09 média altéré ; médias référencés par la fiche :", shas.length);
const sha = shas[0];
console.log("avant :", (await fetch(B + "/media/" + sha)).status);
let upd;
try { upd = await db.query("UPDATE site_media SET bytes = set_byte(bytes, 29, get_byte(bytes, 29) # 255) WHERE sha256 = $1", [sha]); console.log("UPDATE site_media autorisé (rowCount", upd.rowCount, ")"); } catch (e) { console.log("UPDATE site_media refusé :", e.message); }
const rm = await fetch(B + "/media/" + sha);
console.log("après altération /media ->", rm.status, rm.headers.get("content-type"), "octets", (await rm.arrayBuffer()).byteLength);
const fiche = await fetch(B + "/famille/gmce-demo");
const ft = await fiche.text();
console.log("fiche ->", fiche.status, "mention 'Image indisponible' dans le HTML serveur :", ft.includes("Image indisponible"), "(rendu client attendu après onerror)");
await db.query("UPDATE site_media SET bytes = set_byte(bytes, 29, get_byte(bytes, 29) # 255) WHERE sha256 = $1", [sha]);
console.log("restauré /media ->", (await fetch(B + "/media/" + sha)).status);
// A07 UNSAFE
console.log("\n## A07 UNSAFE : pointeur altéré ; lignes avant", await counts());
const ptr = (await db.query("SELECT payload_sha256 FROM site_active_pointer WHERE singleton = 1")).rows[0].payload_sha256;
await db.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", ["0".repeat(64)]);
for (const p of ["/", "/famille/gmce-demo", "/categorie/signaletique", "/panier", "/devis", "/commande", "/recherche?q=a", "/article/PI-000000358", "/media/" + sha, "/recu"]) {
  const r = await fetch(B + p, { redirect: "manual" }); const t = await r.text();
  console.log(`GET ${p} -> ${r.status} ${t.includes("Catalogue indisponible") ? "« Catalogue indisponible »" : ""} prix affichés: ${/\d+,\d{2} €/.test(t)}`);
}
const rp = await fetch(B + "/api/site/cart/preview", { method: "POST", headers: H, body: JSON.stringify({ lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: 2 }] }) });
console.log("preview ->", rp.status, (await rp.text()).slice(0, 120));
const ro = await fetch(B + "/api/site/order", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "order", idempotency_key: "order-rv-unsafe-00001", catalogue_sequence: pv.catalogue_sequence, contact: { organisation_name: "M", contact_name: "J", email: "a@b.fr", phone: null }, currency: "EUR", total_amount: pv.total_amount, lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: 2, rate_id: l0.selection.rate_id, unit_amount: l0.selection.unit_amount, line_total: l0.line_total }] }) });
console.log("commande ->", ro.status, (await ro.text()).slice(0, 160));
const rq = await fetch(B + "/api/site/quote", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote-rv-unsafe-00001", catalogue_sequence: pv.catalogue_sequence, contact: { organisation_name: "M", contact_name: "J", email: "a@b.fr", phone: null }, message: null, lines: [{ public_item_key: l0.public_item_key, variant_axes: l0.variant_axes, quantity: 2, displayed: { rate_id: l0.selection.rate_id, unit_amount: l0.selection.unit_amount } }] }) });
console.log("devis chiffré ->", rq.status, (await rq.text()).slice(0, 160));
console.log("lignes après", await counts());
await db.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [ptr]);
console.log("pointeur restauré, / ->", (await fetch(B + "/")).status);
await db.end();
