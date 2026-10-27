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

/** Scénario RV-P4 (relecteur 8f) : le résultat `UNSAFE` est partagé entre lecteurs simultanés ; il doit être gelé. */
async function sharedUnsafeScenario(mod) {
  mod.resetGenerationCache();
  const first = await mod.getActiveGeneration(pool);
  const original = await tamperSameLength(first.generation_id);
  try {
    const readers = await Promise.all(Array.from({ length: 8 }, () => mod.getActiveGeneration(pool)));
    const [a] = readers;
    assert.ok(readers.every((r) => r.status === "UNSAFE"));
    assert.ok(readers.every((r) => Object.isFrozen(r)), "résultat UNSAFE (partageable entre lecteurs simultanés) : gelé avant partage");
    try { a.status = "ACTIVE"; a.snapshot = { forged: true }; } catch { /* module strict : TypeError attendu */ }
    for (const r of readers) {
      assert.equal(r.status, "UNSAFE", "une mutation chez un lecteur ne doit pas être visible chez un autre");
      assert.equal(r.snapshot, null);
    }
    assert.equal((await mod.getActiveGeneration(pool)).status, "UNSAFE", "ni dans la lecture suivante");
  } finally {
    await restoreBytes(first.generation_id, original);
    mod.resetGenerationCache();
  }
}

test("[RV-P4] résultat UNSAFE partagé entre lecteurs simultanés : gelé, mutation invisible chez l'autre lecteur", async () => {
  await sharedUnsafeScenario(siteDb);
});

test("âge maximal du cache (5 min) : au-delà, relecture et revérification complètes même sonde inchangée", async () => {
  let now = 1_000_000;
  siteDb.resetGenerationCache();
  siteDb.setGenerationCacheClock(() => now);
  try {
    const first = await siteDb.getActiveGeneration(pool);
    assert.equal(first.status, "ACTIVE");
    now += siteDb.GENERATION_CACHE_MAX_AGE_MS - 1;
    const young = await siteDb.getActiveGeneration(pool);
    assert.equal(young.snapshot, first.snapshot, "juste avant 5 min : servi du cache");
    assert.equal(siteDb.generationCacheStats().full_loads, 1);
    now += 1;
    const old = await siteDb.getActiveGeneration(pool);
    assert.equal(siteDb.generationCacheStats().full_loads, 2, "à 5 min : lecture complète, sonde pourtant inchangée");
    assert.equal(old.status, "ACTIVE");
    assert.notEqual(old.snapshot, first.snapshot, "document relu et reconstruit, pas l'ancien objet");
    assert.equal(old.payload_sha256, first.payload_sha256);
    const again = await siteDb.getActiveGeneration(pool);
    assert.equal(again.snapshot, old.snapshot, "la vérification fraîche repart pour 5 min");
    assert.equal(siteDb.generationCacheStats().full_loads, 2);
  } finally {
    siteDb.resetGenerationCache(); // rétablit l'horloge réelle
  }
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

/** Âge non glissant : un lecteur toutes les 30 s pendant 6 min, l'âge court depuis la vérification, pas depuis le dernier usage. */
async function continuousTrafficScenario(mod) {
  let now = 1_000_000;
  mod.resetGenerationCache();
  mod.setGenerationCacheClock(() => now);
  try {
    await mod.getActiveGeneration(pool);
    for (let i = 0; i < 12; i += 1) { now += 30_000; await mod.getActiveGeneration(pool); }
    assert.equal(mod.generationCacheStats().full_loads, 2, "trafic continu pendant 6 min : une revérification complète a eu lieu (expiration non glissante)");
  } finally {
    mod.resetGenerationCache();
  }
}

/** Réserve R1 (8f) : horloge murale reculée d'1 h après la vérification -> âge négatif = expiré, revérification complète. */
async function clockGoesBackScenario(mod) {
  let now = 1_000_000_000;
  mod.resetGenerationCache();
  mod.setGenerationCacheClock(() => now);
  try {
    await mod.getActiveGeneration(pool);
    now -= 3_600_000;
    const after = await mod.getActiveGeneration(pool);
    assert.equal(after.status, "ACTIVE");
    assert.equal(mod.generationCacheStats().full_loads, 2, "horloge reculée : âge négatif traité comme expiré (revérification complète)");
  } finally {
    mod.resetGenerationCache();
  }
}

test("expiration NON glissante sous trafic continu (1 lecteur / 30 s pendant 6 min -> une revérification)", async () => {
  await continuousTrafficScenario(siteDb);
});

test("[R1] horloge qui recule d'1 h : âge négatif = expiré, revérification complète", async () => {
  await clockGoesBackScenario(siteDb);
});

// --- mutants des conditions de la relecture 8f --------------------------------------------------------------------------

async function mutantModule(transform, fn) {
  const out = BUILD_GEN.replace(/generation\.js$/, `generation.rv8f.js`);
  writeFileSync(out, transform(readFileSync(BUILD_GEN, "utf8")));
  try {
    delete require.cache[out];
    return await fn(require(out));
  } finally {
    rmSync(out, { force: true });
    delete require.cache[out];
  }
}

test("garde-fou discriminant : le mutant « résultat de load() non gelé » est refusé par RV-P4", async () => {
  await mutantModule(
    (src) => mutate(src, "freeze", () => "    const active = interpret(row); // MUTATION_POINT:freeze"),
    (mutant) => assert.rejects(sharedUnsafeScenario(mutant), (e) => e instanceof assert.AssertionError && /gelé avant partage/.test(e.message)),
  );
});

test("garde-fou discriminant : le mutant « sans âge maximal » est refusé par le test d'âge", async () => {
  await mutantModule(
    (src) => mutate(src, "hit", (l) => l.replace("isFresh(verified)", "true")),
    async (mutant) => {
      let now = 1_000_000;
      mutant.resetGenerationCache();
      mutant.setGenerationCacheClock(() => now);
      await mutant.getActiveGeneration(pool);
      now += mutant.GENERATION_CACHE_MAX_AGE_MS;
      await mutant.getActiveGeneration(pool);
      assert.equal(mutant.generationCacheStats().full_loads, 1, "le mutant ne relit PAS au-delà de 5 min (donc le test d'âge l'attrape)");
      mutant.resetGenerationCache();
    },
  );
});

test("garde-fou discriminant : le mutant « âge négatif accepté » est refusé par le test d'horloge qui recule", async () => {
  await mutantModule(
    (src) => mutate(src, "age", (l) => l.replace("age >= 0 && ", "")),
    (mutant) => assert.rejects(clockGoesBackScenario(mutant), (e) => e instanceof assert.AssertionError && /âge négatif traité comme expiré/.test(e.message)),
  );
});

test("garde-fou discriminant : le mutant « expiration glissante » est refusé par le trafic continu", async () => {
  await mutantModule(
    (src) => mutate(src, "counthits", (l) => l.replace("stats.hits += 1;", "stats.hits += 1; verified.at = clock();")),
    (mutant) => assert.rejects(continuousTrafficScenario(mutant), (e) => e instanceof assert.AssertionError && /expiration non glissante/.test(e.message)),
  );
});
