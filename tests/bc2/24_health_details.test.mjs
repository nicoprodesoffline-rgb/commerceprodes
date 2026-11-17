// Cercle 4, 4.9 (S03) — le module de détails que la sonde signée (lot T) inclut : commit servi, taille de la base, espace disque, heure du serveur, dernière sauvegarde.
// Un champ qu'on ne sait pas lire vaut null (inconnu), jamais une valeur devinée.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, newPool, resetDb } from "./helpers.mjs";

const { siteDetails } = createRequire(import.meta.url)(join(ROOT, ".bc2-build", "lib", "site-health", "details.js"));
let pool, dir;
before(async () => { await resetDb(); pool = newPool(); dir = mkdtempSync(join(tmpdir(), "c4s-")); });
after(async () => { await pool.end(); rmSync(dir, { recursive: true, force: true }); });

test("S03 — tous les champs sont lus quand tout est en place", async () => {
  const stamp = join(dir, "derniere_sauvegarde.json");
  writeFileSync(stamp, JSON.stringify({ date_utc: "2026-11-17T02:00:05Z", fichier: "site_20261117.dump", octets: 123456 }));
  const now = new Date("2026-11-17T10:00:00.000Z");
  const d = await siteDetails(pool, { SITE_COMMIT: "03197F23ab", SITE_DISK_PATH: dir, SITE_BACKUP_STAMP_PATH: stamp }, now);
  assert.equal(d.commit, "03197f23ab");
  assert.ok(d.db_bytes > 0);
  assert.ok(d.disk_free_bytes > 0 && d.disk_total_bytes >= d.disk_free_bytes);
  assert.equal(d.server_time_utc, "2026-11-17T10:00:00.000Z");
  assert.equal(d.last_backup_utc, "2026-11-17T02:00:05Z");
  assert.equal(d.last_backup_file, "site_20261117.dump");
  assert.equal(d.last_backup_bytes, 123456);
});

test("S03 — fichier de sauvegarde absent, illisible ou mal formé : date inconnue (null), sans erreur ; commit non posé : « inconnu »", async () => {
  const bad = join(dir, "mauvais.json");
  writeFileSync(bad, "pas du json");
  for (const path of [undefined, "", join(dir, "absent.json"), bad]) {
    const d = await siteDetails(pool, { SITE_BACKUP_STAMP_PATH: path });
    assert.equal(d.last_backup_utc, null);
    assert.equal(d.last_backup_file, null);
    assert.equal(d.commit, "inconnu");
  }
  const odd = join(dir, "date.json");
  writeFileSync(odd, JSON.stringify({ date_utc: "hier", fichier: "x", octets: 1 }));
  assert.equal((await siteDetails(pool, { SITE_BACKUP_STAMP_PATH: odd })).last_backup_utc, null);
});

test("S03 — base injoignable : la taille est inconnue, le reste est rendu", async () => {
  const broken = { query: async () => { throw new Error("down"); } };
  const d = await siteDetails(broken, { SITE_DISK_PATH: dir });
  assert.equal(d.db_bytes, null);
  assert.ok(d.disk_free_bytes > 0);
});
