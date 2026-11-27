import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { hooks, input } from './helpers.mjs';
hooks();
const { createPdfHandler } = await import('../../lib/site-pdf/http.ts');
const { pdfLayoutFromContent } = await import('../../lib/site-pdf/model.ts');
const { PdfDownload } = await import('../../components/product/pdf-download.tsx');
const request = () => new Request('http://exemple.invalid/api/site/families/PF-EXEMPLE/pdf');
const deps = extra => ({ resolve: async () => input(), document: async () => Buffer.from('%PDF-exemple'), ...extra });
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
