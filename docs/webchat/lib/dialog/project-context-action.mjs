import {nativeKindCandidates} from './native-binding-candidates.mjs?v=de223646d6';
// Bind model-declared context references to actual native objects; never inspect source words.
import {serializeRequestGraph,str} from '../vendor/sopworld/sopworld.mjs?v=7950b62b94';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=9dfde53bd1';
import {executionPolicyWorld} from './execution-policy.mjs?v=245d0e44ab';
import {readReferenceTurn,resolveObservedReference} from './reference-policy.mjs?v=32943dbf90';
import {flatRequestProjection} from './request-projection.mjs?v=aad2e14a67';
export async function projectContextAction(proposal,session,{bindings,registry,view}={}) {
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||!r?.target||r.target.kind||r.target.name)return null;
 const route=readReferenceTurn(r);if(!route)return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'context-'+globalThis.crypto.randomUUID()});
 const mappings=nativeKindCandidates(bindings).filter(mapping=>mapping.area===readerArea&&mapping.type===r.target.type);
 const resolution=resolveObservedReference(route,host.observe().objects,mappings,session.newEngineFocus?.[view]);
 if(!resolution)return null;
 const {selected,options,choice}=resolution,other=resolution.values==='previous';
 try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:reference-policy','instance:'+area.world],
  phase:'stage',label:'Rank contextual references',operation:'std.choice',sop:choice.sop,input:choice.input,
  candidates:options.map(({object,canonical})=>({id:object.id,canonical}))});}catch{/* Trace subscribers cannot change interpretation. */}
 const previous=session.newEngineLastAction?.[view],history=session.newEngineUndo??[],last=history.findLast(e=>e.area===view);
 let inherited=null,rewind=null;
 if(other){
  if(!previous||!last||!Object.keys(last.after).every(key=>JSON.stringify(session.isession.state[key])===JSON.stringify(last.after[key])))return null;
  const prior=flatRequestProjection(previous);if(!prior.ok||prior.request.act!==r.act||prior.targets.length!==1||!prior.results.length)return null;
  inherited=prior.results;rewind=last.before;
 }else if(!Array.isArray(r.constraints)||!r.constraints.length)return null;
 const canonical=selected.canonical,values=[];
 if(inherited)for(const c of inherited){if(c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||c.value===null)return null;values.push({concept:c.concept,value:c.value});}
 else for(const [index,c]of r.constraints.entries()) {
  if(c.phase!=='result'||c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'||c.value!==c.value_span||Object.keys(c).some(k=>!['key','value','value_span','phase','operator','polarity','character'].includes(k)))return null;
  const evidence=raw.ranges?.filter(a=>JSON.stringify(a.path)===JSON.stringify(['requests','0','constraints',String(index),'value_span']))??[];
  if(evidence.length!==1||Array.from(raw.source.text).slice(...evidence[0].range).join('')!==c.value)return null;
  let concept=bindings.properties.find(p=>p.area===readerArea&&p.key===c.key)?.canonical;
  if(!concept){const spec=registry[readerArea+'.'+c.key];const row=executionPolicyWorld().ofType('app.execution.observedProperty').find(p=>str(p.attrs.sourceType?.[0])===selected.object.sourceType&&str(p.attrs.concept?.[0])===spec?.concept);concept=row&&str(row.attrs.concept[0]);}
  if(!concept)return null;values.push({concept,value:c.value});
 }
 const literal=value=>({kind:'literal',value}),ref=value=>({kind:'ref',value}),string=value=>({kind:'string',value});
 const nodes=[{id:'context.source',type:'std.request.source',attrs:{text:[string(raw.source.text)]}},
  {id:'context.request',type:'std.request',attrs:{act:[literal(r.act)],mood:[literal(r.mood)],source:[ref('context.source')],...(values.length===1?{root:[ref('context.result.0')]}:{})}},
  {id:'context.target',type:'std.request.target',attrs:{request:[ref('context.request')],mode:[literal('existing')],kind:[literal(canonical)]}}];
 for(const [i,c]of values.entries())nodes.push({id:'context.result.'+i,type:'std.request.constraint',attrs:{request:[ref('context.request')],target:[ref('context.target')],concept:[literal(c.concept)],operator:[literal('eq')],polarity:[literal('positive')],character:[literal('requirement')],value:[string(c.value)]}});
 const graph=serializeRequestGraph({request:'context.request',nodes});if(!graph.ok)return null;
 const note=other?'I applied the previous change to the other '+selected.object.kind+'.':'I took the reference as the '+selected.object.kind+'.';
 return {proposal:{...proposal,candidates:[{request:'context.request',wires:graph.wires}],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-context/1',note,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind};
}
