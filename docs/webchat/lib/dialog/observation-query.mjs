// SPDX-License-Identifier: AGPL-3.0-only
// Read-only aggregation over historical selected observations. No English or effects.
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=7ebbcaef36';
const text=v=>typeof v==='string'&&v.length>0;
const nativeId=v=>text(v)||Number.isSafeInteger(v);
const operations=new Set(['values','count','exists','members']);
const identity=o=>({id:o.id,kind:o.kind,source:o.source,sourceType:o.sourceType,version:o.version});
/** Internal jobs are compiled from validated std.request.query declarations. */
export function evaluateQueryJobs(jobs,{observations,bindings=[],maxSteps=100000,maxBytes=4000000}={}){
 const refuse=reason=>({status:'unsupported',reason,answers:[]});
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)return refuse('invalid-query-budget');
 let steps=0;const tick=()=>{if(++steps>maxSteps)throw Error('query-budget');};
 try{
  const input=copyHostData({jobs,observations,bindings},{maxBytes});const answers=[];
  if(!Array.isArray(input.jobs)||!input.jobs.length)return refuse('missing-query-jobs');
  for(const job of input.jobs){
   tick();if(!operations.has(job.operation)||typeof job.id!=='string'||(job.operation==='values'?typeof job.concept!=='string':Object.hasOwn(job,'concept')))return refuse('invalid-query-job');
   const selection=job.selection;
   if(!selection||typeof selection.complete!=='boolean'||!Array.isArray(selection.sources)||!Array.isArray(selection.unknownSources)||new Set(selection.sources).size!==selection.sources.length)return refuse('unresolved-target');
   if(!text(selection.coverage?.requestedScope)||selection.coverage.requestedScope!==selection.scope)return refuse('requested-population-scope-mismatch');
   const scopes=input.observations.filter(o=>{tick();return o.instanceId===selection.instanceId&&o.scope===selection.scope&&o.version===selection.version;});
   if(scopes.length!==1)return refuse('ambiguous-observation');const observation=scopes[0];
   if(!text(observation.instanceId)||!text(observation.scope)||!text(observation.version)||typeof observation.complete!=='boolean'||!Array.isArray(observation.objects))return refuse('invalid-observation');
   const bySource=new Map(),ids=new Set();
   for(const object of observation.objects){
    tick();if(!text(object.source)||!nativeId(object.id)||!text(object.kind)||!text(object.sourceType)||object.version!==observation.version||bySource.has(object.source)||ids.has(object.id)||!Array.isArray(object.inputs))return refuse('invalid-object-identity');
    bySource.set(object.source,object);ids.add(object.id);
   }
   const selected=[];
   for(const source of selection.sources){tick();const object=bySource.get(source);if(!object)return refuse('foreign-selection');selected.push(object);}
   const unknown=new Set(selection.unknownSources);
   for(const source of unknown){tick();if(!bySource.has(source)||selection.sources.includes(source))return refuse('invalid-unknown-selection');}
   const complete=selection.complete&&observation.complete&&unknown.size===0;
   if(!complete&&!(job.operation==='exists'&&selected.length))return refuse('incomplete-query-population');
   const answer={id:job.id,operation:job.operation,objects:selected.map(identity),evidence:{observation,selection}};
   if(job.operation==='count')answer.value=selected.length;
   if(job.operation==='exists')answer.value=selected.length>0;
   if(job.operation==='members')answer.value=selected.map(identity);
   if(job.operation==='values'){
    answer.rows=[];answer.evidence.bindings=[];
    for(const object of selected){
     const candidates=input.bindings.filter(b=>{tick();return b.concept===job.concept&&b.sourceType===object.sourceType;});
     if(candidates.length!==1)return refuse('missing-or-ambiguous-property-binding');const binding=candidates[0];
     if(!text(binding.id)||!text(binding.key))return refuse('invalid-property-binding');
     const inputs=object.inputs.filter(i=>{tick();return i.binding===binding.id;});
     if(inputs.length!==1)return refuse('missing-or-ambiguous-property-observation');const actual=inputs[0];
     if(actual.source!==object.source||actual.sourceType!==object.sourceType||actual.version!==observation.version||actual.key!==binding.key||!Array.isArray(actual.values)||!actual.values.length||actual.values.some(v=>typeof v!=='string'))return refuse('unknown-property-value');
     for(const key of ['dimension','unit','frame'])if(Object.hasOwn(binding,key)&&binding[key]!==actual[key])return refuse('incompatible-property-dimension');
     answer.rows.push({object:identity(object),values:actual.values,input:actual});answer.evidence.bindings.push(binding);
    }
   }
   answers.push(answer);
  }
  return copyHostData({status:'answered',answers,steps},{maxBytes});
 }catch(error){return refuse(error.message==='query-budget'?'query-budget':'invalid-or-overbudget-query-data');}
}
