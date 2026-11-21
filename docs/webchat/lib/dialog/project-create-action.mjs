import {World,parse,quote,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import {groundMention} from './lexical-grounding.mjs?v=9b0bfd03a3';
import POLICY from '../../worlds/app.project/creation-policy-source.mjs?v=07639399d8';
import SCHEMA from '../../worlds/app.project/creation-schema-source.mjs?v=11101d9d84';
import {executionPolicyWorld} from './execution-policy.mjs?v=88bdf143f7';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=ad9d1579e4';
import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=1d1edb19b2';
import {budget} from './budget.mjs?v=d42dc656e7';
import {observeGroundedProjection,projectGroundedRequest} from './grounded-projection.mjs?v=5dca2227e3';
import {positiveCardinalProof} from './key-reader-value-proof.mjs?v=6b91502af8';
import {compileObservedChoice} from './observed-choice.mjs?v=2a2b4c3e8a';

const field=(fact,key)=>str(fact.attrs[key]?.[0]);
let loaded;
export const inspectCreationPolicy=()=>({policy:POLICY,schema:SCHEMA,loaded:!!loaded});
function creationPolicy(source){
 if(source===POLICY&&loaded)return loaded;
 const world=new World({library:{'app.creation':SCHEMA}});
 if(!world.tell(source).ok)throw Error('invalid-creation-policy');
 // Retention limits are declared facts (creation-policy.sop app.creation.limits); a policy without exactly one is invalid.
 const limits=world.ofType('app.creation.limits');
 if(limits.length!==1)throw Error('invalid-creation-policy-limits');
 const config={world,retained:Number(field(limits[0],'alternatives')),batch:Number(field(limits[0],'batch')),lemma:Number(field(limits[0],'lemma'))};
 if(source===POLICY)loaded=config;
 return config;
}
const valueKeys=new Set(['key','value','value_span','phase','operator','polarity','character']);

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

// A stated kind word is grounded by the declared std.ground policy: exact identity,
// spelling repair and the kind relations it follows. Without a word, the reader's
// family and type rank the constructors.
async function groundConstructors({world,retained:retainedLimit,lemma:lemmaLimit},choices,lexical,readType,knowledge){
 if(lexical.length>lemmaLimit)return {options:[],limit:{lemma:lemmaLimit,length:lexical.length}};
 const candidates=choices.filter(choice=>{budget.tick('creation.rank');return choice.mapping.lemma.length<=lemmaLimit;});
 if(!candidates.length)return {options:[]};
 const decision=await groundMention(world,'app.creation',lexical,candidates.map(({mapping})=>({lemma:mapping.lemma,
  measures:{otherType:Number(mapping.type!==readType)}})),knowledge);
 if(decision.selected===undefined)return {options:[]};
 const ties=new Set([decision.selected,...decision.ties]),used=new Set(),options=[],equivalent=[];
 for(const index of [decision.selected,...decision.alternatives]){
  const choice=candidates[index],canonical=choice.mapping.canonical,evidence=decision.evidence.get(index);
  if(used.has(canonical))continue;
  used.add(canonical);
  const ranked={...choice,distance:evidence.cost,route:evidence.route,path:evidence.path,why:evidence.route+(evidence.path.length?' '+evidence.path.join(' '):'')+' '+evidence.cost};
  options.push(ranked);
  if(ties.has(index))equivalent.push(ranked);
  if(options.length===retainedLimit)break;
 }
 return {options,equivalent,trace:{input:decision.input,sop:decision.sop}};
}

// Without a kind word only the reader family's own constructor can be created ("add a node" in a
// diagram). A family whose kinds all differ from it (a drawing of any catalog kind) has no default:
// ranking every kind by criteria that cannot tell two kinds apart would pick the first in catalog
// order, so nothing is created and the request stays honestly unresolved.
function rankConstructors({world,retained:retainedLimit,batch:choiceBatchLimit},choices,readType,family){
 const candidates=[];
 for(const choice of choices){
  budget.tick('creation.rank');
  const mapping=choice.mapping;
  if(mapping.type!==readType||!family||mapping.canonical!==family)continue;
  candidates.push({...choice,distance:0,otherType:false});
 }
 if(!candidates.length)return {options:[]};
 let options=[],equivalent=[],trace;
 for(let offset=0;offset<candidates.length;offset+=choiceBatchLimit-retainedLimit){
  budget.tick('creation.rank.batch');
  const batch=[...options,...candidates.slice(offset,offset+choiceBatchLimit-retainedLimit)];
  trace=compileObservedChoice(world,'app.creation',batch.map(({distance,otherType})=>({
   distance,otherType:Number(otherType),
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
// The evidence of a non-exact grounding, stated in the reply: the declared relation path the policy
// followed or the spelling repair it admitted. An inflection step alone needs no explanation.
const stepPhrase={lemma:'a form of',is_a:'a kind of',kind_of:'a kind of'};
function groundingReason(mention,choice){
 if(choice.route==='spelling')return ' (a close spelling)';
 if(choice.route!=='knowledge'||!choice.path?.length)return '';
 const steps=choice.path.map(step=>{const cut=step.indexOf(':');return {relation:step.slice(0,cut),to:step.slice(cut+1)};});
 if(steps.every(step=>step.relation==='lemma'))return null;
 let from=mention;
 return ': '+steps.map(({relation,to})=>{const phrase=`${JSON.stringify(from)} is ${stepPhrase[relation.split('.')[0]]??relation} ${JSON.stringify(to)}`;from=to;return phrase;}).join(', ');
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
 const cardinal=positiveCardinalProof(target.count_span);
 const countRange=cardinal&&(target.count===undefined||target.count===cardinal.value)?evidence(['target','count_span'],target.count_span):null;
 const conditions=roleEvidence(r,registry,readerArea,evidence).filter(({concept,range})=>
  !(countRange&&concept==='count'&&range?.[0]===countRange[0]&&range?.[1]===countRange[1]));
 const kindRange=target.kind?evidence(['target','kind_span'],target.kind):null;
 if(target.kind&&!kindRange||target.name&&!evidence(['target','name_span'],target.name))return null;
 const lexicalView=resolveRoles(config.world,target,kindRange,conditions,[]);
 if(!lexicalView||lexicalView.ofType('app.creation.checked').length!==conditions.length)return null;
 const lexicalChoices=lexicalView.ofType('app.creation.lexical');
 if(lexicalChoices.length>1)return null;
 const lexical=lexicalChoices.length?field(lexicalChoices[0],'value'):undefined;
 const family=bindings.families?.find(f=>f.area===readerArea&&f.type===target.type)?.canonical;
 const {options,equivalent,trace}=lexical?await groundConstructors(config,choices,lexical,target.type,session.engine?.knowledge):
  rankConstructors(config,choices,target.type,family);
 if(!options.length)return null;
 const properties=propertyEvidence(bindings,readerArea,conditions);
 const shared=resolveRoles(config.world,target,kindRange,conditions,properties,options[0].operation);
 const settled=shared&&assignment(shared,conditions);
 if(!settled)return null;
 const {name,values,unapplied}=settled;
 const groundedValues=countRange?[...values,{concept:'count',token:String(cardinal.value),range:countRange,witness:'request.target.count'}]:values;

 const noteFor=choice=>{
  const others=[...new Set(equivalent.map(other=>other.mapping.lemma))].filter(lemma=>lemma!==choice.mapping.lemma);
  const ambiguity=others.length?` It could equally be ${others.join(' or ')}; you can correct it or undo.`:'';
  if(!lexical)return others.length?`I used ${choice.mapping.lemma} as the kind.${ambiguity}`:'';
  const reason=choice.distance>0?groundingReason(lexical,choice):null;
  if(reason===null)return ambiguity.trim();
  return `I took ${JSON.stringify(lexical)} as ${choice.mapping.lemma}${reason}.${ambiguity}`;
 };
 const candidates=equivalent.flatMap(choice=>{
  if(choice!==options[0]){
   const alternative=resolveRoles(config.world,target,kindRange,conditions,properties,choice.operation);
   if(!alternative||JSON.stringify(assignment(alternative,conditions))!==JSON.stringify(settled))return [];
  }
  const graph=projectGroundedRequest({profile:'creation',act:r.act,mood:r.mood,kind:choice.mapping.canonical,
   text:raw.source.text,name,values:groundedValues,witness:choice.mapping.sourceWire??choice.operation.id});
  if(graph)observeGroundedProjection(session,graph.projection);
  return graph?[{...graph,creationNote:noteFor(choice)}]:[];
 });
 if(!candidates.length)return null;
 if(!countRange&&(target.count!==undefined&&target.count!==1||target.count_span))unapplied.push('the requested object count');
 // Every other target mention the reader anchored and the creation did not use is disclosed
 // ("draw a lake over that background": "background" read as a name with no name to give).
 for(const [key,value] of Object.entries(r.target))if(key.endsWith('_span')&&!['kind_span','count_span'].includes(key)&&
  !(key==='name_span'&&r.target.name!==undefined)&&evidence(['target',key],value))unapplied.push(JSON.stringify(value));
 const note=candidates[0].creationNote;
 return {...proposal,candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-creation/1',note,projections:candidates.map(candidate=>candidate.projection),unapplied,...(name?{requestedName:name}:{}),alternatives:options.map(choice=>({
   canonical:choice.mapping.canonical,lemma:choice.mapping.lemma,cost:choice.distance,why:choice.why,
  })),decision:{input:trace.input,sop:trace.sop},unresolved:proposal.failures}};
}
