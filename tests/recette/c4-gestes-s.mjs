#!/usr/bin/env node
// Cercle 4, lot S — rejeu des gestes S sur le poste de recette (FactoryLab). Une preuve par geste et un RAPPORT_S.md (Item | Statut | Version | Preuve | Limite).
//
//   node tests/recette/c4-gestes-s.mjs --site https://ADRESSE:PORT --stats "postgres://LECTEUR@HOTE:PORT/prodes_site…" --out DOSSIER [options]
//
//   --site        adresse du site VUE PAR LE FRONTAL D'ESSAI (https). Un certificat d'essai : NODE_EXTRA_CA_CERTS=ca.pem dans l'environnement, ou --ca ca.pem.
//   --stats       chaîne de connexion en LECTURE à la base du site (statistiques pg_stat, compteurs de lignes, séquence des contenus). Jamais écrite dans une preuve.
//   --out         dossier des preuves (créé) : preuves/<GESTE>.md et RAPPORT_S.md.
//   --only        liste de gestes, séparés par des virgules (S01,S04,S05,S06,S08,S09,MAINT,S11,S12). Par défaut : tous.
//   --wait        secondes d'attente d'un geste fait par un autre (Factory, opérateur) : 240 par défaut.
//   --s09-cmd         commande (shell) qui modifie un réglage visible de la boutique ET l'envoie au site (geste de la Factory, S09).
//   --maint-on-cmd / --maint-off-cmd   commandes qui activent puis retirent le mode maintenance de la boutique et l'envoient au site.
//   --stop-cmd / --start-cmd   commandes qui arrêtent et relancent le SITE seul (derrière le frontal), pour S11.
//                     Chaque commande est lancée par le script (code de sortie et fin de sa sortie consignés dans la preuve, jamais la commande elle-même), PUIS le script guette l'effet. Sans la commande, le script
//                     écrit une ligne `ATTENTE_FACTORY: …` / `ATTENTE_OPERATEUR: …` et guette seulement (repli : un autre rejeu fait le geste).
//   --page        page dont le contenu change quand un réglage de la boutique change (S09), « / » par défaut.
//   --commit      commit servi (sinon `git rev-parse` du dossier courant, sinon « inconnu »).
//
// Le script n'agit jamais sur la Factory lui-même : les gestes de la Factory sont des commandes qu'on lui passe. Aucune dépendance nouvelle (Node 22 + `pg` du site).
// Par tests seulement : S02 (on n'arrête pas le PostgreSQL du poste), S03 (sonde signée du lot T), S07, S13. S10 : hors mandat.
import http from "node:http";
import https from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";

const { values: opt } = parseArgs({
  options: { site: { type: "string" }, stats: { type: "string" }, out: { type: "string" }, only: { type: "string" }, wait: { type: "string", default: "240" }, "stop-cmd": { type: "string" }, "start-cmd": { type: "string" }, "s09-cmd": { type: "string" }, "maint-on-cmd": { type: "string" }, "maint-off-cmd": { type: "string" }, page: { type: "string", default: "/" }, commit: { type: "string" }, ca: { type: "string" } },
});
for (const need of ["site", "out"]) if (!opt[need]) { console.error(`--${need} obligatoire (voir l'en-tête du script)`); process.exit(2); }
const SITE = new URL(opt.site);
const OUT = opt.out;
const WAIT_MS = Number(opt.wait) * 1000;
const CA = opt.ca ? readFileSync(opt.ca) : undefined;
const ONLY = opt.only ? new Set(opt.only.split(",").map((s) => s.trim())) : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** Requête HTTP(S) brute : statut, en-têtes, corps (aucun suivi de redirection, aucune dépendance). */
function request(path, { method = "GET", headers = {}, body } = {}) {
  const url = new URL(path, SITE);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers, agent: false, ca: CA, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const tryRequest = (path, init) => request(path, init).catch((error) => ({ status: 0, headers: {}, body: Buffer.alloc(0), error: String(error.code ?? error.message) }));
const text = (res) => res.body.toString("utf8");

let db = null;
async function stats() {
  if (!opt.stats) return null;
  if (db === null) { db = new pg.Client({ connectionString: opt.stats }); await db.connect(); }
  return db;
}
const scalar = async (sql, params = []) => Number((await (await stats()).query(sql, params)).rows[0].n);
/** Lectures (balayages d'index + séquentiels) d'une table vues par PostgreSQL ; les statistiques arrivent avec retard : on attend qu'elles se stabilisent. */
async function scans(table) {
  let last = -1;
  for (let i = 0; i < 12; i += 1) {
    await sleep(1300);
    const n = await scalar("SELECT coalesce(idx_scan,0) + coalesce(seq_scan,0) AS n FROM pg_stat_user_tables WHERE relname = $1", [table]);
    if (n === last) return n;
    last = n;
  }
  return last;
}

const results = [];
const H = (res, ...names) => names.map((n) => `${n}: ${res.headers[n] ?? "—"}`).join(" · ");
let notes = [];
function proof(id, title, status, lines, limit) { results.push({ id, title, status, lines: [...lines, ...notes], limit, at: now() }); notes = []; console.log(`${status} ${id} ${title}`); }
/** Lance une commande (shell), attend sa fin (au plus --wait) ; consigne son code de sortie et la fin de sa sortie, jamais la commande. */
function runCmd(what, command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const keep = (c) => { out = (out + c.toString()).slice(-300); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), WAIT_MS);
    child.on("error", (error) => { clearTimeout(timer); notes.push(`commande « ${what} » : lancement impossible (${error.code ?? error.message})`); resolve(null); });
    child.on("exit", (code, signal) => { clearTimeout(timer); notes.push(`commande « ${what} » : code ${code ?? signal}${out.trim() ? `, fin de sortie : ${out.trim().replace(/\s+/g, " ").slice(-200)}` : ""}`); resolve(code); });
  });
}
const wanted = (id) => ONLY === null || ONLY.has(id);
const skipped = (id, title, why) => proof(id, title, "⏸️", [why], "Non joué dans ce rejeu.");

/** Attend `check()` (vrai) pendant au plus `--wait` secondes, en annonçant l'attente sur la sortie. */
async function waitFor(marker, what, check, every = 200, command = undefined) {
  if (command) { console.log(`COMMANDE: ${what}`); await runCmd(what, command); }
  else console.log(`${marker}: ${what}`);
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    const out = await check();
    if (out) return out;
    await sleep(every);
  }
  return null;
}
/** Revient à l'état normal avant le geste suivant : attend qu'une adresse bloquée ne le soit plus. */
async function unblock(probe, okStatus) {
  const end = Date.now() + 90_000;
  while (Date.now() < end) { if ((await tryRequest(probe.path, probe.init)).status === okStatus) return true; await sleep(3000); }
  return false;
}

let commit = opt.commit ?? "inconnu";
if (!opt.commit) { try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* inconnu */ } }

// ------------------------------------------------------------------------------------------------ gestes
async function s01() {
  const res = await tryRequest("/api/site/health");
  const ok = res.status === 200 && text(res) === '{"status":"ok"}';
  proof("S01", "GET /api/site/health en service", ok ? "✅" : "❌", [`GET /api/site/health → HTTP ${res.status} ${res.error ?? ""}`, `corps : ${text(res).slice(0, 80)}`, H(res, "cache-control", "content-type")], "Le 503 « base arrêtée » (S02) n'est pas joué : on n'arrête pas le PostgreSQL du poste, la Factory en dépend (test : tests/http/cercle4-s.test.mjs).");
}

const unsigned = (n, extra = {}) => tryRequest("/api/site/publish/stage", { method: "POST", body: "{}", headers: { "content-type": "application/json", ...extra } });
const runs = (list) => list.reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && last[0] === s) last[1] += 1; else acc.push([s, 1]); return acc; }, []).map(([s, n]) => `${s}×${n}`).join(" puis ");

async function s04() {
  const logBefore = opt.stats ? await scalar("SELECT count(*)::int AS n FROM site_publication_log") : null;
  const statuses = [];
  for (let i = 0; i < 100; i += 1) statuses.push((await unsigned(i)).status);
  const logAfter = opt.stats ? await scalar("SELECT count(*)::int AS n FROM site_publication_log") : null;
  const first429 = statuses.indexOf(429);
  const ordered = first429 > 0 && statuses.slice(0, first429).every((s) => s === 401) && statuses.slice(first429).every((s) => s === 429);
  const noLog = logBefore === null ? null : logAfter === logBefore;
  const ok = ordered && noLog !== false;
  const cleaned = await unblock({ path: "/api/site/publish/stage", init: { method: "POST", body: "{}", headers: { "content-type": "application/json" } } }, 401);
  proof("S04", "100 requêtes non signées sur une route de publication", ok ? "✅" : "❌",
    [`100 POST /api/site/publish/stage sans signature, même adresse : ${runs(statuses)}`, `seuil observé : ${first429} refus 401 avant le premier 429`,
     logBefore === null ? "journal de publication : non lu (pas de --stats)" : `lignes du journal de publication : ${logBefore} → ${logAfter} (${noLog ? "inchangé" : "CHANGÉ"})`, `adresse de nouveau admise après la fenêtre : ${cleaned ? "oui" : "NON (toujours bloquée après 90 s)"}`],
    "Une seule adresse (celle du script) : la limite par adresse se prouve par son effet, pas par la comparaison avec une autre adresse (test : tests/http/cercle4-s.test.mjs). Pendant la minute de blocage, la Factory du poste, si elle passe par la même adresse, lirait 429.");
}

async function s05() {
  const forged = [];
  for (let i = 0; i < 60; i += 1) forged.push((await unsigned(i, { "x-forwarded-for": `203.0.113.${i + 1}` })).status);
  const search = [];
  for (let i = 0; i < 130; i += 1) search.push((await tryRequest("/api/site/search?q=ab", { headers: { "x-forwarded-for": `203.0.113.${(i % 250) + 1}` } })).status);
  const blocked = forged.includes(429) && search.includes(429);
  const c1 = await unblock({ path: "/api/site/publish/stage", init: { method: "POST", body: "{}", headers: { "content-type": "application/json" } } }, 401);
  const c2 = await unblock({ path: "/api/site/search?q=ab" }, 200);
  proof("S05", "X-Forwarded-For du visiteur à travers le frontal", blocked ? "✅" : "❌",
    [`60 requêtes non signées, un X-Forwarded-For forgé DIFFÉRENT à chaque fois : ${runs(forged)}`, `130 recherches, un X-Forwarded-For forgé différent à chaque fois : ${runs(search)}`,
     blocked ? "les deux limites s'appliquent malgré l'en-tête forgé : l'adresse retenue est celle du frontal" : "UNE LIMITE NE S'APPLIQUE PAS : l'en-tête du visiteur compte encore", `adresses de nouveau admises : publication ${c1 ? "oui" : "NON"}, recherche ${c2 ? "oui" : "NON"}`],
    "Suppose SITE_TRUSTED_PROXY_HOPS=1 sur le poste et un frontal qui pose l'adresse (sinon l'en-tête est ignoré et le résultat est le même : à lire avec la configuration du poste).");
}

async function s06() {
  if (!opt.stats) return skipped("S06", "Image demandée deux fois, la seconde sans lecture de site_media", "pas de --stats : les statistiques de PostgreSQL ne sont pas lisibles.");
  const shas = (await (await stats()).query("SELECT sha256 FROM site_media ORDER BY sha256 LIMIT 40")).rows.map((r) => r.sha256);
  let pick = null;
  let first = null;
  for (const sha of shas) {
    const res = await tryRequest(`/media/${sha}`);
    if (res.status === 200 && res.headers["cache-control"] === "public, max-age=31536000, immutable") { pick = sha; first = res; break; }
  }
  if (pick === null) return proof("S06", "Image demandée deux fois, la seconde sans lecture de site_media", "❌", [`aucune image servie telle quelle (immuable) parmi ${shas.length} empreintes essayées`], "—");
  const warm = await scans("site_media");
  const seconds = [];
  for (let i = 0; i < 5; i += 1) seconds.push(await tryRequest(`/media/${pick}`));
  const after = await scans("site_media");
  const etag = first.headers.etag;
  const cond = await tryRequest(`/media/${pick}`, { headers: { "if-none-match": etag } });
  const ok = after - warm === 0 && seconds.every((r) => r.status === 200) && etag === `"${pick}"` && cond.status === 304;
  proof("S06", "Image demandée deux fois, la seconde sans lecture de site_media", ok ? "✅" : "❌",
    [`image essayée : empreinte ${pick.slice(0, 12)}… (${first.body.length} octets)`, H(first, "cache-control", "etag", "content-length"), `5 demandes suivantes : ${runs(seconds.map((r) => r.status))} ; lectures de site_media (pg_stat, balayages) avant → après : ${warm} → ${after}`, `If-None-Match → HTTP ${cond.status}`],
    "Mesure par pg_stat_user_tables (arrive avec retard : on attend la stabilité). Le cache du site est en mémoire : un redémarrage du site le vide. S07 (nouvelle publication = nouvelle adresse) : par test seulement.");
}

async function s08() {
  if (!opt.stats) return skipped("S08", "Dix pages, une seule lecture des contenus", "pas de --stats.");
  await tryRequest(opt.page);
  const attempts = [];
  for (let k = 0; k < 3; k += 1) {
    const before = await scans("site_content_active");
    for (let i = 0; i < 10; i += 1) await tryRequest(opt.page);
    const after = await scans("site_content_active");
    attempts.push(after - before);
    if (after - before === 0) break;
  }
  const ok = attempts.includes(0);
  proof("S08", "Dix pages sans changement de contenus : aucune relecture", ok ? "✅" : "❌",
    [`10 GET ${opt.page} après une demande de chauffe ; lectures de site_content_active (pg_stat) pendant les 10 : ${attempts.join(", ")} (une mesure par essai)`],
    "La boucle de synchronisation de la Factory lit aussi cette table à chaque tour (15 s) : un essai à 0 suffit ; jusqu'à 3 essais. Borne de la mémoire : 30 s sans publication (SITE_MEMORY_MAX_AGE_SECONDS).");
}

const normal = (html) => html.replace(/nonce="[^"]*"/g, "").replace(/id="_R_[^"]*"|aria-controls="_R_[^"]*"|\b_R_[0-9a-z]+_/g, "").replace(/\/_next\/static\/[^"']+/g, "/_next/static/…");
async function s09() {
  if (!opt.stats) return skipped("S09", "Réglages de la boutique modifiés par la Factory", "pas de --stats : la séquence des contenus n'est pas lisible.");
  const seq = () => scalar("SELECT content_sequence AS n FROM site_content_active WHERE singleton = 1").catch(() => -1);
  const beforeSeq = await seq();
  const beforeHtml = normal(text(await tryRequest(opt.page)));
  const changed = await waitFor("ATTENTE_FACTORY", "modifier un réglage visible de la boutique (SITE › Boutique) et l'envoyer au site", async () => ((await seq()) !== beforeSeq ? Date.now() : null), 100, opt["s09-cmd"]);
  if (changed === null) return proof("S09", "Réglages de la boutique modifiés par la Factory", "⏸️", [`aucune nouvelle séquence de contenus en ${opt.wait} s`], "Le geste de la Factory n'a pas eu lieu.");
  await sleep(300);   // l'époque du site avance juste après l'écriture : on laisse passer cet instant, la lecture de la base se voit un peu avant la réponse à la Factory
  const afterSeq = await seq();
  const first = normal(text(await tryRequest(opt.page)));
  let lag = first !== beforeHtml ? 0 : null;
  for (let t = 0; lag === null && t < 40; t += 1) { await sleep(1000); if (normal(text(await tryRequest(opt.page))) !== beforeHtml) lag = t + 1; }
  const status = lag === 0 ? "✅" : lag !== null && lag <= 30 ? "⚠️" : "⏸️";
  proof("S09", "Réglages de la boutique modifiés par la Factory : vus à la requête suivante", status,
    [`séquence des contenus ${beforeSeq} → ${afterSeq}`, lag === 0 ? `la première requête (300 ms après l'écriture) montre déjà le changement sur ${opt.page}` : lag === null ? `la page ${opt.page} n'a pas changé pendant 40 s : le réglage modifié n'apparaît pas sur cette page (à refaire avec --page ou un autre réglage)` : `changement vu après ${lag} s (borne annoncée : 30 s)`],
    "La modification passe par la route signée du site (boucle de la Factory) : l'époque du site avance à la réponse. Le contenu est comparé après retrait des nonces et des identifiants de rendu ; une modification qui ne touche pas la page choisie ne se voit pas.");
}

async function maint() {
  const health = [];
  const on = await waitFor("ATTENTE_FACTORY", "activer le mode maintenance de la boutique (SITE › Boutique) et l'envoyer au site", async () => { const r = await tryRequest(opt.page); return r.status === 503 ? r : null; }, 200, opt["maint-on-cmd"]);
  if (on === null) return proof("MAINT", "Maintenance des réglages : 503 puis 200", "⏸️", [`aucun 503 en ${opt.wait} s`], "Le geste de la Factory n'a pas eu lieu.");
  health.push((await tryRequest("/api/site/health")).status);
  const body = text(on);
  const off = await waitFor("ATTENTE_FACTORY", "retirer le mode maintenance de la boutique et l'envoyer au site", async () => { const r = await tryRequest(opt.page); return r.status === 200 ? r : null; }, 200, opt["maint-off-cmd"]);
  const ok = off !== null && health[0] === 200;
  proof("MAINT", "Maintenance des réglages : 503 puis 200", ok ? "✅" : "❌",
    [`maintenance active : GET ${opt.page} → HTTP 503, ${H(on, "retry-after", "cache-control")}, message de la boutique présent dans la page : ${/data-testid="maintenance"/.test(body) ? "oui" : "NON"}`, `GET /api/site/health pendant la maintenance → HTTP ${health[0]}`, off === null ? `la page ne répond pas 200 après le retrait (${opt.wait} s)` : "maintenance retirée : GET → HTTP 200"],
    "Le script ne mesure pas l'écart à la seconde près (il guette toutes les 200 ms) ; le « à la requête suivante » est prouvé par test HTTP (tests/http/cercle4-s.test.mjs).");
}

async function s11() {
  const down = async () => { const r = await tryRequest(opt.page); return r.status === 503 && /de retour dans quelques minutes/.test(text(r)) ? r : null; };
  const stopped = await waitFor("ATTENTE_OPERATEUR", "arrêter le site derrière le frontal d'essai (pas le frontal)", down, 500, opt["stop-cmd"]);
  if (stopped === null) return proof("S11", "Site arrêté : le frontal sert la page de maintenance en 503", "❌", [`aucune réponse 503 avec la page de maintenance en ${opt.wait} s`], "—");
  const retry = stopped.headers["retry-after"];
  const health = await tryRequest("/api/site/health");
  const back = await waitFor("ATTENTE_OPERATEUR", "relancer le site", async () => ((await tryRequest(opt.page)).status === 200 ? true : null), 1000, opt["start-cmd"]);
  const ok = retry !== undefined && back !== null;
  proof("S11", "Site arrêté : le frontal sert la page de maintenance en 503", ok ? "✅" : "❌",
    [`GET ${opt.page} site arrêté → HTTP 503, Retry-After: ${retry ?? "ABSENT"}, texte « de retour dans quelques minutes » présent`, `GET /api/site/health site arrêté → HTTP ${health.status} (${health.status === 503 ? "le frontal répond 503 aussi" : "autre"})`, back === null ? "le site ne répond pas 200 après la relance" : "site relancé : GET → HTTP 200"],
    "C'est le frontal d'essai de c2 (page ops/maintenance.html) qui répond, pas le site. Ce n'est pas le frontal de production (Caddy chez 01).");
}

async function s12() {
  if (!opt.stats) return skipped("S12", "Devis envoyé avec l'enregistrement fermé", "pas de --stats : les tables de devis ne sont pas lisibles.");
  const tables = ["site_quote_request", "site_quote_line", "site_order", "site_order_line", "site_idempotency", "site_outbox_event"];
  const count = async () => {
    const out = {};
    for (const t of tables) out[t] = await scalar(`SELECT count(*)::int AS n FROM ${t}`);
    return out;
  };
  const before = await count();
  const post = (path, kind) => tryRequest(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
  const quote = await post("/api/site/quote", "quote_request");
  const order = await post("/api/site/order", "order");
  const after = await count();
  const page = await tryRequest("/devis");
  let j = {};
  try { j = JSON.parse(text(quote)); } catch { /* corps illisible */ }
  const same = tables.every((t) => before[t] === after[t]);
  const ok = quote.status === 503 && j.site_status === "ONLINE_REQUEST_CLOSED" && /la demande en ligne n'est pas encore ouverte/i.test(j.message ?? "") && order.status === 503 && same && /n(&#x27;|&apos;|')est pas encore ouverte/i.test(text(page));
  proof("S12", "Devis envoyé avec l'enregistrement fermé", ok ? "✅" : "❌",
    [`POST /api/site/quote → HTTP ${quote.status}, site_status ${j.site_status ?? "—"}, message « ${j.message ?? "—"} »`, `POST /api/site/order → HTTP ${order.status}`, `lignes avant → après : ${tables.map((t) => `${t} ${before[t]}→${after[t]}`).join(", ")}`, `page /devis : avis « pas encore ouverte » ${/pas encore ouverte/i.test(text(page)) ? "présent" : "ABSENT"}`],
    "Le corps envoyé est minimal : il prouve la fermeture, pas la validation d'un vrai devis. Suppose SITE_BUSINESS_PERSISTENCE=closed sur le poste.");
}

const steps = [["S01", s01], ["S04", s04], ["S05", s05], ["S06", s06], ["S08", s08], ["S09", s09], ["MAINT", maint], ["S11", s11], ["S12", s12]];
for (const [id, fn] of steps) {
  if (!wanted(id)) continue;
  try { await fn(); } catch (error) { proof(id, "geste interrompu", "❌", [`erreur : ${String(error.message ?? error).slice(0, 200)}`], "—"); }
}
if (db) await db.end();

// ------------------------------------------------------------------------------------------------ preuves et rapport
const TESTS = [
  ["S02", "Santé : base arrêtée → 503", "tests/http/cercle4-s.test.mjs (S02, S11 côté site) : le PostgreSQL du poste n'est pas arrêté, la Factory en dépend"],
  ["S03", "Sonde signée : commit, génération, base, disque, heure, sauvegarde", "tests/bc2/24_health_details.test.mjs ; la sonde signée est celle du lot T : son rejeu la montre"],
  ["S07", "Nouvelle image = nouvelle adresse", "tests/http/cercle4-s.test.mjs (S06 : l'adresse est l'empreinte des octets servis) ; l'ancienne adresse encore servie par un cache de frontal n'est pas jouable ici"],
  ["S13", "Réglages d'exemple = variables lues par le code", "tests/nav/env-example.test.mjs (4 tests)"],
  ["S10", "Charge : 20 visiteurs, 5 minutes", "hors mandat du cercle 4 (paquet A)"],
];
mkdirSync(join(OUT, "preuves"), { recursive: true });
for (const r of results) {
  writeFileSync(join(OUT, "preuves", `${r.id}.md`), `# ${r.id} — ${r.title}\n\n- Statut : ${r.status}\n- Version du site : ${commit}\n- Heure (UTC) : ${r.at}\n- Site : ${SITE.protocol}//${SITE.host}\n\n## Observé\n\n${r.lines.map((l) => `- ${l}`).join("\n")}\n\n## Limite\n\n${r.limit}\n`);
}
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const rows = [
  ...results.map((r) => `| ${r.id} ${cell(r.title)} | ${r.status} | ${commit} | preuves/${r.id}.md — ${cell(r.lines[0])} | ${cell(r.limit)} |`),
  ...TESTS.filter(([id]) => ONLY === null || results.every((r) => r.id !== id)).map(([id, title, how]) => `| ${id} ${title} | 🧪 par test | ${commit} | ${cell(how)} | Non rejoué sur le poste, par construction. |`),
];
writeFileSync(join(OUT, "RAPPORT_S.md"), `# Rejeu des gestes S — cercle 4, lot S (SITE)\n\n- Date (UTC) : ${now()}\n- Site : ${SITE.protocol}//${SITE.host}\n- Version du site : ${commit}\n- Node : ${process.version}\n- Statistiques de la base : ${opt.stats ? "lues (lecture seule)" : "non lues"}\n\nLégende : ✅ prouvé par le geste · ❌ échec · ⚠️ vu mais hors borne · ⏸️ non joué · 🧪 par test seulement.\n\n| Item | Statut | Version | Preuve | Limite |\n|---|---|---|---|---|\n${rows.join("\n")}\n`);
console.log(`Rapport : ${join(OUT, "RAPPORT_S.md")}`);
process.exit(results.some((r) => r.status === "❌") ? 1 : 0);
