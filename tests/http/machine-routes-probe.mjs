#!/usr/bin/env node
// Sonde de preuve (revue I1 D-02) : envois LÉGITIMES signés au-delà de 10 MiB sur un serveur SITE déjà lancé.
//   BASE_URL=http://127.0.0.1:3367 SITE_TEST_DATABASE_URL=postgres://…/prodes_site_…_test node tests/http/machine-routes-probe.mjs
// La base du serveur DOIT être SITE_TEST_DATABASE_URL (remise à zéro avant chaque STAGE : un seul STAGED par séquence).
// Sortie : une ligne par envoi (taille, statut HTTP, corps de réponse) ; code de sortie 1 si un résultat diffère de l'attendu.
import { request } from "node:http";
import pg from "pg";
import { MiB, bigMedia, bigSnapshot, jsonOfSize } from "./machine-payloads.mjs";
import { resetDb } from "../bc2/helpers.mjs";

const BASE = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3367");
const DB = process.env.SITE_TEST_DATABASE_URL;
let failures = 0;

function send(method, p, headers, body) {
  return new Promise((resolve) => {
    const h = { ...headers, "content-length": String(body.length) };
    const req = request({ host: BASE.hostname, port: BASE.port, path: p, method, headers: h }, (res) => {
      const parts = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () => resolve({ status: res.statusCode, csp: res.headers["content-security-policy"] ?? null, body: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", (e) => resolve({ status: "ERR", csp: null, body: String(e) }));
    req.end(body);
  });
}

function report(label, size, r, expected, extra = "") {
  const ok = r.status === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} ${size} octets (${(size / MiB).toFixed(2)} MiB), Content-Length=${size} -> HTTP ${r.status} (attendu ${expected}) csp=${r.csp === null ? "absente" : "PRÉSENTE"} ${extra}${r.body.slice(0, 300)}`);
}

const pool = new pg.Pool({ connectionString: DB, max: 1 });
await resetDb();
for (const size of [15 * MiB, 20 * MiB]) {
  const m = bigMedia(size);
  const r = await send("PUT", `/api/site/publish/media/${m.sha256}`, m.headers, m.bytes);
  const stored = (await pool.query("SELECT octet_length(bytes) AS n FROM site_media WHERE sha256 = $1", [m.sha256])).rows[0]?.n ?? null;
  report("PUT média légitime signé", size, r, 201, `site_media=${stored} `);
}
for (const target of [12 * MiB, 31 * MiB]) {
  await resetDb();
  const s = bigSnapshot(target);
  const r = await send("POST", "/api/site/publish/stage", s.headers, s.bytes);
  const st = (await pool.query("SELECT status, octet_length(snapshot_bytes) AS n FROM site_generation WHERE payload_sha256 = $1", [s.doc.payload_sha256]).catch((e) => ({ rows: [{ status: `requête: ${e.message}` }] }))).rows[0] ?? {};
  report("STAGE légitime signé (snapshot valide)", s.bytes.length, r, 200, `site_generation=${JSON.stringify(st)} `);
}
const j = jsonOfSize(12 * MiB);
const r = await send("POST", "/api/site/publish/stage", j.headers, j.bytes);
report("STAGE JSON hors contrat (discriminant de troncature : SCHEMA_UNSUPPORTED = corps entier)", j.bytes.length, r, 400);
if (!/SCHEMA_UNSUPPORTED/.test(r.body)) { failures += 1; console.log("FAIL corps tronqué (attendu SCHEMA_UNSUPPORTED)"); }
await pool.end();
console.log(`# SONDE ROUTES MACHINE : ${failures === 0 ? "OK" : `${failures} écart(s)`}`);
process.exit(failures === 0 ? 0 : 1);
