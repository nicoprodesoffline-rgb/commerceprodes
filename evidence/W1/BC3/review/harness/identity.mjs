// A08 identité + CART_STALE (F_IDENTITY gen_a → gen_b → gen_c via le receiver BC2 HTTP), base prodes_site_rv_bc3.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire("/Users/nico/Desktop/prodes-w1/review-bc3/package.json");
const pg = require("pg");
const db = new pg.Pool({ connectionString: "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc3", max: 2 });
const B = "http://127.0.0.1:3364"; const H = { "content-type": "application/json" };
const setup = (...a) => console.log(execFileSync("node", ["setup.mjs", "3364", ...a], { cwd: import.meta.dirname }).toString().trim());
const counts = async () => JSON.stringify((await db.query("SELECT (SELECT count(*) FROM site_quote_request) q, (SELECT count(*) FROM site_order) o, (SELECT count(*) FROM site_outbox_event) e")).rows[0]);
const prev = async (lines) => (await fetch(B + "/api/site/cart/preview", { method: "POST", headers: H, body: JSON.stringify({ lines }) })).json();
setup("reset", "F_IDENTITY.activate_gen_a");
const pvA = await prev([{ public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 4 }]);
console.log("gen A : séquence", pvA.catalogue_sequence, "accepté", pvA.accepted, "total", pvA.total_amount);
setup("keep", "F_IDENTITY.activate_gen_b_same_keys");
const l = pvA.lines[0];
const contact = { organisation_name: "M", contact_name: "J", email: "a@b.fr", phone: null };
console.log("lignes avant", await counts());
const o = await fetch(B + "/api/site/order", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "order", idempotency_key: "order-rv-stale-000001", catalogue_sequence: pvA.catalogue_sequence, contact, currency: "EUR", total_amount: pvA.total_amount, lines: [{ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: l.quantity, rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount, line_total: l.line_total }] }) });
const oj = await o.json(); console.log("commande sur gen A après activation gen B ->", o.status, JSON.stringify(oj.verdict?.error_codes ?? oj.error_codes), "durable", oj.durable);
const q = await fetch(B + "/api/site/quote", { method: "POST", headers: H, body: JSON.stringify({ contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote-rv-stale-000001", catalogue_sequence: pvA.catalogue_sequence, contact, message: null, lines: [{ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: 4, displayed: { rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount } }] }) });
const qj = await q.json(); console.log("devis chiffré sur gen A ->", q.status, JSON.stringify(qj.verdict?.error_codes ?? qj.error_codes));
console.log("lignes après", await counts());
setup("keep", "F_IDENTITY.activate_gen_c_tombstones");
for (const p of ["/article/PI-000000JW3", "/article/PI-000000JVF", "/article/PI-000000JSY", "/article/PI-000000ZZZ", "/article/pi-000000jvf", "/famille/inexistante", "/famille/chaise-pliante?article=PI-000000JSY", "/famille/chaise-pliante?article=%3Cscript%3E"]) {
  const r = await fetch(B + p, { redirect: "manual" }); const t = await r.text();
  console.log(`GET ${p} -> ${r.status} location=${r.headers.get("location")} ${/<title>([^<]*)/.exec(t)?.[1] ?? ""}`);
}
const pc = await prev([{ public_item_key: "PI-000000JW3", variant_axes: { modele: "D" }, quantity: 1 }, { public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 1 }]);
console.log("aperçu panier supplanté/retiré :", pc.lines.map((x) => `${x.public_item_key}:${x.error_codes.join("+")}:${JSON.stringify(x.superseded_by)}`).join(" ; "));
await db.end();
