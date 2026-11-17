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
async function setup(change={}){
 const configJSON=JSON.stringify(fixture.config),manifest={format:'sop.key-reader-runtime/1',artifactRole:'trained-unverified',dtype:'fp32',weightRepresentation:'fp32',executionEligible:false,graphConfidence:null,configJSON,configSha256:hash(configJSON),checkpointSha256:'d'.repeat(64),encoderSha256:'e'.repeat(64),headsSha256:'f'.repeat(64),tokenizerSha256:'c'.repeat(64),preparerSha256:'b'.repeat(64),trainerSha256:'a'.repeat(64),codecSha256:'1'.repeat(64),hiddenWidth:2,rawRoutes:fixture.routes};
 const ids=[101,10,11,102,12,102,...Array(186).fill(0)],calls={encoder:0,heads:0,diagnostics:[],pairs:[]};
 const tokenizer=async(text,opts)=>{calls.pairs.push(opts.text_pair);const full=opts.padding===false;return {input_ids:tensor(BigInt64Array.from((full?ids.slice(0,6):ids),BigInt),[1,full?6:192]),attention_mask:tensor(BigInt64Array.from(full?fixture.mask.slice(0,6):fixture.mask,BigInt),[1,full?6:192])};};
 const encoder=async()=>{calls.encoder++;return {hidden:tensor(new Float32Array(384),[1,192,2]),bio_logits:tensor(Float32Array.from(fixture.bio.flat(2)),[1,122,192,3]),presence_logits:tensor(Float32Array.from(fixture.presence),[1,135])};};
 const heads=async input=>{calls.heads++;assert.deepEqual(Array.from(input.spans.data,Number),[0,1,1,2,2,3]);assert.deepEqual(Array.from(input.key_indices.data,Number),[-1,fixture.config.keys.indexOf(fixture.domain),fixture.config.keys.indexOf(fixture.domain)]);const rows=[fixture.global,...fixture.mentions],values=rows.flatMap(row=>fixture.config.keys.flatMap(k=>fixture.config.banks[k]?(row[k]??[3,...Array(fixture.config.banks[k].length-1).fill(0)]):[]));return {class_logits:tensor(Float32Array.from(values),[3,values.length/3])};};
 const offsetAuthority=async()=>({unit:'unicode-scalar',tokenIds:ids,attentionMask:fixture.mask,sequenceIds:fixture.seq,specialTokensMask:ids.map((_,i)=>fixture.seq[i]===null?1:0),offsets:fixture.offsets.map((r,i)=>fixture.seq[i]===0?r:null),provenance:{id:'synthetic-authority',version:1,profileSha256:'2'.repeat(64),tokenizerSha256:'c'.repeat(64)}});
 const reader=await createKeyReaderInference({manifest,tokenizer,encoder,heads,offsetAuthority,makeTensor:(type,data,dims)=>({type,data,dims}),recordDiagnostics:r=>calls.diagnostics.push(r),...change});return {reader,calls,manifest};
}
test('actual two-stage computation matches Python normalizer for repeated-key per-mention metadata and scalar ranges',async()=>{
 const {reader,calls}=await setup(),result=await reader.infer('😀x',{area:'drawing',context:{existing:[]}}),expected=structuredClone(fixture.expected);expected.model=result.raw.model;
 assert.deepEqual(result.raw,expected);assert.equal(calls.encoder,1);assert.equal(calls.heads,1);assert.deepEqual(result.raw.request.constraints.map(c=>c.phase),['selector','result']);assert.equal(result.graphConfidence,null);assert.equal(result.provenance.executionEligible,false);assert.equal(result.diagnostics.support.length,135);
 assert.equal(calls.pairs[0][0],'{"area": "drawing", "context": {"existing": []}}');
});
test('read retains full diagnostics before handing the closed packet to the pipeline',async()=>{const {reader,calls}=await setup();const packet=await reader.read('😀x',{area:'drawing'});assert.equal(calls.diagnostics.length,1);assert.deepEqual(Object.keys(packet.coverage).sort(),['complete','truncated']);assert.equal(calls.diagnostics[0].diagnostics.support.length,135);});
test('missing offset authority refuses before encoder and never constructs source evidence',async()=>{const {reader,calls}=await setup({offsetAuthority:async()=>null});const result=await reader.infer('😀x',{area:'drawing'});assert.equal(calls.encoder,0);assert.equal(result.raw.coverage.complete,false);assert.equal(result.raw.ranges.length,0);assert.equal(result.raw.unresolved[0].reason,'exact-source-offsets-unavailable');});
test('malformed neural output and low work allowance produce incomplete packets',async()=>{for(const change of [{encoder:async()=>({hidden:tensor([NaN],[1,192,2])})},{budget:1}]){const {reader}=await setup(change),result=await reader.infer('😀x',{area:'drawing'});assert.equal(result.raw.coverage.complete,false);assert.ok(result.raw.unresolved.length);assert.equal(result.graphConfidence,null);}});
test('context serialization preserves Python separators and refuses unrepresentable numeric or scalar inputs',()=>{assert.equal(keyReaderContextJSON({z:[true,null,2],a:'😀'}),'{"a": "😀", "z": [true, null, 2]}');for(const n of [1.2,-0,NaN,Infinity])assert.throws(()=>keyReaderContextJSON(n));assert.throws(()=>keyReaderContextJSON('\ud800'));});
test('runtime identity requires actual pinned config and declared non-executable profile',async()=>{const {manifest}=await setup();await assert.rejects(setup({manifest:{...manifest,configSha256:'0'.repeat(64)}}),/hash/);await assert.rejects(setup({manifest:{...manifest,executionEligible:true}}),/profile/);await assert.rejects(setup({manifest:{...manifest,rawRoutes:{globals:{},metadata:{}}}}),/route/);});

test('truncated source/context refuses before any neural call',async()=>{const tokenizer=async(text,opts)=>{const n=opts.padding===false?193:192;return {input_ids:tensor(new BigInt64Array(n).fill(1n),[1,n]),attention_mask:tensor(new BigInt64Array(n).fill(1n),[1,n])};};const {reader,calls}=await setup({tokenizer}),r=await reader.infer('😀x',{area:'drawing'});assert.equal(r.raw.coverage.truncated,true);assert.equal(calls.encoder,0);assert.equal(calls.heads,0);assert.equal(r.raw.coverage.complete,false);});
