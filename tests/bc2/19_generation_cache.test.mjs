// W6-P : le cache de vérification de `getActiveGeneration` ne court-circuite JAMAIS la vérification d'immutabilité / SHA.
//
// Garde-fou discriminant : les mêmes scénarios sont rejoués contre des MUTANTS du module compilé qui sautent la
// vérification (clé de cache affaiblie, cache servi sans comparer la clé, vérification SHA retirée). Chaque mutant
// DOIT échouer à au moins une assertion : si un mutant passe, le test échoue (le garde-fou ne garde plus rien).
// Les points de mutation sont repérés par des marqueurs `MUTATION_POINT:*` du code source ; un marqueur absent ou
// dupliqué fait échouer le test (jamais un mutant silencieusement identique à l'original).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, activateBase, deps, loadCase, newPool, resetDb, siteDb, STAGE, VERIFY, ACTIVATE, putAllMedia } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const BUILD_GEN = join(ROOT, ".bc2-build", "lib", "site-db", "generation.js");

let pool;
before(async () => {
  await resetDb();
  pool = newPool();
  await activateBase(pool);
});
after(async () => { await pool.end(); });

/** Altère UN caractère d'un prix dans les octets stockés, taille inchangée, `payload_sha256` de la ligne inchangé. */
async function tamperSameLength(id) {
  await pool.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
  try {
    const { rows } = await pool.query("SELECT snapshot_bytes FROM site_generation WHERE id = $1", [id]);
    const text = Buffer.from(rows[0].snapshot_bytes).toString("utf8");
    const at = text.indexOf('"unit_amount":"') + '"unit_amount":"'.length;
    assert.ok(at > '"unit_amount":"'.length - 1, "document de fixture sans prix");
    const swapped = text.slice(0, at) + (text[at] === "9" ? "8" : "9") + text.slice(at + 1);
    assert.equal(Buffer.byteLength(swapped), Buffer.byteLength(text), "altération à taille constante");
    await pool.query("UPDATE site_generation SET snapshot_bytes = $2 WHERE id = $1", [id, Buffer.from(swapped, "utf8")]);
    return rows[0].snapshot_bytes;
  } finally {
    await pool.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
  }
}

async function restoreBytes(id, original) {
  await pool.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
  try {
    await pool.query("UPDATE site_generation SET snapshot_bytes = $2 WHERE id = $1", [id, original]);
  } finally {
    await pool.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
  }
}

/** Scénarios exécutés contre un module `generation` donné (original ou mutant). Lève une AssertionError au premier écart. */
async function scenarios(mod) {
  mod.resetGenerationCache();
  const first = await mod.getActiveGeneration(pool);
  assert.equal(first.status, "ACTIVE");
  const second = await mod.getActiveGeneration(pool);
  assert.equal(second.snapshot, first.snapshot, "même document vérifié rendu depuis le cache");
  const warm = mod.generationCacheStats();
  assert.deepEqual([warm.full_loads, warm.hits], [1, 1], "une seule lecture complète, une réponse du cache");

  // Document modifié sous la MÊME (identifiant, séquence, SHA du pointeur et de la ligne) : refusé, jamais servi du cache.
  const original = await tamperSameLength(first.generation_id);
  try {
    const tampered = await mod.getActiveGeneration(pool);
    assert.equal(tampered.status, "UNSAFE", "octets modifiés sous la même clé logique : doit être refusé (UNSAFE)");
    assert.equal(tampered.snapshot, null, "jamais un document non vérifié (F-05)");
    const again = await mod.getActiveGeneration(pool);
    assert.equal(again.status, "UNSAFE", "un résultat UNSAFE n'est jamais mis en cache comme sûr");
  } finally {
    // La ligne est toujours remise dans son état d'origine (un mutant qui échoue ne doit pas contaminer le test suivant).
    await restoreBytes(first.generation_id, original);
  }

  // Retour aux octets d'origine : la ligne est de nouveau vérifiable, rien de « collé » dans le cache.
  const back = await mod.getActiveGeneration(pool);
  assert.equal(back.status, "ACTIVE");
  assert.equal(back.payload_sha256, first.payload_sha256);
}

test("cache de génération : octets modifiés sous la même clé logique -> refusés ; retour -> revérifié", async () => {
  await scenarios(siteDb);
});

test("cache de génération : le déclencheur d'immutabilité reste actif et le cache n'est pas invalidé à tort", async () => {
  siteDb.resetGenerationCache();
  const active = await siteDb.getActiveGeneration(pool);
  await assert.rejects(pool.query("UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id = $1", [active.generation_id]), /immuables/);
  await assert.rejects(pool.query("UPDATE site_generation SET payload_sha256 = repeat('0', 64) WHERE id = $1", [active.generation_id]), /immuables/);
  const after = await siteDb.getActiveGeneration(pool);
  assert.equal(after.snapshot, active.snapshot, "UPDATE refusé par le déclencheur : même document, servi du cache");
  assert.equal(siteDb.generationCacheStats().full_loads, 1);
  assert.equal(Object.isFrozen(active.snapshot), true, "document partagé entre requêtes : gelé");
  assert.throws(() => { active.snapshot.families.push(null); }, TypeError, "un appelant ne peut pas empoisonner le cache");
});

test("cache de génération : bascule du pointeur -> nouveau document (pas de génération périmée)", async () => {
  siteDb.resetGenerationCache();
  const before = await siteDb.getActiveGeneration(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putAllMedia(d, c);
  await VERIFY(d, c);
  const res = await ACTIVATE(d, c);
  assert.equal(res.headers["x-c0-outcome"], "ACTIVATED");
  const after = await siteDb.getActiveGeneration(pool);
  assert.notEqual(after.payload_sha256, before.payload_sha256);
  assert.equal(after.payload_sha256, c.doc.payload_sha256);
  assert.equal(after.status, "ACTIVE");
});

// --- mutants : chaque version du cache qui saute la vérification DOIT être refusée par les scénarios ----------------

/** Remplace la ligne repérée par `MUTATION_POINT:<marqueur>` ; `rewrite(ligne)` doit produire une ligne DIFFÉRENTE. */
function mutate(source, marker, rewrite) {
  const lines = source.split("\n").filter((l) => l.includes(`MUTATION_POINT:${marker}`));
  assert.equal(lines.length, 1, `marqueur MUTATION_POINT:${marker} attendu exactement une fois (trouvé ${lines.length})`);
  const changed = rewrite(lines[0]);
  assert.notEqual(changed, lines[0], `le mutant « ${marker} » doit différer de l'original`);
  return source.replace(lines[0], changed);
}

const MUTANTS = {
  "clé affaiblie (identifiant, séquence, SHA seulement)": (src) =>
    mutate(src, "key", () => '    return [row.generation_id, row.p_sequence, row.p_sha].join("|"); // MUTATION_POINT:key'),
  "cache servi sans comparer la clé": (src) => mutate(src, "hit", (l) => l.replace("verified.key === key", "true")),
  "SHA et forme canonique non revérifiés au chargement": (src) =>
    mutate(src, "verify", () => "            consistent = consistent; // MUTATION_POINT:verify"),
};

for (const [name, transform] of Object.entries(MUTANTS)) {
  test(`garde-fou discriminant : le mutant « ${name} » est refusé par les scénarios`, async () => {
    const out = BUILD_GEN.replace(/generation\.js$/, `generation.mutant.js`);
    writeFileSync(out, transform(readFileSync(BUILD_GEN, "utf8")));
    try {
      delete require.cache[out];
      const mutant = require(out);
      // Le mutant doit échouer pour LA bonne raison : l'altération sous la même clé logique n'est pas refusée.
      await assert.rejects(
        scenarios(mutant),
        (error) => error instanceof assert.AssertionError && /sous la même clé logique : doit être refusé/.test(error.message),
        `le mutant « ${name} » aurait dû servir le document altéré et échouer sur « doit être refusé (UNSAFE) »`,
      );
    } finally {
      rmSync(out, { force: true });
      delete require.cache[out];
    }
  });
}
