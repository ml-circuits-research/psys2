import {nativeKindCandidates} from './native-binding-candidates.mjs?v=de223646d6';
// Bind model-declared context references to actual native objects; never inspect source words.
import {serializeRequestGraph} from '../vendor/sopworld/sopworld.mjs?v=14e619cf45';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=6c7fc1be6d';
import {DRAWING_PROPERTY_BINDINGS} from '../../worlds/art.draw/property-host.mjs?v=45ec70afe7';
import {flatRequestProjection} from './request-projection.mjs?v=e246760812';
export async function projectContextAction(proposal,session,{bindings,registry,view}={}) {
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||r?.mood!=='do'||r.act!=='change'||r.target?.kind||r.target?.name)return null;
 const other=r.target.quantifier==='other'&&r.turn?.fragment==='replaces';
 if(!other&&(r.target.fill!=='context'||r.target.mode!=='existing'))return null;
 const previous=session.newEngineLastAction?.[view],history=session.newEngineUndo??[],last=history.findLast(e=>e.area===view);
 let inherited=null,rewind=null;
 if(other){
  if(!previous||!last||!Object.keys(last.after).every(key=>JSON.stringify(session.isession.state[key])===JSON.stringify(last.after[key])))return null;
  const prior=flatRequestProjection(previous);if(!prior.ok||prior.request.act!=='change'||prior.targets.length!==1||!prior.results.length)return null;
  inherited=prior.results;rewind=last.before;
 }else if(!Array.isArray(r.constraints)||!r.constraints.length)return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'context-'+globalThis.crypto.randomUUID()}),observation=host.observe();
 const declared=nativeKindCandidates(bindings);
 const options=observation.objects.map(object=>({object,mappings:declared.filter(k=>k.area===readerArea&&k.type===r.target.type&&(k.familyIdentity||k.lemma===object.kind)&&k.nativeFamilyBinding?.sourceType===object.sourceType)})).filter(o=>o.mappings.length);
 const focus=session.newEngineFocus?.[view];
 const selected=other?options.filter(o=>o.object.id!==focus).at(-1):options.find(o=>o.object.id===focus)??options.at(-1);
 if(!selected)return null;
 const canonical=selected.mappings[0].canonical,values=[];
 if(inherited)for(const c of inherited){if(c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||c.value===null)return null;values.push({concept:c.concept,value:c.value});}
 else for(const [index,c]of r.constraints.entries()) {
  if(c.phase!=='result'||c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'||c.value!==c.value_span||Object.keys(c).some(k=>!['key','value','value_span','phase','operator','polarity','character'].includes(k)))return null;
  const evidence=raw.ranges?.filter(a=>JSON.stringify(a.path)===JSON.stringify(['requests','0','constraints',String(index),'value_span']))??[];
  if(evidence.length!==1||Array.from(raw.source.text).slice(...evidence[0].range).join('')!==c.value)return null;
  let concept=bindings.properties.find(p=>p.area===readerArea&&p.key===c.key)?.canonical;
  if(!concept){const spec=registry[readerArea+'.'+c.key];concept=DRAWING_PROPERTY_BINDINGS.find(p=>p.sourceType===selected.object.sourceType&&p.concept===spec?.concept)?.concept;}
  if(!concept)return null;values.push({concept,value:c.value});
 }
 const literal=value=>({kind:'literal',value}),ref=value=>({kind:'ref',value}),string=value=>({kind:'string',value});
 const nodes=[{id:'context.source',type:'std.request.source',attrs:{text:[string(raw.source.text)]}},
  {id:'context.request',type:'std.request',attrs:{act:[literal('change')],mood:[literal('do')],source:[ref('context.source')],...(values.length===1?{root:[ref('context.result.0')]}:{})}},
  {id:'context.target',type:'std.request.target',attrs:{request:[ref('context.request')],mode:[literal('existing')],kind:[literal(canonical)]}}];
 for(const [i,c]of values.entries())nodes.push({id:'context.result.'+i,type:'std.request.constraint',attrs:{request:[ref('context.request')],target:[ref('context.target')],concept:[literal(c.concept)],operator:[literal('eq')],polarity:[literal('positive')],character:[literal('requirement')],value:[string(c.value)]}});
 const graph=serializeRequestGraph({request:'context.request',nodes});if(!graph.ok)return null;
 const note=other?'I applied the previous change to the other '+selected.object.kind+'.':'I took the reference as the '+selected.object.kind+'.';
 return {proposal:{...proposal,candidates:[{request:'context.request',wires:graph.wires}],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-context/1',note,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.mappings[0].canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind};
}
