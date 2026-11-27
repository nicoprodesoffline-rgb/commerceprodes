import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { hooks, input } from './helpers.mjs';
hooks();
const { createPdfHandler } = await import('../../lib/site-pdf/http.ts');
const { pdfLayoutFromContent } = await import('../../lib/site-pdf/model.ts');
const { PdfDownload } = await import('../../components/product/pdf-download.tsx');
const request = () => new Request('http://exemple.invalid/api/site/families/PF-EXEMPLE/pdf');
const deps = extra => ({ resolve: async () => input(), document: async () => Buffer.from('%PDF-exemple'), ...extra });
test('0 jour : fonction allumée, bouton présent, deux réponses 200 PDF sans conservation et purge à chaque demande', async () => {
  const { retainedPdf } = await import('../../lib/site-pdf/store.ts');
  const { buildFamilyPdf } = await import('../../lib/site-pdf/render.ts');
  const d = input(); d.layout.retention_days = 0;
  const layout = pdfLayoutFromContent({ pdf_layout: d.layout });
  assert.equal(layout, d.layout);
  const markup = renderToStaticMarkup(PdfDownload({ familyKey: d.familyKey, layout }));
  assert.match(markup, /Fiche PDF/);
  assert.match(markup, /href="\/api\/site\/families\/PF-EXEMPLE\/pdf"/);
  const pool = {
    connect: () => { assert.fail('connexion interdite à 0 jour'); },
    query: () => { assert.fail('requête interdite à 0 jour'); },
  };
  let purges = 0, builds = 0;
  const get = createPdfHandler(deps({
    resolve: async () => d,
    purge: async () => { purges++; },
    document: received => retainedPdf(pool, received, async value => { builds++; return buildFamilyPdf(value); }),
  }));
  for (let i = 1; i <= 2; i++) {
    const response = await get(request(), d.familyKey);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    assert.equal(Number(response.headers.get('content-length')), bytes.length);
    assert.equal(builds, i); assert.equal(purges, i);
  }
});

test('contenu v2 à 0 jour : contrat compilé et lecteur actif du SITE acceptent le réglage', async () => {
  const require = createRequire(import.meta.url);
  const content = require('../../c0v2/ts/dist/c0v2/ts/src/content.js');
    const doc = JSON.parse(await readFile(new URL('../../c0v2/fixtures/documents/V2_CONTENT/content_ready.json', import.meta.url), 'utf8'));
  doc.pdf_layout = { ...input().layout, retention_days: 0 };
  doc.payload_sha256 = content.payloadSha256(doc);
  assert.equal(content.shapeProblem(doc), null);
  // Le lecteur actif du site (lib/site-publish/content.ts) valide avec ce même contrat compilé ; ici : le contrat accepte 0 et la lecture du réglage le garde.
  assert.equal(pdfLayoutFromContent(doc).retention_days, 0);
  assert.equal(renderToStaticMarkup(PdfDownload({ familyKey: 'PF-EXEMPLE', layout: pdfLayoutFromContent(doc) })).includes('Fiche PDF'), true);
  doc.pdf_layout.retention_days = 366; assert.notEqual(content.shapeProblem(doc), null);
});

test('absent/null : 404 et aucun bouton ; présent : lien de téléchargement', async () => {
  for (const raw of [{}, { pdf_layout: null }]) {
    const layout = pdfLayoutFromContent(raw); assert.equal(layout, null);
    assert.equal(renderToStaticMarkup(PdfDownload({ familyKey: 'PF-EXEMPLE', layout })), '');
    const get = createPdfHandler(deps({ resolve: async () => null })); assert.equal((await get(request(), 'PF-EXEMPLE')).status, 404);
  }
  assert.match(renderToStaticMarkup(PdfDownload({ familyKey: 'PF-EXEMPLE', layout: input().layout })), /Fiche PDF/);
});
test('famille inconnue : 404, aucune fabrication', async () => {
  let made = 0; const get = createPdfHandler(deps({ resolve: async () => null, document: async () => { made++; } }));
  assert.equal((await get(request(), 'inconnue')).status, 404); assert.equal(made, 0);
});
test('3e requête simultanée : 503, compteur libéré aussi après erreur', async () => {
  let release; const waiting = new Promise(r => release = r); let fail = true;
  const get = createPdfHandler(deps({ document: async () => { await waiting; if (fail) throw Error('exemple'); return Buffer.from('%PDF-exemple'); } }), 2);
  const first = get(request(), 'PF-EXEMPLE'), second = get(request(), 'PF-EXEMPLE');
  const third = await get(request(), 'PF-EXEMPLE'); assert.equal(third.status, 503); assert.equal(third.headers.get('retry-after'), '5');
  release(); assert.deepEqual((await Promise.all([first, second])).map(r => r.status), [503, 503]); fail = false;
  const r = await get(request(), 'PF-EXEMPLE'); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf'); assert.match(r.headers.get('content-disposition'), /^attachment; filename="banc-exemple.pdf"$/); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('par défaut une seule fabrication à la fois : la 2e demande simultanée reçoit 503', async () => {
  const { MAX_PARALLEL } = await import('../../lib/site-pdf/http.ts'); assert.equal(MAX_PARALLEL, 1);
  let release; const waiting = new Promise(r => release = r);
  const get = createPdfHandler(deps({ document: async () => { await waiting; return Buffer.from('%PDF-exemple'); } }));
  const first = get(request(), 'PF-EXEMPLE'); const second = await get(request(), 'PF-EXEMPLE');
  assert.equal(second.status, 503); release(); assert.equal((await first).status, 200);
});
test('limitation publique existante : 429 avec attente', async () => {
  const get = createPdfHandler(deps()); let r;
  for (let i = 0; i < 61; i++) r = await get(request(), 'PF-EXEMPLE');
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) >= 1);
});
