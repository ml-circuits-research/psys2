import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CUTTER_CODEC} from '../src/dialog/cutter-inference.mjs';
import {createVerifiedReaderProvider} from '../src/dialog/verified-reader-provider.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>new TextEncoder().encode(value);
const clone=value=>structuredClone(value);
const base=fileURLToPath(new URL('../training/sop-bert/',import.meta.url));
const candidate=JSON.parse(execFileSync('python3',['-c',[
 'import importlib.util,json,sys',
 'from pathlib import Path',
 'base=Path(sys.argv[1])',
 'def load(name,file):',
 " s=importlib.util.spec_from_file_location(name,base/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m",
 "p=load('p','prepare-key-reader.py');t=load('t','train-key-reader.py')",
 "inv=json.loads((base/'tests/fixtures/target-type-inventory.json').read_text())",
 "c=t.configuration({'format':p.CANDIDATE_FORMAT,'registry':p.registry(inv),'inventorySha256':'a'*64,'exclusionSha256':'b'*64,'targetFamilies':p.target_families(inv)})",
 "print(json.dumps({'config':c,'routes':{'globals':p.GLOBAL,'metadata':p.META}}))"
].join('\n'),base],{encoding:'utf8'}));
function tokenizerProfile(){
 const names=['[PAD]','[UNK]','[CLS]','[SEP]','[MASK]','x','area','drawing','context','null','existing','{','}',':','"',',','[',']'];
 const vocab=Object.fromEntries(names.map((word,i)=>[word,i]));
 const special=id=>({SpecialToken:{id,type_id:0}}),sequence=(id,type_id)=>({Sequence:{id,type_id}});
 return {normalizer:{type:'BertNormalizer',clean_text:true,handle_chinese_chars:true,lowercase:true,strip_accents:null},
  pre_tokenizer:{type:'BertPreTokenizer'},model:{type:'WordPiece',unk_token:'[UNK]',continuing_subword_prefix:'##',max_input_chars_per_word:100,vocab},
  post_processor:{type:'TemplateProcessing',single:[special('[CLS]'),sequence('A',0),special('[SEP]')],
   pair:[special('[CLS]'),sequence('A',0),special('[SEP]'),sequence('B',1),{SpecialToken:{id:'[SEP]',type_id:1}}],
   special_tokens:Object.fromEntries(['[CLS]','[SEP]'].map(name=>[name,{id:name,ids:[vocab[name]],tokens:[name]}]))},
  added_tokens:names.slice(0,5).map((content,id)=>({id,content,special:true,normalized:false,single_word:false,lstrip:false,rstrip:false})),
  truncation:null,padding:null};
}
class BertNormalizer{constructor(config){this.config=config;}normalize(value){return value.toLowerCase();}}
class BertPreTokenizer{pre_tokenize_text(value){return value.match(/[\p{L}\p{N}]+|[^\s]/gu)??[];}}
class WordPieceTokenizer{constructor(config){this.config=config;}encode([word]){return [Object.hasOwn(this.config.vocab,word)?word:'[UNK]'];}}
class TemplateProcessing{constructor(config){this.config=config;}}
function fakeTokenizer(profile){
 const tokenizer=async(texts,options={})=>{
  const encode=text=>tokenizer.pre_tokenizer.pre_tokenize_text(tokenizer.normalizer.normalize(text)).flatMap(word=>tokenizer.model.encode([word]).map(piece=>profile.model.vocab[piece]));
  const ids=[profile.model.vocab['[CLS]'],...encode(texts[0]),profile.model.vocab['[SEP]']];
  if(options.text_pair)ids.push(...encode(options.text_pair[0]),profile.model.vocab['[SEP]']);
  if(options.truncation&&ids.length>options.max_length)ids.length=options.max_length;
  const mask=ids.map(()=>1);
  if(options.padding==='max_length')while(ids.length<options.max_length){ids.push(0);mask.push(0);}
  if(options.return_tensor===false)return {input_ids:[ids],attention_mask:[mask]};
  const tensor=data=>({type:'int64',dims:[1,data.length],data:BigInt64Array.from(data,BigInt)});
  return {input_ids:tensor(ids),attention_mask:tensor(mask)};
 };
 tokenizer.normalizer=new BertNormalizer(profile.normalizer);tokenizer.pre_tokenizer=new BertPreTokenizer();
 tokenizer.model=new WordPieceTokenizer(profile.model);tokenizer.post_processor=new TemplateProcessing(profile.post_processor);
 tokenizer.added_tokens=clone(profile.added_tokens);tokenizer.padding_side='right';
 return tokenizer;
}
function fixture(options={}){
 const profile=tokenizerProfile(),tokenizerJSON=JSON.stringify(profile),tokenizerSha256=hash(tokenizerJSON);
 const config=clone(candidate.config);config.encoderFiles={'tokenizer.json':tokenizerSha256};
 config.trainerSha256='a'.repeat(64);config.preparerSha256='b'.repeat(64);
 const codecSha=hash(JSON.stringify(Object.fromEntries(Object.keys(CUTTER_CODEC).sort().map(k=>[k,CUTTER_CODEC[k]]))));
 const cutter={format:'sop.request-cutter-model/1',artifactRole:'trained',maxLength:192,executionEligible:false,
  graphConfidence:null,codec:CUTTER_CODEC,codecSha256:codecSha,trainerSha256:'c'.repeat(64),encoderFiles:{'tokenizer.json':tokenizerSha256}};
 const configJSON=JSON.stringify(config),cutterConfigJSON=JSON.stringify(cutter);
 const rawGraphs={cutter:bytes('synthetic-cutter'),encoder:bytes('synthetic-encoder'),heads:bytes('synthetic-heads')};
 const artifacts={'tokenizer.json':bytes(tokenizerJSON),'bindings.json':bytes(JSON.stringify({format:'sop.structural-bindings/1',kinds:[],properties:[],units:[]}))};
 const files={};for(const [kind,body]of Object.entries(rawGraphs)){artifacts[kind+'.onnx']=body;files[kind]={path:kind+'.onnx',sha256:hash(body),bytes:body.length};}
 // Metadata exercises the trained protocol path with synthetic callbacks only.
 // These tests are not evidence of an actual trained artifact or admission.
 const manifest={format:'sop.key-reader-runtime/1',artifactRole:options.fixtureRole?'fixture':'trained-unverified',
  dtype:'fp32',weightRepresentation:'q8-dynamic',executionEligible:false,graphConfidence:null,
  configJSON,configSha256:hash(configJSON),cutterConfigJSON,cutterConfigSha256:hash(cutterConfigJSON),
  cutterSha256:files.cutter.sha256,encoderSha256:files.encoder.sha256,headsSha256:files.heads.sha256,
  cutterCheckpointSha256:'d'.repeat(64),checkpointSha256:'e'.repeat(64),cutterTrainerSha256:cutter.trainerSha256,
  trainerSha256:config.trainerSha256,preparerSha256:config.preparerSha256,cutterCodecSha256:codecSha,
  codecSha256:'f'.repeat(64),tokenizerSha256,hiddenWidth:2,rawRoutes:candidate.routes,files};
 if(options.manifest)options.manifest(manifest);
 const manifestJSON=JSON.stringify(manifest),events=[],calls=[],released=[],diagnostics=[];
 const width=Object.values(config.banks).reduce((n,bank)=>n+bank.length,0);
 const backend={
  makeTensor:(type,data,dims)=>({type,data,dims}),
  async createSession(body,{kind,path,sha256}){
   events.push('session:'+kind);assert.equal(hash(body),sha256);assert.deepEqual(body,artifacts[path]);
   const signatures={cutter:{inputNames:['input_ids','attention_mask'],outputNames:['bio_logits']},
    encoder:{inputNames:['input_ids','attention_mask'],outputNames:['hidden','bio_logits','presence_logits']},
    heads:{inputNames:['hidden','spans','key_indices'],outputNames:['class_logits']}};
   const session={...signatures[kind],async release(){released.push(kind);},async run(feeds){
    calls.push(kind);
    if(kind==='heads'){
     const count=feeds.spans.dims[0],data=new Float32Array(count*width);
     for(let q=0;q<count;q++){let start=0;for(const key of config.keys)if(config.banks[key]){data[q*width+start]=3;start+=config.banks[key].length;}}
     return {class_logits:{dims:[count,width],data}};
    }
    const length=feeds.input_ids.dims[1];
    if(kind==='cutter'){
     const data=new Float32Array(length*3);for(let i=0;i<length;i++)data[i*3]=3;
     data[3]=0;data[4]=3;return {bio_logits:{dims:[1,length,3],data}};
    }
    const data=new Float32Array(config.bioKeys.length*length*3);
    for(let i=0;i<data.length;i+=3)data[i]=3;
    return {hidden:{dims:[1,length,2],data:new Float32Array(length*2)},
     bio_logits:{dims:[1,config.bioKeys.length,length,3],data},
     presence_logits:{dims:[1,config.keys.length],data:new Float32Array(config.keys.length).fill(-1)}};
   }};
   if(options.invalidSession===kind)session.outputNames=['wrong'];
   return session;
  }
 };
 const runtimeIdentity={backend:'synthetic-unit-backend',implementationSha256:'1'.repeat(64),tokenizerImplementationSha256:'2'.repeat(64)};
 const input={
  manifestJSON,manifestSha256:hash(manifestJSON),
  tokenizerArtifact:{path:'tokenizer.json',sha256:tokenizerSha256,bytes:artifacts['tokenizer.json'].length},
  bindingsArtifact:{path:'bindings.json',sha256:hash(artifacts['bindings.json']),bytes:artifacts['bindings.json'].length},
  readArtifact:async path=>{events.push('read:'+path);const body=artifacts[path];return options.read?options.read(path,body):body;},
  backend,createTokenizer:async args=>{events.push('tokenizer');assert.equal(args.tokenizerJSON,tokenizerJSON);return fakeTokenizer(JSON.parse(args.tokenizerJSON));},
  getContext:async()=>{events.push('context');return {area:'drawing',context:{existing:[]}};},
  recordDiagnostics:async event=>{diagnostics.push(event);if(options.diagnostics)options.diagnostics(event);},
  runtimeIdentity,verifyHostRuntime:async actual=>{
   events.push('attest');assert.equal(actual.backend,backend);assert.equal(actual.getContext,input.getContext);
   if(options.mutateBackend)backend.createSession=()=>{throw Error('unverified-replacement');};
   return {verified:options.attested!==false,identity:clone(runtimeIdentity),authority:'trusted synthetic test host; not real ORT'};
  }
 };
 return {input,events,calls,released,diagnostics,artifacts,manifest};
}
test('verifies all bytes before constructing actual injected sessions; assembly runs all graph stages',async()=>{
 const f=fixture(),built=await createVerifiedReaderProvider(f.input);
 assert.equal(f.events.filter(x=>x.startsWith('read:')).length,5);
 const firstConstruction=f.events.findIndex(x=>x==='tokenizer'||x.startsWith('session:'));
 assert.ok(f.events.slice(0,firstConstruction).filter(x=>x.startsWith('read:')).length===5);
 assert.equal(f.calls.length,0);assert.equal(f.events.includes('context'),false);
 const result=await built.provider.propose('x');
 assert.deepEqual(f.calls,['cutter','encoder','heads']);
 assert.equal(result.coverage.executable,false);assert.equal(result.graphConfidence,null);
 assert.equal(built.verified.calibration,null);assert.equal(built.verified.executionEligible,false);
 assert.equal(f.diagnostics.length,2);assert.equal(built.verified.files.cutter.sha256,f.manifest.cutterSha256);
 assert.match(built.verified.implementationTrust,/external host attestation/);
});
test('wrong manifest/config/tokenizer/binding/graph bytes never create sessions or tokenizer',async()=>{
 for(const failure of ['manifest','config','tokenizer.json','bindings.json','encoder.onnx']){
  const f=fixture({...(failure==='config'?{manifest:m=>m.configSha256='0'.repeat(64)}:{}),
   ...(!['manifest','config'].includes(failure)?{read:(path,body)=>path===failure?bytes('corrupt'):body}:{})});
  if(failure==='manifest')f.input.manifestSha256='0'.repeat(64);
  await assert.rejects(createVerifiedReaderProvider(f.input));
  assert.equal(f.events.some(e=>e==='tokenizer'||e.startsWith('session:')),false,failure);
 }
});
test('host attestation is required and never replaced by a caller supplied implementation hash',async()=>{
 const f=fixture({attested:false});
 await assert.rejects(createVerifiedReaderProvider(f.input),/host-runtime-not-attested/);
 assert.equal(f.events.some(e=>e==='tokenizer'||e.startsWith('session:')),false);
});
test('invalid second session interface releases both new and prior sessions',async()=>{
 const f=fixture({invalidSession:'encoder'});
 await assert.rejects(createVerifiedReaderProvider(f.input),/invalid-session-interface:encoder/);
 assert.deepEqual(f.released,['cutter','encoder']);
});
test('artifact bounds reject oversized callback bytes before construction and declared overcommit before read',async()=>{
 const f=fixture({read:(path,body)=>path==='encoder.onnx'?new Uint8Array(body.length+1):body});
 await assert.rejects(createVerifiedReaderProvider(f.input),/artifact-byte-budget/);
 assert.equal(f.events.some(e=>e==='tokenizer'||e.startsWith('session:')),false);
 const g=fixture();g.input.maxTotalBytes=100;
 await assert.rejects(createVerifiedReaderProvider(g.input),/declared-artifact-byte-budget/);
 assert.equal(g.events.length,0);
});
test('wrong external tokenizer descriptor, unsafe paths and duplicate paths refuse',async()=>{
 const f=fixture();f.input.tokenizerArtifact.sha256='0'.repeat(64);
 await assert.rejects(createVerifiedReaderProvider(f.input),/artifact-descriptor/);
 const g=fixture();g.input.bindingsArtifact.path='../bindings.json';
 await assert.rejects(createVerifiedReaderProvider(g.input),/artifact-path/);
 const h=fixture();h.input.bindingsArtifact.path=h.input.tokenizerArtifact.path;
 await assert.rejects(createVerifiedReaderProvider(h.input),/duplicate-artifact-path/);
});
test('fixture artifacts retain unavailable effects and diagnostic mutation cannot alter delivered computation',async()=>{
 const f=fixture({fixtureRole:true,diagnostics:event=>{event.result.packet??={};event.result.packet.coverage={complete:true};}});
 const built=await createVerifiedReaderProvider(f.input),result=await built.provider.propose('x');
 assert.deepEqual(f.calls,['cutter']);assert.equal(result.coverage.complete,false);
 assert.deepEqual(result.candidates,[]);assert.equal(result.coverage.executable,false);
 const original=built.provenance();built.verified.files.cutter.sha256='0'.repeat(64);
 assert.deepEqual(built.provenance(),original);
});

test('implementation callbacks changing during host attestation are refused before construction',async()=>{
 const f=fixture({mutateBackend:true});
 await assert.rejects(createVerifiedReaderProvider(f.input),/host-runtime-mutated/);
 assert.equal(f.events.some(e=>e==='tokenizer'||e.startsWith('session:')),false);
});
