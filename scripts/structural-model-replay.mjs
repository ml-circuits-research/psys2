// Source-only development proposal replay. No final holdout or execution gate.
import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {bridgeRawStructure} from '../src/dialog/raw-structural-bridge.mjs';
import {readReaderSource} from '../src/dialog/reader-source.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {initialDrawingState,createDrawingHost} from '../worlds/art.draw/declared-host.mjs';
import {initialDiagramState,createDiagramHost} from '../worlds/diagram.sketch/declared-host.mjs';
import {initialDocumentState,createDocumentHost} from '../worlds/docs.editor/declared-host.mjs';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {prepareFunctionalFixture} from './lib/functional-fixture-policy.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,a)=>v.startsWith('--')?[...pairs,[v.slice(2),a[i+1]]]:pairs,[])),sha=x=>createHash('sha256').update(x).digest('hex');
const matrixRaw=readFileSync('training/eval/functional-matrix/dev-rows.jsonl','utf8'),matrix=matrixRaw.trim().split('\n').map(JSON.parse);
const ownerPin='2ba0259603ed5155b57324fca7c27fc249ba2a0a',ownerRaw=execFileSync('git',['-C','../soplang-words-lib','show',`${ownerPin}:compat/psys2/reader/development/rows.jsonl`],{encoding:'utf8',maxBuffer:4000000}),owner=ownerRaw.trim().split('\n').map(JSON.parse);
const source=[...matrix.map(r=>({input:{id:'matrix:'+r.id,text:r.text,area:r.world,context:r.context},suite:'matrix',classes:r.classes,expectedRequestCount:Array.isArray(r.requests)?r.requests.length:null})),...owner.map(r=>({input:{id:'owner:'+r.id,text:r.text,area:r.area,context:r.context},suite:'owner',classes:r.classes??['unclassified'],expectedRequestCount:Array.isArray(r.requests)?r.requests.length:null}))];
if(args.prepare){writeFileSync(args.prepare,source.map(r=>JSON.stringify(r.input)).join('\n')+'\n');console.log(JSON.stringify({rows:source.length,matrix:matrix.length,owner:owner.length,fields:['id','text','area','context']}));}
else{
 if(!args.predictions||!args.bindings||!args['bindings-sha256']||!args.out)throw Error('predictions, bindings, bindings-sha256 and out required');
 const bindingRaw=readFileSync(args.bindings),bindings=JSON.parse(bindingRaw);if(sha(bindingRaw)!==args['bindings-sha256'])throw Error('binding hash mismatch');
 const predictionRaw=readFileSync(args.predictions,'utf8'),predictions=predictionRaw.trim().split('\n').map(JSON.parse),byId=new Map(predictions.map(r=>[r.id,r]));if(byId.size!==source.length||predictions.length!==source.length)throw Error('prediction row identity mismatch');
 const predictionManifest=JSON.parse(readFileSync(args.predictions+'.manifest.json','utf8')),expectedInput=source.map(r=>JSON.stringify(r.input)).join('\n')+'\n';
 if(predictionManifest.complete!==true||predictionManifest.outputSha256!==sha(predictionRaw)||predictionManifest.inputSha256!==sha(expectedInput))throw Error('prediction manifest/input mismatch');
 const rows=[],counts={},cells={};
 for(const row of source){
  const model=byId.get(row.input.id);if(!model||model.prediction.model.sha256!==predictionManifest.checkpointSha256||model.prediction.source.text!==row.input.text||model.prediction.area!==row.input.area)throw Error('prediction source mismatch');
  const bridge=bridgeRawStructure(model.prediction,{bindings,bindingSha256:args['bindings-sha256']});
  const proposal=bridge.decoded??{candidates:[],coverage:{complete:false,executable:false,graphProposal:false}};
  proposal.coverage={...proposal.coverage,executable:false};
  const state={'art.draw':initialDrawingState(),'diagram.sketch':initialDiagramState(),'docs.editor':initialDocumentState(),'time.calendar':{people:[],rooms:[],meetings:[]},'ui.shell':{activeTab:row.input.area}};
  let setup={ok:false,reason:'owner-native-history-not-reconstructed'};
  if(row.suite==='matrix'){
   const area=row.input.area,instanceId='replay-'+sha(row.input.id).slice(0,20),fixture=prepareFunctionalFixture(area,row.input.context);
   const host=area==='drawing'?createDrawingHost({state:state['art.draw'],instanceId}):area==='diagram'?await createDiagramHost({state:state['diagram.sketch'],instanceId}):area==='document'?createDocumentHost({state:state['docs.editor'],instanceId}):area==='calendar'?createCalendarHost({state:state['time.calendar'],instanceId}):null;
   const seeded=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[area]??[],invocationPrefix:instanceId});setup={ok:seeded.ok,semanticallyLimited:fixture.semanticallyLimited,counters:seeded.counters};
  }
  const before=JSON.stringify(state),provider={provenance:()=>({modelSha256:model.prediction.model.sha256,decoderVersion:model.prediction.model.decoderVersion,source:'frozen structural inference'}),propose:async sourceSop=>{if(readReaderSource(sourceSop)!==row.input.text)throw Error('unexpected provider source');return proposal;}};
  const reply=await routeNewEngine({isession:{state},engine:{requestReader:provider},newEngineJournal:[]},row.input.text,{language:'en'});
  const noEffects=before===JSON.stringify(state)&&reply.effects.length===0&&reply.statuses.every(s=>s==='unsupported')&&reply.trace.readerRouting.selected===null;
  const reasons=[...model.prediction.unresolved.map(i=>i.reason),...bridge.diagnostics.map(i=>i.reason),...(bridge.decoded?.issues??[]).map(i=>i.reason)];
  const record={id:row.input.id,suite:row.suite,area:row.input.area,classes:row.classes,rawComplete:model.prediction.coverage.complete,requestCount:model.prediction.requestCount,expectedRequestCount:row.expectedRequestCount,noRequestProposals:proposal.candidates.filter(c=>c.batch?.entries.length===0).length,validCandidates:proposal.candidates.length,graphCandidates:proposal.candidates.filter(c=>c.batch?.entries.length).length,noEffects,setup,readerRouting:reply.trace.readerRouting,reasons:[...new Set(reasons)]};rows.push(record);
  for(const key of [row.suite,...row.classes.map(c=>`${row.suite}:${c}:${row.input.area}`)]){const out=key===row.suite?(counts[key]??={rows:0,rawComplete:0,validCandidates:0,graphRows:0,noEffects:0,setupEligible:0,noRequest:{expectedEmpty:0,omittedNonempty:0,unannotated:0},reasons:{}}):(cells[key]??={rows:0,rawComplete:0,validCandidates:0,graphRows:0,noEffects:0,setupEligible:0,noRequest:{expectedEmpty:0,omittedNonempty:0,unannotated:0},reasons:{}});out.rows++;out.rawComplete+=+record.rawComplete;out.validCandidates+=record.validCandidates;out.graphRows+=+(record.graphCandidates>0);out.noEffects+=+noEffects;out.setupEligible+=+setup.ok;if(record.noRequestProposals)out.noRequest[row.expectedRequestCount===null?'unannotated':row.expectedRequestCount===0?'expectedEmpty':'omittedNonempty']++;for(const reason of record.reasons)out.reasons[reason]=(out.reasons[reason]??0)+1;}
 }
 const report={scope:'Actual frozen source/context-only development predictions. Typed validity is not semantic correctness; whole-graph calibration and effect admission remain closed. Setup mutations are separate from model effects; no final holdout read.',predictionManifest,sources:{matrixSha256:sha(matrixRaw),ownerPin,ownerSha256:sha(ownerRaw),predictionsSha256:sha(predictionRaw),bindingsSha256:args['bindings-sha256']},counts,cells,rows};writeFileSync(args.out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(counts));if(rows.some(r=>!r.noEffects))process.exitCode=1;
}
