// Tests HTTP de la boutique (W1/BC3) sur la génération ACTIVE réelle de la base SITE — `npm run test:storefront`.
//
// Prérequis : `npm run build` et `npm run bc2:build` (receiver compilé, pour signer les PUT média comme le ferait la
// Factory). Un serveur `next start` est lancé sur 127.0.0.1:$SITE_TEST_PORT (défaut 3361) par CE test et tué par lui
// (PID tenu, jamais de kill global). Base : $SITE_TEST_DATABASE_URL (défaut prodes_site_bc3_test), remise à zéro entre
// les scénarios. Les générations sont posées par le VRAI receiver BC2 en HTTP (STAGE → PUT média → VERIFY → ACTIVATE)
// depuis des cas C0 nommés ; les devis/commandes passent par BC4 (`SITE_BUSINESS_PERSISTENCE=postgresql`).
// Horloge : horloge réelle du serveur (receiver et BC4 l'utilisent aussi) ; les fenêtres des fixtures couvrent 2026-10-23.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.env.SITE_TEST_PORT ?? 3361);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_URL = process.env.SITE_TEST_DATABASE_URL ?? "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc3_test";
process.env.SITE_TEST_DATABASE_URL = DB_URL; // lu par tests/bc2/helpers.mjs (resetDb)
const { loadCase, mediaHeaders, resetDb } = await import("../bc2/helpers.mjs");
const { MiB, bigMedia, bigSnapshot, jsonOfSize } = await import("./machine-payloads.mjs");
const C0 = path.join(ROOT, "c0", "fixtures");
const ORACLE = JSON.parse(readFileSync(path.join(C0, "VERDICTS.json"), "utf8")).cases;
const KEYRING_PATH = path.join(C0, "keys", "test_keyring.json");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ── Serveur ──────────────────────────────────────────────────────────────────

async function portAnswers() {
  try {
    await fetch(BASE + "/api/site/receipt", { redirect: "manual", signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

const SERVER_ENV = {
  SITE_ENV: "staging",
  SITE_KEYRING_PATH: KEYRING_PATH,
  SITE_ACK_KEY_ID: "c0-test-ack-01",
  SITE_WITHDRAWAL_HOLD_POLICY: JSON.stringify({ max_withdrawals_without_release: null, released_expected_withdrawals_digest: null }),
  SITE_DATABASE_URL: DB_URL,
  SITE_CATALOG_SOURCE: "db",
  SITE_BUSINESS_PERSISTENCE: "postgresql",
};

let server = null;
const logs = [];

async function startServer() {
  assert.ok(existsSync(path.join(ROOT, ".next", "BUILD_ID")), "build absent : lancer `npm run build` avant les tests");
  assert.ok(existsSync(path.join(ROOT, ".bc2-build")), "receiver non compilé : lancer `npm run bc2:build`");
  assert.equal(await portAnswers(), false, `port ${PORT} déjà occupé : aucun serveur étranger ne doit répondre`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", ...SERVER_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  let exited = false;
  child.on("exit", () => (exited = true));
  const deadline = Date.now() + 30_000;
  while (!(await portAnswers())) {
    if (exited) throw new Error(`serveur arrêté au démarrage :\n${logs.join("")}`);
    if (Date.now() > deadline) throw new Error("serveur non prêt en 30 s");
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`# serveur PID ${child.pid} port ${PORT} base ${new URL(DB_URL).pathname.slice(1)}`);
  return { child, isExited: () => exited };
}

async function stopServer(s) {
  if (!s || s.isExited()) return;
  const done = new Promise((r) => s.child.once("exit", r));
  process.kill(s.child.pid, "SIGTERM"); // PID lancé par ce test uniquement
  const timer = setTimeout(() => !s.isExited() && process.kill(s.child.pid, "SIGKILL"), 10_000);
  await done;
  clearTimeout(timer);
  for (let i = 0; i < 40 && (await portAnswers()); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(await portAnswers(), false, `port ${PORT} encore occupé après l'arrêt du PID ${s.child.pid}`);
  console.log(`# serveur PID ${s.child.pid} arrêté, port ${PORT} libre`);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function http(method, p, { body, headers = {}, json = true } = {}) {
  const h = { ...headers };
  if (body !== undefined && json && !Object.keys(h).some((k) => k.toLowerCase() === "content-type")) h["content-type"] = "application/json";
  const res = await fetch(BASE + p, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Texte HTML sans les séparateurs `<!-- -->` que React insère entre fragments de texte.
  const text = new TextDecoder().decode(bytes).replaceAll("<!-- -->", "");
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non JSON */
  }
  return { status: res.status, headers: res.headers, bytes, text, json: parsed };
}
const get = (p, o) => http("GET", p, o);
const post = (p, body, o = {}) => http("POST", p, { ...o, body });
const preview = (lines, o) => post("/api/site/cart/preview", { lines }, o);

// ── Base et receiver BC2 ─────────────────────────────────────────────────────

const db = new pg.Pool({ connectionString: DB_URL, max: 2 });
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];

/** Pose la génération d'un cas C0 `evaluate_publication` par le receiver BC2, en HTTP, sur le serveur testé. */
async function activateOverHttp(caseId) {
  const c = loadCase(caseId);
  const sig = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature, "content-type": "application/json" };
  const ctl = JSON.stringify({ publication_id: c.doc.publication_id, catalogue_sequence: c.doc.catalogue_sequence, payload_sha256: c.doc.payload_sha256 });
  const st = await http("POST", "/api/site/publish/stage", { body: c.bytes, headers: sig });
  assert.equal(st.status, 200, `${caseId} STAGE : ${st.text.slice(0, 300)}`);
  for (const m of c.media) {
    const r = await http("PUT", `/api/site/publish/media/${m.sha256}`, { body: m.bytes, headers: { ...Object.fromEntries(mediaHeaders(m.sha256, m.bytes.length)), "content-type": "image/png" } });
    assert.ok([200, 201].includes(r.status), `${caseId} PUT média ${m.sha256} : ${r.status} ${r.text.slice(0, 200)}`);
  }
  const v = await http("POST", "/api/site/publish/verify-media", { body: ctl, headers: sig });
  assert.equal(v.status, 200, `${caseId} VERIFY : ${v.text.slice(0, 300)}`);
  const a = await http("POST", "/api/site/publish/activate", { body: ctl, headers: sig });
  assert.equal(a.headers.get("x-c0-outcome"), "ACTIVATED", `${caseId} ACTIVATE : ${a.status} ${a.text.slice(0, 300)}`);
  return c;
}

const CONTACT = { organisation_name: "STAGING_FIXTURE Mairie Exemple", contact_name: "STAGING_FIXTURE Contact", email: "achats@example.invalid", phone: null };
const key = (p) => `${p}-bc3-${Math.random().toString(36).slice(2, 14)}`;

function orderFrom(pv, overrides = {}) {
  return {
    contract_version: "site_business.v1",
    kind: "order",
    idempotency_key: key("order"),
    catalogue_sequence: pv.catalogue_sequence,
    contact: CONTACT,
    currency: "EUR",
    total_amount: pv.total_amount,
    lines: pv.lines.map((l) => ({ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: l.quantity, rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount, line_total: l.line_total })),
    ...overrides,
  };
}

function quoteFrom(pv, overrides = {}) {
  return {
    contract_version: "site_business.v1",
    kind: "quote_request",
    idempotency_key: key("quote"),
    catalogue_sequence: pv.catalogue_sequence,
    contact: CONTACT,
    message: null,
    lines: pv.lines.map((l) => ({ public_item_key: l.public_item_key, variant_axes: l.variant_axes, quantity: l.quantity, displayed: l.accepted ? { rate_id: l.selection.rate_id, unit_amount: l.selection.unit_amount } : null })),
    ...overrides,
  };
}

const PAGES_STORE = ["/", "/panier", "/recherche?q=chaise", "/devis", "/commande", "/favoris", "/comparer", "/gamme-pro-intens"];
const LEGACY = [
  "/admin", "/admin/login", "/admin/devis", "/admin/devis/1", "/admin/produits", "/admin/catalogue", "/admin/import",
  "/api/admin/auth", "/api/admin/export-products", "/api/admin/products-list", "/api/admin/ia/categories-list",
  "/api/admin/paniers-abandonnes/1/recover", "/api/admin/products/1", "/api/admin/devis/1", "/api/admin/site-config",
  "/api/checkout", "/checkout", "/checkout/confirmation", "/api/checkout/bon-de-commande",
  "/api/devis", "/api/devis-express", "/devis-express", "/api/devis-status/X", "/api/revalidate", "/api/track",
  "/mes-commandes", "/mon-devis/X", "/panier/abc", "/api/cart/share", "/api/cart/abandon", "/cart",
  "/api/contact", "/api/search", "/api/product-by-sku", "/api/products-by-handles", "/api/product-pdf/x",
];

// Chaînes qui ne doivent JAMAIS apparaître dans le HTML ou le JS servis.
const SECRET_SECRETS = JSON.parse(readFileSync(KEYRING_PATH, "utf8")).keys.map((k) => k.secret).filter((s) => typeof s === "string" && s.length > 0);
const FORBIDDEN = [/local-dev-only/i, /postgres(ql)?:\/\//i, /SITE_DATABASE_URL/, /SITE_KEYRING_PATH/, /TEST_SECRET/, /jarvis/i, /\/Users\//, /LOCALAPPDATA/i, /prodes_site_bc/, /keyring/i];

describe("BC3 — boutique sur génération ACTIVE réelle (base SITE, receiver BC2, transactions BC4)", () => {
  before(async () => {
    await resetDb();
    server = await startServer();
  });
  after(async () => {
    await stopServer(server);
    await db.end();
  });

  // ── 0. Aucune génération ACTIVE ────────────────────────────────────────────
  test("0 — aucune génération : pages boutique 503 rendues côté serveur (HTML), /recu 200, API 503, rien de servi", async () => {
    for (const p of [...PAGES_STORE, "/famille/chaise-demo", "/categorie/mobilier"]) {
      const r = await get(p);
      assert.equal(r.status, 503, p);
      assert.match(r.headers.get("content-type"), /^text\/html/, p);
      assert.match(r.text, /<html lang="fr">/, p);
      assert.match(r.text, /Catalogue indisponible/, p);
      assert.match(r.text, /data-testid="catalog-unavailable"/, p);
      assert.doesNotMatch(r.text, /R-SIMPLE-1|38[.,]50|PI-0000/, p);
      assert.equal(r.headers.get("retry-after"), "60", p);
      assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, p);
    }
    const head = await http("HEAD", "/");
    assert.equal(head.status, 503);
    const recu = await get("/recu");
    assert.equal(recu.status, 200, "un reçu reste consultable sans catalogue");
    assert.match(recu.text, /Consulter un reçu/);
    const pv = await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }]);
    assert.equal(pv.status, 503);
    assert.equal(pv.json.site_status, "CATALOG_UNAVAILABLE");
    assert.equal(pv.json.reason, "NO_ACTIVE_GENERATION");
    assert.equal((await get("/media/ed9aaaaa1debb1f00870b9b41636dc75b64eb0437ed9c58dcbb18047b73b41ec")).status, 503);
    // Familles par adresse (S1-A I3) : même règle que la recherche instantanée, catalogue indisponible = 503 explicite.
    const lookup = await get("/api/site/families?slugs=chaise-demo");
    assert.equal(lookup.status, 503);
    assert.equal(JSON.parse(lookup.text).unavailable, true);
    // Recherche instantanée (S1-A I2) : catalogue indisponible = 503 explicite, jamais une liste vide qui laisserait croire à « aucun résultat ».
    const suggest = await get("/api/site/search?q=chaise");
    assert.equal(suggest.status, 503);
    assert.match(suggest.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(JSON.parse(suggest.text).unavailable, true);
    assert.deepEqual(JSON.parse(suggest.text).results, []);
    assert.equal((await get("/article/PI-00000001R")).status, 503);
    assert.equal((await get("/panier/abc")).status, 404, "chemin legacy : 404, pas la page d'indisponibilité");
    assert.match(logs.join(""), /\[site-catalog\] indisponible : NO_ACTIVE_GENERATION/);
  });

  // ── 1. F_SIMPLE_READY activé par BC2 ───────────────────────────────────────
  describe("1 — F_SIMPLE_READY.activate_first (1 famille, 1 article, palier unique HT)", () => {
    before(async () => {
      await activateOverHttp("F_SIMPLE_READY.activate_first");
    });

    test("pages 200 / 404 / redirection relative, source db, séquence affichée", async () => {
      for (const p of [...PAGES_STORE, "/categorie/mobilier", "/categorie/mobilier-chaises", "/famille/chaise-demo", "/recu"]) {
        const r = await get(p);
        assert.equal(r.status, 200, p);
        assert.match(r.text, /<html lang="fr">/, p);
      }
      const home = await get("/");
      assert.match(home.text, /data-testid="catalogue-sequence">1</);
      assert.match(home.text, />db</, "source db affichée dans le détail technique");
      assert.match(home.text, /href="\/famille\/chaise-demo"/);
      const parent = await get("/categorie/mobilier");
      assert.match(parent.text, /href="\/categorie\/mobilier-chaises"/, "sous-catégorie (parent_category_key)");
      const fiche = await get("/famille/chaise-demo");
      assert.match(fiche.text, /aria-label="Fil d&#x27;Ariane"|aria-label="Fil d'Ariane"/);
      assert.match(fiche.text, /href="\/categorie\/mobilier"[^>]*>[^<]*</, "fil d'Ariane : catégorie racine");
      assert.match(fiche.text, /data-testid="item-ref">PI-00000001R</, "référence PI affichée telle quelle (C0 §16.3)");
      assert.match(fiche.text, /data-rate-id="R-SIMPLE-1" data-tier="1"/, "palier publié sélectionné par selectPrice");
      assert.match(fiche.text, /38,50/);
      for (const p of ["/famille/inconnue", "/categorie/inconnue", "/article/PI-000000JW3", "/article/n-importe-quoi"]) assert.equal((await get(p)).status, 404, p);
      const art = await get("/article/PI-00000001R");
      assert.equal(art.status, 307);
      assert.equal(art.headers.get("location"), "/famille/chaise-demo?article=PI-00000001R", "Location relative");
    });

    test("médias servis depuis site_media : octets = SHA-256 et taille déclarés, Content-Type déclaré ; non déclaré → 404", async () => {
      const ref = loadCase("F_SIMPLE_READY.activate_first").doc.media_refs[0];
      const r = await get(`/media/${ref.sha256}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), ref.mime);
      assert.equal(r.bytes.length, ref.size);
      assert.equal(sha256(r.bytes), ref.sha256);
      assert.equal((await get("/media/b020140e8822d96407cce4ec28d1ee2df7c25cf7c98f8e2fe0ee49bd73039c6c")).status, 404, "média C0 non déclaré par l'ACTIVE");
      assert.equal((await get(`/media/${"0".repeat(64)}`)).status, 404);
    });

    test("en-têtes de sécurité : CSP à nonce appliqué aux scripts, HSTS seulement en HTTPS, nosniff, frame DENY", async () => {
      const r = await get("/famille/chaise-demo");
      const csp = r.headers.get("content-security-policy");
      const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
      assert.ok(nonce, `nonce absent : ${csp}`);
      for (const d of ["default-src 'self'", "'strict-dynamic'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) assert.ok(csp.includes(d), d);
      assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
      const scripts = [...r.text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
      assert.ok(scripts.length > 0);
      for (const attrs of scripts) assert.match(attrs, new RegExp(`nonce="${nonce.replace(/[+/=]/g, "\\$&")}"`), `script sans nonce : ${attrs}`);
      assert.notEqual((await get("/famille/chaise-demo")).headers.get("content-security-policy"), csp, "nonce différent à chaque requête");
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r.headers.get("x-frame-options"), "DENY");
      assert.equal(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.equal(r.headers.get("strict-transport-security"), null, "pas de HSTS en HTTP clair (staging local)");
      const tls = await get("/", { headers: { "x-forwarded-proto": "https" } });
      assert.match(tls.headers.get("strict-transport-security") ?? "", /max-age=31536000/, "HSTS si HTTPS vu par le proxy frontal");
      const api = await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }]);
      assert.equal(api.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r.headers.get("set-cookie"), null);
    });

    test("base fiscale : la génération déclare HT, le site peut le dire (pied de page, accueil) ; la règle inverse est dans basis.ui", async () => {
      const home = await get("/");
      assert.match(home.text, /data-testid="footer-basis">Prix de vente PRODES hors taxes/);
      assert.match(home.text, /Prix HT/);
      assert.doesNotMatch(home.text, /Les prix et la base fiscale sont précisés sur le devis/);
      assert.doesNotMatch(home.text, /data-testid="universe-bar"/, "aucune page publiée : la barre d'univers n'affiche rien (pas même un cadre vide)");
      const faq = await get("/faq");
      assert.equal(faq.status, 200);
      assert.match(faq.text, /Les prix publiés sont hors taxes ; la TVA apparaît sur le devis et la facture/);
    });

    test("pages fixes provisoires : FAQ, contact, mentions légales, gamme PRO-INTENS sans catégorie — dites telles quelles, sans coordonnée ni garantie inventée", async () => {
      for (const p of ["/faq", "/contact", "/mentions-legales", "/gamme-pro-intens"]) {
        const r = await get(p);
        assert.equal(r.status, 200, p);
        assert.doesNotMatch(r.text, /tel:|mailto:|\b0\d(?:[ .]?\d{2}){4}\b/, `${p} : aucune coordonnée écrite en dur`);
        assert.doesNotMatch(r.text, /10 ans|garantie structure/i, `${p} : aucune garantie générale (C7)`);
      }
      assert.match((await get("/mentions-legales")).text, /data-testid="legal-provisional"/);
      assert.match((await get("/mentions-legales")).text, /noindex/);
      const gamme = (await get("/gamme-pro-intens")).text;
      assert.match(gamme, /Aucun produit de la gamme n&#x27;est publié pour le moment\.|Aucun produit de la gamme n'est publié pour le moment\./);
      assert.doesNotMatch(gamme, /prochainement|bientôt|très vite/i, "aucune promesse de date");
    });

    test("recherche instantanée : requête vide ou trop courte, trop longue, JSON échappé, au plus 8 familles publiées", async () => {
      for (const q of ["", "c", "  "]) {
        const r = await get(`/api/site/search?q=${encodeURIComponent(q)}`);
        assert.equal(r.status, 200, JSON.stringify(q));
        assert.deepEqual(JSON.parse(r.text).results, [], JSON.stringify(q));
      }
      const found = await get("/api/site/search?q=CHAISE");
      assert.equal(found.status, 200);
      assert.match(found.headers.get("content-type") ?? "", /^application\/json/);
      assert.match(found.headers.get("cache-control") ?? "", /no-store/);
      const body = JSON.parse(found.text);
      assert.ok(body.results.length >= 1 && body.results.length <= 8);
      assert.equal(body.results[0].slug, "chaise-demo");
      assert.deepEqual(Object.keys(body.results[0]).sort(), ["category", "imageSha", "name", "priceText", "slug"], "rien d'autre que ce qui est publié et affiché");
      const ref = await get("/api/site/search?q=PI-00000001R");
      assert.equal(JSON.parse(ref.text).results[0].slug, "chaise-demo");
      const evil = await get(`/api/site/search?q=${encodeURIComponent('<script>alert(1)</script>"><img src=x onerror=alert(2)>')}`);
      assert.equal(evil.status, 200);
      assert.match(evil.headers.get("content-type") ?? "", /^application\/json/, "jamais interprété comme du HTML");
      assert.doesNotMatch(evil.text, /[<>&]/, "chevrons et esperluette sont échappés (\\u003c…) dans le JSON");
      assert.equal(JSON.parse(evil.text).query, '<script>alert(1)</script>"><img src=x onerror=alert(2)>', "et le terme est restitué à l'identique une fois le JSON lu");
      const long = await get(`/api/site/search?q=${"a".repeat(5000)}`);
      assert.equal(long.status, 200);
      assert.ok(JSON.parse(long.text).query.length <= 100, "requête bornée à 100 caractères");
    });

    test("limite d'envois : la 121e demande d'une adresse reçoit 429 et un JSON vide", async () => {
      for (const [endpoint, key, address] of [["search", "results", "192.0.2.120"], ["families", "families", "192.0.2.121"]]) {
        const headers = { "x-forwarded-for": ` ${address}, 198.51.100.1` };
        const responses = await Promise.all(Array.from({ length: 121 }, () => http("GET", `/api/site/${endpoint}`, { headers })));
        assert.equal(responses.filter((r) => r.status === 200).length, 120, `${endpoint} : 120/121 demandes autorisées`);
        const refusals = responses.filter((r) => r.status === 429);
        assert.equal(refusals.length, 1, `${endpoint} : 1/121 demande limitée`);
        const limited = refusals[0];
        assert.deepEqual(limited.json, { [key]: [], limited: true });
        assert.match(limited.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
        assert.match(limited.headers.get("content-type") ?? "", /^application\/json/);
        assert.match(limited.headers.get("cache-control") ?? "", /no-store/);
        assert.doesNotMatch(limited.text, /[<>&]/);
      }
    });

    test("familles par adresse : ordre gardé, inconnu rendu à part, adresses invalides écartées, 20 au plus, JSON échappé", async () => {
      const r = await get("/api/site/families?slugs=zzz-inconnu,chaise-demo,chaise-demo,../etc/passwd,%3Cscript%3E");
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /^application\/json/);
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
      const body = JSON.parse(r.text);
      assert.deepEqual(body.families.map((f) => f.slug), ["chaise-demo"]);
      assert.deepEqual(body.missing, ["zzz-inconnu"], "une adresse invalide n'est jamais relue ni renvoyée");
      assert.deepEqual(Object.keys(body.families[0]).sort(), ["axes", "best", "category", "description", "imageSha", "name", "priceText", "reference", "single", "slug", "variantCount"]);
      assert.doesNotMatch(r.text, /[<>&]/);
      const many = await get(`/api/site/families?slugs=${Array.from({ length: 60 }, (_, i) => `zz${i}`).join(",")}`);
      assert.equal(JSON.parse(many.text).missing.length, 20, "20 adresses au plus par appel");
      const none = await get("/api/site/families");
      assert.deepEqual(JSON.parse(none.text).families, []);
    });

    test("recherche serveur : nom, référence PI, requête HTML échappée, longueur bornée", async () => {
      const ok = await get("/recherche?q=CHAISE");
      assert.match(ok.text, /data-testid="search-count">1 famille/);
      assert.match(ok.text, /href="\/famille\/chaise-demo"/);
      const ref = await get("/recherche?q=PI-00000001R");
      assert.match(ref.text, /href="\/famille\/chaise-demo"/);
      const evil = await get(`/recherche?q=${encodeURIComponent('<script>alert(1)</script>"><img src=x onerror=alert(2)>')}`);
      assert.equal(evil.status, 200);
      assert.doesNotMatch(evil.text, /<script>alert\(1\)/);
      assert.doesNotMatch(evil.text, /<img src=x/);
      assert.match(evil.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      const long = await get(`/recherche?q=${"a".repeat(5000)}`);
      assert.equal(long.status, 200);
      // L'état du routeur Next recopie l'URL brute ; la requête TRAITÉE et rendue est bornée à 100 caractères.
      assert.match(long.text, new RegExp(`value="${"a".repeat(100)}"`), "requête tronquée à 100 caractères");
      assert.doesNotMatch(long.text, new RegExp(`value="${"a".repeat(101)}`));
      assert.doesNotMatch(long.text, new RegExp(`« <span[^>]*>${"a".repeat(101)}`));
    });

    test("cart/preview : palier publié, DUPLICATE_LINE, prix du navigateur refusé, corps > 256 Kio refusé", async () => {
      const pv = await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 3 }]);
      assert.equal(pv.status, 200);
      assert.equal(pv.json.catalogue_sequence, 1);
      assert.equal(pv.json.lines[0].selection.rate_id, "R-SIMPLE-1");
      assert.equal(pv.json.lines[0].line_total, "115.50");
      assert.equal(pv.json.total_amount, "115.50");
      const dup = await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }, { public_item_key: "PI-00000001R", variant_axes: {}, quantity: 2 }]);
      assert.equal(dup.status, 422);
      assert.deepEqual(dup.json.error_codes, ["DUPLICATE_LINE"]);
      const forged = await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1, unit_amount: "0.01" }]);
      assert.equal(forged.status, 422);
      assert.deepEqual(forged.json.error_codes, ["INVALID_DATA"]);
      const big = await post("/api/site/cart/preview", JSON.stringify({ lines: [], pad: "x".repeat(300 * 1024) }));
      assert.equal(big.status, 400);
      assert.deepEqual(big.json.error_codes, ["PAYLOAD_MALFORMED"]);
    });

    test("CSRF avant persistance : Content-Type absent/autre → 415, Origin ou Sec-Fetch-Site étrangers → 403, aucune ligne écrite", async () => {
      const body = JSON.stringify({ lines: [{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }] });
      const pv = (await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }])).json;
      const order = JSON.stringify(orderFrom(pv));
      for (const route of ["/api/site/cart/preview", "/api/site/quote", "/api/site/order"]) {
        const payload = route.endsWith("preview") ? body : order;
        const none = await http("POST", route, { body: payload, json: false });
        assert.equal(none.status, 415, `${route} sans Content-Type`);
        assert.equal(none.json.site_status, "CONTENT_TYPE_REFUSED");
        const form = await http("POST", route, { body: payload, headers: { "content-type": "application/x-www-form-urlencoded" } });
        assert.equal(form.status, 415, `${route} formulaire`);
        const plain = await http("POST", route, { body: payload, headers: { "content-type": "text/plain" } });
        assert.equal(plain.status, 415, `${route} text/plain`);
        const evil = await http("POST", route, { body: payload, headers: { origin: "https://evil.example" } });
        assert.equal(evil.status, 403, `${route} Origin étrangère`);
        assert.equal(evil.json.site_status, "ORIGIN_REFUSED");
        const nullOrigin = await http("POST", route, { body: payload, headers: { origin: "null" } });
        assert.equal(nullOrigin.status, 403, `${route} Origin null`);
        const cross = await http("POST", route, { body: payload, headers: { "sec-fetch-site": "cross-site" } });
        assert.equal(cross.status, 403, `${route} Sec-Fetch-Site cross-site`);
        const sameSite = await http("POST", route, { body: payload, headers: { "sec-fetch-site": "same-site" } });
        assert.equal(sameSite.status, 403, `${route} Sec-Fetch-Site same-site (sous-domaine)`);
      }
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order")), 0, "aucune commande écrite par les POST refusés");
      assert.equal(Number(await scalar("SELECT count(*) FROM site_quote_request")), 0);
      const same = await http("POST", "/api/site/cart/preview", { body, headers: { origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" } });
      assert.equal(same.status, 200, "même origine admise");
    });

    test("validation des formulaires : champs manquants, trop longs, e-mail/téléphone invalides, injection → 4xx propres, rien écrit", async () => {
      const pv = (await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 1 }])).json;
      const bad = [
        ["organisation absente", { ...CONTACT, organisation_name: undefined }],
        ["organisation vide", { ...CONTACT, organisation_name: "   " }],
        ["contact > 200", { ...CONTACT, contact_name: "x".repeat(201) }],
        ["e-mail invalide", { ...CONTACT, email: "pas-un-email" }],
        ["e-mail injection SQL", { ...CONTACT, email: "a@b.fr'; DROP TABLE site_order;--" }],
        ["téléphone invalide", { ...CONTACT, phone: "<script>" }],
        ["saut de ligne dans l'organisation", { ...CONTACT, organisation_name: "Mairie\nExemple" }],
        ["contrôle NUL", { ...CONTACT, contact_name: "a\u0000b" }],
      ];
      for (const [label, contact] of bad) {
        const c = JSON.parse(JSON.stringify(contact));
        for (const r of [await post("/api/site/quote", quoteFrom(pv, { contact: c })), await post("/api/site/order", orderFrom(pv, { contact: c }))]) {
          assert.equal(r.status, 422, label);
          assert.deepEqual(r.json.error_codes, ["INVALID_DATA"], label);
          assert.equal(r.json.accepted, false, label);
        }
      }
      const longMsg = await post("/api/site/quote", quoteFrom(pv, { message: "m".repeat(2001) }));
      assert.equal(longMsg.status, 422);
      const notJson = await post("/api/site/quote", "{organisation:");
      assert.equal(notJson.status, 400);
      assert.deepEqual(notJson.json.error_codes, ["PAYLOAD_MALFORMED"]);
      const tax = await post("/api/site/order", orderFrom(pv, { tax_amount: "7.70" }));
      assert.equal(tax.status, 422);
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order")) + Number(await scalar("SELECT count(*) FROM site_quote_request")), 0);
    });

    test("parcours complet : aperçu → devis RECEIVED persisté → commande RECEIVED persistée → reçus consultables (jeton une fois)", async () => {
      const pv = (await preview([{ public_item_key: "PI-00000001R", variant_axes: {}, quantity: 2 }])).json;
      assert.equal(pv.total_amount, "77.00");
      // Contact contenant du HTML : donnée valide, stockée telle quelle, jamais renvoyée ni rendue.
      const q = await post("/api/site/quote", quoteFrom(pv, { contact: { ...CONTACT, organisation_name: "<b>Mairie</b> & Cie" }, message: "Livraison avant le 15/11 ?" }));
      assert.equal(q.status, 200, q.text.slice(0, 300));
      assert.equal(q.json.outcome, "RECEIVED");
      assert.equal(q.json.durable, true);
      assert.match(q.json.receipt_ref, /^QR-[0-9a-f]{32}$/);
      assert.equal(typeof q.json.access_token, "string");
      assert.ok(!q.text.includes("Mairie</b>"), "aucune coordonnée dans la réponse");
      const qRow = (await db.query("SELECT status, catalogue_sequence::int AS seq, (SELECT count(*)::int FROM site_quote_line l WHERE l.quote_id = q.id) AS n FROM site_quote_request q WHERE quote_ref = $1", [q.json.receipt_ref])).rows[0];
      assert.deepEqual(qRow, { status: "RECEIVED", seq: 1, n: 1 }, "devis persisté en base");

      const o = await post("/api/site/order", orderFrom(pv));
      assert.equal(o.status, 200, o.text.slice(0, 300));
      assert.equal(o.json.outcome, "RECEIVED");
      assert.match(o.json.receipt_ref, /^ORD-[0-9a-f]{32}$/);
      const oRow = (await db.query("SELECT status, total_amount, total_cents::int AS cents, catalogue_sequence::int AS seq FROM site_order WHERE order_ref = $1", [o.json.receipt_ref])).rows[0];
      assert.deepEqual(oRow, { status: "RECEIVED", total_amount: "77.00", cents: 7700, seq: 1 }, "commande persistée en base");
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order_line l JOIN site_order o ON o.id = l.order_id WHERE o.order_ref = $1 AND l.rate_id = 'R-SIMPLE-1' AND l.quantity = 2", [o.json.receipt_ref])), 1);

      const found = await get(`/api/site/receipt?ref=${o.json.receipt_ref}&access_token=${encodeURIComponent(o.json.access_token)}`);
      assert.equal(found.status, 200);
      assert.equal(found.json.outcome, "FOUND");
      assert.equal(found.json.receipt.total_amount, "77.00");
      assert.equal((await get(`/api/site/receipt?ref=${o.json.receipt_ref}&access_token=faux`)).status, 404);
      assert.equal((await get(`/api/site/receipt?ref=${o.json.receipt_ref}`)).status, 401);
      // Rejeu à l'identique (réessai réseau) : même reçu, AUCUN jeton redonné, aucun doublon.
      const again = await http("POST", "/api/site/order", { body: JSON.stringify({ ...orderFrom(pv), idempotency_key: "order-bc3-replay-0001" }) });
      const again2 = await http("POST", "/api/site/order", { body: JSON.stringify({ ...orderFrom(pv), idempotency_key: "order-bc3-replay-0001" }) });
      assert.equal(again2.json.outcome, "REPLAY_SAME_RECEIPT");
      assert.equal(again2.json.receipt_ref, again.json.receipt_ref);
      assert.equal(again2.json.access_token, undefined, "jeton jamais redonné au rejeu");
      // Page de consultation : rendue sans le jeton (lu côté client dans le fragment, jamais envoyé au serveur).
      const page = await get("/recu");
      assert.equal(page.status, 200);
      assert.ok(!page.text.includes(o.json.access_token));
    });

    test("aucun secret, chemin local ou JARVIS dans le HTML ni dans le JS servis", async () => {
      const pages = [...PAGES_STORE, "/famille/chaise-demo", "/categorie/mobilier", "/recu", "/famille/inconnue"];
      const scripts = new Set();
      for (const p of pages) {
        const r = await get(p);
        for (const re of FORBIDDEN) assert.doesNotMatch(r.text, re, `${p} : ${re}`);
        for (const s of SECRET_SECRETS) assert.ok(!r.text.includes(s), `${p} : secret du trousseau`);
        for (const m of r.text.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(m[1]);
      }
      assert.ok(scripts.size > 0);
      for (const src of scripts) {
        const js = await get(src);
        assert.equal(js.status, 200, src);
        for (const re of FORBIDDEN.filter((x) => !/keyring/.test(String(x)))) assert.doesNotMatch(js.text, re, `${src} : ${re}`);
        for (const s of SECRET_SECRETS) assert.ok(!js.text.includes(s), `${src} : secret du trousseau`);
      }
      console.log(`# ${pages.length} pages et ${scripts.size} scripts inspectés`);
    });

    test("144 requêtes legacy → 404 : 36 chemins × GET/POST × (sans en-têtes | cookie forgé + Bearer)", async () => {
      const evil = { cookie: "admin_session=forged", authorization: "Bearer x" };
      const failures = [];
      let n = 0;
      for (const p of LEGACY) {
        for (const headers of [{}, evil]) {
          for (const method of ["GET", "POST"]) {
            const r = await http(method, p, { headers, body: method === "POST" ? { any: 1 } : undefined });
            n++;
            if (r.status !== 404 || r.text.includes('"success"')) failures.push(`${method} ${p} → ${r.status}`);
          }
        }
      }
      assert.equal(n, 144);
      assert.deepEqual(failures, []);
    });
  });

  // ── 2. Combinaison interdite ESUNNY ────────────────────────────────────────
  describe("2 — F_ESUNNY_FORBIDDEN.activate (3 combinaisons publiées sur 4 possibles)", () => {
    before(async () => {
      await resetDb();
      await activateOverHttp("F_ESUNNY_FORBIDDEN.activate");
    });

    test("variante interdite blanc + sol : INVALID_VARIANT à l'aperçu et à la commande, 0 ligne ; fiche sans produit cartésien", async () => {
      const pv = await preview([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc", fixation: "sol" }, quantity: 1 }]);
      assert.equal(pv.status, 200);
      assert.deepEqual(pv.json.lines[0].error_codes, ORACLE["F_ESUNNY_FORBIDDEN.select_forbidden_combination"].error_codes);
      const order = await post("/api/site/order", readFileSync(path.join(C0, "documents", "F_ESUNNY_FORBIDDEN", "order_forbidden_combination.json")));
      assert.equal(order.status, 422);
      assert.deepEqual(order.json.error_codes, ["INVALID_VARIANT"]);
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order")), 0);
      const fiche = await get("/famille/esunny-demo?article=PI-0000006BC");
      assert.equal(fiche.status, 200);
      assert.match(fiche.text, /data-testid="item-ref">PI-0000006BC</, "variante présélectionnée");
      // Blanc choisi : « sol » est désactivé et expliqué ; aucune 4e combinaison n'a de référence.
      assert.match(fiche.text, /value="sol"[^>]*disabled=""|disabled=""[^>]*value="sol"/, "sol non sélectionnable avec blanc");
      assert.match(fiche.text, /Non proposé avec Coloris « Blanc »/);
      assert.equal([...fiche.text.matchAll(/<td class="py-1 pr-2 font-mono text-xs whitespace-nowrap">(PI-[0-9A-Z]{9})<\/td>/g)].length, 3, "3 variantes listées, pas 4");
      const noir = await get("/famille/esunny-demo?article=PI-00000069X");
      assert.doesNotMatch(noir.text, /value="sol"[^>]*disabled=""|disabled=""[^>]*value="sol"/, "noir : sol proposé");
    });
  });

  // ── 3. Identité et CART_STALE réel (F_IDENTITY gen_a → gen_b → gen_c) ──────
  describe("3 — F_IDENTITY : CART_STALE / CATALOG_CHANGED réels après activation d'une nouvelle génération par BC2, puis registre d'identité", () => {
    let pvA;
    before(async () => {
      await resetDb();
      await activateOverHttp("F_IDENTITY.activate_gen_a");
      pvA = (await preview([{ public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 4 }])).json;
    });

    test("panier composé sur la génération 1, génération 2 activée par BC2 → commande CART_STALE, devis chiffré CATALOG_CHANGED, 0 ligne", async () => {
      assert.equal(pvA.catalogue_sequence, 1);
      assert.equal(pvA.lines[0].selection.unit_amount, "41.00");
      await activateOverHttp("F_IDENTITY.activate_gen_b_same_keys");
      const pvB = (await preview([{ public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 4 }])).json;
      assert.equal(pvB.catalogue_sequence, 2, "l'aperçu suit la nouvelle ACTIVE (le client compare à sa génération vue)");
      const o = await post("/api/site/order", orderFrom(pvA));
      assert.equal(o.status, 409);
      assert.deepEqual(o.json.error_codes, ["CART_STALE"]);
      const q = await post("/api/site/quote", quoteFrom(pvA));
      assert.equal(q.status, 409);
      assert.deepEqual(q.json.error_codes, ["CATALOG_CHANGED"]);
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order")) + Number(await scalar("SELECT count(*) FROM site_quote_request")), 0);
      // Reconfirmation sur la génération 2 : acceptée.
      const ok = await post("/api/site/order", orderFrom(pvB));
      assert.equal(ok.status, 200, ok.text.slice(0, 200));
      assert.equal(ok.json.outcome, "RECEIVED");
      // Revue F-06 : référence d'une autre Famille → avertissement explicite, jamais une autre variante en silence.
      const other = await get("/famille/chaise-pliante?article=PI-000000JSY");
      assert.equal(other.status, 200);
      assert.match(other.text, /data-testid="article-notice"[^]*appartient à une autre famille/);
      assert.match(other.text, /href="\/article\/PI-000000JSY"/);
      // Slug changé en génération 2 (chaise-coque → chaise-coque-v2) : l'ancienne adresse n'existe plus.
      assert.equal((await get("/famille/chaise-coque")).status, 404);
      assert.equal((await get("/famille/chaise-coque-v2")).status, 200);
    });

    test("génération 3 : Item supplanté → 308 vers la canonique (relative) → fiche ; retiré → 410 ; panier → ITEM_SUPERSEDED/ITEM_RETIRED", async () => {
      await activateOverHttp("F_IDENTITY.activate_gen_c_tombstones");
      const sup = await get("/article/PI-000000JW3");
      assert.equal(sup.status, 308);
      assert.equal(sup.headers.get("location"), "/article/PI-000000JVF");
      const canon = await get("/article/PI-000000JVF");
      assert.equal(canon.status, 307);
      assert.match(canon.headers.get("location"), /^\/famille\/chaise-pliante\?article=PI-000000JVF$/);
      assert.equal((await get(canon.headers.get("location"))).status, 200);
      const ret = await get("/article/PI-000000JSY");
      assert.equal(ret.status, 410);
      assert.match(ret.text, /retiré/);
      const pv = await preview([
        { public_item_key: "PI-000000JW3", variant_axes: { modele: "D" }, quantity: 1 },
        { public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 1 },
      ]);
      assert.deepEqual(pv.json.lines.map((l) => l.error_codes), [["ITEM_SUPERSEDED"], ["ITEM_RETIRED"]]);
      // Revue F-06 : ?article= retirée / remplacée / inconnue / mal formée → message explicite, jamais silencieux.
      const cases = [
        ["PI-000000JSY", /La référence PI-000000JSY a été retirée du catalogue/],
        ["PI-000000JW3", /La référence PI-000000JW3 a été remplacée\.[^]*href="\/article\/PI-000000JVF"/],
        ["PI-00000001R", /La référence PI-00000001R est inconnue du catalogue actuel/],
        ["<script>alert(1)</script>", /La référence &lt;script&gt;alert\(1\)&lt;\/script&gt; est inconnue/],
      ];
      for (const [ref, re] of cases) {
        const r = await get(`/famille/chaise-pliante?article=${encodeURIComponent(ref)}`);
        assert.equal(r.status, 200, ref);
        assert.match(r.text, /data-testid="article-notice"/, ref);
        assert.match(r.text, re, ref);
        assert.doesNotMatch(r.text, /<script>alert\(1\)/, ref);
      }
      const ok = await get("/famille/chaise-pliante?article=PI-000000JVF");
      assert.doesNotMatch(ok.text, /data-testid="article-notice"/, "référence portée par la Famille : aucun avertissement");
      assert.equal(pv.json.lines[0].superseded_by["PI-000000JW3"], "PI-000000JVF");
    });

    test("média manquant/altéré dans site_media → /media 404 (jamais d'octets non vérifiés), fiche toujours servie", async () => {
      const sha = loadCase("F_IDENTITY.activate_gen_c_tombstones").doc.families[0].image_main_sha256;
      assert.equal((await get(`/media/${sha}`)).status, 200);
      // Même taille (contrainte site_media_size_matches), un octet changé : SHA-256 faux.
      await db.query("UPDATE site_media SET bytes = set_byte(bytes, 29, get_byte(bytes, 29) # 255) WHERE sha256 = $1", [sha]);
      assert.equal((await get(`/media/${sha}`)).status, 404);
      assert.match(logs.join(""), /média altéré refusé/);
      const fiche = await get("/famille/chaise-pliante");
      assert.equal(fiche.status, 200);
      assert.match(fiche.text, new RegExp(`/media/${sha}`), "la fiche référence le média ; le client affiche « Image indisponible » (test navigateur)");
    });

    test("génération ACTIVE devenue UNSAFE (pointeur ≠ ligne) → pages 503, aperçu 503 CATALOG_UNSAFE, commande refusée, 0 ligne", async () => {
      const before = Number(await scalar("SELECT count(*) FROM site_order"));
      await db.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", ["0".repeat(64)]);
      for (const p of ["/", "/famille/chaise-pliante", "/panier"]) assert.equal((await get(p)).status, 503, p);
      const pv = await preview([{ public_item_key: "PI-000000JVF", variant_axes: { modele: "C" }, quantity: 1 }]);
      assert.equal(pv.status, 503);
      assert.equal(pv.json.reason, "CATALOG_UNSAFE");
      const o = await post("/api/site/order", { contract_version: "site_business.v1", kind: "order", idempotency_key: key("order"), catalogue_sequence: 3, contact: CONTACT, currency: "EUR", total_amount: "43.00", lines: [{ public_item_key: "PI-000000JVF", variant_axes: { modele: "C" }, quantity: 1, rate_id: "R-ID-603", unit_amount: "43.00", line_total: "43.00" }] });
      assert.ok(o.status >= 400 && o.status !== 500, `commande sur UNSAFE : ${o.status}`);
      assert.notEqual(o.json?.outcome, "RECEIVED");
      assert.equal(Number(await scalar("SELECT count(*) FROM site_order")), before);
      assert.equal((await get("/recu")).status, 200);
    });
  });

  // ── 4. Routes machine hors proxy navigateur (revue I1 D-02) ────────────────
  // Avant correctif, `proxy.ts` couvrait `/api/site/publish/**` : Next 16 tronquait le corps à 10 MiB
  // (`proxyClientMaxBodySize`) → média de 15/20 MiB 401 SIGNATURE_INVALID, STAGE de 12/31 MiB 400 PAYLOAD_MALFORMED,
  // flux signé surdimensionné 400 au lieu de 413. Chaque assertion ci-dessous échoue sur l'ancien `matcher`.
  describe("4 — routes machine signées hors proxy navigateur (plafonds de corps BC2 intacts)", () => {
    before(async () => {
      await resetDb();
    });

    test("4.1 PUT média légitime signé de 15 et 20 MiB → 201 STORED (octets entiers reçus), sans en-tête du proxy", async () => {
      for (const size of [15 * MiB, 20 * MiB]) {
        const m = bigMedia(size);
        const r = await http("PUT", `/api/site/publish/media/${m.sha256}`, { body: m.bytes, headers: m.headers });
        assert.equal(r.status, 201, `${size} octets : ${r.status} ${r.text.slice(0, 200)}`);
        assert.equal(r.json.outcome, "STORED");
        assert.equal(r.json.size, size);
        assert.equal(r.json.sha256, m.sha256);
        assert.equal(Number(await scalar("SELECT octet_length(bytes) FROM site_media WHERE sha256 = $1", [m.sha256])), size);
        assert.equal(r.headers.get("content-security-policy"), null, "route machine : le proxy navigateur n'est pas passé");
        assert.equal(r.headers.get("x-content-type-options"), "nosniff", "en-têtes de next.config.ts toujours servis");
      }
      assert.doesNotMatch(logs.join(""), /Request body exceeded/, "aucune troncature du corps par le proxy");
    });

    test("4.2 STAGE légitime signé de 12 et 31 MiB → 200 STAGED ; JSON hors contrat de 12 MiB → SCHEMA_UNSUPPORTED (corps entier), jamais PAYLOAD_MALFORMED", async () => {
      for (const size of [12 * MiB, 31 * MiB]) {
        await resetDb();
        const s = bigSnapshot(size);
        assert.ok(s.bytes.length > size - 4096 && s.bytes.length <= size, `taille construite ${s.bytes.length}`);
        const r = await http("POST", "/api/site/publish/stage", { body: s.bytes, headers: s.headers });
        assert.equal(r.status, 200, `${s.bytes.length} octets : ${r.status} ${r.text.slice(0, 300)}`);
        assert.equal(r.json.outcome, "STAGED");
        assert.equal(r.headers.get("content-security-policy"), null);
      }
      const j = jsonOfSize(12 * MiB);
      const r = await http("POST", "/api/site/publish/stage", { body: j.bytes, headers: j.headers });
      assert.equal(r.status, 400);
      assert.deepEqual(r.json.error_codes, ["SCHEMA_UNSUPPORTED"], `corps tronqué ? ${r.text.slice(0, 200)}`);
      assert.doesNotMatch(logs.join(""), /Request body exceeded/);
    });

    test("4.3 STAGE signé de 40 MiB en flux sans Content-Length → 413 BODY_TOO_LARGE (plafond BC2 32 MiB), pas 400", async () => {
      const j = jsonOfSize(1024);
      const r = await streamWithoutLength("/api/site/publish/stage", j.headers, 40 * MiB);
      assert.equal(r.status, 413, r.body.slice(0, 200));
      assert.equal(JSON.parse(r.body).transport_error, "BODY_TOO_LARGE");
    });

    test("4.4 /api/site/events et /events/ack (BC4) hors proxy : 401 signé BC4, sans CSP ni contrôle CSRF du proxy", async () => {
      const g = await get("/api/site/events?cursor=&limit=10");
      assert.equal(g.status, 401);
      assert.equal(g.headers.get("content-security-policy"), null);
      // Sans `Content-Type` JSON : le proxy aurait répondu 415 CONTENT_TYPE_REFUSED si la route lui était soumise.
      const a = await http("POST", "/api/site/events/ack", { body: "{}", json: false, headers: { "content-type": "text/plain" } });
      assert.notEqual(a.json?.site_status, "CONTENT_TYPE_REFUSED");
      assert.equal(a.status, 401);
      assert.equal(a.headers.get("content-security-policy"), null);
    });

    test("4.5 le proxy couvre toujours la boutique : CSP sur les pages, CSRF sur les POST du site, exclusion limitée au préfixe exact", async () => {
      assert.match((await get("/recherche")).headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
      const csrf = await http("POST", "/api/site/cart/preview", { body: "{}", json: false, headers: { "content-type": "text/plain" } });
      assert.equal(csrf.status, 415);
      assert.equal(csrf.json.site_status, "CONTENT_TYPE_REFUSED");
      for (const p of ["/api/site/publishx", "/api/site/eventsx"]) {
        const r = await get(p);
        assert.equal(r.status, 404, p);
        assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, `${p} reste sous le proxy`);
      }
    });
  });
});

/** Envoie `total` octets en flux (Transfer-Encoding: chunked, aucun Content-Length) ; s'arrête à la réponse. */
function streamWithoutLength(p, headers, total) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path: p, method: "POST", headers: { ...headers } });
    const chunk = Buffer.alloc(MiB, 0x61);
    let sent = 0;
    let done = false;
    req.on("response", (res) => {
      const parts = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () => {
        done = true;
        req.destroy();
        resolve({ status: res.statusCode, body: Buffer.concat(parts).toString("utf8"), sent });
      });
    });
    req.on("error", () => { if (!done) { done = true; resolve({ status: "ERR", body: "{}", sent }); } });
    const pump = () => {
      while (!done && sent < total) {
        sent += MiB;
        if (!req.write(chunk)) return void req.once("drain", pump);
      }
      if (!done) req.end();
    };
    pump();
  });
}
