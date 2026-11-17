import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {readNativeIntent} from '../src/dialog/native-intent-reader.mjs';
import {observedReaderContext} from '../src/dialog/native-reader-context.mjs';
const directory=new URL('../training/sop-bert/data/ui-natural-v1/',import.meta.url);
const load=async file=>JSON.parse(await readFile(new URL(file,directory),'utf8'));
const rows=(await readFile(new URL('examples.jsonl',directory),'utf8')).trim().split('\n').map(JSON.parse);
const coverage=await load('coverage.json'),observations=await load('observations.json');
const uiRecipes=(await readFile(new URL('ui-actions.jsonl',directory),'utf8')).trim().split('\n').map(JSON.parse);
test('separate natural UI corpus satisfies existing V2 and exact source-offset contracts',()=>{
 const result=spawnSync('python3',['-I',new URL('validate.py',directory).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/0 ambiguous\/overlap label masks/);
 assert.equal(rows.length,coverage.rows);
 assert.equal(coverage.trainingRun,false);assert.equal(coverage.modelInference,false);
});
test('every direct or compound gold SOP pair decodes to its actually executed native arguments',()=>{
 const declarations=new Map(Object.values(coverage.nativeInventory).flat().map(op=>[op.id,op]));
 for(const act of ['undo','redo'])declarations.set('ui.history.'+act,{id:'ui.history.'+act,act,on:'app.history',params:{}});
 let count=0;
 for(const row of rows){if(!row.nativeTool)continue;for(const call of row.nativeTool.calls??[row.nativeTool]){
  const decoded=readNativeIntent(call.wires,{operation:declarations.get(call.operation)});
  assert.equal(decoded.operation,call.operation,row.id);assert.deepEqual(decoded.args,call.args,row.id);count++;
 }}
 assert.ok(count>500);
 assert.equal(uiRecipes.length,coverage.checkedRecipes);let uiCalls=0;
 for(const recipe of uiRecipes)for(const call of recipe.calls){
  const decoded=readNativeIntent(call.wires,{operation:declarations.get(call.operation)});assert.deepEqual(decoded.args,call.args,recipe.id);
  assert.ok(observations[call.observationRef],recipe.id);
  for(const range of call.sourceRanges)assert.equal(Array.from(call.text).slice(range.start,range.end).join(''),range.rendered,recipe.id);
  uiCalls++;
 }
 assert.equal(uiCalls,coverage.uiActionCalls);assert.equal(uiRecipes.slice(0,390).reduce((n,row)=>n+row.calls.length,0),396);assert.ok(uiCalls>1000);
});
test('model context uses current hierarchical ranking while preserving full observations',()=>{
 for(const row of rows){
  const observation=observations[row.observationRef];assert.ok(observation,row.id);
  const actual=observedReaderContext(row.world,observation,row.context.previous,{compact:true,text:row.text}).context;
  assert.deepEqual(row.context.existing,actual.existing,row.id);
 }
 const house=rows.find(row=>row.text==='make the house blue');
 assert.ok(observations[house.observationRef].objects.length>house.context.existing.length);
 assert.ok(house.context.existing.length<=4);
});
test('literal extraction stays distinct from native normalization and desired completion',()=>{
 const byText=text=>{const row=rows.find(row=>row.text===text);assert.ok(row,text);return row;};
 for(const text of ['add a house','create a house','draw a man','change the avatar to a man'])assert.ok(byText(text).nativeTool.wires);
 const duration=byText('show the object IDs for 4 seconds');
 assert.equal(duration.extraction.parameters.find(p=>p.parameter==='duration').value,4);
 assert.equal(duration.extraction.parameters.find(p=>p.parameter==='duration').measureUnit,'second');
 assert.equal(duration.completion.parameters.find(p=>p.parameter==='duration').value,4000);
 assert.equal(duration.requests[0].act,'change');
 const ordinal=byText('pick the first part of o1');
 assert.equal(ordinal.extraction.parameters.find(p=>p.parameter==='index').value,'first');assert.equal(ordinal.requests[0].target.ordinal,'first');assert.equal(ordinal.completion.parameters.find(p=>p.parameter==='index').value,0);
 const omitted=byText('add a house');assert.ok(!('x'in omitted.nativeTool.args));assert.ok(!('y'in omitted.nativeTool.args));
 assert.ok(omitted.completion.requirements.some(item=>item.verifiedByThisDataset===false));
 const vague=rows.filter(row=>row.style==='world-informed-completion');assert.equal(vague.length,18);
 for(const row of vague){assert.equal(row.nativeTool,null);assert.deepEqual(row.completion.parameters,[]);}
 assert.equal(rows.filter(row=>row.style==='compound').length,6);
 const centred=byText('centre the first paragraph');assert.ok(centred.extraction.parameters.some(p=>p.parameter==='align'&&p.surface==='centre'));
 const neck=byText('use necklace for the neck').extraction.parameters.find(p=>p.parameter==='id');assert.equal(neck.start,'use necklace for the '.length);
 const darker=byText('make the house a darker blue');assert.equal(darker.requests[0].constraints.filter(c=>c.key==='drawn.colour').length,1);
 const promote=byText('promote the subchapter to a chapter');assert.ok(!promote.requests[0].constraints.some(c=>c.key==='section.level'));assert.ok(promote.completion.requirements.some(r=>r.policy.includes('level one')));
 assert.equal(coverage.catalog.facePresets,14);assert.equal(coverage.catalog.faceVariants,181);
 const titles=rows.filter(row=>row.world==='calendar').map(row=>row.text).join('\n');
 assert.ok(!/\b(room|Hall|Alex|Work)\b/.test(titles));
});

test('finite synonym and optional omission matrix covers every current UI operation without losing the original cohort',async()=>{
 assert.equal(Object.keys(coverage.operations).length,99);
 for(const [operation,entry]of Object.entries(coverage.variantCoverage)){
  assert.equal(entry.synonymRows,2,operation);assert.equal(entry.ellipticalRows,1,operation);
 }
 const {omissionCases}=await import('../training/sop-bert/data/ui-natural-v1/omission-authoring.mjs');
 const checks=(await load('native-checks.json')).checks;
 assert.equal(checks.filter(check=>check.style?.startsWith('optional-detail-')).length,omissionCases().length);
 for(const row of rows.filter(row=>row.style==='optional-detail-omission')){
  assert.ok(row.completion.requirements.some(item=>item.origin==='controlled-omission'));
  assert.ok(row.cohort.recipeFamily.startsWith('optional-profile-'));
 }
 assert.equal(rows.slice(0,592).filter(row=>['curated-synonym','elliptical-direct','optional-detail-omission','optional-detail-complete'].includes(row.style)).length,0);
 for(const row of rows.filter(row=>row.style==='optional-detail-omission')){const check=checks.find(check=>check.id===row.nativeTool.check);for(const parameter of check.omitted)assert.ok(!row.extraction.parameters.some(item=>item.parameter===parameter),row.id+': omitted '+parameter);}
 for(const row of rows.filter(row=>row.style==='elliptical-direct'))assert.equal(row.requests[0].trigger,null);
});
