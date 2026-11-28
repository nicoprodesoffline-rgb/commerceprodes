import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loader, read, root } from './load.mjs';
import path from 'node:path';
const load = loader();
function metrics() {
  assert.ok(existsSync(path.join(root, 'lib/site-metrics/core.ts')), 'daily metrics implementation exists');
  return load('lib/site-metrics/core.ts');
}
const now = new Date('2026-11-27T12:00:00Z');
const fixtures = 'tests/fixtures/seams/product_metrics_daily_v2/';
const manifest = JSON.parse(read(fixtures + 'VERDICTS.json'));
for (const c of manifest.cases) test(`contract oracle: ${c.name}`, () => {
  const m = metrics();
  const seen = new Map();
  for (const [i, file] of c.documents.entries()) {
    const doc = JSON.parse(read(fixtures + file));
    const problems = m.validateBatchBytes(Buffer.from(read(fixtures + file)), { now, depuis: c.depuis, keys: new Set(Object.keys(manifest.resolve_items)) });
    let verdict = problems[0] ?? 'ACCEPTED';
    if (verdict === 'ACCEPTED') {
      if (doc.rows.some(r => seen.has(r.date + r.public_item_key) && seen.get(r.date + r.public_item_key) !== JSON.stringify(r))) verdict = 'METRICS_CONFLICT';
      else doc.rows.forEach(r => seen.set(r.date + r.public_item_key, JSON.stringify(r)));
    }
    assert.equal(verdict, c.verdicts[i]);
  }
});
test('Paris midnight and both DST transitions', () => {
  const { parisDay } = metrics();
  for (const [instant, day] of [
    ['2026-01-01T22:59:59Z','2026-01-01'], ['2026-01-01T23:00:00Z','2026-01-02'],
    ['2026-03-28T23:00:00Z','2026-03-29'], ['2026-03-29T00:59:59Z','2026-03-29'], ['2026-03-29T01:00:00Z','2026-03-29'], ['2026-03-29T22:00:00Z','2026-03-30'],
    ['2026-10-25T00:59:59Z','2026-10-25'], ['2026-10-25T01:00:00Z','2026-10-25'], ['2026-10-25T22:59:59Z','2026-10-25'], ['2026-10-25T23:00:00Z','2026-10-26'],
  ]) assert.equal(parisDay(new Date(instant)), day);
});
test('strict event payload; no browser quote_submit, extra fields, oversized or approximate keys', () => {
  const { parseEvent } = metrics(); const keys = new Set(['PI-EXAMPLE01']);
  for (const event of ['views', 'add_to_cart', 'quote_start']) assert.deepEqual(parseEvent(Buffer.from(JSON.stringify({ key: 'PI-EXAMPLE01', event })), keys), { key: 'PI-EXAMPLE01', event });
  for (const body of [{ key: 'PI-EXAMPLE01', event: 'quote_submit' }, { key: 'pi-example01', event: 'views' }, { key: 'PI-EXAMPLE01', event: 'views', visitor: 'x' }, null, [], {event:'views'}]) assert.equal(parseEvent(Buffer.from(JSON.stringify(body)), keys), null);
  assert.equal(parseEvent(Buffer.from(' '.repeat(1025)), keys), null);
});
test('rate limiter has only a bounded process/product budget; resets per minute', () => {
  const { createLimiter } = metrics(); const allow = createLimiter(3, 2);
  assert.equal(allow('a', 0), true); assert.equal(allow('a', 0), true); assert.equal(allow('a', 0), false);
  assert.equal(allow('b', 0), true); assert.equal(allow('c', 0), false); assert.equal(allow('a', 60000), true);
});
test('validator rejects malformed envelopes, missing fields, invalid dates, unsafe counters', () => {
  const { validateBatch } = metrics(); const options = { now, keys: new Set(['a']) };
  const good = { contract_version: 'product_metrics_daily.v2', up_to: '2026-11-26', rows: [] };
  for (const [doc, code] of [[null,'METRICS_NOT_AN_OBJECT'], [{ ...good, rows: {} },'ROWS_INVALID'], [{...good, up_to:'2026-02-30'},'DATE_INVALID'], [{...good, contract_version:'x'},'CONTRACT_VERSION_UNSUPPORTED'], [{ up_to:good.up_to, rows:[] },'KEY_MISSING'], [{...good, rows:[null]},'ROW_INVALID'], [{...good, rows:[{date:'2026-11-25',public_item_key:'a'}]},'METRIC_MISSING']]) assert.ok(validateBatch(doc, options).includes(code));
});
