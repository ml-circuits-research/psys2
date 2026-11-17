// Browser host only. Deployment identity is trusted by the application, not inferred from model bytes.
import {createVerifiedReaderProvider} from './verified-reader-provider.mjs?v=ba0f8e9fc0';
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
export async function fetchBrowserReaderBytes(url,{maxBytes=268435456}={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'force-cache'});
 if(!response.ok)throw Error('reader-fetch-failed:'+response.status);
 const declared=Number(response.headers.get('content-length'));
 if(declared>maxBytes)throw Error('reader-fetch-byte-budget');
 if(!response.body?.getReader)throw Error('reader-stream-unavailable');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('reader-fetch-byte-budget');parts.push(value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return bytes;
}
/** Runtime imports/identity are the host deployment trust boundary. All model,
 * tokenizer, bindings and config bytes are independently hash checked. */
export async function createBrowserReaderHost({manifestURL,manifestSha256,tokenizerArtifact,bindingsArtifact,tokenizerConfigArtifact,runtimeIdentity,getContext,recordDiagnostics,resolveURL,fetchBytes=fetchBrowserReaderBytes,importModule=url=>import(url),assemble=createVerifiedReaderProvider}={}){
 if(typeof resolveURL!=='function'||typeof getContext!=='function'||typeof recordDiagnostics!=='function'||!hash(manifestSha256)||!runtimeIdentity||!tokenizerConfigArtifact||!relativePath(tokenizerConfigArtifact.path)||!hash(tokenizerConfigArtifact.sha256))throw Error('invalid-browser-reader-options');
 const manifestLocation=new URL(manifestURL,globalThis.location?.href),base=new URL('.',manifestLocation);
 const read=async(path,maxBytes=268435456)=>{if(!relativePath(path))throw Error('browser-artifact-path');return fetchBytes(new URL(path,base).href,{maxBytes});};
 const manifestBytes=await fetchBytes(manifestLocation.href,{maxBytes:4000000});
 if(await sha(manifestBytes)!==manifestSha256)throw Error('manifest-hash-mismatch');
 const configBytes=await read(tokenizerConfigArtifact.path,4000000);
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
 return {...assembled,browserHost:{format:'psys2.browser-reader-host/1',manifestURL:manifestLocation.href,manifestSha256,tokenizerConfigSha256:tokenizerConfigArtifact.sha256,executionProvider:'wasm',numThreads:1,proxy:false,calibration:null}};
}
