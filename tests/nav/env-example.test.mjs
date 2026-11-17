// Cercle 4, 4.13 (S13) — `.env.example` nomme CHAQUE variable lue par le code, et seulement celles-là ; aucune valeur réelle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCES = ["app", "lib", "components", "proxy.ts", "instrumentation.ts", "next.config.ts", "scripts/db"];
/** Variables que Next ou Node posent eux-mêmes : jamais à régler. */
const PLATFORM = new Set(["NEXT_RUNTIME", "NODE_ENV", "NEXT_PHASE", "PORT", "HOSTNAME"]);

function files(path) {
  const full = join(ROOT, path);
  let stat;
  try { stat = statSync(full); } catch { return []; }
  if (stat.isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(path, e.name)) : /\.(ts|tsx|mjs|js)$/.test(e.name) ? [join(full, e.name)] : []));
}

function readByCode() {
  const found = new Set();
  const pattern = /(?:process\.env|\benv)(?:\.([A-Z][A-Z0-9_]+)|\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\])/g;
  for (const file of SOURCES.flatMap(files)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(pattern)) found.add(m[1] ?? m[2]);
  }
  for (const name of PLATFORM) found.delete(name);
  return found;
}

const example = readFileSync(join(ROOT, ".env.example"), "utf8");
const listed = new Map();
for (const line of example.split("\n")) {
  const m = /^([A-Z][A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) listed.set(m[1], m[2]);
}

test("S13 — chaque variable lue par le code est dans .env.example", () => {
  const missing = [...readByCode()].filter((name) => !listed.has(name)).sort();
  assert.deepEqual(missing, [], `variables lues par le code mais absentes de .env.example : ${missing.join(", ")}`);
});

test("S13 — .env.example ne nomme aucune variable que le code ne lit pas", () => {
  const read = readByCode();
  const extra = [...listed.keys()].filter((name) => !read.has(name)).sort();
  assert.deepEqual(extra, [], `variables de .env.example que le code ne lit pas : ${extra.join(", ")}`);
});

test("S13 — aucune valeur réelle : pas de secret, pas de mot de passe, pas d'adresse de serveur", () => {
  for (const [name, value] of listed) {
    assert.ok(!/[A-Za-z0-9+/]{32,}/.test(value.replace(/^(https?|postgres):\/\//, "")), `${name} : valeur qui ressemble à un secret`);
  }
  assert.match(listed.get("SITE_DATABASE_URL"), /UTILISATEUR:MOT_DE_PASSE/);
  assert.match(listed.get("SITE_PUBLIC_ORIGIN"), /\.invalid$/);
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(example.replace(/203\.0\.113\.\d+/g, "")), "aucune adresse IP");
});

test("S11 — la page de maintenance du frontal : un seul fichier, aucun script ni ressource extérieure, message annoncé", () => {
  const html = readFileSync(join(ROOT, "ops", "maintenance.html"), "utf8");
  assert.match(html, /de retour dans quelques minutes/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!/<script|<link|<img|src=|url\(|@import|https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, "")), "aucune ressource extérieure");
});
