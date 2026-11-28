import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loader, root } from './load.mjs';
import path from 'node:path';
const load = loader();
const get = () => { assert.ok(existsSync(path.join(root,'lib/site-metrics/http.ts')), 'metrics HTTP exists'); return load('lib/site-metrics/http.ts'); };
const now = new Date('2026-11-27T12:00:00Z');
const keyring = { keys: [{ key_id:'metrics-test', scope:'site_metrics.read', status:'ACTIVE', secret_utf8:'invented-test-value-00000000000000' }] };
const ack = {keys:[{key_id:'ack-test',scope:'activation_ack',status:'ACTIVE',secret_utf8:'invented-test-value-00000000000000'}]};
function setup() {
  const seen = new Set(); let writes = 0;
  const pool = { async query(sql, params) {
    if (sql.startsWith('DELETE FROM site_request_nonce')) return {rowCount:0};
    if (sql.startsWith('INSERT INTO site_request_nonce')) {const k=params.slice(0,2).join(':'); const fresh=!seen.has(k); seen.add(k); return {rowCount:fresh?1:0};}
    if (sql.includes('INSERT INTO site_product_metrics_daily')) { writes++; return {rowCount:1}; }
    throw Error('Unexpected query');
  } };
  return { deps:{pool, now:()=>now, keys:async()=>new Set(['PI-EXAMPLE01']), keyring:()=>keyring, sign:async(req,res)=>load('lib/site-publish/transport-gate.ts').signResponse(ack,'ack-test',req.headers,res), read:async()=>({contract_version:'product_metrics_daily.v2',up_to:'2026-11-26',rows:[]}), allow:()=>true}, writes:()=>writes };
}
function signed(url='https://site.invalid/api/site/metrics?depuis=2026-11-26', at=now.toISOString().replace('.000',''), nonce=randomBytes(16).toString('hex')) {
  const {signRoute}=load('lib/site-requests-routes/keyring.ts'); const {sha256Hex}=load('lib/site-publish/transport-gate.ts'); const u=new URL(url);
  return new Request(url,{headers:{'x-c0-key-id':'metrics-test','x-c0-issued-at':at,'x-c0-nonce':nonce,'x-c0-request-signature':signRoute(keyring,'metrics-test','site_metrics.read',{method:'GET',path:u.pathname+u.search,body_sha256:sha256Hex(new Uint8Array()),issued_at_utc:at,nonce})}});
}
test('signed GET: absent, wrong, stale, replayed, modified query -> opaque 401; HTTP remote -> 403', async()=>{
  const {metricsHttp}=get(); const {deps}=setup();
  const unsigned=new Request('https://site.invalid/api/site/metrics?depuis=2026-11-26');
  const wrong=signed(); wrong.headers.set('x-c0-request-signature','0'.repeat(64));
  const stale=signed(undefined,'2026-11-27T11:54:59Z');
  const changed=signed(); const tampered=new Request(changed.url.replace('26','25'),{headers:changed.headers});
  for (const req of [unsigned,wrong,stale,tampered]) {const r=await metricsHttp(req,deps);assert.equal(r.status,401);assert.equal(await r.text(),'');assert.equal(r.headers.get('set-cookie'),null);}
  const req=signed(); assert.equal((await metricsHttp(req,deps)).status,200); assert.equal((await metricsHttp(req,deps)).status,401);
  assert.equal((await metricsHttp(signed('http://site.invalid/api/site/metrics?depuis=2026-11-26'),deps)).status,403);
});
test('signed successful response uses existing activation_ack response signature', async()=>{
  const {metricsHttp}=get(); const {deps}=setup(); const req=signed(); const res=await metricsHttp(req,deps); const bytes=new Uint8Array(await res.arrayBuffer());
  const {verify}=load('c0/ts/src/signing.ts'); const {sha256Hex,RESPONSE_DOMAIN}=load('lib/site-publish/transport-gate.ts');
  assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(res.headers.get('set-cookie'),null);
  assert.equal(res.headers.get('x-c0-response-key-id'),'ack-test');
  assert.equal(verify(ack,'ack-test',res.headers.get('x-c0-response-signature'),'activation_ack',RESPONSE_DOMAIN,{request_nonce:req.headers.get('x-c0-nonce'),http_status:200,body_sha256:sha256Hex(bytes)}),true);
  assert.ok(bytes.length<=1048576);
});
test('missing/invalid depuis -> opaque 400, missing active key or unsigned success -> 503',async()=>{
  const {metricsHttp}=get(); const {deps}=setup();
  for (const url of ['https://site.invalid/api/site/metrics','https://site.invalid/api/site/metrics?depuis=2026-02-30']) assert.equal((await metricsHttp(signed(url),deps)).status,400);
  assert.equal((await metricsHttp(signed(),{...deps,keyring:()=>({keys:[]})})).status,503);
  assert.equal((await metricsHttp(signed(),{...deps,sign:async(_,r)=>r})).status,503);
});
test('browser POST: opaque refusals, <=1KiB streamed, exact catalogue, no cookies, 204 and no-store',async()=>{
  const {eventHttp}=get(); const {deps,writes}=setup();
  const req=body=>new Request('https://site.invalid/api/site/metrics/event',{method:'POST',body});
  for (const body of ['{',JSON.stringify({key:'unknown',event:'views'}),JSON.stringify({key:'PI-EXAMPLE01',event:'quote_submit'}),' '.repeat(1025),JSON.stringify({key:'PI-EXAMPLE01',event:'views',id:'x'})]) {const r=await eventHttp(req(body),deps);assert.ok([400,404].includes(r.status));assert.equal(await r.text(),'');}
  assert.equal(writes(),0);
  for (const event of ['views','add_to_cart','quote_start']) {const r=await eventHttp(req(JSON.stringify({key:'PI-EXAMPLE01',event})),deps);assert.equal(r.status,204);assert.equal(await r.text(),'');assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');}
  assert.equal(writes(),3);
  assert.equal((await eventHttp(req(JSON.stringify({key:'PI-EXAMPLE01',event:'views'})),{...deps,allow:()=>false})).status,204); assert.equal(writes(),3);
});
test('metrics routes bypass Next proxy buffering and redirects',async()=>{
  const {read}=await import('./load.mjs');const source=read('proxy.ts');const literal=/matcher:\s*\[("[^"\n]+")\]/.exec(source);assert.ok(literal);
  const pattern=new RegExp('^'+JSON.parse(literal[1])+'$');
  for(const route of ['/api/site/metrics','/api/site/metrics/event']) assert.equal(pattern.test(route),false,route);
  assert.equal(pattern.test('/famille/exemple'),true);
});
test('dated errors preserve the existing response signature, including capacity/DB failure and HTTP refusal',async()=>{
  const {metricsHttp}=get();const {deps}=setup();
  for(const [req,over,status] of [[signed(),{read:async()=>{throw Error('DAY_CAPACITY');}},503],[signed('http://site.invalid/api/site/metrics?depuis=2026-11-26'),{},403],[signed(undefined,'2026-11-27T11:54:59Z'),{},401],[signed('https://site.invalid/api/site/metrics?depuis=bad'),{},400]]) {
    const res=await metricsHttp(req,{...deps,...over});assert.equal(res.status,status);assert.equal(res.headers.get('x-c0-response-key-id'),'ack-test');
    const bytes=new Uint8Array(await res.arrayBuffer());assert.equal(bytes.length,0);
    const {verify}=load('c0/ts/src/signing.ts');const {sha256Hex,RESPONSE_DOMAIN}=load('lib/site-publish/transport-gate.ts');
    assert.equal(verify(ack,'ack-test',res.headers.get('x-c0-response-signature'),'activation_ack',RESPONSE_DOMAIN,{request_nonce:req.headers.get('x-c0-nonce'),http_status:status,body_sha256:sha256Hex(bytes)}),true);
  }
});
