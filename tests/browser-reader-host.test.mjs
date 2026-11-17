import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
import {createBrowserReaderHost,bertRuntimeConfiguration,fetchBrowserReaderBytes} from '../src/dialog/browser-reader-host.mjs';
import {BertTokenizer} from '../docs/webchat/vendor/sop-tokenizer/bert-tokenizer.mjs';
const encode=x=>new TextEncoder().encode(x),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){const manifest=encode('{}'),config=encode('{}'),calls=[],wasm={};let args;
 const options={manifestURL:'https://example.test/app/models/pin/manifest.json',manifestSha256:sha(manifest),tokenizerConfigArtifact:{path:'tokenizer_config.json',sha256:sha(config),bytes:2},tokenizerArtifact:{path:'tokenizer.json'},bindingsArtifact:{path:'bindings.json'},runtimeIdentity:{backendSha256:'a'.repeat(64)},getContext:()=>({}),recordDiagnostics:()=>{},resolveURL:path=>'https://example.test/app/'+path,fetchBytes:async(url)=>{calls.push(url);return url.endsWith('manifest.json')?manifest:config;},importModule:async url=>url.includes('onnxruntime')?{env:{wasm},InferenceSession:{create:async()=>{}},Tensor:class{}}:{BertTokenizer},assemble:async input=>{args=input;return {provider:{propose(){}},verified:{}};}};return {options,calls,wasm,get args(){return args;}};}
test('browser host verifies config and manifest then assembles exact WASM/tokenizer host',async()=>{const f=fixture(),out=await createBrowserReaderHost(f.options);assert.equal(out.browserHost.numThreads,1);assert.equal(f.wasm.proxy,false);assert.equal(f.wasm.wasmPaths,'https://example.test/app/vendor/onnxruntime/');assert.deepEqual(f.calls,['https://example.test/app/models/pin/manifest.json','https://example.test/app/models/pin/tokenizer_config.json']);assert.equal((await f.args.verifyHostRuntime()).identity,f.options.runtimeIdentity);await f.args.readArtifact('encoder.q8.onnx');assert.ok(f.calls.at(-1).endsWith('/models/pin/encoder.q8.onnx'));await assert.rejects(f.args.readArtifact('../escape'),/artifact-path/);});
test('bad exact bytes refuse before runtime import/assembly',async()=>{for(const key of ['manifestSha256','tokenizerConfigArtifact']){const f=fixture();f.options.importModule=()=>{throw Error('must not import');};if(key==='manifestSha256')f.options[key]='0'.repeat(64);else f.options[key]={path:'tokenizer_config.json',sha256:'0'.repeat(64)};await assert.rejects(createBrowserReaderHost(f.options),/hash/);}});
test('stream byte bound cancels oversized response',async()=>{const old=globalThis.fetch;let canceled=false;globalThis.fetch=async()=>({ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(5)}),cancel:async()=>{canceled=true;}})}});try{await assert.rejects(fetchBrowserReaderBytes('https://example.test',{maxBytes:4}),/budget/);assert.equal(canceled,true);}finally{globalThis.fetch=old;}});
const dir=process.env.SOP_STRUCTURAL_MODEL_DIR,runtime=process.env.SOP_TRANSFORMERS_RUNTIME;
test('minimal browser bundle matches actual full tokenizer tensors and arrays',{skip:!dir||!runtime},async()=>{const full=await import(pathToFileURL(runtime)),profile=JSON.parse(readFileSync(dir+'/tokenizer.json')),cfg=bertRuntimeConfiguration(profile,JSON.parse(readFileSync(dir+'/tokenizer_config.json'))),a=new BertTokenizer(profile,cfg),b=new full.BertTokenizer(profile,cfg);for(const text of ['', 'set blue widget','same same café 🟦','no, earlier, 20 mins'])for(const pair of [false,true])for(const tensors of [false,true]){const opts={...(pair?{text_pair:['{"area": "drawing", "context": {}}']}:{}),padding:'max_length',truncation:true,max_length:192,return_tensor:tensors};const x=await a([text],opts),y=await b([text],opts);for(const k of Object.keys(x))assert.deepEqual(tensors?{data:Array.from(x[k].data),dims:x[k].dims}:x[k],tensors?{data:Array.from(y[k].data),dims:y[k].dims}:y[k]);}const {createBertSourceOffsetAuthority}=await import('../src/dialog/bert-source-offsets.mjs');const json=JSON.stringify(profile);await createBertSourceOffsetAuthority({tokenizer:a,tokenizerJSON:json,tokenizerSha256:sha(json)});await assert.rejects(BertTokenizer.from_pretrained('no-network'),/network-loading-disabled/);});
function memoryCache(){const entries=new Map(),cache={match:async key=>entries.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,response)=>entries.set(typeof key==='string'?key:key.url,response.clone()),delete:async key=>entries.delete(typeof key==='string'?key:key.url),keys:async()=>[...entries.keys()].map(url=>new Request(url))};return {entries,cache,open:async()=>cache};}
test('verified content cache reuses unchanged bytes across deployment paths and authenticates every cached read',async()=>{
 const old=globalThis.fetch,storage=memoryCache(),bytes=encode('real unchanged model bytes'),digest=sha(bytes),events=[];let downloads=0;
 globalThis.fetch=async()=>{downloads++;return new Response(bytes);};
 try{
  for(const url of ['https://example.test/app/old/encoder.onnx','https://example.test/app/new/encoder.onnx'])assert.deepEqual(await fetchBrowserReaderBytes(url,{sha256:digest,bytes:bytes.length,cacheStorage:storage,onCacheEvent:e=>events.push(e)}),bytes);
  assert.equal(downloads,1);assert.equal(events.filter(e=>e.type==='hit').length,1);
  const key=[...storage.entries.keys()][0];storage.entries.set(key,new Response(encode('corrupt')));
  assert.deepEqual(await fetchBrowserReaderBytes('https://example.test/app/new/encoder.onnx',{sha256:digest,cacheStorage:storage,onCacheEvent:e=>events.push(e)}),bytes);assert.equal(downloads,2);assert.ok(events.some(e=>e.type==='corrupt'));
  assert.deepEqual(await fetchBrowserReaderBytes('https://example.test/app/new/encoder.onnx',{sha256:digest,cacheStorage:storage}),bytes);assert.equal(downloads,2);
 }finally{globalThis.fetch=old;}
});
test('corrupt cached and downloaded bytes never enter the reader and a subsequent valid response repairs the cache',async()=>{
 const old=globalThis.fetch,storage=memoryCache(),bytes=encode('expected bytes'),digest=sha(bytes),url='https://example.test/encoder.onnx';let downloads=0;
 globalThis.fetch=async()=>{downloads++;return new Response(bytes);};
 try{
  await fetchBrowserReaderBytes(url,{sha256:digest,cacheStorage:storage});const key=[...storage.entries.keys()][0];storage.entries.set(key,new Response(encode('bad cache')));
  globalThis.fetch=async(_url,options)=>{assert.equal(options.cache,'reload');return new Response(encode('bad network'));};
  await assert.rejects(fetchBrowserReaderBytes(url,{sha256:digest,cacheStorage:storage}),/hash-mismatch/);assert.equal(storage.entries.size,0);
  globalThis.fetch=async()=>new Response(bytes);assert.deepEqual(await fetchBrowserReaderBytes(url,{sha256:digest,cacheStorage:storage}),bytes);assert.equal(storage.entries.size,1);
 }finally{globalThis.fetch=old;}
});
test('Cache API unavailability and write failures fall through to authenticated HTTP',async()=>{
 const old=globalThis.fetch,bytes=encode('valid'),digest=sha(bytes);let downloads=0;globalThis.fetch=async()=>{downloads++;return new Response(bytes);};
 try{for(const cacheStorage of [{open:async()=>{throw Error('private mode');}},{open:async()=>({match:async()=>{throw Error('cache read');}})},{open:async()=>({match:async()=>undefined,put:async()=>{throw Error('quota');}})}])assert.deepEqual(await fetchBrowserReaderBytes('https://example.test/model',{sha256:digest,cacheStorage}),bytes);assert.equal(downloads,3);}finally{globalThis.fetch=old;}
});
test('host prunes only stale content in its own cache after successful assembly and retains referenced weights',async()=>{
 const old=globalThis.fetch,f=fixture(),storage=memoryCache(),weight=encode('weight'),weightHash=sha(weight),stale='https://example.test/.psys2-reader-artifacts/sha256/'+'f'.repeat(64),unrelated='https://example.test/other-cache-entry';
 storage.entries.set(stale,new Response('old'));storage.entries.set(unrelated,new Response('unrelated'));let fail=true;
 f.options.fetchBytes=fetchBrowserReaderBytes;f.options.cacheStorage=storage;
 globalThis.fetch=async url=>new Response(url.endsWith('weights.onnx')?weight:encode('{}'));
 f.options.assemble=async input=>{assert.deepEqual(await input.readArtifact('weights.onnx',{sha256:weightHash,bytes:weight.length}),weight);if(fail)throw Error('assembly failed');return {provider:{},verified:{}};};
 try{
  await assert.rejects(createBrowserReaderHost(f.options),/assembly failed/);assert.ok(storage.entries.has(stale));
  fail=false;const out=await createBrowserReaderHost(f.options);assert.ok(!storage.entries.has(stale));assert.ok(storage.entries.has(unrelated));assert.ok([...storage.entries.keys()].some(key=>key.endsWith(weightHash)));assert.equal(out.browserHost.cache.stats.networkRequests,0);assert.equal(out.browserHost.cache.stats.hits,3);assert.ok(out.browserHost.cache.stats.cachedBytes>0);
 }finally{globalThis.fetch=old;}
});
