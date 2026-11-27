import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { hooks, input } from './helpers.mjs';
hooks();
const { retainedPdf, purgeExpiredPdfs } = await import('../../lib/site-pdf/store.ts');

async function withEmptyStore(run) {
  const url = new URL(process.env.SITE_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/prodes_site_c2_pdf_test'); assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '54318');
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    await pool.query(await readFile(new URL('../../db/migrations/025_site_family_pdf.sql', import.meta.url), 'utf8'));
    await pool.query('TRUNCATE site_family_pdf');
    await run(pool);
  } finally { await pool.end(); }
}

test('0 jour : deux demandes fabriquent deux fiches, table vide après chacune, aucun accès à la base', async () => {
  await withEmptyStore(async pool => {
    const d = input(); d.layout.retention_days = 0;
    let builds = 0, accesses = 0;
    const build = async () => ({ bytes: Buffer.from('%PDF-' + (++builds)), photoShas: [], skipped: [] });
    const observed = {
      connect: (...args) => { accesses++; return pool.connect(...args); },
      query: (...args) => { accesses++; return pool.query(...args); },
    };
    for (let i = 1; i <= 2; i++) {
      assert.equal((await retainedPdf(observed, d, build)).toString(), '%PDF-' + i);
      assert.equal(builds, i);
      assert.equal(Number((await pool.query('SELECT count(*) FROM site_family_pdf')).rows[0].count), 0);
      assert.equal(accesses, 0);
    }
  });
});

test('0 jour : une fiche valide gardée 30 jours dans la même famille reste intacte et jamais servie', async () => {
  await withEmptyStore(async pool => {
    const d = input(); d.layout.retention_days = 30;
    let builds = 0, accesses = 0;
    const build = async () => ({ bytes: Buffer.from('%PDF-' + (++builds)), photoShas: [], skipped: [] });
    const kept = await retainedPdf(pool, d, build);
    const before = (await pool.query('SELECT * FROM site_family_pdf')).rows;
    assert.equal(before.length, 1);
    assert.equal(before[0].family_key, d.familyKey);
    assert.ok(before[0].expires_at > new Date());
    d.layout.retention_days = 0;
    const observed = {
      connect: (...args) => { accesses++; return pool.connect(...args); },
      query: (...args) => { accesses++; return pool.query(...args); },
    };
    for (let i = 2; i <= 3; i++) {
      const fresh = await retainedPdf(observed, d, build);
      assert.equal(fresh.toString(), '%PDF-' + i);
      assert.notDeepEqual(fresh, kept);
      assert.equal(builds, i);
      assert.deepEqual((await pool.query('SELECT * FROM site_family_pdf')).rows, before);
      assert.equal(accesses, 0);
    }
  });
});

for (const days of [1, 30]) {
  test(`${days} jour(s) : deux demandes identiques ne fabriquent qu’une fiche conservée`, async () => {
    await withEmptyStore(async pool => {
      const d = input(); d.layout.retention_days = days;
      let builds = 0;
      const build = async () => ({ bytes: Buffer.from('%PDF-' + (++builds)), photoShas: [], skipped: [] });
      const first = await retainedPdf(pool, d, build);
      assert.deepEqual(await retainedPdf(pool, d, build), first);
      assert.equal(builds, 1);
      const { rows } = await pool.query('SELECT *, expires_at - created_at AS lifetime FROM site_family_pdf');
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].pdf_bytes, first);
      assert.equal(rows[0].lifetime.days, days);
    });
  });
}

test('migration deux fois, conservation, changement, expiration et purge bornée sur vraie base', async () => {
  const url = new URL(process.env.SITE_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/prodes_site_c2_pdf_test'); assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '54318');
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    const sql = await readFile(new URL('../../db/migrations/025_site_family_pdf.sql', import.meta.url), 'utf8');
    await pool.query(sql); await pool.query(sql);
    await pool.query('TRUNCATE site_family_pdf');
    let builds = 0; const build = async d => ({ bytes: Buffer.from('%PDF-' + (++builds)), photoShas: [], skipped: [] });
    const d = input();
    const first = await retainedPdf(pool, d, build); assert.deepEqual(await retainedPdf(pool, d, build), first); assert.equal(builds, 1);
    const changed = { ...d, description: 'Autre description Exemple' }; await retainedPdf(pool, changed, build); assert.equal(builds, 2);
    assert.equal(Number((await pool.query('SELECT count(*) FROM site_family_pdf')).rows[0].count), 2);
    await pool.query("UPDATE site_family_pdf SET expires_at = now() - interval '1 second' WHERE fingerprint = (SELECT fingerprint FROM site_family_pdf ORDER BY created_at LIMIT 1)");
    assert.equal(await purgeExpiredPdfs(pool), 1); assert.equal(Number((await pool.query('SELECT count(*) FROM site_family_pdf')).rows[0].count), 1);
    // Deux appels simultanés identiques : une seule fabrication, sans mémoire applicative de PDF.
    const concurrent = { ...d, name: 'Chaise Exemple' }; const n = builds;
    await Promise.all([retainedPdf(pool, concurrent, build), retainedPdf(pool, concurrent, build)]); assert.equal(builds, n + 1);
    await pool.query("INSERT INTO site_family_pdf (family_key,fingerprint,source_fingerprint,photo_shas,pdf_bytes,expires_at) SELECT 'exemple', lpad(i::text,64,'0'), lpad(i::text,64,'0'), '[]'::jsonb, decode('25504446','hex'), now()-interval '1 second' FROM generate_series(1,105) i");
    assert.equal(await purgeExpiredPdfs(pool), 100); assert.equal(await purgeExpiredPdfs(pool), 5);
  } finally { await pool.end(); }
});
