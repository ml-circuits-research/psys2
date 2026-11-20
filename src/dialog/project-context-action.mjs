import { historyHeads } from './history-journal.mjs';
import {nativeKindCandidates} from './native-binding-candidates.mjs';
// Bind model-declared context references to actual native objects; never inspect source words.
import {quote,str} from '../vendor/sopworld/sopworld.mjs';
import {NATIVE_AREAS} from './app-reader-context.mjs';
import {executionPolicyWorld} from './execution-policy.mjs';
import {readReferenceTurn,resolveObservedReference} from './reference-policy.mjs';
import {observeGroundedProjection,projectGroundedRequest} from './grounded-projection.mjs';
import {flatRequestProjection} from './request-projection.mjs';
import {bridgeRawStructure} from './raw-structural-bridge.mjs';
import {comparativeSteps} from './comparative-projection.mjs';
import {referenceProjection} from './reference-projection.mjs';
function containerOwned(r,bindings,area){
 const keys=(r.constraints??[]).map(c=>c?.key);
 if(!keys.length||keys.some(k=>typeof k!=='string'))return false;
 const types=new Set(keys.map(k=>k.split('.')[0]));
 if(types.size!==1)return false;
 const [container]=types;
 return (bindings.containment??[]).some(c=>c.area===area&&c.containerType===container&&(c.type===r.target?.type||container===r.target?.type));
}
export async function projectContextAction(proposal,session,{bindings,registry,view}={}) {
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||!r?.target||r.target.kind||r.target.name)return null;
 const route=readReferenceTurn(r);if(!route)return null;
 // Properties of a container said of a reference ("make it pastel") are read as the container's members by the partial
 // reading (partial-admission.mjs containerProperty), not as one observed object.
 if(containerOwned(r,bindings,readerArea))return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'context-'+globalThis.crypto.randomUUID()});
 const mappings=nativeKindCandidates(bindings).filter(mapping=>mapping.area===readerArea&&mapping.type===r.target.type);
 const resolution=resolveObservedReference(route,host.observe().objects,mappings,session.newEngineFocus?.[view]);
 if(!resolution)return null;
 const {selected,options,choice}=resolution,other=resolution.values==='previous';
 try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:reference-policy','instance:'+area.world],
  phase:'stage',label:'Rank contextual references',operation:'std.choice',sop:choice.sop,input:choice.input,
  candidates:options.map(({object,canonical})=>({id:object.id,canonical}))});}catch{/* Trace subscribers cannot change interpretation. */}
 const previous=session.newEngineLastAction?.[view];
 let inherited=null,rewind=null;
 if(other){
  const last=historyHeads(session,view).find(row=>row.direction==='undo')?.entry;
  if(!previous||!last||!Object.keys(last.after).every(key=>JSON.stringify(session.isession.state[key])===JSON.stringify(last.after[key])))return null;
  const prior=flatRequestProjection(previous);if(!prior.ok||prior.request.act!==r.act||prior.targets.length!==1||!prior.results.length)return null;
  inherited=prior.results;rewind=last.before;
 }else if(!Array.isArray(r.constraints)||!r.constraints.length&&r.act!=='arrange')return null;   // an arrangement may say nothing more ("improve the layout")
 const canonical=selected.canonical,values=[];
 // A reading beyond plain stated values (a comparative step, several results, a class value its span only evidences:
 // legend "hide" said as "get rid of the legend") is projected by the same bridge as any other reading, with the
 // context target bound to the kind the observed reference resolution chose.
 if(!other&&r.constraints.some(c=>c.operator!=='eq'||typeof c.value==='string'&&typeof c.value_span==='string'&&c.value!==c.value_span)){
  const bindingSha256=proposal.provenance?.bindingsSha256;
  const bridged=bindingSha256?bridgeRawStructure(raw,{bindings,bindingSha256,comparatives:comparativeSteps(),references:referenceProjection(),contextTarget:{kind:canonical,declaration:selected.object.source}}):null;
  if(!bridged||bridged.diagnostics.length||bridged.decoded?.candidates?.length!==1||bridged.decoded.issues?.length)return null;
  const note='I took the reference as the '+selected.object.kind+'.';
  return {proposal:{...proposal,candidates:bridged.decoded.candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
   interpretation:{profile:'native-context/1',note,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind:null};
 }
 if(inherited)for(const c of inherited){if(c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||c.value===null)return null;if(c.tokens.length!==1)return null;values.push({concept:c.concept,token:c.tokens[0],witness:previous.request+':'+c.id});}
 else for(const [index,c]of r.constraints.entries()) {
  if(c.phase!=='result'||c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'||c.value!==c.value_span||Object.keys(c).some(k=>!['key','value','value_span','phase','operator','polarity','character'].includes(k)))return null;
  const evidence=raw.ranges?.filter(a=>JSON.stringify(a.path)===JSON.stringify(['requests','0','constraints',String(index),'value_span']))??[];
  if(evidence.length!==1||Array.from(raw.source.text).slice(...evidence[0].range).join('')!==c.value)return null;
  let concept=bindings.properties.find(p=>p.area===readerArea&&p.key===c.key)?.canonical;
  if(!concept){const spec=registry[readerArea+'.'+c.key];const row=executionPolicyWorld().ofType('app.execution.observedProperty').find(p=>str(p.attrs.sourceType?.[0])===selected.object.sourceType&&str(p.attrs.concept?.[0])===spec?.concept);concept=row&&str(row.attrs.concept[0]);}
  if(!concept)return null;values.push({concept,token:quote(c.value),range:evidence[0].range,witness:c.key});
 }
 const graph=projectGroundedRequest({profile:'context',act:r.act,mood:r.mood,kind:canonical,text:raw.source.text,
  values,witness:selected.object.source});
 if(!graph)return null;
 observeGroundedProjection(session,graph.projection);
 const note=other?'I applied the previous change to the other '+selected.object.kind+'.':'I took the reference as the '+selected.object.kind+'.';
 return {proposal:{...proposal,candidates:[graph],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-context/1',note,projection:graph.projection,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind};
}
