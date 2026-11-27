// Jeu intégralement inventé, réutilisé par le test HTTP et le relevé local. Aucun canal Factory.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT, layout, png } from './helpers.mjs';
const require = createRequire(import.meta.url);
const jsonc = require(`${ROOT}/c0/ts/dist/src/jsonc.js`);
const snapshot = require(`${ROOT}/c0v2/ts/dist/c0v2/ts/src/snapshot.js`);
const content = require(`${ROOT}/c0v2/ts/dist/c0v2/ts/src/content.js`);
const sharp = require('sharp'); // déjà fourni par Next, aucune dépendance ajoutée.
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const PDF_FAMILY_KEY = 'PF-00000001Y';
export async function seedCatalogue(pool) {
  const doc = JSON.parse(await readFile(`${ROOT}/c0v2/fixtures/documents/V2_CATALOGUE/snapshot_v2_ready.json`, 'utf8'));
  doc.publication_id = 'PUB-pdf-exemple'; doc.projection_id = 'PRJ-pdf-exemple';
  for (let i = 0; i < doc.families.length; i++) {
    const f = doc.families[i]; f.name = `Banc Exemple ${i + 1}`; f.description_short = 'Description courte Exemple'; f.description_long = 'Description longue Exemple, é è à ç œ €';
    f.seo_title = null; f.seo_description = null;
  }
  const identities = [];
  for (let i = 0; i < 5; i++) {
    const bytes = await sharp(png(1200, 900, i + 1)).jpeg({ quality: 85 }).toBuffer();
    const original = sha(Buffer.from(`original-exemple-${i}`)); const derivative = sha(bytes); identities.push(original);
    doc.media_refs.push({ sha256: original, mime: 'image/jpeg', size: 9_000_000, alt: 'Banc Exemple', public_name: `banc-exemple-${i}`, derivatives: [{ sha256: derivative, mime: 'image/jpeg', width: 1200, height: 900, size: bytes.length }] });
    await pool.query('INSERT INTO site_media (sha256,mime,size,bytes) VALUES ($1,$2,$3,$4) ON CONFLICT (sha256) DO NOTHING', [derivative, 'image/jpeg', bytes.length, bytes]);
  }
  doc.media_refs.sort((a,b) => a.sha256.localeCompare(b.sha256));
  doc.manifest_counts.media = doc.media_refs.length;
  doc.families[0].image_main_sha256 = identities[0]; doc.families[0].items[0].public_media_refs = identities.slice(1).sort();
  doc.families[0].slug = 'banc-exemple'; doc.families[0].characteristics = [{ label: 'Matière', value: 'Bois Exemple' }];
  doc.payload_sha256 = snapshot.payloadSha256(doc);
  const errors = snapshot.validateSnapshotDetailed(doc);
  if (errors[0].length) throw Error(JSON.stringify(errors));
  const bytes = Buffer.from(jsonc.canonicalBytes(doc));
  const { rows } = await pool.query(`INSERT INTO site_generation (publication_id,projection_id,scope_key,catalogue_sequence,payload_sha256,snapshot_bytes,snapshot_json,transport_json,status,staged_at,activated_at,ack_json,ack_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'{}','ACTIVE',now(),now(),'{}',decode('7b7d','hex')) RETURNING id`,
  [doc.publication_id,doc.projection_id,doc.scope_key,doc.catalogue_sequence,doc.payload_sha256,bytes,JSON.stringify(doc)]);
  await pool.query('UPDATE site_active_pointer SET generation_id=$1,catalogue_sequence=$2,payload_sha256=$3,activated_at=now() WHERE singleton=1', [rows[0].id,doc.catalogue_sequence,doc.payload_sha256]);
}
export async function putContent(pool, pdfLayout = layout, sequence = 1) {
  const contentCase = JSON.parse(await readFile(`${ROOT}/c0v2/fixtures/cases/V2_CONTENT/content_accepted.json`, 'utf8')).input;
  const doc = JSON.parse(await readFile(`${ROOT}/c0v2/fixtures/${contentCase.content.$bytes}`, 'utf8'));
  doc.publication_id = 'PUB-content-pdf-exemple'; doc.content_sequence = sequence;
  if (pdfLayout === undefined) delete doc.pdf_layout; else doc.pdf_layout = pdfLayout;
  doc.pages = []; doc.relations = []; doc.redirects = [];
  doc.payload_sha256 = content.payloadSha256(doc);
  await pool.query(`INSERT INTO site_content_active (singleton,content_sequence,publication_id,payload_sha256,content_bytes,ack_bytes) VALUES (1,$1,$2,$3,$4,decode('7b7d','hex'))
    ON CONFLICT (singleton) DO UPDATE SET content_sequence=EXCLUDED.content_sequence,publication_id=EXCLUDED.publication_id,payload_sha256=EXCLUDED.payload_sha256,content_bytes=EXCLUDED.content_bytes`,
  [doc.content_sequence,doc.publication_id,doc.payload_sha256,Buffer.from(jsonc.canonicalBytes(doc))]);
}
