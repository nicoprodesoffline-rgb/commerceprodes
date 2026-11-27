import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { hooks, input } from './helpers.mjs';
hooks();
const { retainedPdf, purgeExpiredPdfs } = await import('../../lib/site-pdf/store.ts');
test('migration deux fois, conservation, changement, expiration et purge bornée sur vraie base', async () => {
  const url = new URL(process.env.SITE_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/prodes_site_c2_pdf_test'); assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '54318');
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    const sql = await readFile(new URL('../../db/migrations/025_site_family_pdf.sql', import.meta.url), 'utf8');
    await pool.query(sql); await pool.query(sql);
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
