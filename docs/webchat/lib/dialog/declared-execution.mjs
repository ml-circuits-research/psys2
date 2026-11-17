import{instanceIdFor}from'./instance-identity.mjs';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=965157001c';
// Application composition of declared semantic identities and native capabilities; no text parsing.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=0a9b998e29';
import SOURCE from './new-engine-source.mjs?v=e31b4adb7f';
import {flatRequestProjection} from './request-projection.mjs?v=cd2eefe301';
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs?v=f956e7d0ed';
import {observedReaderContext} from './native-reader-context.mjs?v=a762c82e14';
import {validateNativeArguments} from '../../worlds/native-tool-host.mjs?v=463e762442';
import {resolvePropertyValue} from './property-selection.mjs?v=2ac97a325c';
import {DRAWING_PROPERTY_BINDINGS} from '../../worlds/art.draw/property-host.mjs?v=ad4de9eb20';
let knowledge;
const source=()=>knowledge??=World.fromJSON(SOURCE.snapshot);
// Explicit application value and creation defaults. These are assumptions, not knowledge facts.
const valueSources={colour:{valueType:'k.colours.colour',nameKey:'name',valueKey:'rgb'}};
/** Finite lexical values from the same declared knowledge source used by execution. */
export function declaredPropertyValues(concept) {
 const config=valueSources[concept];
 return config?source().ofType(config.valueType).map(w=>str(w.attrs[config.nameKey]?.[0])).filter(v=>typeof v==='string'):[];
}
const creationDefaults={
 'document.write':()=>({blocks:[]}),
 'calendar.meeting.add':()=>({start:Date.now(),duration:30*60*1000,participants:[],room:null}),
};
const reply=(text,supported,trace={})=>({text,parts:[{text,translate:false}],statuses:[supported?'supported':'unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',...trace}});
export async function executeDeclaredRequest(session,candidate,text,{bindings,view,unapplied:externalUnapplied=[]}={}) {
 const area=NATIVE_AREAS[view],projection=flatRequestProjection(candidate);
 if(!area||!bindings||!projection.ok||projection.targets.length!==1||projection.request.mood!=='do')return null;
 const act=projection.request.act,target=projection.targets[0];
 if(target.selector.length)return null;
 if(!['make','change','place','remove'].includes(act)||act==='make'&&target.mode!=='new'||act!=='make'&&target.mode!=='existing')return null;
 const mappings=nativeKindCandidates(bindings).filter(r=>r.area===area.area&&r.canonical===target.kind&&r.nativeFamilyBinding);
 if(!mappings.length)return null;
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
   const property=bindings.properties.find(p=>p.area===area.area&&p.canonical===selector.concept&&p.hostBinding);
   if(!property)return null;
   objects=objects.filter(o=>o.inputs.some(i=>i.binding===property.hostBinding.id&&i.values.some(v=>str(v)===selector.value)));
  }
  if(!objects.length)return reply('I could not find an object to apply that action to. Nothing changed.',false,{reason:'target'});
  selected=objects.find(o=>o.id===session.newEngineFocus?.[view])??objects.at(-1);
  if(objects.length>1)notes.push('I used the most recent matching '+selected.kind+'.');
  operationsForAct=operationsForAct.filter(op=>op.on===selected.sourceType);
 }
 const candidates=[];
 for(const operation of operationsForAct) {
  const explicitDefaults=mappings.find(m=>m.nativeFamilyBinding.operation===operation.id)?.nativeFamilyBinding.arguments??{};
  const args=structuredClone(explicitDefaults),applied=[],skipped=[],assumptions=[];
  if(operation.params.kind) {if(kinds.length!==1)continue;args.kind=kinds[0];}
  if(selected){if(operation.params.ids)args.ids=[selected.id];else if(operation.params.id)args.id=selected.id;}
  if(act==='make'&&operation.params.id?.required)args.id=globalThis.crypto.randomUUID();
  if(target.name&&operation.params.name)args.name=target.name;
  const orderedResults=[...projection.results].sort((a,b)=>{const av=a.wire.attrs['source.start']?.[0],bv=b.wire.attrs['source.start']?.[0];return av!==undefined&&bv!==undefined?Number(str(av))-Number(str(bv)):0;});
  for(const condition of orderedResults) {
   if(condition.operator!=='eq'||condition.polarity!=='positive'){skipped.push(condition);continue;}
   const mapping=bindings.properties.find(p=>p.area===area.area&&p.canonical===condition.concept&&p.hostBinding&&p.hostBinding.sourceType===operation.on&&Object.hasOwn(operation.params,p.hostBinding.parameter))??DRAWING_PROPERTY_BINDINGS.filter(b=>b.concept===condition.concept&&b.sourceType===operation.on&&Object.hasOwn(operation.params,b.key)).map(b=>({hostBinding:{parameter:b.key,sourceType:b.sourceType}}))[0];
   if(!mapping){skipped.push(condition);continue;}
   const parameter=mapping.hostBinding.parameter,descriptor=operation.params[parameter];let value=condition.value;
   if(descriptor.type==='array'&&mapping.hostBinding.codec){
    const codec=mapping.hostBinding.codec;let items;
    try{const parsed=JSON.parse(value);items=Array.isArray(parsed)?parsed:[parsed];}catch{items=String(value).split(',').map(v=>v.trim());}
    if(codec==='number-list'){if(items.some(v=>typeof v!=='number'&&(typeof v!=='string'||!v.trim()||!Number.isFinite(Number(v))))){skipped.push(condition);continue;}items=items.map(Number);}
    else if(codec==='string-list'){if(items.some(v=>typeof v!=='string'||!v)){skipped.push(condition);continue;}}
    else {skipped.push(condition);continue;}
    value=[...(args[parameter]??[]),...items];
   }else if(valueSources[condition.concept]) {
    const found=resolvePropertyValue(source(),{normalize:v=>/^#[a-f0-9]{6}$/i.test(v)?v.toLowerCase():null},valueSources[condition.concept],value);
    if(!found.ok){skipped.push(condition);continue;}value=found.values[0];
   } else if(['number','integer'].includes(descriptor.type)&&value!==null&&value.trim()!==''&&Number.isFinite(Number(value)))value=Number(value);
   else if(descriptor.type==='boolean'&&['true','false'].includes(value))value=value==='true';
   if(!validateNativeArguments({...operation,params:{[parameter]:descriptor}},{[parameter]:value}).ok){skipped.push(condition);continue;}
   args[parameter]=value;applied.push(condition);
  }
  if(act==='make') {
   if(operation.params.title?.required&&!Object.hasOwn(args,'title')){args.title=target.name??mappings[0].lemma;assumptions.push('I used '+JSON.stringify(args.title)+' as the title.');}
   if(operation.params.label?.required&&!Object.hasOwn(args,'label')){args.label=target.name??mappings[0].lemma;assumptions.push('I used '+JSON.stringify(args.label)+' as the name.');}
   const defaults=creationDefaults[operation.id]?.()??{};
   for(const [key,value]of Object.entries(defaults))if(!Object.hasOwn(args,key)){args[key]=value;if(key==='start')assumptions.push('I scheduled it starting now.');if(key==='duration')assumptions.push('I used a 30-minute duration.');}
  }
  for(const rule of operation.defaultsFrom??[])if(rule.method==='ordinal-labels'&&operation.params[rule.parameter]?.type==='array'&&operation.params[rule.lengthOf]?.type==='array'&&(!args[rule.parameter]||args[rule.parameter].length===0)&&Array.isArray(args[rule.lengthOf])&&args[rule.lengthOf].length){args[rule.parameter]=args[rule.lengthOf].map((_,i)=>String(i+1));assumptions.push('I numbered the categories because no labels were supplied.');}
  const checked=validateNativeArguments(operation,args);
  if(checked.ok&&(act==='make'||act==='remove'||applied.length))candidates.push({operation,args:checked.args,applied,skipped,assumptions});
 }
 candidates.sort((a,b)=>b.applied.length-a.applied.length);
 const chosen=candidates[0];if(!chosen)return null;
 // A create instruction must not silently overwrite a populated singleton editor.
 if(chosen.operation.id==='document.write'&&(nativeState.title||nativeState.blocks?.length))return reply('The document already has content. I left it unchanged.',false,{reason:'overwrite-needs-stricter-admission'});
 if(chosen.operation.id==='calendar.meeting.add'&&(chosen.skipped.length||externalUnapplied.length))return reply('I understood a meeting, but could not apply its scheduling details. Nothing changed.',false,{reason:'unapplied-scheduling-details'});
 const receipt=host.invoke({invocation:globalThis.crypto.randomUUID(),expectedVersion:before.version,operation:chosen.operation.id,args:chosen.args});
 if(receipt.status==='refused')return reply('I could not apply that action. Nothing changed.',false,{reason:receipt.reason,receipt});
 const after=host.observe(),created=after.objects.filter(o=>!before.objects.some(b=>b.id===o.id)),object=created[0]??selected;
 session.newEngineFocus={...session.newEngineFocus,[view]:object?.id??null};
 notes.push(...chosen.assumptions);unapplied.push(...externalUnapplied,...chosen.skipped.map(c=>`${c.concept} ${c.value??''}`));
 const kind=object?.kind??kinds[0]??mappings[0].lemma;
 const said=act==='make'?`Created a ${kind}.`:act==='remove'?`Removed the ${kind}.`:`Updated the ${kind}.`;
 if(unapplied.length)notes.push('I could not apply '+unapplied.join(', ')+'.');
 const message=[said,...notes].join(' ');
 return {...reply(message,true,{assessment:receipt.status,receipt,reading:candidate,uncertainty:notes,alternatives:candidates.map(c=>c.operation.id),partial:unapplied.length>0}),
  state:{[area.world]:structuredClone(nativeState)},effects:receipt.status==='changed'?[{operation:chosen.operation.id}]:[]};
}
