import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proveReaderHeadAlternative,inspectReaderHeadPolicy} from '../src/dialog/reader-head-alternative.mjs';

function fixture(){
 const head={area:'remote',property:'item.surface',present:true,ranges:[]};
 const diagnostic=(reason)=>({reason:'provider-unresolved',path:['requests',0],detail:{reason,key:'remote.item.surface',head}});
 const raw={requestCount:1,area:'local',source:{text:'a coarse item'},coverage:{complete:false,truncated:false},
  requests:[{constraints:[{key:'thing.finish',value_span:'coarse'}]}],
  ranges:[{path:['requests','0','constraints','0','value_span'],range:[2,8]}],
  unresolved:[{reason:'incomplete-provider-coverage',path:['requests',0]},diagnostic('presence-span-inconsistent'),diagnostic('cross-area-key-unresolved')]};
 const declaration={canonical:'surface',sourceWire:'ground.texture',sourceWorld:'library.texture',sourceSnapshotSHA:'a'.repeat(64)};
 const bindings={properties:[{area:'local',key:'thing.finish',...declaration},{area:'remote',key:'item.surface',...declaration}]};
 return {raw,bindings,head};
}

test('same-declaration heads without exclusive source content retain an alternative and original diagnostics',()=>{
 const {raw,bindings,head}=fixture(), original=structuredClone(raw);
 const proof=proveReaderHeadAlternative(raw,bindings);
 assert.ok(proof);
 assert.match(proof.sop,/app\.reader\.head\.alternative/);
 assert.deepEqual(raw,original);
 assert.equal(proof.competing[0].key,'remote.item.surface');
 head.present=false;
 head.ranges=[[2,8]];
 assert.ok(proveReaderHeadAlternative(raw,bindings));
});

test('different declarations, exclusive spans and unresolved local or unknown-area heads stay incomplete',()=>{
 for(const modify of [
  ({bindings})=>{bindings.properties[1].canonical='weight';},
  ({bindings})=>{bindings.properties[1].sourceWire='unrelated';},
  ({bindings})=>{bindings.properties[1].sourceSnapshotSHA='b'.repeat(64);},
  ({raw})=>{raw.area='unknown';},
  ({raw})=>{raw.unresolved.push({reason:'provider-unresolved',path:['requests',0],detail:{reason:'unknown-class',key:'local.thing.finish'}});},
  ({head})=>{head.ranges=[[0,1]];},
  ({head})=>{head.area='local';},
 ]){
  const setup=fixture();modify(setup);
  assert.equal(proveReaderHeadAlternative(setup.raw,setup.bindings),null);
 }
});

test('head policies preserve separate authored source bytes',async()=>{
 const policy=inspectReaderHeadPolicy();
 for(const [key,name] of [['source','policy'],['schema','schema']]){
  assert.equal(policy[key],await readFile(new URL('../worlds/app.project/reader-head-'+name+'.sop',import.meta.url),'utf8'));
 }
});
