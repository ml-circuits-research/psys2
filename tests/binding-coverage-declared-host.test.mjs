// Every Diagram and Drawing inventory key (the deployed reader's label space, official-dataset/inventory.json) that a
// declared native operation parameter can consume has a binding in the deployed bindings, generated from the native
// interfaces (training/sop-bert/export-structural-bindings.mjs NATIVE-CHAIN COVERAGE). A key without a binding must
// be listed with the reason it has none, and that reason is re-checked here against the current native interfaces:
// when an interface gains the parameter, this test fails until the bindings are regenerated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {declaredOperations,NATIVE_CHAIN_AREAS} from '../training/sop-bert/export-structural-bindings.mjs';

const root=new URL('../',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('docs/webchat/models/sop-bert/deployment.json',root),'utf8'));
const bindings=JSON.parse(readFileSync(new URL('docs/webchat/'+deployment.artifactBase+deployment.bindingsArtifact.path,root),'utf8'));
const inventory=JSON.parse(readFileSync(new URL('official-dataset/inventory.json',root),'utf8'));
// The deployed reader's own label space (its manifest's key list): the official inventory moves ahead with the next training; its new keys are bound when that reader is deployed.
const manifest=JSON.parse(readFileSync(new URL('docs/webchat/'+deployment.manifestPath,root),'utf8'));
const readerKeys=new Set(JSON.parse(manifest.configJSON).keys);
const interfaces={diagram:'worlds/diagram.sketch/native-interface.sop',drawing:'worlds/art.draw/native-interface.sop'};
const operations=Object.fromEntries(Object.entries(interfaces).map(([area,path])=>[area,declaredOperations(parse(readFileSync(new URL(path,root),'utf8')),str)]));

test('every Diagram and Drawing inventory key is bound or listed with a re-checked reason',()=>{
 assert.deepEqual([...NATIVE_CHAIN_AREAS].sort(),Object.keys(interfaces).sort());
 const coverage=new Map((bindings.coverage??[]).map(row=>[row.area+'.'+row.key,row]));
 const missing=[],stale=[];
 for(const area of NATIVE_CHAIN_AREAS)for(const [type,row] of Object.entries(inventory[area]??{}))for(const name of Object.keys(row.keys??{})){
  const key=type+'.'+name,entry=coverage.get(area+'.'+key);
  if(!readerKeys.has(area+'.'+key))continue;
  if(!entry){missing.push(area+'.'+key);continue;}
  if(entry.status==='bound'){
   const property=bindings.properties.find(p=>p.area===area&&p.key===key);
   if(!property||!(property.hostBinding||property.projection||property.canonical==='count'))stale.push(area+'.'+key+' listed bound without a binding');
   if(property?.hostBinding&&!operations[area].some(op=>op.id===property.hostBinding.operation&&Object.hasOwn(op.params,property.hostBinding.parameter)))
    stale.push(area+'.'+key+' bound to a parameter the interface no longer declares');
  }else{
   assert.match(entry.reason,/^(no-native-(parameter|source-type)|constructor-target-parameter)$/,area+'.'+key);
   if(entry.reason==='constructor-target-parameter'){assert.ok(operations[area].some(op=>op.id===entry.operation&&op.act==='make'&&op.params[entry.parameter]?.required),area+'.'+key);continue;}
   // The reason still holds: no operation declares a parameter of the key's name (or the one its descriptor names).
   const src=String(row.keys[name].src??''),named=/(?:Native parameter: |^)([a-z][a-z.]*[a-z])(?:\.| \{)([A-Za-z_]+)\}?/.exec(src);
   const consumable=named&&operations[area].some(op=>op.id===named[1]&&Object.hasOwn(op.params,named[2]));
   if(consumable)stale.push(area+'.'+key+' is consumable by '+named[1]+'.'+named[2]+' but unbound');
  }
 }
 assert.deepEqual(missing,[],'inventory keys absent from the coverage list (regenerate the bindings)');
 assert.deepEqual(stale,[],'coverage out of date with the native interfaces (regenerate the bindings)');
});

test('the coverage of the deployed bindings, by area (bound keys, unbound keys with reasons)',()=>{
 const rows=bindings.coverage??[];
 for(const area of NATIVE_CHAIN_AREAS){
  const bound=rows.filter(r=>r.area===area&&r.status==='bound').length,unbound=rows.filter(r=>r.area===area&&r.status!=='bound');
  console.log(`${area}: ${bound} bound, ${unbound.length} without a native parameter (${unbound.map(r=>r.key).join(', ')})`);
  assert.ok(bound>0);
 }
});
