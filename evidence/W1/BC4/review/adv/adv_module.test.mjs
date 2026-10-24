// Review indépendante BC4 — cas adversariaux au niveau module (même code que les routes), PostgreSQL réel
// prodes_site_rv_bc4_test. Oracle = C0 vendu lui-même (validateOrderSubmit/validateQuoteRequest/validateEvent),
// jamais une valeur devinée. Écrit par le reviewer ; ne modifie aucun fichier du builder.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";
import {
  KEYRING, ZERO, activate, barrier, business, businessCase, c0business, c0events, counts, jsonc, newPool, poll, ack,
  rawSign, headers, events, receipt, resetDb, siteDb, submit, DB_URL,
} from "../../../../../tests/bc4/helpers.mjs";

const NOW = "2026-10-20T09:00:00Z";
const VALID = businessCase("F_QUOTE_ORDER.order_valid");
const BASE_ORDER = JSON.parse(Buffer.from(VALID.bytes).toString("utf8"));
const enc = (o) => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o));
const withKey = (o, k) => ({ ...structuredClone(o), idempotency_key: k });
let pool;

async function genNow(p) {
  const g = await siteDb.getActiveGeneration(p);
  return { snapshot: g.snapshot, status: g.status };
}
const log = (...a) => console.log("# ADV", ...a);

describe("ADV module", () => {
  before(async () => { await resetDb(); pool = newPool(20); await activate(pool, "F_SELL_WINDOWS.activate"); });
  after(async () => { await pool.end(); });

  test("ADV-01 10 POST concurrents même clé (barrière 10) → 1 RECEIVED, 9 REPLAY, 1 objet, 1 événement, reçus identiques", async () => {
    const before = await counts(pool);
    const bytes = enc(withKey(BASE_ORDER, "order:rv:conc-10"));
    const wait = barrier(10);
    const rs = await Promise.all(Array.from({ length: 10 }, () => submit(pool, "order", bytes, NOW, { afterValidate: wait })));
    const outcomes = rs.map((r) => `${r.status}:${r.body.outcome}`).sort();
    log("ADV-01 outcomes", JSON.stringify(outcomes));
    assert.equal(rs.filter((r) => r.body.outcome === "RECEIVED").length, 1);
    assert.equal(rs.filter((r) => r.body.outcome === "REPLAY_SAME_RECEIPT").length, 9);
    const strip = (b) => { const { access_token, outcome, ...rest } = b; return rest; };
    const norm = rs.map((r) => JSON.stringify(strip(r.body), Object.keys(strip(r.body)).sort()));
    const first = strip(rs.find((r) => r.body.outcome === "RECEIVED").body);
    for (const r of rs) assert.deepEqual(strip(r.body), first, "réponses identiques hors access_token/outcome");
    assert.equal(rs.filter((r) => typeof r.body.access_token === "string").length, 1);
    const after = await counts(pool);
    assert.equal(after.site_order - before.site_order, 1);
    assert.equal(after.site_outbox_event - before.site_outbox_event, 1);
    assert.equal(after.site_idempotency - before.site_idempotency, 1);
  });

  test("ADV-02 échec du COMMIT lui-même (contrainte différée violée juste avant COMMIT) → 503 DB_WRITE_FAILED, 0 ligne", async () => {
    const before = await counts(pool);
    const bytes = enc(withKey(BASE_ORDER, "order:rv:commit-fail"));
    const r = await submit(pool, "order", bytes, NOW, {
      beforeCommit: async (client) => {
        const { rows } = await client.query("SELECT id FROM site_order WHERE idempotency_key = 'order:rv:commit-fail'");
        // ligne parasite valide en soi (CHECK immédiats OK) mais Σ ≠ total_cents → trigger différé au COMMIT
        await client.query(`INSERT INTO site_order_line (order_id, line_no, public_item_key, variant_axes, quantity, catalogue_sequence, rate_id, unit_amount, unit_cents, currency, tax_basis_or_status, offer_price_version_public, line_total, line_total_cents)
          VALUES ($1, 99, 'PI-ZZZZZZZZZ', '{}'::jsonb, 1, 7, 'R-X', '1.00', 100, 'EUR', 'HT', 'OPV-X', '1.00', 100)`, [rows[0].id]);
      },
    });
    log("ADV-02", r.status, JSON.stringify(r.body.error_codes), JSON.stringify(r.body.detail));
    assert.equal(r.status, 503);
    assert.equal(r.body.accepted, false);
    assert.deepEqual(r.body.error_codes, ["DB_WRITE_FAILED"]);
    assert.equal(r.body.detail.reason, "23514");
    assert.deepEqual(await counts(pool), before);
    // la même clé est ensuite utilisable (rien de commité) :
    const again = await submit(pool, "order", bytes, NOW);
    assert.equal(again.body.outcome, "RECEIVED");
  });

  test("ADV-03 connexion tuée (pg_terminate_backend) pendant la transaction puis requête suivante sur le même pool → RECEIVED", async () => {
    const killer = new pg.Client({ connectionString: DB_URL() });
    await killer.connect();
    const before = await counts(pool);
    const bytes = enc(withKey(BASE_ORDER, "order:rv:killed"));
    const r = await submit(pool, "order", bytes, NOW, {
      afterValidate: async (client) => {
        const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
        await killer.query("SELECT pg_terminate_backend($1)", [rows[0].pid]);
      },
    });
    log("ADV-03 killed", r.status, JSON.stringify(r.body.error_codes), JSON.stringify(r.body.detail));
    assert.equal(r.status, 503);
    assert.deepEqual(r.body.error_codes, ["DB_WRITE_FAILED"]);
    assert.deepEqual(await counts(pool), before);
    // connexions inactives du pool tuées aussi
    await killer.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle'");
    await new Promise((res) => setTimeout(res, 200));
    const next = await submit(pool, "order", bytes, NOW);
    log("ADV-03 next", next.status, next.body.outcome);
    assert.equal(next.body.outcome, "RECEIVED");
    await killer.end();
  });

  test("ADV-04a activation BC2 PENDANT une transaction BC4 : l'activation attend le COMMIT BC4 ; la commande garde la séquence d'origine", async () => {
    // Génération F_IDENTITY gen_a puis gen_b dans une base dédiée à ce test (reset).
    await resetDb();
    await activate(pool, "F_IDENTITY.activate_gen_a");
    const gen = await genNow(pool);
    const NOW_A = "2026-10-20T12:00:00Z";
    const item = gen.snapshot.families.flatMap((f) => f.items).find((it) => c0business.selectPrice(gen, it.public_item_key, it.variant_axes, 2, NOW_A).accepted);
    const sel = c0business.selectPrice(gen, item.public_item_key, item.variant_axes, 2, NOW_A).selection;
    const quote = { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote:rv:during-activation", catalogue_sequence: gen.snapshot.catalogue_sequence,
      contact: BASE_ORDER.contact, message: null, lines: [{ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity: 2, displayed: { rate_id: sel.rate_id, unit_amount: sel.unit_amount } }] };
    const order = []; // chronologie
    let releaseBc4; const gate = new Promise((r) => (releaseBc4 = r));
    let entered; const inside = new Promise((r) => (entered = r));
    const bc4 = submit(pool, "quote_request", enc(quote), NOW_A, { afterValidate: async () => { entered(); await gate; } }).then((r) => { order.push("BC4_DONE"); return r; });
    await inside;
    const act = activate(pool, "F_IDENTITY.activate_gen_b_same_keys").then(() => order.push("ACTIVATION_DONE"));
    await new Promise((r) => setTimeout(r, 1500));
    const waiting = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
    log("ADV-04a sessions en attente de verrou pendant BC4 ouvert:", waiting.rows[0].n, "chronologie:", JSON.stringify(order));
    assert.deepEqual(order, [], "l'activation ne doit pas aboutir tant que BC4 n'a pas commité");
    releaseBc4();
    const r = await bc4; await act;
    log("ADV-04a chronologie finale", JSON.stringify(order), "BC4", r.status, r.body.outcome, "seq reçu", r.body.receipt?.catalogue_sequence);
    assert.equal(order[0], "BC4_DONE");
    assert.equal(r.body.outcome, "RECEIVED");
    assert.equal(r.body.receipt.catalogue_sequence, gen.snapshot.catalogue_sequence);
    const g2 = await siteDb.getActiveGeneration(pool);
    assert.ok(g2.catalogue_sequence > gen.snapshot.catalogue_sequence, "gen_b activée après");
    // même devis après activation : rejeu → reçu d'origine (§10.4)
    const replay = await submit(pool, "quote_request", enc(quote), NOW_A);
    assert.equal(replay.body.outcome, "REPLAY_SAME_RECEIPT");
    assert.equal(replay.body.receipt_ref, r.body.receipt_ref);
    // nouveau devis (autre clé) chiffré sur l'ancienne séquence → CATALOG_CHANGED
    const stale = await submit(pool, "quote_request", enc({ ...quote, idempotency_key: "quote:rv:after-activation" }), NOW_A);
    log("ADV-04a devis chiffré ancienne séquence", stale.status, JSON.stringify(stale.body.error_codes));
    assert.deepEqual(stale.body.error_codes, ["CATALOG_CHANGED"]);
  });

  test("ADV-04b pointeur verrouillé FOR UPDATE (activation longue simulée > lock_timeout 5 s) → 503 DB_WRITE_FAILED 55P03, 0 écriture", async () => {
    const holder = new pg.Client({ connectionString: DB_URL() });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM site_active_pointer WHERE singleton = 1 FOR UPDATE");
    const before = await counts(pool);
    const t0 = Date.now();
    const gen = await genNow(pool);
    const it = gen.snapshot.families[0].items[0];
    const quote = { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote:rv:locked", catalogue_sequence: null, contact: BASE_ORDER.contact, message: null,
      lines: [{ public_item_key: it.public_item_key, variant_axes: it.variant_axes, quantity: 1, displayed: null }] };
    const r = await submit(pool, "quote_request", enc(quote), "2026-10-20T12:00:00Z");
    const dt = Date.now() - t0;
    await holder.query("ROLLBACK"); await holder.end();
    log("ADV-04b", r.status, JSON.stringify(r.body.error_codes), JSON.stringify(r.body.detail), `${dt} ms`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body.error_codes, ["DB_WRITE_FAILED"]);
    assert.deepEqual(await counts(pool), before);
  });

  test("ADV-05 clés d'idempotence limites : 128 car. OK ; 129, 7, espace, accent, vide → refus C0, 0 écriture", async () => {
    await resetDb(); await activate(pool, "F_SELL_WINDOWS.activate");
    const k128 = "k" + "x".repeat(127);
    const ok = await submit(pool, "order", enc(withKey(BASE_ORDER, k128)), NOW);
    log("ADV-05 128", ok.status, ok.body.outcome);
    assert.equal(ok.body.outcome, "RECEIVED");
    const before = await counts(pool);
    for (const k of ["k" + "x".repeat(128), "abcdefg", "order qo 0001", "commande:é:0001", "", ":startcolon1", 12345678]) {
      const body = enc(withKey(BASE_ORDER, k));
      const r = await submit(pool, "order", body, NOW);
      const oracle = c0business.validateOrderSubmit(body, await genNow(pool), [], NOW);
      log("ADV-05", JSON.stringify(k).slice(0, 20), r.status, JSON.stringify(r.body.error_codes), "oracle", JSON.stringify(oracle.error_codes));
      assert.deepEqual(r.body.error_codes, oracle.error_codes);
      assert.equal(r.body.accepted, false);
    }
    assert.deepEqual(await counts(pool), before);
  });

  test("ADV-06 falsifications de forme : quantités, clés interdites, __proto__, contact, lignes 0/201 → verdict = oracle C0, HTTP §13, 0 écriture", async () => {
    const before = await counts(pool);
    const gen = await genNow(pool);
    const L = BASE_ORDER.lines;
    const mk = (mut) => { const o = withKey(BASE_ORDER, "order:rv:shape"); mut(o); return JSON.stringify(o); };
    const cases = {
      qty0: mk((o) => { o.lines[0].quantity = 0; }),
      qty1000001: mk((o) => { o.lines[0].quantity = 1000001; }),
      qty1_5: mk((o) => { o.lines[0].quantity = 1.5; }),
      qtyString: mk((o) => { o.lines[0].quantity = "10"; }),
      tax_amount: mk((o) => { o.tax_amount = "0.00"; }),
      shipping_amount: mk((o) => { o.shipping_amount = "0.00"; }),
      status: mk((o) => { o.status = "PAID"; }),
      line_status: mk((o) => { o.lines[0].status = "PAID"; }),
      proto_top: Buffer.from(VALID.bytes).toString("utf8").replace('"catalogue_sequence"', '"__proto__": {"x": 1},\n  "catalogue_sequence"'),
      proto_contact: mk((o) => { o.contact = JSON.parse(JSON.stringify(o.contact)); }).replace('"contact_name"', '"__proto__":{"isAdmin":true},"contact_name"'),
      constructor_key: mk((o) => { o.constructor = "x"; }),
      email_bad: mk((o) => { o.contact.email = "pas-un-email"; }),
      email_crlf: mk((o) => { o.contact.email = "a@b.fr\r\nBcc: x@y.fr"; }),
      phone_bad: mk((o) => { o.contact.phone = "appelez-moi"; }),
      lines0: mk((o) => { o.lines = []; o.total_amount = "0.00"; }),
      lines201: mk((o) => { o.lines = Array.from({ length: 201 }, () => L[0]); }),
      currency_usd: mk((o) => { o.currency = "USD"; }),
      sequence_string: mk((o) => { o.catalogue_sequence = "7"; }),
      neg_amount: mk((o) => { o.lines[0].unit_amount = "-11.00"; }),
      unit_3dec: mk((o) => { o.lines[0].unit_amount = "11.000"; }),
      total_huge: mk((o) => { o.total_amount = "999999999.99"; }),
      big_int: mk((o) => { o.lines[0].quantity = 9007199254740993; }),
    };
    const table = [];
    for (const [name, text] of Object.entries(cases)) {
      const bytes = enc(text);
      const r = await submit(pool, "order", bytes, NOW);
      const oracle = c0business.validateOrderSubmit(bytes, gen, [], NOW);
      table.push(`${name}=${r.status}:${r.body.error_codes.join("+")}`);
      assert.equal(r.body.accepted, false, name);
      assert.deepEqual(r.body.error_codes, oracle.error_codes, `${name} : BC4 = oracle C0`);
      assert.equal(r.body.access_token, undefined);
    }
    log("ADV-06", table.join(" "));
    assert.deepEqual(await counts(pool), before);
    assert.equal(({}).isAdmin, undefined, "aucune pollution de prototype");
  });

  test("ADV-07 lignes insérées = lignes C0 (pas le corps) : variant_axes/clé client vs base, offer_price_version_public C0", async () => {
    const r = await submit(pool, "order", enc(withKey(BASE_ORDER, "order:rv:lines-from-c0")), NOW);
    assert.equal(r.body.outcome, "RECEIVED");
    const oracle = c0business.validateOrderSubmit(enc(withKey(BASE_ORDER, "order:rv:lines-from-c0")), await genNow(pool), [], NOW);
    const { rows } = await pool.query("SELECT l.public_item_key, l.variant_axes, l.quantity, l.catalogue_sequence::int AS catalogue_sequence, l.rate_id, l.unit_amount, l.currency, l.tax_basis_or_status, l.offer_price_version_public, l.line_total FROM site_order_line l JOIN site_order o ON o.id = l.order_id WHERE o.order_ref = $1 ORDER BY line_no", [r.body.receipt_ref]);
    assert.deepEqual(rows, JSON.parse(JSON.stringify(oracle.receipt.lines)));
    const o = (await pool.query("SELECT total_amount, total_cents::text, request_fingerprint FROM site_order WHERE order_ref = $1", [r.body.receipt_ref])).rows[0];
    assert.equal(o.total_amount, oracle.receipt.total_amount);
    assert.equal(o.request_fingerprint, c0business.requestFingerprint(JSON.parse(JSON.stringify(withKey(BASE_ORDER, "order:rv:lines-from-c0")))));
    log("ADV-07 lignes base = lignes C0 ; total", o.total_amount, o.total_cents);
  });

  test("ADV-08 UNSAFE par octets ACTIVE altérés mais lisibles (sha ≠) → CATALOG_UNSAFE, 0 écriture ; devis non chiffré ?", async () => {
    const before = await counts(pool);
    const g = await pool.query("SELECT g.id, g.snapshot_bytes FROM site_generation g JOIN site_active_pointer p ON p.generation_id = g.id");
    const original = g.rows[0].snapshot_bytes;
    const text = original.toString("utf8");
    const altered = Buffer.from(text.replace("STAGING_FIXTURE", "STAGING_FIXTURF"), "utf8");
    assert.notEqual(altered.toString("utf8"), text);
    await pool.query("UPDATE site_generation SET snapshot_bytes = $1 WHERE id = $2", [altered, g.rows[0].id]);
    try {
      const st = (await siteDb.getActiveGeneration(pool)).status;
      const r = await submit(pool, "order", enc(withKey(BASE_ORDER, "order:rv:unsafe")), NOW);
      log("ADV-08 status", st, "commande", r.status, JSON.stringify(r.body.error_codes));
      assert.equal(st, "UNSAFE");
      assert.deepEqual(r.body.error_codes, ["CATALOG_UNSAFE"]);
      assert.deepEqual(await counts(pool), before);
      const unpriced = { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote:rv:unsafe-unpriced", catalogue_sequence: null, contact: BASE_ORDER.contact, message: null,
        lines: [{ public_item_key: BASE_ORDER.lines[0].public_item_key, variant_axes: {}, quantity: 1, displayed: null }] };
      const q = await submit(pool, "quote_request", enc(unpriced), NOW);
      log("ADV-08 devis non chiffré sur ACTIVE altérée", q.status, q.body.outcome, JSON.stringify(q.body.error_codes), "(C0 §10.2 : UNSAFE ne bloque que le devis chiffré)");
    } finally {
      await pool.query("UPDATE site_generation SET snapshot_bytes = $1 WHERE id = $2", [original, g.rows[0].id]);
    }
  });

  test("ADV-09 poll : base64 exact, sha, payload_digest recalculé, canonique, APPLY puis EVENT_DUPLICATE_NOOP ; aucune PII", async () => {
    const r = await poll(pool, { cursor: null, limit: 500 });
    assert.equal(r.status, 200);
    assert.ok(r.body.events.length >= 3);
    const consumed = [];
    const raw = JSON.stringify(r.body);
    for (const pii of ["achats@example.invalid", "STAGING_FIXTURE Contact", "Mairie Exemple", "contact", "email", "phone", "message"]) assert.ok(!raw.includes(pii), `PII ${pii} dans la réponse de poll`);
    let prevId = 0n;
    const ids = (await pool.query("SELECT event_id, id::text FROM site_outbox_event")).rows;
    const idOf = new Map(ids.map((x) => [x.event_id, BigInt(x.id)]));
    for (const e of r.body.events) {
      const bytes = e.bytes;
      assert.equal(createHash("sha256").update(bytes).digest("hex"), e.event_sha256);
      const doc = jsonc.parseBytes(bytes, 1 << 20);
      assert.deepEqual(Buffer.from(jsonc.canonicalBytes(doc)), Buffer.from(bytes), "octets canoniques");
      assert.equal(c0events.payloadDigest(doc.payload), doc.payload_digest);
      const v = c0events.validateEvent(bytes, consumed);
      assert.equal(v.outcome, "APPLY");
      consumed.push(v.record);
      assert.equal(c0events.validateEvent(bytes, consumed).error_codes.join(), "EVENT_DUPLICATE_NOOP");
      assert.ok(idOf.get(e.event_id) > prevId, "ordre id croissant"); prevId = idOf.get(e.event_id);
      assert.ok(!("id" in doc));
    }
    log("ADV-09 événements", r.body.events.length, "tous APPLY puis DUPLICATE_NOOP, base64/sha/digest exacts");
  });

  test("ADV-10 rejeu d'une requête de poll signée capturée (curseur null) : re-servie, nouveau curseur à chaque fois, delivery_count++", async () => {
    const sig = rawSign("c0-test-events-01", events.EVENTS_POLL_DOMAIN, { cursor: null, limit: 500 });
    const c0 = (await pool.query("SELECT count(*)::int AS n FROM site_event_cursor")).rows[0].n;
    const outs = [];
    for (let i = 0; i < 3; i++) {
      const r = await events.pollEvents({ pool, keyring: KEYRING }, headers("c0-test-events-01", sig), new URLSearchParams({ cursor: "", limit: "500" }));
      const b = JSON.parse(Buffer.from(r.body).toString("utf8"));
      outs.push(`${r.status}:${b.events?.length}`);
    }
    const c1 = (await pool.query("SELECT count(*)::int AS n FROM site_event_cursor")).rows[0].n;
    const dc = (await pool.query("SELECT max(delivery_count) AS m FROM site_outbox_event")).rows[0].m;
    log("ADV-10 rejeux", outs.join(" "), "curseurs créés", c1 - c0, "delivery_count max", dc);
    assert.deepEqual(outs, ["200:" + outs[0].split(":")[1], outs[0], outs[0]]);
    assert.equal(c1 - c0, 3);
  });

  test("ADV-11 limit=1 répété sans ACK : toujours le même événement (le curseur n'avance pas) — blocage en tête de file", async () => {
    let cursor = null; const seen = [];
    for (let i = 0; i < 4; i++) {
      const r = await poll(pool, { cursor, limit: 1 });
      seen.push(r.body.events[0]?.event_id); cursor = r.body.next_cursor;
    }
    log("ADV-11 limit=1 x4 sans ACK", JSON.stringify(seen));
    assert.equal(new Set(seen).size, 1);
  });

  test("ADV-12 ACK : id inconnu, partiel, clé publication, signature d'un autre corps, rejeu d'ACK, PENDING", async () => {
    const all = (await pool.query("SELECT event_id, status FROM site_outbox_event ORDER BY id")).rows;
    const first = all[0].event_id;
    const unk = await ack(pool, { event_ids: ["EVT-inconnu-0001"] });
    log("ADV-12 inconnu", unk.status, JSON.stringify(unk.body));
    assert.equal(unk.status, 200); assert.deepEqual(unk.body.unknown, ["EVT-inconnu-0001"]);
    const part = await ack(pool, { event_ids: [first] });
    assert.deepEqual(part.body.acked, [first]);
    const rest = (await pool.query("SELECT count(*)::int AS n FROM site_outbox_event WHERE status <> 'ACKED'")).rows[0].n;
    assert.equal(rest, all.length - 1, "ACK partiel : seul l'id listé passe ACKED");
    const again = await ack(pool, { event_ids: [first] });
    assert.deepEqual(again.body.already_acked, [first]);
    const pub = await ack(pool, { event_ids: [all[1].event_id] }, { keyId: "c0-test-publish-02" });
    assert.equal(pub.status, 401);
    const ackKey = await ack(pool, { event_ids: [all[1].event_id] }, { keyId: "c0-test-ack-01" });
    assert.equal(ackKey.status, 401);
    const otherBody = await ack(pool, { event_ids: [all[1].event_id] }, { signature: rawSign("c0-test-events-01", events.EVENTS_ACK_DOMAIN, { event_ids: [all[2].event_id] }) });
    assert.equal(otherBody.status, 401);
    const pollSigForAck = await ack(pool, { event_ids: [all[1].event_id] }, { signature: rawSign("c0-test-events-01", events.EVENTS_POLL_DOMAIN, { event_ids: [all[1].event_id] }) });
    assert.equal(pollSigForAck.status, 401, "séparation de domaine poll/ACK");
    const dup = await ack(pool, { event_ids: [all[1].event_id, all[1].event_id] });
    assert.equal(dup.status, 400);
    const extra = await ack(pool, { event_ids: [all[1].event_id], cursor: "CUR-x" });
    assert.equal(extra.status, 400);
    log("ADV-12 pub", pub.status, "ack-key", ackKey.status, "autre corps", otherBody.status, "domaine poll", pollSigForAck.status, "doublon", dup.status, "clé en trop", extra.status);
    // événement PENDING (nouvelle commande, jamais servi) : ACK refusé (not_delivered)
    const r = await submit(pool, "order", enc(withKey(BASE_ORDER, "order:rv:pending-ack")), NOW);
    const ev = (await pool.query("SELECT event_id FROM site_outbox_event WHERE object_ref = $1", [r.body.receipt_ref])).rows[0].event_id;
    const pend = await ack(pool, { event_ids: [ev] });
    assert.deepEqual(pend.body.not_delivered, [ev]);
  });

  test("ADV-13 reçu : 401/404 indiscernables (octets) ; temps comparable réf inconnue vs faux jeton ; aucun id interne", async () => {
    const r = await submit(pool, "order", enc(withKey(BASE_ORDER, "order:rv:receipt")), NOW);
    const ref = r.body.receipt_ref; const tok = r.body.access_token;
    const call = async (q) => { const x = await receipt.getReceipt({ pool }, new URLSearchParams(q)); return { status: x.status, text: Buffer.from(x.body).toString("utf8") }; };
    const good = await call({ ref, access_token: tok });
    assert.equal(good.status, 200);
    assert.ok(!/"id"\s*:/.test(good.text), "aucun id interne dans le reçu");
    assert.ok(!good.text.includes("achats@example.invalid"), "reçu sans PII de contact");
    const wrong = await call({ ref, access_token: "x".repeat(43) });
    const unknown = await call({ ref: "ORD-" + "0".repeat(32), access_token: tok });
    const malformed = await call({ ref: "' OR 1=1 --", access_token: tok });
    const noTok = await call({ ref });
    const emptyTok = await call({ ref, access_token: "" });
    const noRef = await call({ access_token: tok });
    log("ADV-13", "bon", good.status, "faux", wrong.status, "inconnue", unknown.status, "injection", malformed.status, "sans jeton", noTok.status, "vide", emptyTok.status, "sans ref", noRef.status);
    assert.equal(wrong.text, unknown.text); assert.equal(wrong.status, 404); assert.equal(malformed.text, unknown.text);
    assert.equal(noTok.status, 401); assert.equal(emptyTok.status, 401);
    const time = async (q, n) => { const ts = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await call(q); ts.push(Number(process.hrtime.bigint() - t) / 1e3); } ts.sort((a, b) => a - b); return ts[Math.floor(n / 2)]; };
    await time({ ref, access_token: "y" }, 30);
    const tWrong = await time({ ref, access_token: "y".repeat(43) }, 300);
    const tUnknown = await time({ ref: "ORD-" + "1".repeat(32), access_token: "y".repeat(43) }, 300);
    log(`ADV-13 médianes µs : faux jeton ${tWrong.toFixed(0)} / réf inconnue ${tUnknown.toFixed(0)} (écart ${(Math.abs(tWrong - tUnknown) / tUnknown * 100).toFixed(1)} %)`);
  });

  test("ADV-14 PII : aucun e-mail/nom dans event_bytes, payload, site_idempotency.receipt_json, site_transaction_log, site_event_cursor", async () => {
    const pii = ["achats@example.invalid", "STAGING_FIXTURE Contact", "Mairie Exemple"];
    const q = await pool.query(`SELECT 'outbox' AS t, convert_from(event_bytes, 'UTF8') || payload::text AS s FROM site_outbox_event
      UNION ALL SELECT 'idem', receipt_json::text FROM site_idempotency
      UNION ALL SELECT 'log', error_codes::text || detail::text || coalesce(object_ref,'') FROM site_transaction_log
      UNION ALL SELECT 'cursor', array_to_string(event_ids, ',') FROM site_event_cursor`);
    const hits = q.rows.filter((r) => pii.some((p) => r.s.includes(p)) || /access_token|"[A-Za-z0-9_-]{43}"/.test(r.s));
    log("ADV-14 lignes inspectées", q.rows.length, "PII/jetons trouvés", hits.length);
    assert.equal(hits.length, 0, JSON.stringify(hits.slice(0, 2)));
    const cols = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'site_%' AND table_name !~ '^site_(generation|active_pointer|media|publication_log)$' AND column_name <> 'tax_basis_or_status' AND (column_name ~ '(tax|tva|vat|shipping|port|payment|paid|price_public|margin|buy)')");
    log("ADV-14 colonnes taxe/port/paiement", JSON.stringify(cols.rows));
    assert.deepEqual(cols.rows, []);
  });

  test("ADV-15 rejeu sans jeton : un client qui a perdu la 1re réponse ne peut plus jamais consulter son reçu", async () => {
    const bytes = enc(withKey(BASE_ORDER, "order:rv:lost-response"));
    const first = await submit(pool, "order", bytes, NOW);
    const replay = await submit(pool, "order", bytes, NOW);
    log("ADV-15 1re réponse jeton:", typeof first.body.access_token, "rejeu jeton:", typeof replay.body.access_token);
    assert.equal(replay.body.access_token, undefined);
  });
});
