import {World,editCost,parse,quote,str} from '../vendor/sopworld/sopworld.mjs?v=ac74fb4d82';
import POLICY from '../../worlds/app.project/creation-policy-source.mjs?v=a166e47fda';
import SCHEMA from '../../worlds/app.project/creation-schema-source.mjs?v=6f8e06c701';
import {executionPolicyWorld} from './execution-policy.mjs?v=3652fc9f1f';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=21796a4665';
import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=5941d8843a';
import {budget} from './budget.mjs?v=00bce6e369';
import {observeGroundedProjection,projectGroundedRequest} from './grounded-projection.mjs?v=9cff47c5cf';
import {compileObservedChoice} from './observed-choice.mjs?v=f90a7e290a';

const field=(fact,key)=>str(fact.attrs[key]?.[0]);
let loaded;
export const inspectCreationPolicy=()=>({policy:POLICY,schema:SCHEMA,loaded:!!loaded});
function creationPolicy(){
 if(loaded)return loaded;
 const world=new World({library:{'app.creation':SCHEMA}});
 if(!world.tell(POLICY).ok)throw Error('invalid-creation-policy');
 const rows=world.ofType('app.creation.role'),[grounding]=world.ofType('app.creation.grounding');
 const roles=new Map(rows.map(row=>[field(row,'concept'),field(row,'role')]));
 const editCeiling=Number(field(grounding,'editCeiling'));
 const nameParameter=field(rows.find(row=>field(row,'role')==='name'),'parameter');
 loaded={world,roles,editCeiling,nameParameter};
 return loaded;
}
const valueKeys=new Set(['key','value','value_span','phase','operator','polarity','character']);
const retainedLimit=5;
const choiceBatchLimit=200;

function sourceEvidence(raw){
 const chars=Array.from(raw.source.text),ranges=raw.ranges??[];
 return (path,value)=>{
  if(typeof value!=='string'||!value)return null;
  const key=JSON.stringify(['requests','0',...path]);
  const matches=ranges.filter(row=>JSON.stringify(row.path)===key);
  if(matches.length!==1)return null;
  const range=matches[0].range;
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<0||range[1]>chars.length||range[1]<=range[0])return null;
  return chars.slice(...range).join('')===value?range:null;
 };
}
const coextensive=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];

function rankConstructors(choices,lexical,readType,family){
 const {world,editCeiling}=creationPolicy();
 if(lexical&&lexical.length>64)return {options:[]};
 const candidates=[];
 for(const choice of choices){
  budget.tick('creation.rank');
  const mapping=choice.mapping;
  if(lexical?mapping.lemma.length>64:mapping.type!==readType)continue;
  const distance=lexical?editCost(lexical.toLowerCase(),mapping.lemma.toLowerCase(),editCeiling):0;
  if(Number.isFinite(distance))candidates.push({...choice,distance,otherType:mapping.type!==readType,otherFamily:!lexical&&mapping.canonical!==family});
 }
 let options=[],equivalent=[],trace;
 for(let offset=0;offset<candidates.length;offset+=choiceBatchLimit-retainedLimit){
  budget.tick('creation.rank.batch');
  const batch=[...options,...candidates.slice(offset,offset+choiceBatchLimit-retainedLimit)];
  trace=compileObservedChoice(world,'app.creation',batch.map(({distance,otherType,otherFamily})=>({
   distance,otherType:Number(otherType),otherFamily:Number(otherFamily),
  })));
  if(trace.selected===undefined)return {options:[]};
  const used=new Set(),ties=new Set([trace.selected,...trace.ties]);
  const assessments=new Map(parse(trace.sop).filter(row=>row.type==='std.choice.assessment')
   .map(row=>[row.attrs.option[0],field(row,'why')]));
  options=[];
  equivalent=[];
  for(const index of [trace.selected,...trace.alternatives]){
   const choice=batch[index],canonical=choice.mapping.canonical;
   if(used.has(canonical))continue;
   used.add(canonical);
   choice.why=assessments.get('$observed.option.'+index);
   options.push(choice);
   if(ties.has(index))equivalent.push(choice);
   if(options.length===retainedLimit)break;
  }
 }
 return {options,equivalent,trace};
}
export async function projectCreateAction(proposal,session,{bindings,registry,view}={}){
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view];
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||r?.act!=='make'||r.mood!=='do'||r.target?.mode!=='new'||typeof raw.source?.text!=='string'||!Array.isArray(r.constraints)||r.constraints.some(c=>c.polarity==='negative'))return null;
 const evidence=sourceEvidence(raw);
 if(!evidence(['trigger'],r.trigger))return null;
 const native=session.isession.state[area.world];
 if(!native)return null;
 const readerArea=bindings.readerAreaByView?.[view]??area.area;
 const host=await area.create({state:native,instanceId:'creation-'+globalThis.crypto.randomUUID()});
 const choices=nativeCreationCandidates(bindings,host.bindings(),readerArea);
 const {roles,nameParameter}=creationPolicy();
 const recognized=r.constraints.map((entry,index)=>{
  const concept=registry[readerArea+'.'+entry.key]?.concept;
  const range=entry.value===entry.value_span?evidence(['constraints',String(index),'value_span'],entry.value):null;
  return {entry,concept,range,role:roles.get(concept)};
 });
 let lexical=r.target.kind,kindRange=null;
 if(lexical){
  kindRange=evidence(['target','kind_span'],r.target.kind_span??lexical);
  if(!kindRange)return null;
 }else{
  const kind=recognized.find(row=>row.role==='kind'&&row.range);
  lexical=kind?.entry.value;
  kindRange=kind?.range;
 }
 let name=r.target.name;
 if(name&&!evidence(['target','name_span'],r.target.name_span??name))return null;
 const family=bindings.families?.find(f=>f.area===readerArea&&f.type===r.target.type)?.canonical;
 const {options,equivalent,trace}=rankConstructors(choices,lexical,r.target.type,family);
 const chosen=options[0];
 if(!chosen)return null;
 const values=[],unapplied=[];
 const acceptsName=!!chosen.operation.params[nameParameter]&&!chosen.operation.knowledgeInputs?.some(input=>input.argument===nameParameter);
 if(r.target.count!==undefined&&r.target.count!==1||r.target.count_span)unapplied.push('the requested object count');
 for(const {entry,concept,range,role} of recognized){
  if(Object.keys(entry).some(k=>!valueKeys.has(k))){unapplied.push((concept??entry.key)+' '+entry.value);continue;}
  if(entry.operator!=='eq'||entry.phase!=='result'||entry.polarity!=='positive'||entry.character!=='requirement'||!range)return null;
  if((role==='kind'||role==='coextensive')&&coextensive(kindRange,range))continue;
  if(role==='name'&&acceptsName&&(!name||name===entry.value)){name=entry.value;continue;}
  const canonical=bindings.properties.find(p=>p.area===readerArea&&p.key===entry.key)?.canonical;
  const own=executionPolicyWorld().ofType('app.execution.observedProperty').find(p=>field(p,'sourceType')===chosen.operation.on&&field(p,'concept')===concept);
  if(canonical||own)values.push({concept:canonical??concept,token:quote(entry.value),range,witness:entry.key});
  else unapplied.push((concept??entry.key)+' '+entry.value);
 }
 const noteFor=choice=>choice.distance>0?`I took ${JSON.stringify(lexical)} as ${choice.mapping.lemma}.`:!lexical?`I used ${choice.mapping.lemma} as the kind.`:'';
 const candidates=equivalent.flatMap(choice=>{
  const graph=projectGroundedRequest({profile:'creation',act:r.act,mood:r.mood,kind:choice.mapping.canonical,
   text:raw.source.text,name,values,witness:choice.mapping.sourceWire??choice.operation.id});
  if(graph)observeGroundedProjection(session,graph.projection);
  return graph?[{...graph,creationNote:noteFor(choice)}]:[];
 });
 if(!candidates.length)return null;
 const note=candidates[0].creationNote;
 return {...proposal,candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-creation/1',note,projections:candidates.map(candidate=>candidate.projection),unapplied,...(name&&acceptsName?{requestedName:name}:{}),alternatives:options.map(choice=>({
   canonical:choice.mapping.canonical,lemma:choice.mapping.lemma,cost:choice.distance,why:choice.why,
  })),decision:{input:trace.input,sop:trace.sop},unresolved:proposal.failures}};
}
