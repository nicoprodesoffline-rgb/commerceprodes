import { start } from "./lib.mjs";
import http from "node:http";
const get = (path, headers) => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: 3342, path, headers }, (r) => { r.resume(); res(`${r.statusCode} loc=${r.headers.location}`); }).on("error", rej));
const s = await start({ SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_IDENTITY/" + process.argv[2], SITE_NOW_UTC: "2026-10-22T12:00:00Z" });
try {
  for (const [label, h] of [["Host normal", { host: "127.0.0.1:3342" }], ["Host forgé", { host: "evil.example" }], ["X-Forwarded-Host forgé", { host: "127.0.0.1:3342", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }]]) {
    console.log(`${label} : /article/PI-000000JW3 (SUPERSEDED) → ${await get("/article/PI-000000JW3", h)} ; /article/PI-000000JVF → ${await get("/article/PI-000000JVF", h)} ; /article/PI-000000JSY → ${await get("/article/PI-000000JSY", h)}`);
  }
} finally { await s.stop(); }
