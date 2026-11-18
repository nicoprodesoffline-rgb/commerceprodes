// Cercle 5, étape P1 : montants (M01 à M03, M07, M08), numéros, champs, constructeur de l'événement v2. Valeurs inventées seulement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";

const { vatCents, priceLine, priceDelivery, totals, lotText, toCents, toMoney, rateBasisPoints } = load("lib/site-requests/amounts.ts");
const { formatNumber, yearOf, NUMBER_FORMAT } = load("lib/site-requests/numbers.ts");
const { checkContact, checkMessage, checkAddress, checkCustomerRefs, checkPaymentMethod, checkTerms, checkPrivacyNotice, clean } = load("lib/site-requests/fields.ts");
const { quotePayload, orderPayload, messagePayload, buildEventV2, DOMAIN_PAYLOAD } = load("lib/site-requests/event-v2.ts");
const { digest, canonicalBytes } = load("c0/ts/src/jsonc.ts");

const RATE = "20.00";
const build = (rows, option = "incluse") => {
  const lines = rows.map(([quantity, unitHt]) => priceLine({ quantity, unitHt }, RATE));
  const delivery = priceDelivery(option, option === "incluse" ? "Livraison incluse" : "Livraison sur rendez-vous", "20.00", RATE);
  return { lines, delivery, amounts: totals(lines, delivery, RATE) };
};

test("M01 : 4 × 25,00 HT = 100,00 ; TVA 20,00 ; TTC 120,00", () => {
  const { amounts } = build([[4, "25.00"]]);
  assert.deepEqual([amounts.total_ht, amounts.total_tva, amounts.total_ttc], ["100.00", "20.00", "120.00"]);
});

test("M02 : TVA arrondie ligne par ligne, demi au-dessus", () => {
  const { lines, amounts } = build([[3, "3.33"], [1, "0.01"]]);
  assert.deepEqual(lines.map((l) => [l.line_total_ht, l.line_tva]), [["9.99", "2.00"], ["0.01", "0.00"]]);
  assert.deepEqual([amounts.total_ht, amounts.total_tva, amounts.total_ttc], ["10.00", "2.00", "12.00"]);
  assert.equal(toMoney(vatCents(25n, RATE)), "0.05", "0,25 × 20 % = 0,05");
  assert.equal(vatCents(2n, "25.00"), 1n, "0,5 centime → 1 centime (demi au-dessus)");
  assert.equal(vatCents(1n, "20.00"), 0n, "0,2 centime → 0");
  assert.equal(vatCents(3n, "50.00"), 2n, "1,5 → 2");
});

test("M03 : l'option sur rendez-vous est une ligne à part, 20 HT, 4 de TVA", () => {
  const { delivery, amounts } = build([[4, "25.00"]], "rendez_vous");
  assert.deepEqual(delivery, { option: "rendez_vous", label: "Livraison sur rendez-vous", amount_ht: "20.00", amount_tva: "4.00" });
  assert.deepEqual([amounts.total_ht, amounts.total_tva, amounts.total_ttc], ["120.00", "24.00", "144.00"]);
  assert.equal(build([[4, "25.00"]]).delivery.amount_ht, "0.00", "incluse = 0,00");
});

test("M08 : une ligne « prix sur devis » n'a aucun montant et les totaux le disent", () => {
  const { lines, amounts } = build([[2, "10.00"], [5, null]]);
  assert.deepEqual(lines[1], { unit_amount_ht: null, line_total_ht: null, line_tva: null });
  assert.equal(amounts.excludes_quote_lines, true);
  assert.equal(amounts.total_ttc, "24.00");
  assert.equal(build([[2, "10.00"]]).amounts.excludes_quote_lines, false);
});

test("M07 : la mention d'un lot", () => {
  assert.equal(lotText({ bought: 10, free: 2 }), "10 achetés + 2 offerts");
  assert.equal(lotText({ bought: 1, free: 1 }), "1 acheté + 1 offert");
});

test("montants : jamais de Number, formats stricts", () => {
  assert.equal(toCents("123456789.99"), 12345678999n);
  assert.throws(() => toCents("1.5"));
  assert.throws(() => vatCents(100n, "20"));
  assert.equal(rateBasisPoints("5.50"), 550n);
  assert.equal(rateBasisPoints("100.00"), null);
});

test("numéros : par type et par année, six chiffres", () => {
  assert.equal(formatNumber("quote_request", 2026, 1), "DEV-2026-000001");
  assert.equal(formatNumber("order", 2026, 123), "CMD-2026-000123");
  assert.equal(formatNumber("message", 2027, 1), "MSG-2027-000001");
  assert.equal(yearOf("2026-12-31T23:59:59Z"), 2026);
  for (const ok of ["DEV-2026-000001", "CMD-2026-999999", "MSG-2026-000042"]) assert.match(ok, NUMBER_FORMAT);
  for (const bad of ["QR-2026-000001", "DEV-26-000001", "DEV-2026-1", "dev-2026-000001"]) assert.doesNotMatch(bad, NUMBER_FORMAT);
});

test("contact : nom et e-mail obligatoires, organisation et téléphone facultatifs", () => {
  assert.deepEqual(checkContact({ organisation: " Mairie de Val-Fictif ", name: "Alex Test", email: "achats@val-fictif.example", phone: "" }), { ok: true, value: { organisation: "Mairie de Val-Fictif", name: "Alex Test", email: "achats@val-fictif.example", phone: null } });
  assert.deepEqual(checkContact({ name: "", email: "a@b.example" }), { ok: false, rules: ["contact_required"] });
  for (const email of ["sans-arobase", "a@b", "a@@b.example", "a b@c.example", ""]) assert.deepEqual(checkContact({ name: "Alex", email }), { ok: false, rules: ["contact_email"] }, email);
  assert.equal(checkContact({ name: "Alex", email: "a@b.example", phone: "0".repeat(41) }).ok, false);
});

test("message : obligatoire pour une demande libre, borné", () => {
  assert.deepEqual(checkMessage("  ", true, 5000), { ok: false, rules: ["message_required"] });
  assert.deepEqual(checkMessage("", false, 5000), { ok: true, value: null });
  assert.deepEqual(checkMessage("Bonjour\r\nmerci", true, 5000), { ok: true, value: "Bonjour\nmerci" });
  assert.deepEqual(checkMessage("x".repeat(5001), true, 5000), { ok: false, rules: ["message_length"] });
  assert.deepEqual(checkMessage("a\u0000b", true, 5000), { ok: false, rules: ["message_length"] });
  assert.equal(clean("é"), "é", "NFC");
});

test("C01, C02 : adresse de livraison obligatoire ; facturation absente = comme la livraison", () => {
  const ok = { name: "Mairie de Val-Fictif", line1: "7 allée Fictive", line2: "", postal_code: "00000", city: "Val-Fictif" };
  assert.deepEqual(checkAddress(ok), { ok: true, value: { ...ok, line2: null, country: "FR" } });
  assert.deepEqual(checkAddress({ ...ok, city: "" }), { ok: false, rules: ["address_required"] });
  assert.deepEqual(checkAddress(undefined), { ok: false, rules: ["address_required"] });
});

test("C03 : SIRET à 14 chiffres, ou vide ; références du client facultatives", () => {
  assert.deepEqual(checkCustomerRefs({ siret: `${"0".repeat(3)} ${"0".repeat(3)} ${"0".repeat(3)} ${"0".repeat(4)}1`, order_number: "EN-0042", service_code: "" }), { ok: true, value: { siret: `${"0".repeat(13)}1`, order_number: "EN-0042", service_code: null } });
  assert.deepEqual(checkCustomerRefs({ siret: "0".repeat(13) }), { ok: false, rules: ["siret_format"] });
  assert.deepEqual(checkCustomerRefs({}), { ok: true, value: { siret: null, order_number: null, service_code: null } });
});

test("C04, C06 : règlement connu, case des CGV cochée avec la version courante", () => {
  for (const m of ["cheque", "virement", "mandat_administratif"]) assert.equal(checkPaymentMethod(m).ok, true);
  for (const m of ["carte", "", undefined, "payé"]) assert.deepEqual(checkPaymentMethod(m), { ok: false, rules: ["payment_method"] });
  assert.equal(checkTerms({ accepted: true, cgv_version: "v1" }, "v1").ok, true);
  for (const t of [{ accepted: false, cgv_version: "v1" }, { accepted: true, cgv_version: "v0" }, {}, undefined, { accepted: "true", cgv_version: "v1" }]) assert.deepEqual(checkTerms(t, "v1"), { ok: false, rules: ["terms_required"] });
  assert.deepEqual(checkTerms({ accepted: true, cgv_version: "" }, ""), { ok: false, rules: ["terms_required"] });
  assert.equal(checkPrivacyNotice("m1", "m1").ok, true);
  assert.deepEqual(checkPrivacyNotice("", "m1"), { ok: false, rules: ["privacy_notice_required"] });
});

const contact = { organisation: "Mairie de Val-Fictif", name: "Alex Test", email: "achats@val-fictif.example", phone: null };
const lineOf = (extra = {}) => ({ public_item_key: "PI-ABCDEFGH2", variant_axes: { taille: "M" }, item_label: "Banc d'essai", quantity: 4, rate_id: "r-1", ...priceLine({ quantity: 4, unitHt: "25.00" }, RATE), lot: null, ...extra });
const keys = (o) => Object.keys(o);

test("D01 : l'événement v2 porte toutes les clés du payload de chaque type, rien d'autre", () => {
  const priced = build([[4, "25.00"]]);
  const base = { number: "DEV-2026-000001", contact, message: "Bonjour", privacy_notice: "m1", lines: [lineOf()], delivery: priced.delivery, amounts: priced.amounts };
  assert.deepEqual(keys(quotePayload(base)), ["number", "contact", "message", "privacy_notice", "lines", "delivery", "amounts"]);
  const addr = { name: "Mairie", line1: "7 allée Fictive", line2: null, postal_code: "00000", city: "Val-Fictif", country: "FR" };
  const order = orderPayload({ ...base, number: "CMD-2026-000001", addresses: { delivery: addr, billing: null }, customer_refs: { siret: null, order_number: "EN-1", service_code: null }, payment: { method: "virement", instructions: "Texte d'attente." }, terms: { cgv_version: "v1", accepted: true } });
  assert.deepEqual(keys(order), ["number", "contact", "message", "privacy_notice", "lines", "delivery", "amounts", "status", "addresses", "customer_refs", "payment", "terms"]);
  assert.equal(order.status, "RECEIVED");
  assert.equal(order.addresses.billing, null);
  const msg = messagePayload({ number: "MSG-2026-000001", contact, message: "Une question", privacy_notice: "m1", product: { public_item_key: null, label: "Banc d'essai", url: "/famille/banc-d-essai" } });
  assert.deepEqual(keys(msg), ["number", "contact", "message", "privacy_notice", "product"]);
  assert.deepEqual(keys(msg.product), ["public_item_key", "label", "url"]);
  assert.deepEqual(keys(quotePayload(base).lines[0]), ["public_item_key", "variant_axes", "item_label", "quantity", "rate_id", "unit_amount_ht", "line_total_ht", "line_tva", "lot"]);
  assert.deepEqual(keys(quotePayload(base).amounts), ["currency", "tax_rate", "total_ht", "total_tva", "total_ttc", "excludes_quote_lines"]);
});

test("événement v2 : enveloppe à dix clés, empreinte du domaine v2, octets canoniques, numéro cohérent", () => {
  const payload = messagePayload({ number: "MSG-2026-000001", contact, message: "Une question", privacy_notice: "m1", product: null });
  const { event, bytes } = buildEventV2({ type: "message.received", ref: "MSG-abc", number: "MSG-2026-000001", eventId: "EVT-abc", createdAtUtc: "2026-11-18T10:00:00Z", catalogueSequence: null, payload });
  assert.equal(keys(event).length, 10);
  assert.equal(event.contract_version, "site_events.v2");
  assert.equal(event.idempotency_key, "message.received:MSG-abc");
  assert.equal(event.payload_digest, digest(DOMAIN_PAYLOAD, payload));
  assert.notEqual(event.payload_digest, digest("prodes.site_events.v1.payload", payload), "pas le domaine du v1");
  assert.deepEqual([...bytes], [...canonicalBytes(event)]);
  assert.throws(() => buildEventV2({ type: "message.received", ref: "x", number: "MSG-2026-000002", eventId: "e", createdAtUtc: "2026-11-18T10:00:00Z", catalogueSequence: null, payload }), /numéro/);
  assert.throws(() => buildEventV2({ type: "message.received", ref: "x", number: "QR-1", eventId: "e", createdAtUtc: "2026-11-18T10:00:00Z", catalogueSequence: null, payload }));
});

test("lot : la ligne porte « 10 achetés + 2 offerts » dans le payload, la quantité compte des lots", () => {
  const l = lineOf({ quantity: 1, lot: { bought: 10, free: 2 }, ...priceLine({ quantity: 1, unitHt: "80.00" }, RATE) });
  const p = quotePayload({ number: "DEV-2026-000002", contact, message: null, privacy_notice: "m1", ...build([[1, "80.00"]]), lines: [l] });
  assert.deepEqual(p.lines[0].lot, { bought: 10, free: 2 });
  assert.equal(p.lines[0].line_total_ht, "80.00");
});

// ---- Jeu d'essai commun du v2 (Factory c5/d-demandes @fd36fb5b, recopié à l'octet) : le constructeur du site reproduit les cas valides OCTET POUR OCTET ----
import fs from "node:fs";
const caseOf = (name) => JSON.parse(fs.readFileSync(new URL(`../../lib/site-requests/fixtures/site_events_v2/${name}.json`, import.meta.url), "utf8"));

for (const name of ["quote_requested", "quote_with_quote_line", "order_received", "order_with_lot", "order_rendez_vous", "message_received"]) {
  test(`jeu d'essai commun : ${name} refabriqué par le site, mêmes octets et mêmes montants`, () => {
    const c = caseOf(name);
    assert.equal(c.expected.outcome, "APPLY");
    const e = JSON.parse(c.event_text);
    const p = e.payload;
    let payload;
    if (e.event_type === "message.received") {
      payload = messagePayload({ number: p.number, contact: p.contact, message: p.message, privacy_notice: p.privacy_notice, product: p.product });
    } else {
      const lines = p.lines.map((l) => ({ ...l, ...priceLine({ quantity: l.quantity, unitHt: l.unit_amount_ht }, p.amounts.tax_rate) }));
      const delivery = priceDelivery(p.delivery.option, p.delivery.label, "20.00", p.amounts.tax_rate);
      const amounts = totals(lines, delivery, p.amounts.tax_rate);
      assert.deepEqual(amounts, p.amounts, "le site recalcule les mêmes totaux que la Factory");
      assert.deepEqual(delivery, p.delivery);
      const base = { number: p.number, contact: p.contact, message: p.message, privacy_notice: p.privacy_notice, lines, delivery, amounts };
      payload = e.event_type === "quote.requested" ? quotePayload(base) : orderPayload({ ...base, addresses: p.addresses, customer_refs: p.customer_refs, payment: p.payment, terms: p.terms });
    }
    const built = buildEventV2({ type: e.event_type, ref: e.object_ref, number: p.number, eventId: e.event_id, createdAtUtc: e.created_at_utc, catalogueSequence: e.catalogue_sequence, payload });
    assert.equal(Buffer.from(built.bytes).toString("utf8"), c.event_text);
  });
}
