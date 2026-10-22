#!/usr/bin/env node
// Spike BC1-D — tests HTTP S05–S09 (Node 22, fetch, aucune dépendance).
// Usage : BASE_URL=http://127.0.0.1:3311 PHASE=default|promo|before node spike/http-tests.mjs
// PHASE doit correspondre au SPIKE_NOW_UTC du serveur lancé :
//   default = 2026-10-22T20:00:00Z, promo = 2026-11-15T12:00:00Z, before = 2025-06-01T00:00:00Z
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3311";
const PHASE = process.env.PHASE ?? "default";
const EXPECTED_INSTANT = {
  default: "2026-10-22T20:00:00.000Z",
  promo: "2026-11-15T12:00:00.000Z",
  before: "2025-06-01T00:00:00.000Z",
}[PHASE];
const results = [];
const run = `${PHASE}-${Date.now()}`;

function record(id, scenario, label, expected, obtained, pass) {
  results.push({ id, scenario, label, expected, obtained, pass: !!pass });
}

async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
async function get(path, headers = {}) {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

const SIMPLE = { public_item_key: "PI-SIMPLE001", variant_axes: {} };
const GMCE_RM = { public_item_key: "PI-GMCE0001", variant_axes: { couleur: "rouge", taille: "M" } };
const GMCE_RL = { public_item_key: "PI-GMCE0002", variant_axes: { couleur: "rouge", taille: "L" } };
const ES_AP = { public_item_key: "PI-ESUNNY01", variant_axes: { toile: "acrylique", largeur: "300" } };
const contact = { name: "Test BC1-D", email: "test@example.invalid" };

async function preview(lines) {
  return post("/api/site/cart/preview", { lines });
}
const label = (j) => j && j.simulation === true && j.persistence === "NONE_CONTRACTUAL_SIMULATION";

async function phaseDefault() {
  // ── S05 paliers ──
  const tiers = [
    [1, "RATE-PI-SIMPLE001-BASE-1", "189.00"],
    [9, "RATE-PI-SIMPLE001-BASE-1", "189.00"],
    [10, "RATE-PI-SIMPLE001-BASE-2", "179.50"],
    [19, "RATE-PI-SIMPLE001-BASE-2", "179.50"],
    [20, "RATE-PI-SIMPLE001-BASE-3", "169.90"],
  ];
  for (const [q, rate, amt] of tiers) {
    const r = await preview([{ ...SIMPLE, quantity: q }]);
    const l = r.json?.lines?.[0];
    record(`S05-q${q}`, "S05", `PI-SIMPLE001 qty ${q}`, `200 ${rate} ${amt}`, `${r.status} ${l?.rate_id} ${l?.unit_amount}`,
      r.status === 200 && l?.rate_id === rate && l?.unit_amount === amt);
  }
  // somme exacte (12.40 × 3 vaut 37.199999… en flottant) + multi-lignes
  {
    const r = await preview([{ ...SIMPLE, quantity: 10 }, { ...GMCE_RL, quantity: 3 }, { ...ES_AP, quantity: 1 }]);
    const ls = r.json?.lines ?? [];
    const exp = "1795.00|37.20|349.00|2181.20";
    const got = `${ls.map((l) => l.line_amount).join("|")}|${r.json?.total_amount}`;
    record("S05-sum", "S05", "somme exacte serveur (10×179.50 + 3×12.40 + 349.00)", exp, got, r.status === 200 && got === exp);
  }
  // le montant renvoyé est une chaîne décimale, pas un Number
  {
    const r = await preview([{ ...SIMPLE, quantity: 1 }]);
    const t = typeof r.json?.lines?.[0]?.unit_amount;
    record("S05-type", "S05", "unit_amount sérialisé en chaîne", "string", t, t === "string");
  }

  // ── S06 panier unique, lignes affichées revalidées ──
  {
    const pv = await preview([{ ...SIMPLE, quantity: 10 }, { ...GMCE_RM, quantity: 2 }]);
    const displayed = pv.json.lines.map(({ public_item_key, variant_axes, quantity, rate_id, unit_amount }) => ({ public_item_key, variant_axes, quantity, rate_id, unit_amount }));
    const q = await post("/api/site/quote", { idempotency_key: `s06-${run}`, contact, lines: displayed });
    const same = JSON.stringify(q.json?.lines?.map((l) => [l.public_item_key, l.quantity, l.rate_id, l.unit_amount])) ===
      JSON.stringify(displayed.map((l) => [l.public_item_key, l.quantity, l.rate_id, l.unit_amount]));
    record("S06-revalidate", "S06", "lignes affichées → reçu avec les mêmes rate_id/montants", "200 + lignes identiques", `${q.status} same=${same}`, q.status === 200 && same);
    const noPrice = await post("/api/site/quote", { idempotency_key: `s06b-${run}`, contact, lines: [{ ...SIMPLE, quantity: 1 }] });
    record("S06-requires-displayed", "S06", "ligne sans rate_id/unit_amount affichés refusée", "400 INVALID_LINE", `${noPrice.status} ${noPrice.json?.error}`, noPrice.status === 400 && noPrice.json?.error === "INVALID_LINE");
    const cookies = [pv.headers.get("set-cookie"), q.headers.get("set-cookie"), (await get("/panier")).headers.get("set-cookie"), (await get("/famille/etabli-atelier-simple")).headers.get("set-cookie")];
    record("S06-no-cookie", "S06", "aucun Set-Cookie (pas de cartId) sur preview/quote/panier/fiche", "aucun", cookies.filter(Boolean).join(";") || "aucun", cookies.every((c) => c === null));
    const legacyCart = await post("/api/cart/share", { items: [] });
    record("S06-no-second-cart", "S06", "ancien panier serveur /api/cart/share absent", "404", String(legacyCart.status), legacyCart.status === 404);
  }

  // ── S07 devis : idempotence ──
  {
    const pv = await preview([{ ...GMCE_RL, quantity: 12 }]);
    const lines = pv.json.lines.map(({ public_item_key, variant_axes, quantity, rate_id, unit_amount }) => ({ public_item_key, variant_axes, quantity, rate_id, unit_amount }));
    const key = `s07-${run}`;
    const a = await post("/api/site/quote", { idempotency_key: key, contact, lines });
    record("S07-first", "S07", "devis valide → reçu étiqueté SIMULATION", "200 + simulation:true + NONE_CONTRACTUAL_SIMULATION + receipt_id", `${a.status} label=${label(a.json)} receipt=${a.json?.receipt_id}`,
      a.status === 200 && label(a.json) && typeof a.json?.receipt_id === "string" && a.json?.kind === "QUOTE_REQUEST" && a.json?.total_amount === "141.60");
    const b = await post("/api/site/quote", { idempotency_key: key, contact, lines });
    const strip = (j) => { const { replayed, ...rest } = j ?? {}; return JSON.stringify(rest); };
    record("S07-replay", "S07", "même clé + même payload → même reçu", `200 ${a.json?.receipt_id} identique`, `${b.status} ${b.json?.receipt_id} identique=${strip(a.json) === strip(b.json)}`,
      b.status === 200 && strip(a.json) === strip(b.json) && b.json?.replayed === true);
    const c = await post("/api/site/quote", { idempotency_key: key, contact, lines: [{ ...lines[0], quantity: 13 }] });
    record("S07-dup-diff", "S07", "même clé + payload différent", "409 DUPLICATE_KEY_DIFFERENT_PAYLOAD", `${c.status} ${c.json?.error}`, c.status === 409 && c.json?.error === "DUPLICATE_KEY_DIFFERENT_PAYLOAD" && label(c.json));
    const d = await post("/api/site/quote", { contact, lines });
    record("S07-no-key", "S07", "idempotency_key absente", "400 IDEMPOTENCY_KEY_REQUIRED", `${d.status} ${d.json?.error}`, d.status === 400 && d.json?.error === "IDEMPOTENCY_KEY_REQUIRED");
    const e = await post("/api/site/quote", { idempotency_key: `s07e-${run}`, contact: { name: "", email: "x" }, lines });
    record("S07-contact", "S07", "contact minimal invalide", "400 INVALID_CONTACT", `${e.status} ${e.json?.error}`, e.status === 400 && e.json?.error === "INVALID_CONTACT");
    // un refus n'enregistre pas la clé : la même clé avec un payload valide passe ensuite
    const f1 = await post("/api/site/quote", { idempotency_key: `s07f-${run}`, contact, lines: [{ ...lines[0], unit_amount: "0.01" }] });
    const f2 = await post("/api/site/quote", { idempotency_key: `s07f-${run}`, contact, lines });
    record("S07-refusal-not-stored", "S07", "refus (PRICE_CHANGED) puis même clé valide", "409 puis 200", `${f1.status} puis ${f2.status}`, f1.status === 409 && f2.status === 200);
  }

  // ── S08 commande ──
  {
    const pv = await preview([{ ...SIMPLE, quantity: 1 }]);
    const ok = pv.json.lines[0];
    const base = { public_item_key: ok.public_item_key, variant_axes: ok.variant_axes, quantity: 1, rate_id: ok.rate_id, unit_amount: ok.unit_amount };
    const a = await post("/api/site/order", { idempotency_key: `s08a-${run}`, contact, lines: [base] });
    record("S08-accepted", "S08", "commande au montant affiché", "200 ORDER 189.00 + SIMULATION", `${a.status} ${a.json?.kind} ${a.json?.total_amount} label=${label(a.json)}`,
      a.status === 200 && a.json?.kind === "ORDER" && a.json?.total_amount === "189.00" && label(a.json));
    const b = await post("/api/site/order", { idempotency_key: `s08b-${run}`, contact, lines: [{ ...base, unit_amount: "1.00" }] });
    record("S08-falsified", "S08", "montant falsifié 1.00", "409 PRICE_CHANGED", `${b.status} ${b.json?.error}`, b.status === 409 && b.json?.error === "PRICE_CHANGED" && b.json?.errors?.[0]?.detail?.current?.unit_amount === "189.00");
    const b2 = await post("/api/site/order", { idempotency_key: `s08b2-${run}`, contact, lines: [{ ...base, quantity: 10 }] });
    record("S08-stale-tier", "S08", "qty 10 envoyée avec le palier 1-9 (189.00)", "409 PRICE_CHANGED (attendu 179.50)", `${b2.status} ${b2.json?.error} ${b2.json?.errors?.[0]?.detail?.current?.unit_amount}`,
      b2.status === 409 && b2.json?.error === "PRICE_CHANGED" && b2.json?.errors?.[0]?.detail?.current?.unit_amount === "179.50");
    const b3 = await post("/api/site/order", { idempotency_key: `s08b3-${run}`, contact, lines: [{ ...base, unit_amount: "189" }] });
    record("S08-equal-amount-other-notation", "S08", "189 au lieu de 189.00 (même valeur)", "200", String(b3.status), b3.status === 200);
    const c = await post("/api/site/order", { idempotency_key: `s08c-${run}`, contact, lines: [{ public_item_key: "PI-ESUNNY01", variant_axes: { toile: "acrylique", largeur: "400" }, quantity: 1, rate_id: "RATE-PI-ESUNNY01-BASE-1", unit_amount: "349.00" }] });
    record("S08-forbidden", "S08", "ESUNNY acrylique×400", "400 INVALID_VARIANT FORBIDDEN_COMBINATION", `${c.status} ${c.json?.error} ${c.json?.errors?.[0]?.detail?.reason}`,
      c.status === 400 && c.json?.error === "INVALID_VARIANT" && c.json?.errors?.[0]?.detail?.reason === "FORBIDDEN_COMBINATION");
    const c2 = await post("/api/site/order", { idempotency_key: `s08c2-${run}`, contact, lines: [{ public_item_key: "PI-GMCE0002", variant_axes: { couleur: "bleu", taille: "L" }, quantity: 1, rate_id: "RATE-PI-GMCE0002-BASE-1", unit_amount: "12.40" }] });
    record("S08-absent", "S08", "GMCE bleu/L (non publié)", "400 INVALID_VARIANT ABSENT_COMBINATION", `${c2.status} ${c2.json?.error} ${c2.json?.errors?.[0]?.detail?.reason}`,
      c2.status === 400 && c2.json?.error === "INVALID_VARIANT" && c2.json?.errors?.[0]?.detail?.reason === "ABSENT_COMBINATION");
    const c3 = await post("/api/site/order", { idempotency_key: `s08c3-${run}`, contact, lines: [{ public_item_key: "PI-INCONNU", variant_axes: {}, quantity: 1, rate_id: "X", unit_amount: "1.00" }] });
    record("S08-unknown-item", "S08", "item inconnu", "400 INVALID_VARIANT", `${c3.status} ${c3.json?.error}`, c3.status === 400 && c3.json?.error === "INVALID_VARIANT");
    const d = await post("/api/site/order", { idempotency_key: `s08d-${run}`, contact, lines: [{ ...base, quantity: 0 }] });
    record("S08-no-window", "S08", "quantité 0 (aucune fenêtre)", "409 PRICE_WINDOW_UNAVAILABLE", `${d.status} ${d.json?.error}`, d.status === 409 && d.json?.error === "PRICE_WINDOW_UNAVAILABLE");
    const e = await post("/api/site/order", { idempotency_key: `s08e-${run}`, contact, lines: [{ ...base, quantity: 1.5 }] });
    record("S08-fractional", "S08", "quantité 1.5", "400 INVALID_QUANTITY", `${e.status} ${e.json?.error}`, e.status === 400 && e.json?.error === "INVALID_QUANTITY");
    const m = await post("/api/site/order", { idempotency_key: `s08m-${run}`, contact, lines: [base, { ...base, unit_amount: "2.00" }] });
    record("S08-partial-refused", "S08", "1 ligne valide + 1 falsifiée → aucun reçu", "409 sans receipt_id", `${m.status} receipt=${m.json?.receipt_id}`, m.status === 409 && m.json?.receipt_id === undefined);
    const g = await post("/api/site/order", "pas du json");
    record("S08-bad-json", "S08", "corps non JSON", "400 INVALID_REQUEST", `${g.status} ${g.json?.error}`, g.status === 400 && g.json?.error === "INVALID_REQUEST");
    const bodies = [a, b, b2, c, c2, d, e, m, g].map((x) => x.text);
    record("S08-no-success-flag", "S08", "aucune réponse ne contient \"success\"", "0", String(bodies.filter((t) => t.includes('"success"')).length), bodies.every((t) => !t.includes('"success"')));
    const promoFuture = await preview([{ ...GMCE_RM, quantity: 1 }]);
    record("S03-promo-future", "S03", "GMCE rouge/M qty 1 avant la promo", "BASE RATE-PI-GMCE0001-BASE-1 12.40", `${promoFuture.json?.lines?.[0]?.layer} ${promoFuture.json?.lines?.[0]?.rate_id} ${promoFuture.json?.lines?.[0]?.unit_amount}`,
      promoFuture.json?.lines?.[0]?.rate_id === "RATE-PI-GMCE0001-BASE-1" && promoFuture.json?.lines?.[0]?.unit_amount === "12.40");
  }

  // ── S09 routes legacy ──
  const legacy = [
    "/admin", "/admin/login", "/admin/devis", "/admin/devis/1", "/admin/produits", "/admin/catalogue", "/admin/import",
    "/api/admin/auth", "/api/admin/export-products", "/api/admin/products-list", "/api/admin/ia/categories-list",
    "/api/admin/paniers-abandonnes/1/recover", "/api/admin/products/1", "/api/admin/devis/1", "/api/admin/site-config",
    "/api/checkout", "/checkout", "/checkout/confirmation", "/api/checkout/bon-de-commande",
    "/api/devis", "/api/devis-express", "/devis-express", "/api/devis-status/X", "/api/revalidate", "/api/track",
    "/mes-commandes", "/mon-devis/X", "/panier/abc", "/api/cart/share", "/api/cart/abandon", "/cart",
    "/api/contact", "/api/search", "/api/product-by-sku", "/api/products-by-handles", "/api/product-pdf/x",
  ];
  const evil = { cookie: "admin_session=forged", authorization: "Bearer x" };
  for (const p of legacy) {
    const g = await get(p, evil);
    const po = await post(p, { any: 1 }, evil);
    const ok = g.status === 404 && po.status === 404 && !g.text.includes('"success"') && !po.text.includes('"success"');
    record(`S09-${p}`, "S09", `${p} GET+POST (cookie forgé + Bearer)`, "404/404", `${g.status}/${po.status}`, ok);
  }
}

async function phasePromo() {
  const r = await preview([{ ...GMCE_RM, quantity: 1 }, { ...GMCE_RM, quantity: 25 }, { ...GMCE_RL, quantity: 1 }]);
  const ls = r.json?.lines ?? [];
  record("S03-promo-active-q1", "S03", "GMCE rouge/M qty 1 pendant la promo", "PROMO RATE-PI-GMCE0001-PROMO-1 9.99", `${ls[0]?.layer} ${ls[0]?.rate_id} ${ls[0]?.unit_amount}`, ls[0]?.rate_id === "RATE-PI-GMCE0001-PROMO-1" && ls[0]?.unit_amount === "9.99");
  record("S03-promo-active-q25", "S03", "GMCE rouge/M qty 25 pendant la promo", "PROMO 9.99 (règle provisoire PROMO > BASE)", `${ls[1]?.layer} ${ls[1]?.unit_amount}`, ls[1]?.rate_id === "RATE-PI-GMCE0001-PROMO-1" && ls[1]?.unit_amount === "9.99");
  record("S03-promo-scope", "S03", "GMCE rouge/L non concerné par la promo", "BASE 12.40", `${ls[2]?.layer} ${ls[2]?.unit_amount}`, ls[2]?.rate_id === "RATE-PI-GMCE0002-BASE-1" && ls[2]?.unit_amount === "12.40");
  const stale = await post("/api/site/order", { idempotency_key: `promo-${run}`, contact, lines: [{ ...GMCE_RM, quantity: 1, rate_id: "RATE-PI-GMCE0001-BASE-1", unit_amount: "12.40" }] });
  record("S08-promo-stale", "S08", "prix BASE affiché avant la promo, envoyé pendant", "409 PRICE_CHANGED (9.99)", `${stale.status} ${stale.json?.error} ${stale.json?.errors?.[0]?.detail?.current?.unit_amount}`,
    stale.status === 409 && stale.json?.error === "PRICE_CHANGED" && stale.json?.errors?.[0]?.detail?.current?.unit_amount === "9.99");
}

async function phaseBefore() {
  const r = await post("/api/site/order", { idempotency_key: `before-${run}`, contact, lines: [{ ...SIMPLE, quantity: 1, rate_id: "RATE-PI-SIMPLE001-BASE-1", unit_amount: "189.00" }] });
  record("S08-before-windows", "S08", "instant 2025-06-01 (avant toute fenêtre)", "409 PRICE_WINDOW_UNAVAILABLE", `${r.status} ${r.json?.error}`, r.status === 409 && r.json?.error === "PRICE_WINDOW_UNAVAILABLE");
  const p = await get("/famille/etabli-atelier-simple");
  record("S08-before-ui", "S08", "fiche affiche « Prix indisponible »", "texte présent", p.text.includes("Prix indisponible") ? "présent" : "absent", p.status === 200 && p.text.includes("Prix indisponible"));
}

const probe = await preview([{ ...SIMPLE, quantity: 1 }]);
if (probe.json?.instant_utc !== EXPECTED_INSTANT) {
  console.error(`Instant serveur ${probe.json?.instant_utc} ≠ attendu ${EXPECTED_INSTANT} pour PHASE=${PHASE}`);
  process.exit(2);
}
if (PHASE === "default") await phaseDefault();
else if (PHASE === "promo") await phasePromo();
else await phaseBefore();

let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.id} | ${r.label} | attendu: ${r.expected} | obtenu: ${r.obtained}`);
}
console.log(`\nPHASE=${PHASE} instant=${EXPECTED_INSTANT} : ${results.length - fail}/${results.length} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
