import{prepareNativeControlHost}from'./native-control-preparation.mjs?v=835694f785';
import{invokeObservedNativeTool}from'./native-tool-activity.mjs?v=23f96568ed';
// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS} from './app-reader-context.mjs?v=aab30ccd46';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs?v=c7cf5d55bb';
import {readNativeIntent} from './native-intent-reader.mjs?v=969c41538b';
import {discardPlacementLinks,observePlacementCorrection,prunePlacementLinks,withdrawPlacementCorrection} from '../../worlds/app.project/spatial-profile.mjs?v=fe452d65d1';

// Focus navigation is declared by each host; it does not invalidate content undo.
const areaForWorld=world=>Object.values(NATIVE_AREAS).find(area=>area.world===world);
function journalContent(world,state){
 const area=areaForWorld(world),copy=structuredClone(area?.projectState?area.projectState(state):state),paths=[...(area?.historySelection??[]),...(area?.historyView??[])];
 for(const path of paths){let node=copy;for(const key of path.slice(0,-1))node=node?.[key];if(node&&typeof node==='object')delete node[path.at(-1)];}
 return JSON.stringify(copy);
}
export async function invokeNativeControl(session,{view,operation,args={}}={},depth=0){
 if(depth>1)throw Error('native-history-alias-depth');
 const area=NATIVE_AREAS[view];
 if(!area||typeof operation!=='string')throw Error('unknown-native-control');
 if(['undo','redo','ui.history.undo','ui.history.redo'].includes(operation)){
  const redo=operation.endsWith('redo'),key=redo?'newEngineRedo':'newEngineUndo',history=session[key]??[],index=history.findLastIndex(r=>r.area===view),entry=history[index],verb=redo?'Redo':'Undo';
  if(!entry)return {ok:false,changed:false,message:'There is no earlier action to '+verb.toLowerCase()+'.'};
  const baseline=redo?entry.before:entry.after,next=redo?entry.after:entry.before;
  if(!Object.keys(baseline).every(k=>journalContent(k,session.isession.state[k])===journalContent(k,baseline[k])))return {ok:false,changed:false,message:'The objects changed after that action. Nothing changed.'};
  const intent=describeNativeControl({operation:{id:'ui.history.'+verb.toLowerCase(),act:verb.toLowerCase(),on:'app.history',intent:{subject:'last action',determiner:'the'},params:{}},args:{},before:null});
  const actualBefore=Object.fromEntries(Object.keys(baseline).map(world=>[world,structuredClone(session.isession.state[world])])),restored=structuredClone(next);
  for(const [world,state]of Object.entries(restored)){
   const owner=areaForWorld(world),paths=owner?.historyView??[];
   if(!paths.length){if(owner?.canonicalizeState)restored[world]=owner.canonicalizeState(state);continue;}
   const fromState=owner.projectState?owner.projectState(session.isession.state[world]):session.isession.state[world];
   const target=structuredClone(owner.projectState?owner.projectState(state):state);
   for(const path of paths){let from=fromState,to=target;for(const key of path.slice(0,-1)){from=from?.[key];if(!to[key]||typeof to[key]!=='object')to[key]={};to=to[key];}const key=path.at(-1);if(from&&Object.hasOwn(from,key))to[key]=structuredClone(from[key]);else delete to[key];}
   restored[world]=owner.canonicalizeState?owner.canonicalizeState(target):target;
  }
  Object.assign(session.isession.state,restored);session[key]=history.filter((_,i)=>i!==index);const other=redo?'newEngineUndo':'newEngineRedo';session[other]=[...(session[other]??[]).slice(-31),entry];
  for(const world of Object.keys(restored))discardPlacementLinks(session,session.nativeInstanceIds?.[world]);
  if(entry.placementCorrection)withdrawPlacementCorrection(session,entry.placementCorrection,redo);
  return {ok:true,changed:true,message:redo?'Redid the last action.':'Undid the last action.',intentRecord:{format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:{operation:'ui.history.'+verb.toLowerCase(),args:{}},verification:{status:'verified',reason:'journal-content-restored-with-current-view-preferences'},before:actualBefore,after:restored}};
 }
 let state=session.isession.state[area.world];
 if(!state)throw Error('native-state-unavailable');
 if(area.canonicalizeState)state=session.isession.state[area.world]=area.canonicalizeState(state);
 const invocation=globalThis.crypto.randomUUID();
 const before=structuredClone(state),host=await prepareNativeControlHost(session,{view,operation,args,invocation});
 const observation=host.observe();
 const declaration=host.bindings().find(op=>op.id===operation);if(!declaration)throw Error('undeclared-native-control');
 if(['undo','redo'].includes(declaration.act))return invokeNativeControl(session,{view,operation:declaration.act,args:{}},depth+1);
 const targets=declaration.spatial?.idsKey&&args[declaration.spatial.idsKey];
 const movedId=declaration.act==='place'&&Array.isArray(targets)&&targets.length===1?targets[0]:null;
 const observeSpatial=()=>{try{return host.observeSpatial?.();}catch{return null;}};
 const spatialBefore=movedId?observeSpatial():null;
 const intent=describeNativeControl({operation:declaration,args,before:observation});
 const interpreted=readNativeIntent(intent.wires,{operation:declaration});
 if(interpreted.operation!==operation||JSON.stringify(interpreted.args)!==JSON.stringify(intent.expected.args))throw Error('native-intent-roundtrip');
 const receipt=await invokeObservedNativeTool(session,{area,host,invocation,expectedVersion:observation.version,sop:intent.wires});
 const changed=JSON.stringify(before)!==JSON.stringify(state),ok=['changed','unchanged','supported'].includes(receipt.status);
 if(!ok&&changed){session.isession.state[area.world]=before;throw Error('native-refusal-mutated-state');}
 let historyEntry;
 if(changed&&!['ask','pick'].includes(declaration.act)){
  session.newEngineRedo=(session.newEngineRedo??[]).filter(r=>r.area!==view);
  historyEntry={area:view,before:{[area.world]:before},after:{[area.world]:structuredClone(state)},operation};
  session.newEngineUndo=[...(session.newEngineUndo??[]).slice(-31),historyEntry];
  const object=host.observe().objects.find(o=>!observation.objects.some(b=>b.id===o.id));
  if(object)session.newEngineFocus={...session.newEngineFocus,[view]:object.id};
 }
 const after=host.observe(),verification=verifyNativeControlEffect({intent,before:observation,after,receipt});
 if(historyEntry&&receipt.status==='changed'){
  const spatialAfter=observeSpatial();
  if(spatialBefore&&spatialAfter&&verification.status==='verified'){
   const event=observePlacementCorrection(session,spatialBefore,spatialAfter,movedId,invocation);
   if(event)historyEntry.placementCorrection=event;
  }
  prunePlacementLinks(session,spatialAfter);
 }
 const intentRecord={format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:interpreted,before:observation,after,verification,outcome:receipt.status};
 return {ok,changed,receipt,intentRecord,message:ok?(changed?'Saved.':'Already up to date.'):(receipt.reason==='calendar-policy-denied'||JSON.stringify(receipt).includes('calendar-policy-denied')?'This time overlaps another booking for that calendar, participant or room.':(JSON.stringify(receipt).includes('missing_resource')?'Remove or reassign this resource’s events first.':`Could not save: ${receipt.reason??receipt.code??'the tool refused this change'}.`))};
}
