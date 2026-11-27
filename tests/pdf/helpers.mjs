import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { deflateSync } from 'node:zlib';
export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SCRATCH = '/Users/nico/WORK/PRODES/JETABLE/c2/pdf-releve';
export function hooks() {
  return registerHooks({
    resolve(s, c, next) {
      if (s.startsWith('@/')) s = pathToFileURL(path.join(ROOT, s.slice(2))).href;
      if ((s.startsWith('.') || s.startsWith('file:')) && !path.extname(s) && !(c.parentURL || '').includes('/dist/')) {
        try { return next(s + '.ts', c); } catch { return next(s + '.tsx', c); }
      }
      return next(s, c);
    },
    load(url, c, next) {
      if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
      return next(url, c);
    },
  });
}
export const layout = { blocks: ['images', 'description', 'caracteristiques', 'prix', 'coordonnees'], font: 'Helvetica', extra_photos: 8, retention_days: 7, contact: 'Contact Exemple' };
export const input = () => ({ familyKey: 'PF-EXEMPLE', name: 'Banc Exemple', description: 'Description Exemple', characteristics: [{ label: 'Matière', value: 'Bois Exemple' }], price: 'À partir de 123,45 € HT', priceDay: '2027-01-03', layout: structuredClone(layout), photos: [] });
// PNG RGB synthétique, bruit déterministe ; aucune photo réelle, aucun outil externe.
export function png(width, height, seed = 1) {
  const crc = b => { let n = 0xffffffff; for (const v of b) { n ^= v; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (name, bytes) => { const b = Buffer.concat([Buffer.from(name), bytes]); const head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc(b)); return Buffer.concat([head, b, tail]); };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let n = seed;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 3; x++) { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; raw[y * (width * 3 + 1) + x] = n & 255; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
