import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createKeyReaderPacketAdapter} from '../src/dialog/key-reader-packet.mjs';
const generated=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
base=Path('training/sop-bert/candidates/target-type')
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,base/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
prep=load('prep','prepare-key-reader.py');train=load('train','train-key-reader.py');predict=load('predict','predict-key-reader.py')
inv=json.loads((base/'tests/fixtures/target-type-inventory.json').read_text())
c=train.configuration({'format':prep.CANDIDATE_FORMAT,'registry':prep.registry(inv),'inventorySha256':'a'*64,'exclusionSha256':'b'*64,'targetFamilies':prep.target_families(inv)})
model={'sha256':'a'*64,'tokenizerSha256':'b'*64,'codecSha256':'c'*64,'decoderVersion':2}
logits={key:[3]+[0]*(len(bank)-1)for key,bank in c['banks'].items()if c['registry'][key]['role']=='global'}
packet,_=predict.normalize(c,'x','drawing',[[[3,0,0]]for _ in c['bioKeys']],[-1]*len(c['keys']),logits,{},[[0,1]],[0],[1],model,prep.GLOBAL,prep.META)
print(json.dumps({'config':c,'packet':packet}))
`],{encoding:'utf8'}));
const clone=x=>structuredClone(x),hash=text=>createHash('sha256').update(text).digest('hex');
async function adapter(options={}){const configJSON=JSON.stringify(generated.config);return createKeyReaderPacketAdapter({configJSON,configSha256:hash(configJSON),model:generated.packet.model,...options});}
test('actual135-key predictor support is retained outside the closed runtime packet',async()=>{
 const a=await adapter(),input=clone(generated.packet),before=clone(input),result=a.adapt(input);
 assert.equal(result.ok,true);assert.equal(result.diagnostics.support.length,135);assert.deepEqual(result.diagnostics.rawPacket,input);assert.deepEqual(result.packet.coverage,{complete:false,truncated:false});assert.deepEqual(result.packet.unresolved,input.unresolved);assert.deepEqual(input,before);assert.equal(result.provenance.executable,false);assert.equal(result.provenance.calibration,null);
 result.packet.request.target.extra='changed';assert.equal(result.diagnostics.rawPacket.request.target.extra,undefined);
});
test('missing, duplicate, changed and extra support entries refuse',async()=>{
 const a=await adapter();for(const change of [p=>p.coverage.support.pop(),p=>p.coverage.support.push(p.coverage.support[0]),p=>p.coverage.support[0].presence='trained',p=>p.coverage.support[0].extra=true,p=>p.coverage.support.reverse()]){const p=clone(generated.packet);change(p);assert.equal(a.adapt(p).ok,false);}
});
test('unknown semantic fields and scalar source evidence survive without claimed understanding',async()=>{
 const a=await adapter(),p=clone(generated.packet);p.source.text='😀x';p.request.span='😀x';p.request.target.name_span='😀';p.request.future={unsupported:true};p.ranges=[{path:['target','name_span'],range:[0,1]}];
 const result=a.adapt(p);assert.equal(result.ok,true);assert.deepEqual(result.packet.request,p.request);assert.deepEqual(result.packet.ranges,p.ranges);assert.equal(result.packet.coverage.complete,false);
 p.ranges[0].range=[1,2];assert.equal(a.adapt(p).ok,false);
});
test('hash, model, layout, inconsistent coverage and range ownership fail closed',async()=>{
 await assert.rejects(adapter({configSha256:'f'.repeat(64)}),/hash/);
 const a=await adapter();for(const change of [p=>p.model.sha256='f'.repeat(64),p=>p.coverage.complete=true,p=>p.coverage.calibrated=true,p=>p.ranges.push({path:['missing'],range:[0,1]}),p=>p.source.unit='utf16']){const p=clone(generated.packet);change(p);assert.equal(a.adapt(p).ok,false);}
 const config=clone(generated.config);config.keys.pop();const configJSON=JSON.stringify(config);await assert.rejects(adapter({configJSON,configSha256:hash(configJSON)}),/layout/);
});
test('copy and work limits refuse without exposing a partial runtime packet',async()=>{
 const a=await adapter({budget:1}),result=a.adapt(generated.packet);assert.equal(result.ok,false);assert.equal(result.packet,null);assert.equal(result.diagnostics.issues[0].reason,'adapter-budget');
});

test('coherently trimmed inventory cannot masquerade as the frozen135-key profile',async()=>{
 const config=clone(generated.config),key=config.keys.find(k=>k!=='request.target.type'&&config.bioKeys.includes(k));
 config.keys=config.keys.filter(k=>k!==key);config.bioKeys=config.bioKeys.filter(k=>k!==key);delete config.registry[key];delete config.banks[key];
 const configJSON=JSON.stringify(config);await assert.rejects(adapter({configJSON,configSha256:hash(configJSON)}),/profile/);
});
