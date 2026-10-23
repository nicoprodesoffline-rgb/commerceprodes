import { start, req, jpost, line } from "./lib.mjs";
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: "2026-10-20T09:00:00Z" });
const C = { contact_name: "RV Contact", email: "rv@example.invalid", organisation_name: "RV Org", phone: null };
const P = (lines) => jpost("/api/site/cart/preview", { lines });
const sum = (r) => r.json?.lines?.map(l => `${l.quantity}:${l.accepted ? l.selection.rate_id + "=" + l.selection.unit_amount + " tot " + l.line_total : l.error_codes.join("+")}`).join(" | ") ?? JSON.stringify(r.json?.error_codes ?? r.text.slice(0, 120));
try {
  console.log("## RV-01 paliers (aperçu, PI-000000CHJ, 2026-10-20T09:00:00Z)");
  for (const q of [1, 9, 10, 19, 20, 21, 1000000, 1000001, 0, -1, "10"]) { const r = await P([{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: q }]); line(`qty ${JSON.stringify(q)}`, r, sum(r)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{},"quantity":1.5}]}'); line("qty 1.5 (octets bruts)", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{},"quantity":10.0}]}'); line("qty 10.0", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{},"quantity":1e1}]}'); line("qty 1e1", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{},"quantity":9007199254740993}]}'); line("qty 2^53+1", r, JSON.stringify(r.json.error_codes)); }
  { const r = await P([{ public_item_key: "PI-000000CJS", variant_axes: {}, quantity: 5 }]); line("potelet qty 5 (fenêtre future seulement)", r, sum(r) + " total=" + r.json.total_amount); }
  console.log("## RV-02 deux lignes même clé, axes différents");
  { const r = await P([{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5 }, { public_item_key: "PI-000000CHJ", variant_axes: { coloris: "rouge" }, quantity: 5 }]); line("aperçu", r, sum(r) + " total=" + r.json.total_amount); }
  { const r = await jpost("/api/site/order", { contract_version: "site_business.v1", kind: "order", idempotency_key: "rv-order-axes-0001", catalogue_sequence: 7, contact: C, currency: "EUR", total_amount: "120.00",
      lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "60.00" }, { public_item_key: "PI-000000CHJ", variant_axes: { coloris: "rouge" }, quantity: 5, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "60.00" }] });
    line("commande", r, JSON.stringify(r.json.verdict.error_codes)); }
  console.log("## RV-03 deux lignes identiques");
  { const r = await P([{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5 }, { public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5 }]); line("aperçu 5+5", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/order", { contract_version: "site_business.v1", kind: "order", idempotency_key: "rv-order-dup-0001", catalogue_sequence: 7, contact: C, currency: "EUR", total_amount: "120.00",
      lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "60.00" }, { public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 5, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "60.00" }] });
    line("commande 5+5 au palier 1–9", r, JSON.stringify(r.json.verdict.error_codes)); }
  console.log("## RV-04 commande 9 → 10 au prix 1–9 ; séquence périmée");
  const o = (over) => ({ contract_version: "site_business.v1", kind: "order", idempotency_key: "rv-order-0000001", catalogue_sequence: 7, contact: C, currency: "EUR", ...over });
  { const r = await jpost("/api/site/order", o({ total_amount: "108.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 9, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "108.00" }] })); line("commande 9 @12.00 (référence)", r, `${r.json.verdict.outcome} ${JSON.stringify(r.json.verdict.error_codes)} persistence=${r.json.persistence} durable=${r.json.durable} receipt_ref=${JSON.stringify(r.text).includes("receipt_ref")}`); }
  { const r = await jpost("/api/site/order", o({ total_amount: "120.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-B1", unit_amount: "12.00", line_total: "120.00" }] })); line("commande 10 @ R-401-B1 12.00", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ total_amount: "120.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "12.00", line_total: "120.00" }] })); line("commande 10 @ R-401-T10 mais 12.00", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line("commande 10 @ T10 11.00 (juste)", r, `${r.json.verdict.outcome} total=${r.json.verdict.receipt?.total_amount}`); }
  { const r = await jpost("/api/site/order", o({ total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.0" }] })); line("line_total '110.0'", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ total_amount: "109.99", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line("total 109.99", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ catalogue_sequence: 6, total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line("commande séquence 6", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ catalogue_sequence: 8, total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line("commande séquence 8 (future)", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/order", o({ catalogue_sequence: "7", total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line("commande séquence \"7\"", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/quote", { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "rv-quote-0000001", catalogue_sequence: 6, contact: C, message: null, lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, displayed: { rate_id: "R-401-T10", unit_amount: "11.00" } }] }); line("devis chiffré séquence 6", r, JSON.stringify(r.json.verdict.error_codes)); }
  { const r = await jpost("/api/site/quote", { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "rv-quote-0000002", catalogue_sequence: null, contact: C, message: null, lines: [{ public_item_key: "PI-000000CJS", variant_axes: {}, quantity: 500, displayed: null }] }); line("devis non chiffré sans fenêtre", r, `${r.json.verdict.outcome} ${JSON.stringify(r.json.verdict.receipt?.lines?.[0])} persistence=${r.json.persistence} durable=${r.json.durable} receipt_ref=${r.text.includes("receipt_ref")}`); }
  console.log("## RV-05 clés client hors contrat");
  for (const k of ["tax_amount", "shipping_amount", "status", "vat_rate", "receipt_ref", "__proto__"]) {
    const raw = JSON.stringify(o({ total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })).replace(/}$/, `,"${k}":"0.00"}`);
    const r = await jpost("/api/site/order", raw); line(`commande + ${k}`, r, JSON.stringify(r.json.verdict?.error_codes));
  }
  { const r = await P([{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, unit_amount: "0.01" }]); line("aperçu + unit_amount navigateur", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{},"quantity":10}],"__proto__":{"x":1}}'); line("aperçu + __proto__", r, JSON.stringify(r.json.error_codes)); }
  { const r = await jpost("/api/site/cart/preview", '{"lines":[{"public_item_key":"PI-000000CHJ","variant_axes":{"__proto__":"x"},"quantity":10}]}'); line("aperçu axes __proto__", r, sum(r)); }
  { const r = await P([{ public_item_key: "pi-000000chj", variant_axes: {}, quantity: 10 }]); line("aperçu clé minuscule", r, sum(r)); }
  { const r = await P([{ public_item_key: "PF-000000CHM", variant_axes: {}, quantity: 10 }]); line("aperçu clé Famille", r, sum(r)); }
  { const r = await P([{ public_item_key: "PI-000000CHK", variant_axes: {}, quantity: 10 }]); line("aperçu contrôle faux", r, sum(r)); }
  { const r = await P(Array.from({ length: 201 }, (_, i) => ({ public_item_key: "PI-000000CHJ", variant_axes: { a: String(i) }, quantity: 1 }))); line("aperçu 201 lignes", r, JSON.stringify(r.json.error_codes)); }
  { const r = await P([]); line("aperçu 0 ligne", r, JSON.stringify(r.json.error_codes)); }
  console.log("## RV-06 double POST identique (registre vide)");
  for (let i = 0; i < 2; i++) { const r = await jpost("/api/site/order", o({ total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] })); line(`POST #${i + 1}`, r, `${r.json.verdict.outcome} persistence=${r.json.persistence} durable=${r.json.durable} receipt_keys=${Object.keys(r.json.verdict.receipt ?? {}).join(",")}`); }
  console.log("## RV-07 méthodes et types");
  for (const m of ["GET", "PUT", "DELETE"]) { const r = await req(m, "/api/site/order"); line(`${m} /api/site/order`, r); }
  { const r = await req("POST", "/api/site/order", { body: '{"a":1}', headers: { "content-type": "text/plain" } }); line("POST text/plain", r, JSON.stringify(r.json?.verdict?.error_codes)); }
  { const r = await req("POST", "/api/site/order"); line("POST sans corps", r, JSON.stringify(r.json?.verdict?.error_codes)); }
} finally { await s.stop(); }
