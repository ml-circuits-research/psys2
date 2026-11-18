import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=de223646d6';
// Compose a reversible creation from model-declared roles and actual native constructor declarations.
import {serializeRequestGraph,editCost} from '../vendor/sopworld/sopworld.mjs?v=f5d53a8da9';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=6e3d5a17a2';
import {DRAWING_PROPERTY_BINDINGS} from '../../worlds/art.draw/property-host.mjs?v=45ec70afe7';
const kindConcepts=new Set(['kind','shape']);
export async function projectCreateAction(proposal,session,{bindings,registry,view}={}) {
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view];
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||r?.act!=='make'||r.mood!=='do'||r.target?.mode!=='new'||!Array.isArray(r.constraints)||r.constraints.some(c=>c.polarity==='negative'))return null;
 const chars=Array.from(raw.source.text),evidence=(path,value)=>(raw.ranges??[]).some(a=>JSON.stringify(a.path)===JSON.stringify(['requests','0',...path])&&chars.slice(...a.range).join('')===value);
 if(typeof r.trigger!=='string'||!evidence(['trigger'],r.trigger))return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'creation-'+globalThis.crypto.randomUUID()}),operations=host.bindings();
 const choices=nativeCreationCandidates(bindings,operations,area.area);
 let lexical=r.target.kind,kindCondition=-1;
 if(lexical&&!evidence(['target','kind_span'],r.target.kind_span??lexical))return null;
 if(!lexical)for(const [i,c]of r.constraints.entries())if(kindConcepts.has(registry[area.area+'.'+c.key]?.concept)&&c.value===c.value_span&&evidence(['constraints',String(i),'value_span'],c.value)){lexical=c.value;kindCondition=i;break;}
 let ranked;
 if(lexical){
  if(typeof lexical!=='string'||lexical.length>64)return null;
  // Reuse the library's bounded lexical edit ranking, with no copied vocabulary.
  ranked=choices.filter(c=>c.mapping.lemma.length<=64).map(c=>({...c,cost:editCost(lexical.toLowerCase(),c.mapping.lemma.toLowerCase(),2)})).filter(c=>Number.isFinite(c.cost)).sort((a,b)=>a.cost-b.cost||Number(b.mapping.type===r.target.type)-Number(a.mapping.type===r.target.type));
 }else {
  ranked=choices.filter(c=>c.mapping.type===r.target.type).map(c=>({...c,cost:0}));
  const family=bindings.families?.find(f=>f.area===area.area&&f.type===r.target.type);
  ranked.sort((a,b)=>Number(b.mapping.canonical===family?.canonical)-Number(a.mapping.canonical===family?.canonical));
 }
 const chosen=ranked[0];if(!chosen)return null;
 const canonical=chosen.mapping.canonical,values=[],unapplied=[];
 if(r.target.count!==undefined&&r.target.count!==1||r.target.count_span)unapplied.push('the requested object count');
 for(const [i,c]of r.constraints.entries()) {
  if(i===kindCondition)continue;
  const spec=registry[area.area+'.'+c.key];
  if(Object.keys(c).some(k=>!['key','value','value_span','phase','operator','polarity','character'].includes(k))){unapplied.push((spec?.concept??c.key)+' '+c.value);continue;}
  if(c.operator!=='eq'||c.phase!=='result'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'||c.value!==c.value_span||!evidence(['constraints',String(i),'value_span'],c.value))return null;
  let concept=bindings.properties.find(p=>p.area===area.area&&p.key===c.key)?.canonical;
  if(!concept)concept=DRAWING_PROPERTY_BINDINGS.find(p=>p.sourceType===chosen.operation.on&&p.concept===spec?.concept)?.concept;
  if(concept)values.push({concept,value:c.value});else unapplied.push((spec?.concept??c.key)+' '+c.value);
 }
 const literal=value=>({kind:'literal',value}),ref=value=>({kind:'ref',value}),string=value=>({kind:'string',value});
 const target={request:[ref('creation.request')],mode:[literal('new')],kind:[literal(canonical)]};
 if(r.target.name){if(!evidence(['target','name_span'],r.target.name_span??r.target.name))return null;target.name=[string(r.target.name)];}
 const nodes=[{id:'creation.source',type:'std.request.source',attrs:{text:[string(raw.source.text)]}},
  {id:'creation.request',type:'std.request',attrs:{act:[literal('make')],mood:[literal('do')],source:[ref('creation.source')],...(values.length===1?{root:[ref('creation.result.0')]}:{})}},
  {id:'creation.target',type:'std.request.target',attrs:target}];
 for(const [i,c]of values.entries())nodes.push({id:'creation.result.'+i,type:'std.request.constraint',attrs:{request:[ref('creation.request')],target:[ref('creation.target')],concept:[literal(c.concept)],operator:[literal('eq')],polarity:[literal('positive')],character:[literal('requirement')],value:[string(c.value)]}});
 const graph=serializeRequestGraph({request:'creation.request',nodes});if(!graph.ok)return null;
 const note=chosen.cost>0?`I took ${JSON.stringify(lexical)} as ${chosen.mapping.lemma}.`:!lexical?`I used ${chosen.mapping.lemma} as the kind.`:'';
 return {...proposal,candidates:[{request:'creation.request',wires:graph.wires}],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-creation/1',note,unapplied,alternatives:ranked.slice(0,5).map(c=>({canonical:c.mapping.canonical,lemma:c.mapping.lemma,cost:c.cost})),unresolved:proposal.failures}};
}
