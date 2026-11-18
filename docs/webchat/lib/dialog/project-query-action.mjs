import {World,editCost,quote,serialize} from '../vendor/sopworld/sopworld.mjs?v=3a48344175';
import {createAreaHost,NATIVE_AREAS} from './app-reader-context.mjs?v=a11d1a3e95';
import {nativeCreationCandidates} from './native-binding-candidates.mjs?v=f6d6f43960';
import {compileObservedChoice} from './observed-choice.mjs?v=7c29d210ff';
import POLICY from '../../worlds/app.project/query-reading-policy-source.mjs?v=1697719f48';
import SCHEMA from '../../worlds/app.project/query-reading-schema-source.mjs?v=f301119a4b';
import {budget} from './budget.mjs?v=00bce6e369';

const kind='app.query.read';
const atom=value=>typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)?value:undefined;
const row=(id,type,fields)=>({id,type,attrs:Object.fromEntries(Object.entries(fields)
 .filter(([,value])=>value!==undefined).map(([key,value])=>[key,[value]]))});
let base;

function queryPolicy(){
 if(!base){
  const world=new World({library:{[kind]:SCHEMA}});
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

function graph(text,request,canonical,operation,selector){
 const target={request:'$query',mode:'existing',kind:canonical};
 const nodes=[row('query.source','std.request.source',{text:quote(text)}),
  row('query','std.request',{act:request.act,mood:request.mood,source:'$query.source',query:'$query.answer'}),
  row('query.answer','std.request.query',{request:'$query',target:'$query.target',operation:operation.attrs.name[0],concept:operation.attrs.concept?.[0]})];
 if(selector){
  target.selector='$query.selector';
  nodes.push(row('query.selector','std.request.constraint',{request:'$query',target:'$query.target',concept:selector.attrs.concept[0],
   value:selector.attrs.value[0],operator:'eq',character:'requirement',polarity:'positive'}));
 }
 nodes.push(row('query.target','std.request.target',target));
 return {request:'query',wires:serialize(nodes)};
}

export async function projectQueryAction(proposal,session,{view,bindings}={}){
 const raw=proposal?.raw,request=raw?.requests?.[0],target=request?.target,
  area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||
  !atom(request?.question?.ask)||typeof raw.source?.text!=='string'||!Array.isArray(request.constraints)||request.constraints.length>1||
  target?.name||target?.name_span||target?.description_span)return null;
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
  const distance=editCost(noun.toLowerCase(),mapping.lemma.toLowerCase(),2);
  if(Number.isFinite(distance))choices.set(JSON.stringify([mapping.canonical,mapping.lemma]),{canonical:mapping.canonical,lemma:mapping.lemma,distance,otherType:Number(mapping.type!==target.type)});
 }
 const candidates=[...choices.values()];
 if(!candidates.length||candidates.length>200)return null;
 const decision=compileObservedChoice(world,'app.query.kind',candidates.map(({distance,otherType})=>({distance,otherType})));
 if(decision.selected===undefined)return null;
 const selected=candidates[decision.selected],alternatives=decision.alternatives.map(index=>candidates[index]);
 const result=graph(raw.source.text,request,selected.canonical,operations[0],selectors[0]);
 const projection=serialize([...operations,...selectors]);
 try{session.engine?.onWorldActivity?.({nodeIds:['component:reader','component:library'],phase:'stage',operation:'app.query.read',
  label:'Ground the model’s question projection',wires:evidence+'\n'+projection+'\n'+decision.input+'\n'+decision.sop,selected,alternatives});}
 catch{/* Inspection cannot change the reading. */}
 return {...proposal,candidates:[result],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'declared-query/1',note:selected.distance?'I interpreted '+JSON.stringify(noun)+' as '+selected.lemma+'.':'',
   selected,alternatives,decision:{input:decision.input,sop:decision.sop},evidence,projection,unresolved:proposal.failures??[]}};
}
