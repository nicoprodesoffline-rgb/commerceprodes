import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {loader,root,read} from './load.mjs';
test('client sends only key/event, keepalive, credentials omitted, no referrer, silent failure',async()=>{
  assert.ok(existsSync(path.join(root,'lib/site-metrics/browser.ts')),'browser metrics exists');
  const calls=[];const original=globalThis.fetch;
  try {globalThis.fetch=(...args)=>{calls.push(args);return Promise.reject(Error('offline'));};
    const {emitMetric}=loader()('lib/site-metrics/browser.ts');
    assert.equal(emitMetric('PI-EXAMPLE01','views'),undefined); await new Promise(r=>setImmediate(r));
    const [url,opts]=calls[0]; assert.equal(url,'/api/site/metrics/event');assert.deepEqual(JSON.parse(opts.body),{key:'PI-EXAMPLE01',event:'views'});assert.equal(opts.keepalive,true);assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');
    assert.doesNotMatch(read('lib/site-metrics/browser.ts'),/localStorage|sessionStorage|cookie|sendBeacon|userAgent/);
  } finally {globalThis.fetch=original;}
});
test('opening counts initial product only once despite rerenders/strict effects; quote deduplicates products',()=>{
  assert.ok(existsSync(path.join(root,'components/site/use-opening-metrics.ts')),'opening hook exists');
  const refs=[];let cursor=0;const effects=[],calls=[];
  const load=loader({react:{useRef:v=>refs[cursor++]??(refs[cursor-1]={current:v}),useEffect:fn=>effects.push(fn)},'@/lib/site-metrics/browser':{emitMetric:(...a)=>calls.push(a)}});
  const {useOpeningMetrics}=load('components/site/use-opening-metrics.ts');
  function render(event,keys,ready=true){cursor=0;effects.length=0;useOpeningMetrics(event,keys,ready);effects.forEach(fn=>{fn();fn();});}
  render('views',['a']); render('views',['b']); assert.deepEqual(calls,[['a','views']]);
  refs.length=0;calls.length=0;render('quote_start',[],false);render('quote_start',['a','a','b']);render('quote_start',['a','b','c']);assert.deepEqual(calls,[['a','quote_start'],['b','quote_start']]);
});
test('gestures wired at opening, central cart add, form readiness; submit only server after idempotence',()=>{
  assert.match(read('components/product/family-buy-box.tsx'),/useOpeningMetrics\("views", \[selectedKey\]\)/);
  assert.match(read('components/cart/cart-provider.tsx'),/emitMetric\(line.public_item_key, "add_to_cart"\)/);
  assert.match(read('components/checkout/checkout-flow.tsx'),/useOpeningMetrics\("quote_start"/);
  const submit=read('lib/site-requests/submit.ts');assert.match(submit,/countQuoteSubmit/); assert.ok(submit.indexOf('await countQuoteSubmit')>submit.indexOf('await insertQuote'));
});
