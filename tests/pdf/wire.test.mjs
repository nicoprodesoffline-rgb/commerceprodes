import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import pg from 'pg';
import { ROOT, layout } from './helpers.mjs';
import { seedCatalogue, putContent, PDF_FAMILY_KEY } from './fixture.mjs';
import { migrate } from '../../scripts/db/migrate.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
test('Next réel + base : téléchargement, cache, données modifiées, absent/null et famille inconnue', async () => {
  const url = new URL(process.env.SITE_TEST_DATABASE_URL); assert.equal(url.pathname, '/prodes_site_c2_pdf_test');
  const pool = new pg.Pool({ connectionString: url.href }); let child; let exit;
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
  let stderr = '';
  try {
    await migrate(url.href, () => {}); await seedCatalogue(pool); await putContent(pool);
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [`${ROOT}/node_modules/next/dist/bin/next`, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1', SITE_CATALOG_SOURCE: 'db', SITE_DATABASE_URL: url.href, SITE_ENV: 'staging', SITE_NOW_UTC: '2027-01-03T09:00:00Z', SITE_MEMORY_MAX_AGE_SECONDS: '0', SITE_MEDIA_CACHE_MB: '0', SITE_PUBLIC_ORIGIN: base }, stdio: ['ignore','ignore','pipe'],
    });
    exit = once(child, 'exit'); child.stderr.on('data', b => stderr = (stderr + b.toString()).slice(-8000));
    for (let i = 0;; i++) { try { await fetch(base + '/api/site/health'); break; } catch { if (i > 150 || child.exitCode !== null) throw Error(stderr); await sleep(100); } }
    const endpoint = `${base}/api/site/families/${PDF_FAMILY_KEY}/pdf`;
    const first = await fetch(endpoint); assert.equal(first.status, 200, stderr); assert.equal(first.headers.get('content-type'), 'application/pdf');
    assert.match(first.headers.get('content-disposition'), /^attachment; filename="banc-exemple-1.pdf"$/);
    const bytes = Buffer.from(await first.arrayBuffer()); assert.equal(bytes.subarray(0,4).toString(), '%PDF'); assert.ok(bytes.length <= 5 * 1024 * 1024);
    const record = await pool.query('SELECT fingerprint,created_at,photo_shas FROM site_family_pdf WHERE family_key=$1', [PDF_FAMILY_KEY]);
    assert.equal(record.rows[0].photo_shas.length, 5, 'les cinq JPEG publiés sont intégrés, aucun original');
    const second = await fetch(endpoint); assert.equal(second.status, 200, stderr); assert.deepEqual(Buffer.from(await second.arrayBuffer()), bytes);
    assert.deepEqual((await pool.query('SELECT fingerprint,created_at,photo_shas FROM site_family_pdf WHERE family_key=$1', [PDF_FAMILY_KEY])).rows, record.rows, 'conservation sans réécriture ni fabrication');
    const page = await fetch(base + '/famille/banc-exemple'); assert.equal(page.status, 200, stderr); assert.match(await page.text(), /data-testid="family-pdf"/);
    await putContent(pool, { ...layout, contact: 'Autre Contact Exemple' }, 2);
    const changed = await fetch(endpoint); assert.equal(changed.status, 200, stderr); assert.notDeepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
    assert.equal(Number((await pool.query('SELECT count(*) FROM site_family_pdf WHERE family_key=$1', [PDF_FAMILY_KEY])).rows[0].count), 2);
    assert.equal((await fetch(base + '/api/site/families/inconnue/pdf')).status, 404);
    for (const setting of [null, 'absent']) {
      if (setting === 'absent') await pool.query('DELETE FROM site_content_active'); else await putContent(pool, null, 3);
      assert.equal((await fetch(endpoint)).status, 404);
      assert.doesNotMatch(await (await fetch(base + '/famille/banc-exemple')).text(), /data-testid="family-pdf"/);
    }
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await exit; }
    await pool.end();
  }
});
