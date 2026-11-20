import {World,quote,serialize} from '../vendor/sopworld/sopworld.mjs?v=5221d62911';
import {groundMention} from './lexical-grounding.mjs?v=19b4df96ee';
import {createAreaHost,NATIVE_AREAS} from './app-reader-context.mjs?v=c12a1b8eb7';
import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=a1e925e0c7';
import POLICY from '../../worlds/app.project/query-reading-policy-source.mjs?v=2a90b91449';
import {detachGroundedRequest} from './grounded-projection.mjs?v=d72b5b2594';
import GROUNDED_SCHEMA from '../../worlds/app.project/grounded-projection-schema-source.mjs?v=b6d275f29d';
import SCHEMA from '../../worlds/app.project/query-reading-schema-source.mjs?v=2d9e000e63';
import {budget} from './budget.mjs?v=00bce6e369';
import {writeReaderSource} from './reader-source.mjs?v=f5f7a86d5f';

const kind='app.query.read';
const atom=value=>typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)?value:undefined;
const row=(id,type,fields)=>({id,type,attrs:Object.fromEntries(Object.entries(fields)
 .filter(([,value])=>value!==undefined).map(([key,value])=>[key,[value]]))});
let base;

export const inspectQueryPolicy=()=>({schema:SCHEMA,policy:POLICY,loaded:!!base});

function queryPolicy(){
 if(!base){
  const world=new World({library:{[kind]:SCHEMA,'app.grounded':GROUNDED_SCHEMA}});
  world.load(POLICY);
  base=world;
 }
 return base;
}

function anchors(raw){
 const source=Array.from(raw.source.text);
 return (path,value)=>{
  if(typeof value!=='string'||!value)return false;
  const key=JSON.stringify(['requests','0',...path]);
  const ranges=(raw.ranges??[]).filter(item=>JSON.stringify(item.path)===key);
  const range=ranges[0]?.range;
  return ranges.length===1&&Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)&&
   range[0]>=0&&range[1]<=source.length&&range[0]<range[1]&&source.slice(...range).join('')===value?range:null;
 };
}

export async function projectQueryAction(proposal,session,{view,bindings}={}){
 const raw=proposal?.raw,request=raw?.requests?.[0],target=request?.target,
  area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||
  !atom(request?.question?.ask)||typeof raw.source?.text!=='string'||!Array.isArray(request.constraints)||request.constraints.length>1||
  target?.name||target?.name_span||target?.description_span)return null;
 const grounded=anchors(raw);
 const observedTarget=grounded(['target','kind_span'],target?.kind_span);
 const observations=(raw.unresolved??[]).flatMap(({reason,detail},index)=>{
  const head=detail?.head;
  if(reason!=='provider-unresolved'||!head||!Array.isArray(head.ranges)||typeof head.present!=='boolean')return [];
  const subject=head.property??head.path;
  if(typeof subject!=='string')return [];
  return [row('observed.gap.'+index,kind+'.headObservation',{subject:quote(subject),role:head.property?'filter':'global',
   reason:atom(detail.reason),present:String(head.present),ranges:String(head.ranges.length)})];
 });
 const coverage=[row('observed.coverage',kind+'.coverage',{targetAnchored:String(!!observedTarget),
  referenceMarked:String(!!request.turn||target?.fill==='context'),isolated:String(!proposal.composition)}),...observations];
 const coverageWorld=queryPolicy().fork(),coverageSop=serialize(coverage);
 if(!coverageWorld.tell(coverageSop,{factsOnly:true}).ok)return null;
 const limitations=coverageWorld.ofType(kind+'.limitation');
 if(limitations.length){
  const proof={input:coverageSop,sop:serialize(limitations),rules:limitations.map(observation=>observation.meta.via)};
  try{session.engine?.onWorldActivity?.({nodeIds:['component:reader','component:library','execution:query-policy'],phase:'stage',
   operation:'app.query.read',label:'Record incomplete question evidence',wires:proof.input+'\n'+proof.sop});}catch{/* Observations are optional. */}
  const strategies=coverageWorld.ofType(kind+'.reconsider').sort((a,b)=>Number(a.attrs.rank[0])-Number(b.attrs.rank[0]))
   .map(observation=>observation.attrs.profile[0]);
  return {...proposal,interpretation:{profile:'declared-query/1',limitation:limitations.map(observation=>observation.attrs.reason[0]),
   proof,reconsider:strategies.length>0,strategies,unresolved:proposal.failures??[]}};
 }
 const anchored=anchors(raw);
 const noun=target?.kind;
 const trigger=anchored(['trigger'],request.trigger),kindRange=anchored(['target','kind_span'],target?.kind_span);
 if(!trigger||!kindRange||noun!==target.kind_span||noun.length>64)return null;
 const targetCue=trigger[0]<=kindRange[0]&&trigger[1]>=kindRange[1];
 const property=key=>{
  const meanings=new Set((bindings.properties??[]).filter(binding=>binding.area===readerArea&&
   (binding.key===key||binding.canonical===key)).map(binding=>binding.canonical));
  return meanings.size===1?[...meanings][0]:undefined;
 };
 const asked=request.question.asked_key;
 const concept=anchored(['question','asked_key_span'],asked)?atom(property(asked)):undefined;
 if(asked!==undefined&&!concept)return null;
 const facts=[row('observed.question',kind+'.question',{act:atom(request.act),mood:atom(request.mood),head:request.question.ask,concept,targetCue:String(targetCue)})];
 const [condition]=request.constraints;
 if(condition){
  const propertyConcept=atom(property(condition.key));
  if(!propertyConcept||condition.value!==condition.value_span||!anchored(['constraints','0','value_span'],condition.value)||
     Object.keys(condition).some(key=>!['key','value','value_span','phase','operator','character','polarity','scope'].includes(key)))return null;
  facts.push(row('observed.condition',kind+'.condition',{concept:propertyConcept,value:quote(condition.value),phase:atom(condition.phase),
   operator:atom(condition.operator),polarity:atom(condition.polarity),character:atom(condition.character),scope:atom(condition.scope??'unmarked')}));
 }
 const world=queryPolicy().fork(),evidence=serialize(facts);
 if(!world.tell(evidence,{factsOnly:true}).ok)return null;
 const operations=world.ofType(kind+'.operation'),selectors=world.ofType(kind+'.selector');
 if(operations.length!==1||selectors.length!==request.constraints.length)return null;
 const state=session.isession.state[area.world];
 if(!state)return null;
 const host=await createAreaHost(area,{state:structuredClone(state),instanceId:'query-reading',loader:session.engine?.loader,knowledge:session.engine?.knowledge});
 const choices=new Map();
 for(const {mapping,operation}of nativeCreationCandidates(bindings,host.bindings(),readerArea)){
  budget.tick('query-reading.kinds');
  if(!operation.params.kind?.enum?.includes(mapping.lemma)||mapping.lemma.length>64)continue;
  choices.set(JSON.stringify([mapping.canonical,mapping.lemma]),{canonical:mapping.canonical,lemma:mapping.lemma,otherType:Number(mapping.type!==target.type)});
 }
 const candidates=[...choices.values()];
 if(!candidates.length)return null;
 const decision=await groundMention(world,'app.query.kind',noun,candidates.map(({lemma,otherType})=>({lemma,measures:{otherType}})),session.engine?.knowledge);
 if(decision.selected===undefined)return null;
 for(const [index,{cost}] of decision.evidence)if(cost!==undefined)candidates[index].distance=cost;
 const selected=candidates[decision.selected],alternatives=decision.alternatives.map(index=>candidates[index]);
 const grounding=serialize([row('observed.ground',kind+'.ground',{text:quote(raw.source.text),kind:selected.canonical})]);
 if(!world.tell(grounding,{factsOnly:true}).ok)return null;
 const result=detachGroundedRequest(world,evidence+'\n'+grounding,4+selectors.length);
 if(!result)return null;
 const projection=serialize([...operations,...selectors]);
 try{session.engine?.onWorldActivity?.({nodeIds:['component:reader','component:library','execution:query-policy'],phase:'stage',operation:'app.query.read',
  label:'Ground the model’s question projection',wires:[evidence,projection,decision.input,decision.sop,grounding,result.wires].join('\n'),support:result.projection.support,selected,alternatives});}
 catch{/* Inspection cannot change the reading. */}
 return {...proposal,candidates:[result],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-query/1',note:selected.distance||decision.ties.length?'I interpreted '+JSON.stringify(noun)+' as '+selected.lemma+'.':'',
   selected,alternatives,decision:{input:decision.input,sop:decision.sop},evidence,projection,unresolved:proposal.failures??[]}};
}


function readingObservation(proposal){
 const {raw,sourceObservation}=proposal,request=raw.requests[0],target=request.target??{},anchored=anchors(raw);
 const targetRange=anchored(['target','kind_span'],target.kind_span);
 const filter=request.constraints[0];
 const filterRange=filter&&anchored(['constraints','0','value_span'],filter.value_span);
 const trigger=anchored(['trigger'],request.trigger);
 const positives=(raw.unresolved??[]).filter(({reason,detail})=>reason==='provider-unresolved'&&
  detail?.reason==='presence-span-inconsistent'&&detail.head?.present===true&&
  detail.head.ranges?.length===0&&typeof detail.head.property==='string');
 const literal=value=>typeof value==='string'?quote(value):undefined;
 const index=value=>Number.isSafeInteger(value)?String(value):undefined;
 return {
  source:literal(raw.source.text),act:atom(request.act),mood:atom(request.mood),head:atom(request.question?.ask),
  askedKey:literal(request.question?.asked_key??''),family:literal(target.type),quantifier:literal(target.quantifier??''),
  triggerStart:index(trigger?.[0]),triggerEnd:index(trigger?.[1]),
  referenceMarked:String(!!request.turn||target.fill==='context'),
  scope:literal(sourceObservation?.scope),instance:literal(sourceObservation?.instance),revision:literal(sourceObservation?.revision),
  targetText:targetRange&&target.kind===target.kind_span?literal(target.kind):undefined,
  targetStart:index(targetRange?.[0]),targetEnd:index(targetRange?.[1]),
  filterKey:literal(filter?.key),filterValue:filterRange&&filter.value===filter.value_span?literal(filter.value):undefined,
  filterStart:index(filterRange?.[0]),filterEnd:index(filterRange?.[1]),
  filterOperator:atom(filter?.operator),filterCharacter:atom(filter?.character),filterPolarity:atom(filter?.polarity),
  filterCount:String(request.constraints.length),filterPhase:atom(filter?.phase),filterScope:filter?atom(filter.scope??'unmarked'):undefined,
  filterGaps:String(positives.length),filterGap:positives.length===1?literal(positives[0].detail.head.property):undefined,
 };
}

const readFor={literal:'proposeLiteral',independent:'proposeIndependent'};

function addWitnessedTarget(primary,alternate){
 const request=primary.raw.requests[0],target=alternate.raw.requests[0].target;
 const key=['requests','0','target','kind_span'];
 const range=anchors(alternate.raw)(['target','kind_span'],target.kind_span);
 return {...primary,selectionScore:alternate.selectionScore,raw:{...primary.raw,
  requests:[{...request,target:{...request.target,kind:target.kind,kind_span:target.kind_span}}],
  ranges:[...primary.raw.ranges,{path:key,range}]}};
}

export async function recoverQueryProjection(projected,session,{view,bindings,provider}={}){
 if(!projected?.interpretation?.reconsider)return projected;
 const area=NATIVE_AREAS[view],state=session.isession.state[area.world];
 const readings=[projected.raw],failures=[projected.failures];
 const retain=()=>readings.length===1?projected:{...projected,interpretation:{...projected.interpretation,retry:{readings,failures}}};
 for(const profile of projected.interpretation.strategies){
  let alternate;
  try{alternate=await provider?.[readFor[profile]]?.(writeReaderSource(projected.raw.source.text));}catch{continue;}
  if(session.isession.state[area.world]!==state)return retain();
  if(!alternate)continue;
  readings.push(alternate.raw);failures.push(alternate.failures);
  if(!alternate.raw?.requests?.[0]||alternate.raw.requestCount!==1)continue;
  const world=queryPolicy().fork();
  const input=serialize([
   row('query.primary',kind+'.recoveryReading',{role:'primary',...readingObservation(projected)}),
   row('query.independent',kind+'.recoveryReading',{role:profile,...readingObservation(alternate)}),
  ]);
  if(!world.tell(input,{factsOnly:true}).ok)continue;
  const results=world.ofType(kind+'.recovery'),pairs=world.ofType(kind+'.readingPair');
  if(results.length!==1||pairs.length!==1)continue;
  const candidate=profile==='literal'?addWitnessedTarget(projected,alternate):alternate;
  const independent=await projectQueryAction(candidate,session,{view,bindings});
  if(session.isession.state[area.world]!==state)return retain();
  if(!independent?.candidates?.length||independent.interpretation?.limitation)continue;
  const recovery={readings,failures,input,sop:serialize([...pairs,...results]),rule:results[0].meta.via,pairRule:pairs[0].meta.via,profile};
  try{session.engine?.onWorldActivity?.({nodeIds:['component:reader','component:library','execution:query-policy'],phase:'stage',
   operation:'app.query.read',label:'Verify an independent reading of the current question',
   wires:recovery.input+'\n'+recovery.sop});}catch{/* Observations are optional. */}
  return {...independent,interpretation:{...independent.interpretation,retry:recovery,unresolved:failures.flat()}};
 }
 return retain();
}
