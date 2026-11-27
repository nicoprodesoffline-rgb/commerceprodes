import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { hooks, input, png } from './helpers.mjs';
hooks();
const { buildFamilyPdf, MAX_PDF_BYTES } = await import('../../lib/site-pdf/render.ts');
const { fingerprint, printableText, filename, selectPhotos } = await import('../../lib/site-pdf/model.ts');
const text = bytes => { const r = spawnSync('pdftotext', ['-layout', '-', '-'], { input: bytes }); assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout.toString(); };
const photo = (sha, bytes, mime = 'image/png') => ({ sha256: sha, mime, size: bytes.length, load: async () => bytes });
test('PDF relisible, blocs dans l’ordre demandé, nom toujours présent', async () => {
  const d = input(); d.layout.blocks = ['coordonnees', 'prix', 'caracteristiques', 'description'];
  const { bytes } = await buildFamilyPdf(d); assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  const out = text(bytes); let previous = -1;
  for (const s of ['Banc Exemple', 'Contact Exemple', '123,45', 'Bois Exemple', 'Description Exemple']) { const i = out.indexOf(s); assert.ok(i > previous, s); previous = i; }
  assert.match(out, /au 3 janvier 2027/); assert.match(out, /prix susceptible d'évoluer/);
});
test('blocs absents et prix absent ne sont jamais imprimés', async () => {
  const d = input(); d.layout.blocks = []; const out = text((await buildFamilyPdf(d)).bytes);
  assert.match(out, /Banc Exemple/); for (const s of ['Description Exemple', 'Bois Exemple', 'Contact Exemple', '123,45', 'janvier']) assert.ok(!out.includes(s));
  d.layout.blocks = ['prix']; d.price = null; assert.doesNotMatch(text((await buildFamilyPdf(d)).bytes), /Prix|évoluer|janvier/);
});
test('WinAnsi : é è à ç œ € relus, caractère inconnu remplacé proprement', async () => {
  const d = input(); d.name = 'é è à ç œ € 漢 🙂';
  assert.equal(printableText(d.name), 'é è à ç œ € ? ?');
  assert.match(text((await buildFamilyPdf(d)).bytes).replace(/\s/g, ''), /éèàçœ€\?\?/);
});
test('9 photos synthétiques lourdes : limite 5 Mio, retrait par la fin', async () => {
  const d = input(); d.photos = Array.from({ length: 9 }, (_, i) => photo(String(i), png(1200, 900, i + 1)));
  const r = await buildFamilyPdf(d); assert.ok(r.bytes.length <= MAX_PDF_BYTES); assert.ok(r.photoShas.length > 0 && r.photoShas.length < 9);
  assert.deepEqual(r.photoShas, d.photos.slice(0, r.photoShas.length).map(p => p.sha256));
  d.photos = [photo('large', png(1700, 1200))]; const no = await buildFamilyPdf(d); assert.deepEqual(no.photoShas, []); assert.ok(no.bytes.length <= MAX_PDF_BYTES);
});
test('WebP sauté et consigné, aucune lecture des octets', async () => {
  const d = input(); let loads = 0; d.photos = [{ sha256: 'webp', mime: 'image/webp', size: 10, load: async () => { loads++; throw Error('interdit'); } }];
  const r = await buildFamilyPdf(d); assert.deepEqual(r.photoShas, []); assert.ok(r.skipped.some(s => s.code === 'WEBP_SKIPPED')); assert.equal(loads, 0); assert.match(text(r.bytes), /Banc Exemple/);
});
test('seuls les dérivés publiés, principale puis huit au plus, jamais un original', () => {
  const family = { image_main_sha256: 'main', items: [{ public_media_refs: ['main', 'other', 'original'] }] };
  const views = new Map([['main', { derivatives: [{ sha256: 'small', mime: 'image/jpeg', width: 640, size: 50 }, { sha256: 'big', mime: 'image/jpeg', width: 1200, size: 70 }] }], ['other', { derivatives: [{ sha256: 'webp', mime: 'image/webp', width: 1200, size: 60 }] }]]);
  assert.deepEqual(selectPhotos(family, views, 0).map(p => p.sha256), ['big']);
  assert.deepEqual(selectPhotos(family, views, 8).map(p => p.sha256), ['big', 'webp']);
});
test('empreinte des données imprimées, ordre, photos retenues et jour ; nom sûr', () => {
  const d = input(); const base = fingerprint(d, ['a']);
  for (const change of [v => v.name += ' bis', v => v.description += ' bis', v => v.characteristics[0].value += ' bis', v => v.priceDay = '2027-01-04', v => v.price = '234 €', v => v.layout.blocks.reverse(), v => v.layout.contact = 'Autre Exemple']) { const v = structuredClone(d); change(v); assert.notEqual(fingerprint(v, ['a']), base); }
  assert.notEqual(fingerprint(d, ['b']), base); assert.match(filename('../Banc é\r\n"'), /^[a-z0-9-]+\.pdf$/);
});
