import {World,editCost,parse,quote,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=3a48344175';
import POLICY from '../../worlds/app.project/creation-policy-source.mjs?v=874b0f8e6d';
import SCHEMA from '../../worlds/app.project/creation-schema-source.mjs?v=9d9c428cd6';
import {executionPolicyWorld} from './execution-policy.mjs?v=0b0a918c63';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=3b73627e71';
import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=f6d6f43960';
import {budget} from './budget.mjs?v=00bce6e369';
import {observeGroundedProjection,projectGroundedRequest} from './grounded-projection.mjs?v=6b5fddabd8';
import {compileObservedChoice} from './observed-choice.mjs?v=7c29d210ff';

const field=(fact,key)=>str(fact.attrs[key]?.[0]);
let loaded;
export const inspectCreationPolicy=()=>({policy:POLICY,schema:SCHEMA,loaded:!!loaded});
function creationPolicy(source){
 if(source===POLICY&&loaded)return loaded;
 const world=new World({library:{'app.creation':SCHEMA}});
 if(!world.tell(source).ok)throw Error('invalid-creation-policy');
 const [grounding]=world.ofType('app.creation.grounding');
 const config={world,editCeiling:Number(field(grounding,'editCeiling'))};
 if(source===POLICY)loaded=config;
 return config;
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

function rankConstructors({world,editCeiling},choices,lexical,readType,family){
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
const textToken=value=>typeof value==='string'?quote(value):undefined;
const spanTokens=range=>range?{start:String(range[0]),end:String(range[1])}:{};
const row=(id,type,fields)=>({id,type:'app.creation.'+type,attrs:Object.fromEntries(
 Object.entries(fields).filter(([,value])=>value!==undefined).map(([key,value])=>[key,[value]]))});
const conditionId=index=>'creation.entry.'+index;

function roleEvidence(request,registry,readerArea,span){
 return request.constraints.map((entry,index)=>{
  const concept=registry[readerArea+'.'+entry.key]?.concept;
  const range=entry.value===entry.value_span?span(['constraints',String(index),'value_span'],entry.value):null;
  return {entry,concept,range};
 });
}
function resolveRoles(base, target, kindRange, conditions, properties, operation){
 const view=base.fork(),facts=[row('creation.input','input',{
  kind:textToken(target.kind),name:textToken(target.name),...spanTokens(kindRange),on:textToken(operation?.on),
 })];
 for(const [index,{entry,concept,range}]of conditions.entries()){
  facts.push(row(conditionId(index),'entry',{key:textToken(entry.key),concept,value:textToken(entry.value),
   phase:textToken(entry.phase),operator:textToken(entry.operator),character:textToken(entry.character),polarity:textToken(entry.polarity),
   normal:String(Object.keys(entry).every(key=>valueKeys.has(key))),...spanTokens(range),
  }));
 }
 if(operation){
  const knowledge=new Set((operation.knowledgeInputs??[]).map(input=>input.argument));
  for(const name of Object.keys(operation.params))facts.push(row('creation.parameter.'+facts.length,'parameter',
   {name:quote(name),knowledge:String(knowledge.has(name))}));
  for(const property of properties)facts.push(row('creation.property.'+facts.length,'property',{
   key:quote(property.key),canonical:quote(property.canonical),on:quote(property.sourceType),parameter:quote(property.parameter),
  }));
 }
 if(!view.tell(serialize(facts),{factsOnly:true}).ok)return null;
 return view;
}
function propertyEvidence(bindings,readerArea,conditions){
 const observed=executionPolicyWorld().ofType('app.execution.observedProperty');
 const direct=(bindings.properties??[]).filter(row=>row.area===readerArea&&row.hostBinding?.sourceType&&row.hostBinding.parameter)
  .map(row=>({key:row.key,canonical:row.canonical,sourceType:row.hostBinding.sourceType,parameter:row.hostBinding.parameter}));
 const owned=conditions.flatMap(({entry,concept})=>observed.filter(row=>field(row,'concept')===concept).map(row=>({
  key:entry.key,canonical:concept,sourceType:field(row,'sourceType'),parameter:field(row,'parameter'),
 })));
 return [...direct,...owned];
}
function assignment(view,conditions){
 const rows=view.ofType('app.creation.disposition'),dispositions=new Map(rows.map(fact=>[fact.attrs.entry[0],fact]));
 if(dispositions.size!==rows.length||dispositions.size!==conditions.length)return null;
 const values=[],unapplied=[],names=new Set(view.ofType('app.creation.targetName').map(fact=>field(fact,'value')));
 for(const [index,{entry,concept,range}] of conditions.entries()){
  const decision=dispositions.get('$'+conditionId(index));
  if(!decision)return null;
  const action=field(decision,'action');
  if(action==='name')names.add(field(decision,'name'));
  if(action==='value')values.push({concept:field(decision,'concept'),token:quote(entry.value),range,witness:entry.key});
  if(action==='unapplied')unapplied.push((concept??entry.key)+' '+entry.value);
 }
 for(const gap of view.ofType('app.creation.nameGap'))unapplied.push('the name '+JSON.stringify(field(gap,'value')));
 if(names.size>1)return null;
 return {name:[...names][0],values,unapplied};
}
export async function projectCreateAction(proposal,session,{bindings,registry,view,policy=POLICY}={}){
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view];
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||r?.act!=='make'||r.mood!=='do'||r.target?.mode!=='new'||typeof raw.source?.text!=='string'||!Array.isArray(r.constraints))return null;
 const evidence=sourceEvidence(raw);
 if(!evidence(['trigger'],r.trigger))return null;
 const native=session.isession.state[area.world];
 if(!native)return null;
 const readerArea=bindings.readerAreaByView?.[view]??area.area;
 const host=await area.create({state:native,instanceId:'creation-'+globalThis.crypto.randomUUID()});
 const choices=nativeCreationCandidates(bindings,host.bindings(),readerArea);
 const config=creationPolicy(policy),target={...r.target,kind:r.target.kind?(r.target.kind_span??r.target.kind):undefined};
 const conditions=roleEvidence(r,registry,readerArea,evidence);
 const kindRange=target.kind?evidence(['target','kind_span'],target.kind):null;
 if(target.kind&&!kindRange||target.name&&!evidence(['target','name_span'],target.name))return null;
 const lexicalView=resolveRoles(config.world,target,kindRange,conditions,[]);
 if(!lexicalView||lexicalView.ofType('app.creation.checked').length!==conditions.length)return null;
 const lexicalChoices=lexicalView.ofType('app.creation.lexical');
 if(lexicalChoices.length>1)return null;
 const lexical=lexicalChoices.length?field(lexicalChoices[0],'value'):undefined;
 const family=bindings.families?.find(f=>f.area===readerArea&&f.type===target.type)?.canonical;
 const {options,equivalent,trace}=rankConstructors(config,choices,lexical,target.type,family);
 if(!options.length)return null;
 const properties=propertyEvidence(bindings,readerArea,conditions);
 const shared=resolveRoles(config.world,target,kindRange,conditions,properties,options[0].operation);
 const settled=shared&&assignment(shared,conditions);
 if(!settled)return null;
 const {name,values,unapplied}=settled;

 const noteFor=choice=>choice.distance>0?`I took ${JSON.stringify(lexical)} as ${choice.mapping.lemma}.`:!lexical?`I used ${choice.mapping.lemma} as the kind.`:'';
 const candidates=equivalent.flatMap(choice=>{
  if(choice!==options[0]){
   const alternative=resolveRoles(config.world,target,kindRange,conditions,properties,choice.operation);
   if(!alternative||JSON.stringify(assignment(alternative,conditions))!==JSON.stringify(settled))return [];
  }
  const graph=projectGroundedRequest({profile:'creation',act:r.act,mood:r.mood,kind:choice.mapping.canonical,
   text:raw.source.text,name,values,witness:choice.mapping.sourceWire??choice.operation.id});
  if(graph)observeGroundedProjection(session,graph.projection);
  return graph?[{...graph,creationNote:noteFor(choice)}]:[];
 });
 if(!candidates.length)return null;
 if(target.count!==undefined&&target.count!==1||target.count_span)unapplied.push('the requested object count');
 const note=candidates[0].creationNote;
 return {...proposal,candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-creation/1',note,projections:candidates.map(candidate=>candidate.projection),unapplied,...(name?{requestedName:name}:{}),alternatives:options.map(choice=>({
   canonical:choice.mapping.canonical,lemma:choice.mapping.lemma,cost:choice.distance,why:choice.why,
  })),decision:{input:trace.input,sop:trace.sop},unresolved:proposal.failures}};
}
