import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createKeyReaderInference,keyReaderContextJSON} from '../src/dialog/key-reader-inference.mjs';
const fixture=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
base=Path('training/sop-bert/candidates/target-type')
def load(name,file):
 s=importlib.util.spec_from_file_location(name,base/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('p','prepare-key-reader.py');t=load('t','train-key-reader.py');n=load('n','predict-key-reader.py')
inv=json.loads((base/'tests/fixtures/target-type-inventory.json').read_text())
c=t.configuration({'format':p.CANDIDATE_FORMAT,'registry':p.registry(inv),'inventorySha256':'a'*64,'exclusionSha256':'b'*64,'targetFamilies':p.target_families(inv)})
c.update(trainerSha256='a'*64,preparerSha256='b'*64,encoderFiles={'tokenizer.json':'c'*64})
L=192;text='😀x';seq=[None,0,0,None,1,None]+[None]*186;offsets=[[0,0],[0,1],[1,2],[0,0],[0,0],[0,0]]+[[0,0]]*186;mask=[1]*6+[0]*186
bio=[[[3,0,0]for _ in range(L)]for _ in c['bioKeys']];presence=[-1]*len(c['keys'])
domain=next(k for k in c['keys']if c['registry'][k]['role']=='domain'and c['registry'][k]['area']=='drawing'and k not in c['banks'])
for pos in [1,2]:bio[c['bioKeys'].index(domain)][pos]=[0,3,0]
presence[c['keys'].index(domain)]=1
G={k:[3]+[0]*(len(b)-1)for k,b in c['banks'].items()if c['registry'][k]['role']=='global'}
k='request.target.type';idx=next(i for i,e in enumerate(c['banks'][k])if e.get('value')=='drawn');G[k]=[3 if i==idx else 0 for i in range(len(c['banks'][k]))];presence[c['keys'].index(k)]=1
M={};queryrows=[]
for j,pos in enumerate([1,2]):
 row={k:[3]+[0]*(len(c['banks'][k])-1)for k in c['metadataKeys']}
 k='request.constraint.phase';idx=next(i for i,e in enumerate(c['banks'][k])if e.get('value')==['selector','result'][j]);row[k]=[3 if i==idx else 0 for i in range(len(c['banks'][k]))];presence[c['keys'].index(k)]=1
 M[(domain,pos,pos+1)]=row;queryrows.append(row)
model={'sha256':'d'*64,'tokenizerSha256':'c'*64,'codecSha256':'e'*64,'decoderVersion':2}
raw,_=n.normalize(c,text,'drawing',bio,presence,G,M,offsets,seq,mask,model,p.GLOBAL,p.META)
print(json.dumps({'config':c,'routes':{'globals':p.GLOBAL,'metadata':p.META},'bio':bio,'presence':presence,'global':G,'mentions':queryrows,'domain':domain,'expected':raw,'seq':seq,'offsets':offsets,'mask':mask}))
`],{encoding:'utf8',maxBuffer:4e6}));
const hash=x=>createHash('sha256').update(x).digest('hex');
const tensor=(data,dims)=>({data,dims});
async function setup(change={},data=fixture){
 const configJSON=JSON.stringify(data.config),manifest={format:'sop.key-reader-runtime/1',artifactRole:'trained-unverified',dtype:'fp32',weightRepresentation:'fp32',executionEligible:false,graphConfidence:null,configJSON,configSha256:hash(configJSON),checkpointSha256:'d'.repeat(64),encoderSha256:'e'.repeat(64),headsSha256:'f'.repeat(64),tokenizerSha256:'c'.repeat(64),preparerSha256:'b'.repeat(64),trainerSha256:'a'.repeat(64),codecSha256:'1'.repeat(64),hiddenWidth:2,rawRoutes:data.routes,...(data.dataManifestJSON?{dataManifestJSON:data.dataManifestJSON}:{})};
 const length=data.config.maxLength,ids=[101,10,11,102,12,102,...Array(length-6).fill(0)],calls={encoder:0,heads:0,diagnostics:[],pairs:[],settings:[],shapes:[]};
 const tokenizer=async(text,opts)=>{calls.pairs.push(opts.text_pair);calls.settings.push(opts);const full=opts.padding===false;return {input_ids:tensor(BigInt64Array.from((full?ids.slice(0,6):ids),BigInt),[1,full?6:length]),attention_mask:tensor(BigInt64Array.from(full?data.mask.slice(0,6):data.mask,BigInt),[1,full?6:length])};};
 const encoder=async input=>{calls.encoder++;const n=input.input_ids.dims[1];calls.shapes.push(n);return {hidden:tensor(new Float32Array(n*2),[1,n,2]),bio_logits:tensor(Float32Array.from(data.bio.flatMap(row=>row.slice(0,n)).flat()),[1,data.config.bioKeys.length,n,3]),presence_logits:tensor(Float32Array.from(data.presence),[1,data.config.keys.length])};};
 const heads=async input=>{calls.heads++;assert.deepEqual(Array.from(input.spans.data,Number),[0,1,1,2,2,3]);assert.deepEqual(Array.from(input.key_indices.data,Number),[-1,data.config.keys.indexOf(data.domain),data.config.keys.indexOf(data.domain)]);const rows=[data.global,...data.mentions],values=rows.flatMap(row=>data.config.keys.flatMap(k=>data.config.banks[k]?(row[k]??[3,...Array(data.config.banks[k].length-1).fill(0)]):[]));return {class_logits:tensor(Float32Array.from(values),[3,values.length/3])};};
 const offsetAuthority=async input=>({unit:'unicode-scalar',tokenIds:input.tokenIds,attentionMask:input.attentionMask,sequenceIds:data.seq.slice(0,input.tokenIds.length),specialTokensMask:input.tokenIds.map((_,i)=>data.seq[i]===null?1:0),offsets:data.offsets.slice(0,input.tokenIds.length).map((r,i)=>data.seq[i]===0?r:null),provenance:{id:'synthetic-authority',version:1,profileSha256:'2'.repeat(64),tokenizerSha256:'c'.repeat(64)}});
 const reader=await createKeyReaderInference({manifest,tokenizer,encoder,heads,offsetAuthority,makeTensor:(type,data,dims)=>({type,data,dims}),recordDiagnostics:r=>calls.diagnostics.push(r),...change});return {reader,calls,manifest};
}
test('actual two-stage computation matches Python normalizer for repeated-key per-mention metadata and scalar ranges',async()=>{
 const {reader,calls}=await setup(),result=await reader.infer('😀x',{area:'drawing',context:{existing:[]}}),expected=structuredClone(fixture.expected);expected.model=result.raw.model;
 assert.deepEqual(result.raw,expected);assert.equal(calls.encoder,1);assert.equal(calls.heads,1);assert.deepEqual(result.raw.request.constraints.map(c=>c.phase),['selector','result']);assert.equal(result.graphConfidence,null);assert.equal(result.provenance.executionEligible,false);assert.equal(result.diagnostics.support.length,135);
 assert.equal(calls.pairs[0][0],'{"area": "drawing", "context": {"existing": []}}');
});
test('a repeated reading of the same text and fitted context reuses the validated outputs; another context runs the graphs',async()=>{
 const {reader,calls}=await setup(),first=await reader.infer('😀x',{area:'drawing',context:{existing:[]}}),again=await reader.infer('😀x',{area:'drawing',context:{existing:[]}});
 assert.equal(calls.encoder,1);assert.equal(calls.heads,1);assert.deepEqual(again.raw,first.raw);assert.deepEqual(again.auxiliary.selectedLogits,first.auxiliary.selectedLogits);
 await reader.infer('😀x',{area:'drawing',context:{existing:[],previous:'add a box'}});assert.equal(calls.encoder,2);assert.equal(calls.heads,2);
});
test('read retains full diagnostics before handing the closed packet to the pipeline',async()=>{const {reader,calls}=await setup();const packet=await reader.read('😀x',{area:'drawing'});assert.equal(calls.diagnostics.length,1);assert.deepEqual(Object.keys(packet.coverage).sort(),['complete','truncated']);assert.equal(calls.diagnostics[0].diagnostics.support.length,135);});
test('missing offset authority refuses before encoder and never constructs source evidence',async()=>{const {reader,calls}=await setup({offsetAuthority:async()=>null});const result=await reader.infer('😀x',{area:'drawing'});assert.equal(calls.encoder,0);assert.equal(result.raw.coverage.complete,false);assert.equal(result.raw.ranges.length,0);assert.equal(result.raw.unresolved[0].reason,'exact-source-offsets-unavailable');});
test('malformed neural output and low work allowance produce incomplete packets',async()=>{for(const change of [{encoder:async()=>({hidden:tensor([NaN],[1,192,2])})},{budget:1}]){const {reader}=await setup(change),result=await reader.infer('😀x',{area:'drawing'});assert.equal(result.raw.coverage.complete,false);assert.ok(result.raw.unresolved.length);assert.equal(result.graphConfidence,null);}});
test('context serialization preserves Python separators and refuses unrepresentable numeric or scalar inputs',()=>{assert.equal(keyReaderContextJSON({z:[true,null,2],a:'😀'}),'{"a": "😀", "z": [true, null, 2]}');for(const n of [1.2,-0,NaN,Infinity])assert.throws(()=>keyReaderContextJSON(n));assert.throws(()=>keyReaderContextJSON('\ud800'));});
test('runtime identity requires actual pinned config and declared non-executable profile',async()=>{const {manifest}=await setup();await assert.rejects(setup({manifest:{...manifest,configSha256:'0'.repeat(64)}}),/hash/);await assert.rejects(setup({manifest:{...manifest,executionEligible:true}}),/profile/);await assert.rejects(setup({manifest:{...manifest,rawRoutes:{globals:{},metadata:{}}}}),/route/);});

test('truncated source/context refuses before any neural call',async()=>{const tokenizer=async(text,opts)=>{const n=opts.padding===false?193:192;return {input_ids:tensor(new BigInt64Array(n).fill(1n),[1,n]),attention_mask:tensor(new BigInt64Array(n).fill(1n),[1,n])};};const {reader,calls}=await setup({tokenizer}),r=await reader.infer('😀x',{area:'drawing'});assert.equal(r.raw.coverage.truncated,true);assert.equal(calls.encoder,0);assert.equal(calls.heads,0);assert.equal(r.raw.coverage.complete,false);});

test('unfamiliar fifth-domain source proof retains wrong classifier and confidence',async()=>{
 const data=structuredClone(fixture),old=data.domain,key='quasar.drawn.finish';data.domain=key;
 for(const field of ['keys','bioKeys'])data.config[field]=data.config[field].map(k=>k===old?key:k);
 data.config.registry[key]={...data.config.registry[old],area:'quasar',type:'drawn',key:'finish',values:['spurious','😀','x']};delete data.config.registry[old];
 data.config.targetFamilies.quasar=['drawn'];data.config.registry['request.target.type'].familiesByArea.quasar=['drawn'];
 data.config.banks[key]=[{state:'absent'},{state:'unknown'},...['spurious','😀','x'].map(value=>({state:'value',value}))];
 for(const row of data.mentions)row[key]=[0,0,9,0,0];
 const {reader}=await setup({},data),r=await reader.infer('😀x',{area:'quasar'});
 assert.deepEqual(r.raw.request.constraints.map(c=>c.value),['😀','x']);assert.equal(r.auxiliary.valueProofs.length,2);
 for(const p of r.auxiliary.valueProofs){assert.equal(p.classifier.value,'spurious');assert.ok(p.classifier.probability>.9);assert.equal(p.disagrees,true);}
 assert.deepEqual(r.diagnostics.valueProofs,r.auxiliary.valueProofs);assert.ok(r.packet);
});
test('typed numeric copy preserves the source span and emits an actual safe integer',async()=>{
 const data=structuredClone(fixture),key='request.target.count',i=data.config.bioKeys.indexOf(key);
 data.bio[i][1]=[0,3,0];data.bio[i][2]=[0,0,3];data.presence[data.config.keys.indexOf(key)]=1;
 const {reader}=await setup({},data),r=await reader.infer('23',{area:'drawing'});
 assert.equal(r.raw.request.target.count,23);assert.equal(r.raw.request.target.count_span,'23');
 assert.ok(!r.raw.unresolved.some(i=>i.reason==='unresolved-numeric-normalization'));
 assert.ok(r.auxiliary.valueProofs.some(p=>p.kind==='positive-safe-integer'&&p.value===23));
 assert.ok(!r.raw.ranges.some(p=>p.path.join('.')==='target.count'));
});

test('canonical and typed numeric proofs have identical Python/browser contracts',async()=>{
 const {canonicalLiteralProof,positiveIntegerLiteralProof}=await import('../src/dialog/key-reader-value-proof.mjs');
 const {readFileSync}=await import('node:fs');
 const samples=JSON.parse(readFileSync('training/sop-bert/tests/fixtures/value-proofs.json','utf8'));
 const python=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
p=Path('training/sop-bert/predict-key-reader.py');s=importlib.util.spec_from_file_location('p',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=json.loads(Path('training/sop-bert/tests/fixtures/value-proofs.json').read_text())
print(json.dumps({'categorical':[m.canonical_literal_proof(r['bank'],r['literal'],r['logits'])for r in c['categorical']],'numeric':[m.positive_integer_literal_proof(r['literal'])for r in c['numeric']]}))
`],{encoding:'utf8'}));
 const round=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1e12)/1e12:v));
 samples.categorical.forEach((row,i)=>{const proof=canonicalLiteralProof(row.bank,row.literal,row.logits);assert.equal(proof?.value??null,row.expected,row.name);assert.deepEqual(round(proof),round(python.categorical[i]),row.name);});
 samples.numeric.forEach((row,i)=>{const proof=positiveIntegerLiteralProof(row.literal);assert.equal(proof?.value??null,row.expected,row.literal);assert.deepEqual(proof,python.numeric[i]);});
});

function minimalCoreFixture(){
 const type='request.target.type',domain='quasar.surface.finish',phase='request.constraint.phase',data=structuredClone(fixture);
 data.config={format:'sop.key-reader/1',keys:[type,domain,phase],bioKeys:[domain],metadataKeys:[phase],maxLength:384,registry:{[type]:{role:'global',values:['surface']},[domain]:{role:'domain',area:'quasar',type:'surface',key:'finish',values:['wrong','😀','x']},[phase]:{role:'metadata',values:fixture.config.registry[phase].values}},banks:{[type]:[{state:'absent'},{state:'unknown'},{state:'value',value:'surface'}],[domain]:[{state:'absent'},{state:'unknown'},...['wrong','😀','x'].map(value=>({state:'value',value}))],[phase]:fixture.config.banks[phase]},trainerSha256:'a'.repeat(64),encoderFiles:{'tokenizer.json':'c'.repeat(64)}};
 data.dataManifestJSON=JSON.stringify({scriptSha256:'b'.repeat(64)});data.config.dataManifestSha256=hash(data.dataManifestJSON);
 data.routes={globals:{[type]:'target.type'},metadata:{[phase]:'phase'}};data.domain=domain;data.global={[type]:[0,0,9]};data.presence=[1,1,1];
 data.bio=[structuredClone(fixture.bio[fixture.config.bioKeys.indexOf(fixture.domain)])];data.bio[0].push(...Array.from({length:192},()=>[3,0,0]));
 data.seq.push(...Array(192).fill(null));data.offsets.push(...Array.from({length:192},()=>[0,0]));data.mask.push(...Array(192).fill(0));
 data.mentions=fixture.mentions.map(row=>({[phase]:row[phase],[domain]:[0,0,9,0,0]}));return data;
}
test('three-head 384-token artifact derives families and verifies frozen preparer manifest',async()=>{
 const data=minimalCoreFixture(),{reader}=await setup({},data),result=await reader.infer('😀x',{area:'quasar'});
 assert.equal(result.raw.request.target.type,'surface');assert.deepEqual(result.raw.request.constraints.map(c=>c.value),['😀','x']);assert.ok(result.packet);assert.equal(result.diagnostics.support.length,3);
 data.dataManifestJSON=JSON.stringify({scriptSha256:'f'.repeat(64)});await assert.rejects(setup({},data),/runtime-layout/);
});
test('dynamic artifact rejects unknown roles, invalid BIO ownership, banks and routes',async()=>{
 for(const mutate of [d=>d.config.registry[d.domain].role='alien',d=>d.config.bioKeys.push('missing'),d=>d.config.banks[d.domain][0].state='value',d=>d.routes.globals['unknown']='target.name',d=>d.routes.globals['request.target.type']='target.__proto__.type',d=>d.config.banks[d.domain][2].value='undeclared']){
  const data=minimalCoreFixture();mutate(data);await assert.rejects(setup({},data));
 }
});


test('opt-in dynamic padding preserves source spans and head queries at actual sequence length',async()=>{
 for(const initial of [fixture,minimalCoreFixture()]){
  const legacy=await setup({},initial),expected=await legacy.reader.infer('😀x',{area:initial===fixture?'drawing':'quasar'});
  const data=structuredClone(initial);data.config.inputPadding='dynamic';
  const {reader,calls}=await setup({},data),result=await reader.infer('😀x',{area:initial===fixture?'drawing':'quasar'});
  assert.deepEqual(calls.shapes,[6]);assert.equal(calls.settings.at(-1).padding,false);
  assert.equal(calls.settings.at(-1).max_length,data.config.maxLength);
  assert.deepEqual(result.raw.request,expected.raw.request);assert.deepEqual(result.raw.ranges,expected.raw.ranges);
  assert.deepEqual(result.raw.coverage,expected.raw.coverage);assert.equal(calls.heads,1);
  assert.deepEqual(legacy.calls.shapes,[data.config.maxLength]);assert.equal(legacy.calls.settings.at(-1).padding,'max_length');
 }
});
test('dynamic reader rejects oversized/empty encoded tensors and incompatible model output',async()=>{
 const data=structuredClone(fixture);data.config.inputPadding='dynamic';
 for(const n of [0,193]){
  const tokenizer=async(_,opts)=>{const size=opts.truncation?n:6;return {input_ids:tensor(new BigInt64Array(size).fill(1n),[1,size]),attention_mask:tensor(new BigInt64Array(size).fill(1n),[1,size])};};
  const {reader,calls}=await setup({tokenizer},data),result=await reader.infer('😀x',{area:'drawing'});
  assert.equal(calls.encoder,0);assert.match(result.raw.unresolved[0].reason,/invalid-tokenizer-(shape|tensor)/);
 }
 const {reader}=await setup({encoder:async()=>({hidden:tensor(new Float32Array(384),[1,192,2])})},data);
 assert.equal((await reader.infer('😀x',{area:'drawing'})).raw.unresolved[0].reason,'invalid-neural-output-shape');
 data.config.inputPadding='typo';await assert.rejects(setup({},data),/input-padding/);
});
