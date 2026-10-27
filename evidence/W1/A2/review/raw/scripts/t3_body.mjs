import { start, req, jpost, line } from "./lib.mjs";
import http from "node:http";
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json", SITE_NOW_UTC: "2026-10-20T09:00:00Z" });
const codes = (r) => JSON.stringify(r.json?.verdict?.error_codes ?? r.json?.error_codes ?? r.text.slice(0, 80));
const valid = JSON.stringify({ contract_version: "site_business.v1", kind: "order", idempotency_key: "rv-body-000001", catalogue_sequence: 7, contact: { contact_name: "RV", email: "rv@example.invalid", organisation_name: "RV", phone: null }, currency: "EUR", total_amount: "110.00", lines: [{ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity: 10, rate_id: "R-401-T10", unit_amount: "11.00", line_total: "110.00" }] });
try {
  console.log("## RV-08 lecture stricte / bornée (POST /api/site/order sauf mention)");
  const cases = [
    ["JSON valide (référence)", Buffer.from(valid)],
    ["non-JSON", Buffer.from("hello")],
    ["virgule finale", Buffer.from(valid.replace(/}$/, ",}"))],
    ["BOM + JSON valide", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(valid)])],
    ["UTF-8 invalide (C3 28)", Buffer.from(valid.replace('"RV"', '"R\u0001V"').replace("\u0001", "")).toString().replace('"RV",', '"R') .length ? Buffer.concat([Buffer.from(valid.slice(0, valid.indexOf('"RV"') + 2)), Buffer.from([0xc3, 0x28]), Buffer.from(valid.slice(valid.indexOf('"RV"') + 2))]) : null],
    ["surlong UTF-8 (C0 AF)", Buffer.concat([Buffer.from(valid.slice(0, valid.indexOf('"RV"') + 2)), Buffer.from([0xc0, 0xaf]), Buffer.from(valid.slice(valid.indexOf('"RV"') + 2))])],
    ["surrogate isolé \\ud800", Buffer.from(valid.replace('"RV"', '"R\\ud800V"'))],
    ["clé dupliquée brute (kind)", Buffer.from(valid.replace('"kind":"order"', '"kind":"order","kind":"order"'))],
    ["clé dupliquée après NFC (é composé / décomposé dans variant_axes)", Buffer.from(valid.replace('"variant_axes":{}', '"variant_axes":{"café":"a","café":"a"}'))],
    ["espace NBSP hors SP/HT/LF/CR", Buffer.from(valid.replace('{"contract', '{ "contract'))],
    ["profondeur 64 (dans message)", null],
    ["profondeur 65", null],
    ["NaN", Buffer.from(valid.replace('"quantity":10', '"quantity":NaN'))],
    ["-0", Buffer.from(valid.replace('"catalogue_sequence":7', '"catalogue_sequence":-0'))],
  ];
  const nest = (n) => "[".repeat(n) + "]".repeat(n);
  cases[10][1] = Buffer.from(valid.replace('"currency":"EUR"', `"currency":"EUR","x":${nest(63)}`));
  cases[11][1] = Buffer.from(valid.replace('"currency":"EUR"', `"currency":"EUR","x":${nest(64)}`));
  for (const [label, body] of cases) { const r = await req("POST", "/api/site/order", { body, headers: { "content-type": "application/json" } }); line(label, r, codes(r)); }
  // Taille : 262144 octets exactement (JSON valide + espaces de fin) vs 262145
  for (const n of [262144, 262145]) { const b = Buffer.alloc(n, 0x20); Buffer.from(valid).copy(b); const r = await req("POST", "/api/site/order", { body: b, headers: { "content-type": "application/json" } }); line(`taille ${n} o`, r, codes(r)); }
  // Corps de 50 Mio en flux chunké : lecture bornée → réponse rapide sans tout lire
  await new Promise((resolve) => {
    const t0 = Date.now(); let sent = 0; const chunk = Buffer.alloc(65536, 0x20);
    const rq = http.request({ host: "127.0.0.1", port: 3342, path: "/api/site/order", method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => { console.log(`flux chunké 50 Mio → HTTP ${res.statusCode} ${d.slice(0, 120)} ; octets envoyés avant réponse ≈ ${sent} ; ${Date.now() - t0} ms`); resolve(); });
    });
    rq.on("error", (e) => { console.log(`flux chunké 50 Mio → connexion coupée par le serveur (${e.code}) après ≈ ${sent} octets, ${Date.now() - t0} ms`); resolve(); });
    (function pump() { while (sent < 50 * 1024 * 1024) { sent += chunk.length; if (!rq.write(chunk)) return rq.once("drain", pump); } rq.end(); })();
  });
  // Content-Length énorme annoncé, petit corps réel
  { const r = await req("POST", "/api/site/cart/preview", { body: "{", headers: { "content-type": "application/json" } }); line("aperçu '{'", r, codes(r)); }
  { const r = await req("POST", "/api/site/quote", { body: Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), headers: { "content-type": "application/json" } }); line("devis BOM+{}", r, codes(r)); }
  { const big = Buffer.alloc(262145, 0x20); Buffer.from('{"lines":[]}').copy(big); const r = await req("POST", "/api/site/cart/preview", { body: big, headers: { "content-type": "application/json" } }); line("aperçu 262145 o", r, codes(r)); }
  { const r = await req("GET", "/"); line("serveur toujours vivant après les attaques : GET /", r); }
} finally { await s.stop(); }
