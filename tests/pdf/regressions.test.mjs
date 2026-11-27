import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hooks, input, png } from './helpers.mjs';
hooks();
const model = await import('../../lib/site-pdf/model.ts');
const { buildFamilyPdf } = await import('../../lib/site-pdf/render.ts');
const { price } = await import('../../components/site/format.ts');
const retained = (d, shas, truncated) => ({ fingerprint: model.fingerprint(d, shas), source_fingerprint: model.sourceFingerprint(d, truncated), photo_shas: shas });
test('prix du site : espace des milliers conservé, jamais remplacé par un point d’interrogation', () => {
  assert.equal(model.printableText(price('1234.56', 'HT')), '1 234,56 € HT');
});
test('PNG endommagé : tentative abandonnée, PDF relisible sans photo, jamais bloqué', async () => {
  const d = input(); const bytes = png(30,30); bytes[25] = 6;
  d.photos = [{sha256:'png-exemple', mime:'image/png',size:bytes.length,load:async()=>bytes}];
  let timer;
  try {
    const result = await Promise.race([buildFamilyPdf(d),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF bloqué')),700);})]);
    assert.deepEqual(result.photoShas,[]); assert.equal(result.bytes.subarray(0,4).toString(),'%PDF'); assert.ok(result.skipped.some(s=>s.code==='IMAGE_SKIPPED'));
  } finally { clearTimeout(timer); }
});
test('conservation : seul un WebP écarté change, la fiche correspond toujours', () => {
  const d = input(); d.photos = [{sha256:'main',mime:'image/jpeg'}, {sha256:'webp-avant',mime:'image/webp'}];
  const row = retained(d,['main'],false); d.photos[1].sha256 = 'webp-apres'; assert.equal(model.matchesRetained(d,row),true);
  d.photos[0].sha256 = 'main-apres'; assert.equal(model.matchesRetained(d,row),false);
});
test('conservation : dernière photo retirée pour taille modifiée, même fiche ; ajout après fiche complète, nouvelle fiche', () => {
  const d = input(); d.photos = [{sha256:'main',mime:'image/jpeg'}, {sha256:'last',mime:'image/jpeg'}];
  const row = retained(d,['main'],true); d.photos[1].sha256 = 'last-apres'; assert.equal(model.matchesRetained(d,row),true);
  const complete = retained(d,['main','last-apres'],false); d.photos.push({sha256:'nouvelle',mime:'image/jpeg'}); assert.equal(model.matchesRetained(d,complete),false);
});
test('chaque demande déclenche une purge bornée, même fonction éteinte ; 404 reste prioritaire', async () => {
  const { createPdfHandler } = await import('../../lib/site-pdf/http.ts');
  let purges = 0;
  const get = createPdfHandler({resolve:async()=>null,document:async()=>{throw Error('interdit');},purge:async()=>{purges++;throw Error('base indisponible');}});
  assert.equal((await get(new Request('http://exemple.invalid/pdf'),'inconnue')).status,404); assert.equal(purges,1);
});

test('connexion coupée pendant la fabrication : erreur rejetée, jamais non interceptée, client écarté', async () => {
  const { EventEmitter } = await import('node:events');
  const { retainedPdf } = await import('../../lib/site-pdf/store.ts');
  const { input } = await import('./helpers.mjs');
  const client = new EventEmitter(); let released;
  client.query = async sql => { if (/SELECT fingerprint/.test(sql)) return { rows: [] }; return { rows: [] }; };
  client.release = arg => { released = arg; };
  const pool = { connect: async () => client };
  await assert.rejects(retainedPdf(pool, input(), async () => { client.emit('error', new Error('coupée')); throw new Error('coupée'); }), /coupée/);
  assert.equal(released, true); assert.equal(client.listenerCount('error'), 0);
});
