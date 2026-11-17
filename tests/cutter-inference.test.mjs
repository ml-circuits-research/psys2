import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CUTTER_CODEC,createCutterInference} from '../src/dialog/cutter-inference.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const codecJSON=JSON.stringify(Object.fromEntries(Object.keys(CUTTER_CODEC).sort().map(k=>[k,CUTTER_CODEC[k]])));
const codecSha=hash(codecJSON);
const clone=x=>structuredClone(x);
function profile(){
 const config={format:'sop.request-cutter-model/1',artifactRole:'fixture',executionEligible:false,
  graphConfidence:null,maxLength:192,trainerSha256:'a'.repeat(64),codecSha256:codecSha,
  codec:CUTTER_CODEC,encoderFiles:{'tokenizer.json':'b'.repeat(64)}};
 const cutterConfigJSON=JSON.stringify(config);
 return {format:'sop.key-reader-runtime/1',artifactRole:'fixture',dtype:'fp32',weightRepresentation:'q8-dynamic',
  executionEligible:false,graphConfidence:null,cutterConfigJSON,cutterConfigSha256:hash(cutterConfigJSON),
  cutterSha256:'c'.repeat(64),cutterCheckpointSha256:'d'.repeat(64),cutterTrainerSha256:config.trainerSha256,
  cutterCodecSha256:codecSha,tokenizerSha256:config.encoderFiles['tokenizer.json']};
}
const tensor=data=>({dims:[1,data.length],data:BigInt64Array.from(data,BigInt)});
function tokens(text){
 const chars=Array.from(text),offsets=[];
 for(let i=0;i<chars.length;i++)if(!/\s/u.test(chars[i]))offsets.push([i,i+1]);
 return {ids:[101,...offsets.map((_,i)=>10+i),102],offsets};
}
async function setup(options={}){
 const manifest=options.manifest??profile(),calls={tokenizer:[],model:[],authority:[],diagnostics:[]};
 const tokenizer=async([text],settings)=>{
  calls.tokenizer.push({text,settings});
  assert.equal(Object.hasOwn(settings,'text_pair'),false);
  const full=tokens(text).ids;
  const ids=settings.padding===false?full:full.slice(0,192),mask=ids.map(()=>1);
  if(settings.padding!==false){while(ids.length<192){ids.push(0);mask.push(0);}}
  if(options.mask)options.mask(mask);
  if(options.ids&&settings.padding!==false)options.ids(ids);
  return {input_ids:tensor(ids),attention_mask:tensor(mask)};
 };
 const offsetAuthority=async input=>{
  calls.authority.push(clone(input));assert.equal(Object.hasOwn(input,'contextJson'),false);
  if(options.nullAuthority)return null;
  const source=tokens(input.text).offsets,n=input.tokenIds.length;
  const authority={unit:'unicode-scalar',tokenIds:[...input.tokenIds],attentionMask:[...input.attentionMask],
   sequenceIds:[null,...source.map(()=>0),null],specialTokensMask:[1,...source.map(()=>0),1],
   offsets:[null,...source,null],provenance:{id:'synthetic-single-template-proof',version:1,
    profileSha256:'e'.repeat(64),tokenizerSha256:manifest.tokenizerSha256}};
  while(authority.offsets.length<n){authority.offsets.push(null);authority.sequenceIds.push(null);authority.specialTokensMask.push(1);}
  if(options.authority)options.authority(authority,input);
  return authority;
 };
 const model=async inputs=>{
  calls.model.push(inputs);
  const length=inputs.input_ids.dims[1],data=new Float32Array(length*3);
  for(let i=0;i<length;i++)data[i*3+2]=100; // ignored CLS/SEP/pad logits
  const active=Array.from(inputs.attention_mask.data,Number).filter(Boolean).length;
  for(let i=1;i<active-1;i++){
   const values=options.logits?.[i-1]??[4,0,0];data.set(values,i*3);
  }
  if(options.output) return options.output({dims:[1,length,3],data});
  return {bio_logits:{dims:[1,length,3],data}};
 };
 const component=await createCutterInference({manifest,tokenizer,model,offsetAuthority,
  recordDiagnostics:async result=>{calls.diagnostics.push(result);if(options.record)options.record(result);},
  ...(options.budget?{budget:options.budget}:{})});
 return {component,calls,manifest};
}

test('frozen codec canonical hash matches actual trained source contract',()=>{
 assert.equal(codecSha,'64fd854a5711acd8f675c7669e2426b12676b200fa3b1a9da6f67ad60e7f8213');
});

test('single-template tokenizer reaches injected cutter call; scalar cuts and full source logits retained',async()=>{
 const {component,calls}=await setup({logits:[[0,4,1],[0,1,4],[4,0,1]]});
 const result=await component.infer('😀x y');
 assert.equal(calls.tokenizer.length,2);assert.equal(calls.model.length,1);assert.equal(calls.authority.length,1);
 assert.deepEqual(calls.model[0].input_ids.dims,[1,192]);
 assert.deepEqual(result.packet.spans,[[0,2]]);
 assert.equal(result.auxiliary.sourceDecisions.length,3); // Includes negative O.
 assert.deepEqual(result.auxiliary.sourceDecisions[2].logits,[4,0,1]);
 assert.equal(result.packet.coverage.complete,false); // Explicitly synthetic artifact.
 assert.deepEqual(result.packet.unresolved,[{reason:'fixture-model-untrained'}]);
 assert.equal(result.graphConfidence,null);assert.equal(result.provenance.executionEligible,false);
});

test('closed cut envelope and diagnostics do not mutate internal provenance or delivered packet',async()=>{
 const {component,calls}=await setup({logits:[[0,4,1]],record:r=>{r.packet.spans=[];r.packet.model.sha256='f'.repeat(64);}});
 const identity=component.provenance().model;
 const packet=await component.cut('x');
 assert.deepEqual(Object.keys(packet).sort(),['coverage','model','source','spans','unresolved']);
 assert.deepEqual(packet.spans,[[0,1]]);assert.deepEqual(packet.model,identity);
 assert.equal(calls.diagnostics.length,1);
 const result=await component.infer('x');result.packet.model.sha256='0'.repeat(64);
 assert.deepEqual(component.provenance().model,identity);
});

test('deterministic ties and illegal I after O globally refuse, with no repair or partial cuts',async()=>{
 for(const logits of [[[0,3,3]],[[4,0,0],[0,0,4]],[[0,4,0],[4,0,0],[0,0,4]]]){
  const {component}=await setup({logits});
  const r=await component.infer('abc'.slice(0,logits.length));
  assert.deepEqual(r.packet.spans,[]);assert.equal(r.packet.coverage.complete,false);
  assert.match(r.packet.unresolved[0].reason,/unknown-BIO-label|illegal-I-after-O/);
 }
});

test('complete untruncated all-O and empty source produce empty spans; fixture is never promoted',async()=>{
 for(const text of ['', 'abc']){
  const {component}=await setup();const r=await component.infer(text);
  assert.deepEqual(r.packet.spans,[]);assert.equal(r.packet.coverage.truncated,false);
  assert.equal(r.packet.coverage.complete,false);assert.equal(r.packet.unresolved[0].reason,'fixture-model-untrained');
 }
});

test('truncation refuses before offset authority/model, without clipping or guessed end',async()=>{
 const {component,calls}=await setup();const r=await component.infer('x'.repeat(200));
 assert.equal(r.packet.coverage.truncated,true);assert.deepEqual(r.packet.spans,[]);
 assert.equal(r.packet.unresolved[0].reason,'source-truncated');
 assert.equal(calls.authority.length,0);assert.equal(calls.model.length,0);
});

test('authority must be single-template with exact IDs, mask and scalar source ranges',async()=>{
 const variants=[
  a=>a.tokenIds[1]++,
  a=>a.attentionMask[1]=0,
  a=>a.sequenceIds[1]=1,
  a=>a.offsets[1]=[0,2], // UTF16 end is invalid for one scalar emoji.
  a=>a.specialTokensMask[1]=1,
  a=>{a.sequenceIds[3]=0;a.offsets[3]=[0,1];}, // padding.
  a=>a.provenance.tokenizerSha256='f'.repeat(64),
 ];
 for(const authority of variants){
  const {component,calls}=await setup({authority});const r=await component.infer('😀');
  assert.deepEqual(r.packet.spans,[]);assert.equal(r.packet.coverage.complete,false);
  assert.equal(calls.model.length,0);
 }
 const {component}=await setup({nullAuthority:true});const r=await component.infer('x');
 assert.equal(r.packet.unresolved[0].reason,'exact-source-offsets-unavailable');
});

test('invalid Unicode, padding, tensor shape and nonfinite model output refuse',async()=>{
 const lone=await setup();assert.equal((await lone.component.infer('\ud800')).packet.unresolved[0].reason,'invalid-source-scalar');
 assert.equal(lone.calls.tokenizer.length,0);
 const padded=await setup({mask:mask=>{if(mask.length===192)mask[5]=1;}});
 assert.equal((await padded.component.infer('x')).packet.unresolved[0].reason,'non-right-padding');
 for(const output of [t=>({bio_logits:{...t,dims:[1,192,2]}}),t=>{t.data[3]=NaN;return {bio_logits:t};}]){
  const {component}=await setup({output});const r=await component.infer('x');
  assert.deepEqual(r.packet.spans,[]);assert.match(r.packet.unresolved[0].reason,/output-shape|nonfinite/);
 }
});

test('manifest/config/codec identities are exact, representation changes model identity',async()=>{
 const manifest=profile();manifest.cutterConfigSha256='f'.repeat(64);
 await assert.rejects(setup({manifest}),/config-hash/);
 const altered=profile(),config=JSON.parse(altered.cutterConfigJSON);config.codec.transitionPolicy='repair-I-to-B';
 altered.cutterConfigJSON=JSON.stringify(config);altered.cutterConfigSha256=hash(altered.cutterConfigJSON);
 await assert.rejects(setup({manifest:altered}),/frozen-cutter/);
 const a=await setup(),other=profile();other.weightRepresentation='fp32';const b=await setup({manifest:other});
 assert.notEqual(a.component.provenance().model.sha256,b.component.provenance().model.sha256);
});

test('finite work budget refuses before computation and never admits fixture effects',async()=>{
 const {component,calls}=await setup({budget:1});const r=await component.infer('abc');
 assert.deepEqual(r.packet.spans,[]);assert.equal(r.packet.unresolved[0].reason,'cutter-runtime-budget');
 assert.equal(calls.model.length,0);assert.equal(r.provenance.calibration,null);
});

test('strict span decoding matches the frozen pure Python codec on Unicode BIO cases',async()=>{
 const cases=[
  {text:'abc',labels:[1,2,0]},
  {text:'😀x y',labels:[1,2,0]},
  {text:'abc',labels:[1,0,1]},
  {text:'ab',labels:[0,2]},
  {text:'x',labels:[-1]},
  {text:'',labels:[]}
 ];
 const source=fileURLToPath(new URL('../training/sop-bert/train-request-cutter.py',import.meta.url));
 const code="import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('frozen',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nout=[]\nfor case in json.loads(sys.argv[2]):\n offsets=[(i,i+1)for i,c in enumerate(case['text'])if not c.isspace()]\n out.append(m.decode_bio(case['labels'],offsets,[0]*len(offsets),[1]*len(offsets),len(case['text']))[0])\nprint(json.dumps(out))";
 const expected=JSON.parse(execFileSync('python3',['-c',code,source,JSON.stringify(cases)],{encoding:'utf8'}));
 for(let i=0;i<cases.length;i++){
  const item=cases[i],logits=item.labels.map(label=>label<0?[0,3,3]:[0,1,2].map(n=>n===label?4:0));
  const {component}=await setup({logits});const result=await component.infer(item.text);
  assert.deepEqual(result.packet.spans,expected[i]);
 }
});

test('untruncated full and padded actual IDs must agree before authority or model use',async()=>{
 const {component,calls}=await setup({ids:ids=>ids[1]++});const r=await component.infer('x');
 assert.equal(r.packet.unresolved[0].reason,'full-vs-padded-token-mismatch');
 assert.equal(calls.authority.length,0);assert.equal(calls.model.length,0);
});


test('opt-in dynamic cutter uses actual length with exact legacy Unicode spans',async()=>{
 const manifest=profile(),config=JSON.parse(manifest.cutterConfigJSON);config.inputPadding='dynamic';config.maxLength=384;
 manifest.cutterConfigJSON=JSON.stringify(config);manifest.cutterConfigSha256=hash(manifest.cutterConfigJSON);
 for(const text of ['', '😀x', 'abc de']){
  const options={logits:[[0,4,1],[0,1,4],[4,0,1]]};
  const legacy=await setup(options),dynamic=await setup({...options,manifest});
  const expected=await legacy.component.infer(text),actual=await dynamic.component.infer(text);
  assert.deepEqual(dynamic.calls.model[0].input_ids.dims,[1,tokens(text).ids.length]);
  assert.equal(dynamic.calls.tokenizer[1].settings.padding,false);
  assert.equal(dynamic.calls.tokenizer[1].settings.max_length,384);
  assert.deepEqual(actual.packet.spans,expected.packet.spans);assert.deepEqual(actual.packet.coverage,expected.packet.coverage);
  assert.deepEqual(actual.auxiliary.sourceDecisions,expected.auxiliary.sourceDecisions);
 }
 const overflow=await setup({manifest}),result=await overflow.component.infer('x'.repeat(400));
 assert.equal(overflow.calls.model.length,0);assert.equal(result.packet.coverage.complete,false);
 const bad=JSON.parse(manifest.cutterConfigJSON);bad.inputPadding='typo';manifest.cutterConfigJSON=JSON.stringify(bad);manifest.cutterConfigSha256=hash(manifest.cutterConfigJSON);
 await assert.rejects(setup({manifest}),/input-layout/);
});
