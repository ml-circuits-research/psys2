import{executionValueSource,executionDefaults}from'./execution-policy.mjs';
import{inspectCachedExecutionSource}from'./execution-world-inspection.mjs';
import{instanceIdFor}from'./instance-identity.mjs';
import{prepareNativeControlHost}from'./native-control-preparation.mjs';
import{invokeObservedNativeTool}from'./native-tool-activity.mjs';
import{describeNativeControl,verifyNativeControlEffect}from'./native-control-intent.mjs';
import {nativeKindCandidates} from './native-binding-candidates.mjs';
// Application composition of declared semantic identities and native capabilities; no text parsing.
import {World,str} from '../vendor/sopworld/sopworld.mjs';
import SOURCE from './new-engine-source.mjs';
import {flatRequestProjection} from './request-projection.mjs';
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs';
import {observedReaderContext} from './native-reader-context.mjs';
import {validateNativeArguments} from '../../worlds/native-tool-host.mjs';
import {resolvePropertyValue} from './property-selection.mjs';
import {DRAWING_PROPERTY_BINDINGS} from '../../worlds/art.draw/property-host.mjs';
let knowledge;
/** Read-only cache inspection; does not create the lazy knowledge World. */
export const inspectDeclaredExecutionSourceWorld=options=>inspectCachedExecutionSource(knowledge,options);
const source=()=>knowledge??=World.fromJSON(SOURCE.snapshot);
// Value joins and omitted-argument assumptions come from the operational SOP policy.
/** Finite lexical values from the same declared knowledge source used by execution. */
export function declaredPropertyValues(concept) {
 const config=executionValueSource(concept);
 return config?source().ofType(config.valueType).map(w=>str(w.attrs[config.nameKey]?.[0])).filter(v=>typeof v==='string'):[];
}
const reply=(text,supported,trace={})=>({text,parts:[{text,translate:false}],statuses:[supported?'supported':'unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',...trace}});
export async function executeDeclaredRequest(session,candidate,text,{bindings,view,unapplied:externalUnapplied=[]}={}) {
 const area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area,projection=flatRequestProjection(candidate);
 if(!area||!bindings||!projection.ok||projection.targets.length!==1||projection.request.mood!=='do')return null;
 const act=projection.request.act,target=projection.targets[0];
 if(target.selector.length)return null;
 if(!['make','change','place','remove'].includes(act)||act==='make'&&target.mode!=='new'||act!=='make'&&target.mode!=='existing')return null;
 const mappings=nativeKindCandidates(bindings).filter(r=>r.area===readerArea&&r.canonical===target.kind&&r.nativeFamilyBinding);
 if(!mappings.length)return act==='make'?reply('I understood the requested action and object, but could not find their declared tool binding. Nothing changed.',false,{reason:'native-binding-gap',reading:candidate,binding:{act,kind:target.kind,alternatives:[]}}):null;
 const nativeState=session.isession.state[area.world];if(!nativeState)return null;
 const host=await createAreaHost(area,{state:nativeState,instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge}),before=host.observe(),operations=host.bindings();
 const familyOps=operations.filter(op=>mappings.some(m=>m.nativeFamilyBinding.operation===op.id));
 const kinds=[...new Set(mappings.map(m=>m.lemma).filter(name=>familyOps.some(op=>op.params.kind?.enum?.includes(name))))];
 const sourceTypes=new Set(familyOps.map(op=>op.on)),notes=[],unapplied=[];
 let selected=null,operationsForAct=operations.filter(op=>op.act===act&&sourceTypes.has(op.on)&&!op.requires?.length);
 if(act!=='make') {
  let objects=before.objects.filter(o=>sourceTypes.has(o.sourceType)&&(!kinds.length||kinds.includes(o.kind)));
  if(target.name){const names=observedReaderContext(area.area,before).context.existing;objects=objects.filter(o=>names[before.objects.indexOf(o)]?.name===target.name);}
  for(const selector of target.selector) {
   if(selector.operator!=='eq'||selector.polarity!=='positive')return null;
   const property=bindings.properties.find(p=>p.area===readerArea&&p.canonical===selector.concept&&p.hostBinding);
   if(!property)return null;
   objects=objects.filter(o=>o.inputs.some(i=>i.binding===property.hostBinding.id&&i.values.some(v=>str(v)===selector.value)));
  }
  if(!objects.length)return reply('I could not find an object to apply that action to. Nothing changed.',false,{reason:'target'});
  selected=objects.find(o=>o.id===session.newEngineFocus?.[view])??objects.at(-1);
  if(objects.length>1)notes.push('I used the most recent matching '+selected.kind+'.');
  operationsForAct=operationsForAct.filter(op=>op.on===selected.sourceType);
 }
 const candidates=[],bindingFailures=[];
 for(const operation of operationsForAct) {
  const explicitDefaults=mappings.find(m=>m.nativeFamilyBinding.operation===operation.id)?.nativeFamilyBinding.arguments??{};
  const args=structuredClone(explicitDefaults),applied=[],skipped=[],assumptions=[];
  if(operation.params.kind) {if(kinds.length!==1){bindingFailures.push({operation:operation.id,reason:'native-kind-enum',requested:mappings.map(mapping=>mapping.lemma),accepted:operation.params.kind.enum??null});continue;}args.kind=kinds[0];}
  const knowledgeInputs=operation.knowledgeInputs??[],lexicalKinds=[...new Set(mappings.map(mapping=>mapping.lemma))];
  for(const input of knowledgeInputs)if(!Object.hasOwn(args,input.argument)&&lexicalKinds.length===1)args[input.argument]=lexicalKinds[0];
  if(selected){if(operation.params.ids)args.ids=[selected.id];else if(operation.params.id)args.id=selected.id;}
  if(act==='make'&&operation.params.id?.required)args.id=globalThis.crypto.randomUUID();
  if(target.name&&operation.params.name&&!knowledgeInputs.some(input=>input.argument==='name'))args.name=target.name;
  const orderedResults=[...projection.results].sort((a,b)=>{const av=a.wire.attrs['source.start']?.[0],bv=b.wire.attrs['source.start']?.[0];return av!==undefined&&bv!==undefined?Number(str(av))-Number(str(bv)):0;});
  for(const condition of orderedResults) {
   if(condition.operator!=='eq'||condition.polarity!=='positive'){skipped.push(condition);continue;}
   const mapping=bindings.properties.find(p=>p.area===readerArea&&p.canonical===condition.concept&&p.hostBinding&&p.hostBinding.sourceType===operation.on&&Object.hasOwn(operation.params,p.hostBinding.parameter))??DRAWING_PROPERTY_BINDINGS.filter(b=>b.concept===condition.concept&&b.sourceType===operation.on&&Object.hasOwn(operation.params,b.key)).map(b=>({hostBinding:{parameter:b.key,sourceType:b.sourceType}}))[0];
   if(!mapping){skipped.push(condition);continue;}
   const parameter=mapping.hostBinding.parameter,descriptor=operation.params[parameter];let value=condition.value;
   if(descriptor.type==='array'&&mapping.hostBinding.codec){
    const codec=mapping.hostBinding.codec;let items;
    try{const parsed=JSON.parse(value);items=Array.isArray(parsed)?parsed:[parsed];}catch{items=String(value).split(',').map(v=>v.trim());}
    if(codec==='number-list'){if(items.some(v=>typeof v!=='number'&&(typeof v!=='string'||!v.trim()||!Number.isFinite(Number(v))))){skipped.push(condition);continue;}items=items.map(Number);}
    else if(codec==='string-list'){if(items.some(v=>typeof v!=='string'||!v)){skipped.push(condition);continue;}}
    else {skipped.push(condition);continue;}
    value=[...(args[parameter]??[]),...items];
   }else if(executionValueSource(condition.concept)) {
    const found=resolvePropertyValue(source(),{normalize:v=>/^#[a-f0-9]{6}$/i.test(v)?v.toLowerCase():null},executionValueSource(condition.concept),value);
    if(!found.ok){skipped.push(condition);continue;}value=found.values[0];
   } else if(['number','integer'].includes(descriptor.type)&&value!==null&&value.trim()!==''&&Number.isFinite(Number(value)))value=Number(value);
   else if(descriptor.type==='boolean'&&['true','false'].includes(value))value=value==='true';
   if(!validateNativeArguments({...operation,params:{[parameter]:descriptor}},{[parameter]:value}).ok){skipped.push(condition);continue;}
   args[parameter]=value;applied.push(condition);
  }
  if(act==='make') {
   if(operation.params.title?.required&&!Object.hasOwn(args,'title')){args.title=target.name??mappings[0].lemma;assumptions.push('I used '+JSON.stringify(args.title)+' as the title.');}
   if(operation.params.label?.required&&!Object.hasOwn(args,'label')){args.label=target.name??mappings[0].lemma;assumptions.push('I used '+JSON.stringify(args.label)+' as the name.');}
   const defaults=executionDefaults(operation.id,args);
   try{session.engine?.onWorldActivity?.({nodeIds:['execution:policy'],phase:'stage',label:'Read omitted-argument defaults',operation:'policy.execution.defaults',tool:operation.id,facts:defaults.evidence,parameters:Object.keys(defaults.values),notices:defaults.notices});}catch{/* Observation cannot change execution. */}
   Object.assign(args,defaults.values);assumptions.push(...defaults.notices);
  }
  for(const rule of operation.defaultsFrom??[])if(rule.method==='ordinal-labels'&&operation.params[rule.parameter]?.type==='array'&&operation.params[rule.lengthOf]?.type==='array'&&(!args[rule.parameter]||args[rule.parameter].length===0)&&Array.isArray(args[rule.lengthOf])&&args[rule.lengthOf].length){args[rule.parameter]=args[rule.lengthOf].map((_,i)=>String(i+1));assumptions.push('I numbered the categories because no labels were supplied.');}
  const checked=validateNativeArguments(operation,args);
  if(checked.ok&&(act==='make'||act==='remove'||applied.length))candidates.push({operation,args:checked.args,applied,skipped,assumptions});
  else bindingFailures.push({operation:operation.id,reason:checked.reason??'no-applicable-result',missing:Object.entries(operation.params).filter(([name,parameter])=>parameter.required&&!Object.hasOwn(args,name)&&!Object.hasOwn(parameter,'default')).map(([name])=>name)});
 }
 candidates.sort((a,b)=>b.applied.length-a.applied.length);
 const chosen=candidates[0];if(!chosen)return reply(`I understood that you want to ${act} a ${mappings[0].lemma}, but could not bind its required tool arguments. Nothing changed.`,false,{reason:'native-binding-gap',reading:candidate,binding:{act,kind:target.kind,alternatives:bindingFailures}});
 // A create instruction must not silently overwrite a populated singleton editor.
 if(chosen.operation.id==='document.write'&&(nativeState.title||nativeState.blocks?.length))return reply('The document already has content. I left it unchanged.',false,{reason:'overwrite-needs-stricter-admission'});
 if(chosen.operation.id==='calendar.meeting.add'&&(chosen.skipped.length||externalUnapplied.length))return reply('I understood a meeting, but could not apply its scheduling details. Nothing changed.',false,{reason:'unapplied-scheduling-details'});
 const invocation=globalThis.crypto.randomUUID();let prepared;
 try{prepared=await prepareNativeControlHost(session,{view,operation:chosen.operation.id,args:chosen.args,host,invocation});}catch(error){return reply(`I understood the request for ${mappings[0].lemma}, but could not load the knowledge required by its tool. Nothing changed.`,false,{reason:'native-knowledge-unavailable',reading:candidate,binding:{operation:chosen.operation.id,knowledgeInputs:chosen.operation.knowledgeInputs??[]},error:String(error?.message??error)});}
 const observedBefore=prepared.observe(),intent=describeNativeControl({operation:chosen.operation,args:chosen.args,before:observedBefore});
 const receipt=await invokeObservedNativeTool(session,{area,host:prepared,invocation,expectedVersion:observedBefore.version,operation:chosen.operation.id,args:chosen.args});
 if(receipt.status==='refused')return reply('I could not apply that action. Nothing changed.',false,{reason:receipt.reason,receipt});
 const after=prepared.observe(),verification=verifyNativeControlEffect({intent,before:observedBefore,after,receipt}),created=after.objects.filter(o=>!before.objects.some(b=>b.id===o.id)),object=created[0]??selected;
 session.newEngineFocus={...session.newEngineFocus,[view]:object?.id??null};
 notes.push(...chosen.assumptions);unapplied.push(...externalUnapplied,...chosen.skipped.map(c=>`${c.concept} ${c.value??''}`));
 const kind=object?.kind??kinds[0]??mappings[0].lemma;
 const said=act==='make'?`Created a ${kind}.`:act==='remove'?`Removed the ${kind}.`:`Updated the ${kind}.`;
 if(unapplied.length)notes.push('I could not apply '+unapplied.join(', ')+'.');
 const message=[said,...notes].join(' ');
 return {...reply(message,true,{assessment:receipt.status,receipt,reading:candidate,controlIntent:intent.wires,effectVerification:verification,binding:{operation:chosen.operation.id,alternatives:bindingFailures},uncertainty:notes,alternatives:candidates.map(c=>c.operation.id),partial:unapplied.length>0}),
  state:{[area.world]:structuredClone(nativeState)},effects:receipt.status==='changed'?[{operation:chosen.operation.id}]:[]};
}
