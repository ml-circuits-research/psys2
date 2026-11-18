// Browser host only. Deployment identity is trusted by the application, not inferred from model bytes.
import {createVerifiedReaderProvider} from './verified-reader-provider.mjs?v=b37a809e20';
export function bertRuntimeConfiguration(profile,config){
 const roles={pad_token:'[PAD]',unk_token:'[UNK]',cls_token:'[CLS]',sep_token:'[SEP]',mask_token:'[MASK]'};
 const ids=new Set();
 for(const [key,value]of Object.entries(roles)){
  if(config[key]!==undefined&&config[key]!==value)throw Error('conflicting-bert-special-role');
  const matches=profile.added_tokens?.filter(t=>t.content===value&&t.special===true);
  if(matches?.length!==1||ids.has(matches[0].id)||profile.model?.vocab?.[value]!==matches[0].id)throw Error('missing-declared-bert-special-role');ids.add(matches[0].id);
  if(key==='unk_token'&&profile.model.unk_token!==value)throw Error('conflicting-bert-unknown-role');
  if(key==='cls_token'||key==='sep_token'){const declared=profile.post_processor?.special_tokens?.[value];if(JSON.stringify(declared?.ids)!==JSON.stringify([matches[0].id])||JSON.stringify(declared?.tokens)!==JSON.stringify([value]))throw Error('conflicting-bert-processor-role');}
 }
 return {...config,...roles};
}

const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const relativePath=x=>typeof x==='string'&&x.length>0&&!x.includes('\\')&&!x.startsWith('/')&&!/^[a-z][a-z0-9+.-]*:/i.test(x)&&!x.split('/').some(p=>!p||p==='.'||p==='..');
export const READER_ARTIFACT_CACHE='psys2-reader-artifacts-v1';
const cacheKey=(url,digest)=>new URL('/.psys2-reader-artifacts/sha256/'+digest,url).href;
async function responseBytes(response,maxBytes){
 if(!response.ok)throw Error('reader-fetch-failed:'+response.status);
 const declared=Number(response.headers.get('content-length'));
 if(declared>maxBytes)throw Error('reader-fetch-byte-budget');
 if(!response.body?.getReader)throw Error('reader-stream-unavailable');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('reader-fetch-byte-budget');parts.push(value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return bytes;
}
/** Cache keys describe authenticated content, never a mutable deployment URL. */
export async function fetchBrowserReaderBytes(url,{maxBytes=268435456,sha256:expectedHash,bytes:expectedBytes,cacheStorage=globalThis.caches,onCacheEvent=()=>{}}={}){
 if(expectedHash!==undefined&&!hash(expectedHash))throw Error('reader-artifact-hash-descriptor');
 const report=(type,extra={})=>{try{onCacheEvent({type,...extra});}catch{/* Diagnostics cannot affect artifact loading. */}};
 const verify=async bytes=>{if(expectedBytes!==undefined&&bytes.byteLength!==expectedBytes)throw Error('reader-artifact-size-mismatch');if(expectedHash&&await sha(bytes)!==expectedHash)throw Error('reader-artifact-hash-mismatch');return bytes;};
 const started=performance.now();let cache=null,repair=false;const key=expectedHash?cacheKey(url,expectedHash):null;
 if(key&&cacheStorage){
  try{cache=await cacheStorage.open(READER_ARTIFACT_CACHE);const response=await cache.match(key);if(response){try{const bytes=await verify(await responseBytes(response,maxBytes));report('hit',{bytes:bytes.byteLength,elapsedMs:performance.now()-started});return bytes;}catch{repair=true;report('corrupt');try{await cache.delete(key);}catch{/* Refetch even when eviction fails. */}}}}
  catch{report('unavailable');}
 }
 report('network');const networkStarted=performance.now();
 const bytes=await verify(await responseBytes(await fetch(url,{credentials:'same-origin',cache:repair?'reload':'force-cache'}),maxBytes));
 report('download',{bytes:bytes.byteLength,elapsedMs:performance.now()-networkStarted});
 if(cache&&key)try{await cache.put(key,new Response(bytes,{headers:{'content-type':'application/octet-stream','content-length':String(bytes.byteLength)}}));report('stored');}catch{report('unavailable');}
 return bytes;
}
async function pruneReaderCache(cacheStorage,url,hashes,report){
 if(!cacheStorage)return;
 try{const cache=await cacheStorage.open(READER_ARTIFACT_CACHE),active=new Set(hashes.map(digest=>cacheKey(url,digest))),origin=new URL(url).origin;
  for(const request of await cache.keys()){const key=new URL(request.url);if(key.origin===origin&&key.pathname.startsWith('/.psys2-reader-artifacts/sha256/')&&!active.has(key.href))await cache.delete(request);}
 }catch{report('unavailable');}
}
/** Runtime imports/identity are the host deployment trust boundary. All model,
 * tokenizer, bindings and config bytes are independently hash checked. */
export async function createBrowserReaderHost({manifestURL,manifestSha256,tokenizerArtifact,bindingsArtifact,tokenizerConfigArtifact,runtimeIdentity,getContext,recordDiagnostics,resolveURL,fetchBytes=fetchBrowserReaderBytes,importModule=url=>import(url),assemble=createVerifiedReaderProvider,cacheStorage=globalThis.caches}={}){
 if(typeof resolveURL!=='function'||typeof getContext!=='function'||typeof recordDiagnostics!=='function'||!hash(manifestSha256)||!runtimeIdentity||!tokenizerConfigArtifact||!relativePath(tokenizerConfigArtifact.path)||!hash(tokenizerConfigArtifact.sha256))throw Error('invalid-browser-reader-options');
 const manifestLocation=new URL(manifestURL,globalThis.location?.href),base=new URL('.',manifestLocation);
 const started=performance.now(),cacheStats={hits:0,cachedBytes:0,cacheReadMs:0,networkRequests:0,networkMs:0,downloadedBytes:0,corruptEntries:0,failures:0},activeHashes=new Set([manifestSha256,tokenizerConfigArtifact.sha256]);
 const report=event=>{if(event.type==='hit'){cacheStats.hits++;cacheStats.cachedBytes+=event.bytes;cacheStats.cacheReadMs+=event.elapsedMs;}if(event.type==='network')cacheStats.networkRequests++;if(event.type==='download'){cacheStats.downloadedBytes+=event.bytes;cacheStats.networkMs+=event.elapsedMs;}if(event.type==='corrupt')cacheStats.corruptEntries++;if(event.type==='unavailable')cacheStats.failures++;};
 const read=async(path,descriptor={})=>{if(!relativePath(path))throw Error('browser-artifact-path');if(descriptor.sha256)activeHashes.add(descriptor.sha256);return fetchBytes(new URL(path,base).href,{maxBytes:descriptor.bytes??268435456,...descriptor,cacheStorage,onCacheEvent:report});};
 const manifestBytes=await fetchBytes(manifestLocation.href,{maxBytes:4000000,sha256:manifestSha256,cacheStorage,onCacheEvent:report});
 if(await sha(manifestBytes)!==manifestSha256)throw Error('manifest-hash-mismatch');
 const configBytes=await read(tokenizerConfigArtifact.path,{...tokenizerConfigArtifact,maxBytes:4000000});
 if(tokenizerConfigArtifact.bytes!==undefined&&configBytes.byteLength!==tokenizerConfigArtifact.bytes||await sha(configBytes)!==tokenizerConfigArtifact.sha256)throw Error('tokenizer-config-hash');
 const config=JSON.parse(decode(configBytes));
 if(config.tokenizer_class!==undefined&&!['BertTokenizer','DistilBertTokenizer'].includes(config.tokenizer_class))throw Error('unsupported-tokenizer-class');
 const [ort,tokenizers]=await Promise.all([importModule(resolveURL('vendor/onnxruntime/ort.wasm.bundle.min.mjs')),importModule(resolveURL('vendor/sop-tokenizer/bert-tokenizer.mjs'))]);
 if(!ort.env?.wasm||typeof ort.InferenceSession?.create!=='function'||typeof ort.Tensor!=='function'||typeof tokenizers.BertTokenizer!=='function')throw Error('invalid-browser-runtime');
 ort.env.wasm.wasmPaths=resolveURL('vendor/onnxruntime/');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 const backend={createSession:bytes=>ort.InferenceSession.create(bytes,{executionProviders:['wasm'],intraOpNumThreads:1,interOpNumThreads:1}),makeTensor:(type,data,dims)=>new ort.Tensor(type,data,dims)};
 const assembled=await assemble({manifestJSON:decode(manifestBytes),manifestSha256,tokenizerArtifact,bindingsArtifact,readArtifact:read,backend,
  createTokenizer:async({tokenizerJSON})=>{const profile=JSON.parse(tokenizerJSON);return new tokenizers.BertTokenizer(profile,bertRuntimeConfiguration(profile,config));},getContext,recordDiagnostics,runtimeIdentity,
  verifyHostRuntime:async()=>({verified:true,identity:runtimeIdentity,authority:'psys2.browser-reader-host/1: application-trusted module deployment; not callback cryptographic proof'})});
 await pruneReaderCache(cacheStorage,manifestLocation.href,[...activeHashes],type=>report({type}));
 return {...assembled,browserHost:{format:'psys2.browser-reader-host/1',manifestURL:manifestLocation.href,manifestSha256,tokenizerConfigSha256:tokenizerConfigArtifact.sha256,executionProvider:'wasm',numThreads:1,proxy:false,calibration:null,cache:{name:READER_ARTIFACT_CACHE,key:'sha256',policy:'Verified bytes on every read; current successful deployment retained.',stats:{...cacheStats,hostLoadMs:performance.now()-started}}}};
}
