import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {loader,read} from './load.mjs';
import {migrate} from '../../scripts/db/migrate.mjs';
import {activate,businessCase,enc,newPool,resetDb} from '../bc4/helpers.mjs';
const load=loader(); let pool;
const NOW='2026-10-20T09:00:00Z';
before(async()=>{assert.equal(new URL(process.env.SITE_TEST_DATABASE_URL).pathname,'/prodes_site_c2_stats_test');await resetDb();pool=newPool();});
after(async()=>{await pool?.end();});
const store=()=>load('lib/site-metrics/store.ts');
const clear=()=>pool.query('TRUNCATE site_product_metrics_daily');
test('migration twice and schema exactly six aggregate columns, owner prodes_site',async()=>{
  await migrate(process.env.SITE_TEST_DATABASE_URL,()=>{});await migrate(process.env.SITE_TEST_DATABASE_URL,()=>{});
  const sql=read('db/migrations/026_site_product_metrics_daily.sql');await pool.query(sql);await pool.query(sql);
  const {rows}=await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='site_product_metrics_daily' ORDER BY ordinal_position");assert.deepEqual(rows.map(r=>r.column_name),['day','public_item_key','views','add_to_cart','quote_start','quote_submit']);
  assert.equal((await pool.query("SELECT tableowner FROM pg_tables WHERE tablename='site_product_metrics_daily'")).rows[0].tableowner,'prodes_site');
});
test('atomic counters isolated per product/event; midnight receipt only; distinct quote products',async()=>{
  const {increment,countQuoteSubmit}=store();await clear();
  await Promise.all(Array.from({length:40},()=>increment(pool,'a','views',()=>new Date('2026-11-26T22:59:59Z'))));
  await increment(pool,'a','add_to_cart',()=>new Date('2026-11-26T22:59:59Z'));
  await increment(pool,'b','quote_start',()=>new Date('2026-11-26T22:59:59Z'));
  await countQuoteSubmit(pool,['a','a','b'],()=>new Date('2026-11-26T22:59:59Z'));
  await increment(pool,'a','views',()=>new Date('2026-11-26T23:00:00Z'));
  const r=(await pool.query('SELECT day::text,public_item_key,views,add_to_cart,quote_start,quote_submit FROM site_product_metrics_daily ORDER BY day,public_item_key')).rows;
  assert.deepEqual(r,[{day:'2026-11-26',public_item_key:'a',views:40,add_to_cart:1,quote_start:0,quote_submit:1},{day:'2026-11-26',public_item_key:'b',views:0,add_to_cart:0,quote_start:1,quote_submit:1},{day:'2026-11-27',public_item_key:'a',views:1,add_to_cart:0,quote_start:0,quote_submit:0}]);
});
test('concurrent quote counts with reversed products both succeed below the 100ms lock timeout',async(t)=>{
  await clear();
  // Keep each row lock briefly so the two statements overlap, even on a fast database.
  await pool.query("CREATE FUNCTION metrics_overlap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.02); RETURN NEW; END $$");
  try {
    await pool.query('CREATE TRIGGER metrics_overlap BEFORE INSERT ON site_product_metrics_daily FOR EACH ROW EXECUTE FUNCTION metrics_overlap()');
    let arrived=0,release;const gate=new Promise(resolve=>{release=resolve;});
    const results=await Promise.allSettled([['PI-B','PI-A','PI-B'],['PI-A','PI-B']].map(async keys=>{
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '100ms'; SET LOCAL statement_timeout = '300ms'");
        if(++arrived===2) release();
        await gate;
        const started=performance.now();
        await store().countQuoteSubmit(client,keys,()=>new Date(NOW));
        const elapsed=performance.now()-started;
        await client.query('COMMIT');
        return elapsed;
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    }));
    assert.deepEqual(results.map(result=>result.status),['fulfilled','fulfilled'],JSON.stringify(results));
    t.diagnostic(`2 quote counts, lock_timeout=100ms, statement durations: ${results.map(result=>result.value.toFixed(2)+'ms').join(', ')}`);
    assert.deepEqual((await pool.query('SELECT public_item_key,quote_submit FROM site_product_metrics_daily ORDER BY public_item_key')).rows,[{public_item_key:'PI-A',quote_submit:2},{public_item_key:'PI-B',quote_submit:2}]);
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS metrics_overlap ON site_product_metrics_daily');
    await pool.query('DROP FUNCTION metrics_overlap()');
  }
});
test('read inclusive closed days, exact lexical sort; removed keys omitted and logged without value; future depuis empty',async()=>{
  await clear();await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) VALUES ('2026-11-24','a',1),('2026-11-25','b',1),('2026-11-25','a',2),('2026-11-26','a',3),('2026-11-27','a',4),('2026-11-25','removed-example',5)");
  const warnings=[];const out=await store().readBatch(pool,'2026-11-25',new Date('2026-11-27T12:00:00Z'),new Set(['a','b']),n=>warnings.push(n));
  assert.equal(out.up_to,'2026-11-26');assert.deepEqual(out.rows.map(r=>[r.date,r.public_item_key]),[['2026-11-25','a'],['2026-11-25','b'],['2026-11-26','a']]);assert.deepEqual(warnings,[1]);
  for(const since of ['2026-11-27','2026-11-28']) assert.deepEqual(await store().readBatch(pool,since,new Date('2026-11-27T12:00:00Z'),new Set(['a'])),{contract_version:'product_metrics_daily.v2',up_to:'2026-11-26',rows:[]});
  assert.deepEqual(load('lib/site-metrics/core.ts').validateBatch(out,{now:new Date('2026-11-27T12:00:00Z'),depuis:'2026-11-25',keys:new Set(['a','b'])}),[]);
});
test('5000 rows; whole days only; one grouped bounded query; byte budget; impossible single day fails closed',async()=>{
  await clear();
  await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) SELECT '2026-11-24'::date,'k'||lpad(i::text,5,'0'),1 FROM generate_series(1,3000) i");
  await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) SELECT '2026-11-25'::date,'k'||lpad(i::text,5,'0'),1 FROM generate_series(1,2001) i");
  const keys=new Set(Array.from({length:3000},(_,i)=>'k'+String(i+1).padStart(5,'0')));let queries=0;
  const bounded={query:(sql,params)=>{queries++;assert.match(sql,/GROUP BY/);assert.match(sql,/day >=/);assert.match(sql,/LIMIT 5000/);return pool.query(sql,params);}};
  const first=await store().readBatch(bounded,'2026-11-24',new Date('2026-11-27T12:00:00Z'),keys);assert.equal(queries,1);assert.equal(first.rows.length,3000);assert.equal(first.up_to,'2026-11-24');
  await pool.query("DELETE FROM site_product_metrics_daily WHERE day='2026-11-25' AND public_item_key='k02001'");
  const exact=await store().readBatch(pool,'2026-11-24',new Date('2026-11-27T12:00:00Z'),keys);assert.equal(exact.rows.length,5000);assert.equal(exact.up_to,'2026-11-26');assert.ok(Buffer.byteLength(JSON.stringify(exact))<=1048576);
  await clear();const long='invented-'+ 'x'.repeat(600);const bigKeys=new Set(Array.from({length:2000},(_,i)=>long+i));
  await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) SELECT '2026-11-24'::date,$1||i::text,1 FROM generate_series(0,999) i",[long]);
  await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) SELECT '2026-11-25'::date,$1||i::text,1 FROM generate_series(1000,1999) i",[long]);
  const bytes=await store().readBatch(pool,'2026-11-24',new Date('2026-11-27T12:00:00Z'),bigKeys);assert.equal(bytes.rows.length,1000);assert.equal(bytes.up_to,'2026-11-24');assert.ok(Buffer.byteLength(JSON.stringify(bytes))<=1048576);
  await clear();await pool.query("INSERT INTO site_product_metrics_daily(day,public_item_key,views) SELECT '2026-11-25'::date,'k'||i::text,1 FROM generate_series(1,5001) i");
  await assert.rejects(()=>store().readBatch(pool,'2026-11-25',new Date('2026-11-27T12:00:00Z'),new Set(Array.from({length:5001},(_,i)=>'k'+(i+1)))),/DAY_CAPACITY/);
});
let quotesReady=false;
async function prepareQuotes() {
  await clear();if(!quotesReady){await activate(pool,'F_SELL_WINDOWS.activate');quotesReady=true;}
  await pool.query('DELETE FROM site_commerce_active');
  const commerce=load('lib/site-commerce/document.ts');const {canonicalBytes}=load('c0/ts/src/jsonc.ts');
  const d={contract_version:'site_commerce.v1',publication_id:'metrics-example',commerce_sequence:1,generated_at_utc:'2026-10-20T08:00:00Z',tax_rate:'20.00',delivery_rendez_vous:{label:'Exemple',amount_ht:'20.00'},payment:Object.fromEntries(['cheque','virement','mandat_administratif'].map(k=>[k,{label:'Exemple',instructions:'Exemple'}])),privacy_notice:{version:'m1',text:'Exemple'},cgv_version:'c1',acknowledgement:Object.fromEntries(['quote','order','message'].map(k=>[k,{subject:'Exemple',body:'{numero}'}])),sender:null};const doc={...d,payload_sha256:commerce.documentDigest(d)};
  await pool.query('INSERT INTO site_commerce_active(singleton,commerce_sequence,publication_id,payload_sha256,document_bytes,ack_bytes) VALUES(1,1,$1,$2,$3,$4)',[doc.publication_id,doc.payload_sha256,Buffer.from(canonicalBytes(doc)),Buffer.from('{}')]);
  return load('lib/site-requests/submit.ts').submitRequest;
}
test('server quote increments once per submitted product; replay, rejected input and rollback count nothing',async()=>{
  const submit=await prepareQuotes();
  const request={...JSON.parse(Buffer.from(businessCase('F_QUOTE_ORDER.quote_priced').bytes).toString()),idempotency_key:'metrics:quote:0001'};
  const body=enc({request,extras:{commerce_sequence:1,privacy_notice:'m1'}});
  const deps={pool,now:()=>NOW,metricsNow:()=>new Date(NOW),hooks:{beforeCommit:async client=>checkTimeouts(await timeoutSettings(client))}};
  assert.equal((await submit(deps,'quote_request',body)).status,200);
  const expected=[...new Set(request.lines.map(l=>l.public_item_key))].sort();
  const rows=()=>pool.query('SELECT public_item_key,quote_submit FROM site_product_metrics_daily ORDER BY public_item_key');
  assert.deepEqual((await rows()).rows,expected.map(public_item_key=>({public_item_key,quote_submit:1})));
  assert.equal((await submit(deps,'quote_request',body)).status,200);
  assert.equal((await submit(deps,'quote_request',enc({}))).status,400);
  const other=enc({request:{...request,idempotency_key:'metrics:quote:0002'},extras:{commerce_sequence:1,privacy_notice:'m1'}});
  assert.equal((await submit({...deps,hooks:{beforeCommit:async()=>{throw Error('synthetic rollback');}}},'quote_request',other)).status,503);
  assert.deepEqual((await rows()).rows,expected.map(public_item_key=>({public_item_key,quote_submit:1})));
});

function quoteBody(key, twoProducts=false) {
  const request={...JSON.parse(Buffer.from(businessCase('F_QUOTE_ORDER.quote_priced').bytes).toString()),idempotency_key:key};
  if(twoProducts) request.lines.push(...JSON.parse(Buffer.from(businessCase('F_QUOTE_ORDER.quote_unpriced_no_window').bytes).toString()).lines);
  return enc({request,extras:{commerce_sequence:1,privacy_notice:'m1'}});
}
async function assertSaved(response, before) {
  assert.equal(response.status,200);
  const body=JSON.parse(Buffer.from(response.body).toString());
  assert.equal(body.accepted,true);
  assert.equal(body.durable,true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM site_quote_request')).rows[0].n,before+1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM site_outbox_event WHERE object_ref=$1',[body.receipt_ref])).rows[0].n,1);
}
const quoteCount=async()=> (await pool.query('SELECT count(*)::int AS n FROM site_quote_request')).rows[0].n;
const metricCount=async()=> (await pool.query('SELECT count(*)::int AS n FROM site_product_metrics_daily')).rows[0].n;
function checkTimeouts(settings) {assert.deepEqual(settings,{lock:'5s',statement:'15s'});}
async function timeoutSettings(client) {return (await client.query("SELECT current_setting('lock_timeout') AS lock,current_setting('statement_timeout') AS statement")).rows[0];}

test('regression: missing metrics table never rolls back a received quote; only SQLSTATE is logged',async()=>{
  const submit=await prepareQuotes();const before=await quoteCount();const warnings=[];const warn=console.warn;console.warn=message=>warnings.push(message);
  let response,settings;
  await pool.query('ALTER TABLE site_product_metrics_daily RENAME TO metrics_unavailable');
  try {response=await submit({pool,now:()=>NOW,hooks:{beforeCommit:async client=>{settings=await timeoutSettings(client);}}},'quote_request',quoteBody('metrics:missing:0001'));}
  finally {console.warn=warn;await pool.query('ALTER TABLE metrics_unavailable RENAME TO site_product_metrics_daily');}
  await assertSaved(response,before);assert.equal(await metricCount(),0);checkTimeouts(settings);
  assert.deepEqual(warnings,['[site-metrics] quote_submit code=42P01']);
});

test('regression: metrics lock is abandoned quickly and quote commits with original timeouts',async()=>{
  const submit=await prepareQuotes();const before=await quoteCount();const blocker=await pool.connect();let response,settings,elapsed;
  try {
    await blocker.query('BEGIN');await blocker.query('LOCK TABLE site_product_metrics_daily IN ACCESS EXCLUSIVE MODE');
    const started=performance.now();
    response=await submit({pool,now:()=>NOW,hooks:{beforeCommit:async client=>{settings=await timeoutSettings(client);}}},'quote_request',quoteBody('metrics:locked:0001'));
    elapsed=performance.now()-started;
  } finally {await blocker.query('ROLLBACK');blocker.release();}
  await assertSaved(response,before);assert.ok(elapsed<1500,`quote delayed ${elapsed}ms`);assert.equal(await metricCount(),0);checkTimeouts(settings);
});

test('regression: slow metrics statement is bounded and every partial increment is rolled back',async()=>{
  const submit=await prepareQuotes();const before=await quoteCount();let response,settings,elapsed;
  await pool.query("CREATE FUNCTION metrics_slow() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.public_item_key = 'PI-000000CJS' THEN PERFORM pg_sleep(2); END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER metrics_slow BEFORE INSERT ON site_product_metrics_daily FOR EACH ROW EXECUTE FUNCTION metrics_slow()');
  try {
    const started=performance.now();
    response=await submit({pool,now:()=>NOW,hooks:{beforeCommit:async client=>{settings=await timeoutSettings(client);}}},'quote_request',quoteBody('metrics:slow:0001',true));
    elapsed=performance.now()-started;
  } finally {await pool.query('DROP TRIGGER metrics_slow ON site_product_metrics_daily');await pool.query('DROP FUNCTION metrics_slow()');}
  await assertSaved(response,before);assert.ok(elapsed<1500,`quote delayed ${elapsed}ms`);assert.equal(await metricCount(),0);checkTimeouts(settings);
});

test('regression: two quote products share one clock reading across Paris midnight',async()=>{
  await clear();let reads=0;
  await store().countQuoteSubmit(pool,['a','a','b'],()=>new Date(reads++===0?'2026-11-26T22:59:59Z':'2026-11-26T23:00:00Z'));
  assert.deepEqual((await pool.query('SELECT day::text,public_item_key,quote_submit FROM site_product_metrics_daily ORDER BY public_item_key')).rows,[{day:'2026-11-26',public_item_key:'a',quote_submit:1},{day:'2026-11-26',public_item_key:'b',quote_submit:1}]);
  assert.equal(reads,1);
  const submit=await prepareQuotes();const before=await quoteCount();reads=0;
  const response=await submit({pool,now:()=>NOW,metricsNow:()=>new Date(reads++===0?'2026-11-26T22:59:59Z':'2026-11-26T23:00:00Z')},'quote_request',quoteBody('metrics:midnight:0001',true));
  await assertSaved(response,before);
  assert.deepEqual((await pool.query('SELECT day::text,quote_submit FROM site_product_metrics_daily ORDER BY public_item_key')).rows,[{day:'2026-11-26',quote_submit:1},{day:'2026-11-26',quote_submit:1}]);
  assert.equal(reads,1);
});

test('regression: Paris day is evaluated by SQL when the queued write executes',async()=>{
  await clear();const client=await pool.connect();
  try {
    // Virtual SQL clock: no dependency on the wall clock or on a real midnight.
    await client.query("CREATE FUNCTION public.statement_timestamp() RETURNS timestamptz LANGUAGE SQL AS $$ SELECT current_setting('test.metrics_now')::timestamptz $$");
    await client.query('SET search_path TO public,pg_catalog');
    await client.query("SELECT set_config('test.metrics_now','2026-11-26T22:59:59Z',false)");
    const queued={query:async(sql,params)=>{
      await client.query("SELECT set_config('test.metrics_now','2026-11-26T23:00:00Z',false)");
      return client.query(sql,params);
    }};
    await store().increment(queued,'at-write','views');
    assert.deepEqual((await client.query('SELECT day::text FROM site_product_metrics_daily')).rows,[{day:'2026-11-27'}]);
    await store().increment(client,'injected','views',()=>new Date('2026-03-29T22:00:00Z'));
    assert.deepEqual((await client.query("SELECT day::text FROM site_product_metrics_daily WHERE public_item_key='injected'")).rows,[{day:'2026-03-30'}]);
  } finally {try {await client.query('RESET search_path');await client.query('DROP FUNCTION public.statement_timestamp()');} finally {client.release();}}
});
