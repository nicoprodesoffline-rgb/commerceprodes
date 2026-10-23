#!/usr/bin/env node
// Review BC2 F-01 : mémoire du serveur réel stable sous des corps de 100 MiB, refus 401/413 sans journal.
//   SERVER_PID=<pid> BASE_URL=http://127.0.0.1:3331 SITE_DEV_DATABASE_URL=postgres://…/prodes_site_bc2 node tests/bc2/http-body-limits.mjs
// RSS du serveur échantillonnée toutes les 20 ms par `ps -o rss=` pendant chaque envoi.
// Critères : chaque envoi, pic - avant < 64 MiB ; rafale de 4 envois parallèles, pic < 4 x 32 + 64 MiB ; RSS après
// rafale 5 - après rafale 3 < 32 MiB (plateau, après échauffement du tas V8) ; RSS finale - initiale < 256 MiB ; 0 ligne de journal ajoutée.
// (Référence review a9dede14 : +278 MiB pour UN STAGE de 100 MiB non authentifié, 3,17 GiB retenus après ~1,8 GiB.)
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import pg from "pg";
import { loadCase } from "./helpers.mjs";

const BASE = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3331");
const PID = process.env.SERVER_PID;
const DB = process.env.SITE_DEV_DATABASE_URL;
if (!PID || !DB) { console.error("SERVER_PID et SITE_DEV_DATABASE_URL requis"); process.exit(2); }
const MiB = 1 << 20;
const rssKiB = () => Number(execFileSync("ps", ["-o", "rss=", "-p", PID]).toString().trim());

/** Envoie `total` octets (blocs de 1 MiB) ; s'arrête dès que la réponse arrive. */
function send(path, headers, total, withLength) {
  return new Promise((resolve) => {
    const h = { ...headers, "content-type": "application/octet-stream" };
    if (withLength) h["content-length"] = String(total);
    const req = request({ host: BASE.hostname, port: BASE.port, path, method: path.includes("/media/") ? "PUT" : "POST", headers: h });
    let sent = 0;
    let done = false;
    const chunk = Buffer.alloc(MiB, 0x41);
    req.on("response", (res) => {
      const parts = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () => { done = true; req.destroy(); resolve({ status: res.statusCode, body: Buffer.concat(parts).toString("utf8"), sent }); });
    });
    req.on("error", () => { if (!done) { done = true; resolve({ status: "ERR", body: "", sent }); } });
    const pump = () => {
      while (!done && sent < total) {
        const n = Math.min(MiB, total - sent);
        sent += n;
        if (!req.write(n === MiB ? chunk : chunk.subarray(0, n))) { req.once("drain", pump); return; }
      }
      if (!done && sent >= total) req.end();
    };
    pump();
  });
}

const c = loadCase("F_SIMPLE_READY.activate_first");
const signed = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature };
const sha = c.media[0].sha256;
const scenarios = [
  ["STAGE 100 MiB sans en-têtes", "/api/site/publish/stage", {}, true, 401],
  ["STAGE 100 MiB sans en-têtes, sans Content-Length", "/api/site/publish/stage", {}, false, 401],
  ["STAGE 100 MiB signé, Content-Length 100 MiB", "/api/site/publish/stage", signed, true, 413],
  ["STAGE 100 MiB signé, flux sans Content-Length", "/api/site/publish/stage", signed, false, 413],
  ["VERIFY_MEDIA 100 MiB signé, flux", "/api/site/publish/verify-media", signed, false, 413],
  ["ACTIVATE 100 MiB signé, Content-Length", "/api/site/publish/activate", signed, true, 413],
  ["PUT média 100 MiB signé, flux", `/api/site/publish/media/${sha}`, signed, false, 413],
  ["PUT média 100 MiB sans en-têtes", `/api/site/publish/media/${sha}`, {}, false, 401],
];

const db = new pg.Client({ connectionString: DB });
await db.connect();
const logCount = async () => Number((await db.query("SELECT count(*) FROM site_publication_log")).rows[0].count);
const logsBefore = await logCount();
const rss0 = rssKiB();
console.log(`# serveur PID ${PID}, RSS initiale ${rss0} KiB, journal ${logsBefore} lignes`);
let fails = 0;
for (const [label, path, headers, withLength, expected] of scenarios) {
  const before = rssKiB();
  let peak = before;
  const timer = setInterval(() => { try { peak = Math.max(peak, rssKiB()); } catch {} }, 20);
  const t0 = Date.now();
  const res = await send(path, headers, 100 * MiB, withLength);
  await new Promise((r) => setTimeout(r, 200));
  clearInterval(timer);
  peak = Math.max(peak, rssKiB());
  const growth = (peak - before) / 1024;
  const ok = res.status === expected && growth < 64;
  if (!ok) fails += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} | attendu ${expected} obtenu ${res.status} en ${Date.now() - t0} ms | envoyés ${(res.sent / MiB).toFixed(0)} MiB | rss avant=${before}KiB pic=${peak}KiB (+${growth.toFixed(1)} MiB) | ${res.body.slice(0, 140)}`);
}
// Rafales : 5 tours de 4 flux signés de 100 MiB en parallèle (pire cas : 4 corps de 32 MiB vivants à la fois).
const rounds = [];
for (let round = 1; round <= 5; round += 1) {
  const before = rssKiB();
  let peak = before;
  const timer = setInterval(() => { try { peak = Math.max(peak, rssKiB()); } catch {} }, 20);
  const res = await Promise.all([0, 1, 2, 3].map(() => send("/api/site/publish/stage", signed, 100 * MiB, false)));
  await new Promise((r) => setTimeout(r, 300));
  clearInterval(timer);
  const after = rssKiB();
  rounds.push(after);
  const ok = res.every((x) => x.status === 413) && (peak - before) / 1024 < 4 * 32 + 64;
  if (!ok) fails += 1;
  console.log(`${ok ? "PASS" : "FAIL"} rafale ${round} : 4 x STAGE 100 MiB signés en parallèle | codes ${res.map((x) => x.status).join(",")} | rss avant=${before}KiB pic=${peak}KiB (+${((peak - before) / 1024).toFixed(1)} MiB) après=${after}KiB`);
}
// Le tas V8 grandit pendant les premières rafales puis plafonne (la RSS n'est pas rendue au système) : on mesure
// le PLATEAU, après échauffement (rafales 3 -> 5).
const growthAcrossRounds = (rounds[4] - rounds[2]) / 1024;
const okRounds = growthAcrossRounds < 32;
if (!okRounds) fails += 1;
console.log(`${okRounds ? "PASS" : "FAIL"} plateau (pas d'accumulation) : RSS après rafale 3 -> 5 : ${rounds[2]} -> ${rounds[4]} KiB (${growthAcrossRounds.toFixed(1)} MiB ; rafale 1 -> 3 : ${((rounds[2] - rounds[0]) / 1024).toFixed(1)} MiB d'échauffement)`);
await new Promise((r) => setTimeout(r, 1000));
const rssEnd = rssKiB();
const retained = (rssEnd - rss0) / 1024;
const logsAfter = await logCount();
const okEnd = retained < 256 && logsAfter === logsBefore;
if (!okEnd) fails += 1;
console.log(`${okEnd ? "PASS" : "FAIL"} fin | RSS finale ${rssEnd} KiB (retenu +${retained.toFixed(1)} MiB, ${(scenarios.length + 12) * 100} MiB proposés) | journal ${logsBefore} -> ${logsAfter} lignes`);
const checks = scenarios.length + 5 + 1 + 1;
console.log(`# LIMITES BC2 : ${checks - fails}/${checks} PASS, ${fails} FAIL`);
await db.end();
process.exit(fails === 0 ? 0 : 1);
