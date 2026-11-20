import { recordHistory } from './history-journal.mjs?v=9dc30df167';
import{prepareNativeControlHost}from'./native-control-preparation.mjs?v=c69b6e801e';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=f7cd19a44d';
import{runHistoryControlQuery}from'./history-execution.mjs?v=d4742ba535';
import{invokeObservedNativeTool}from'./native-tool-activity.mjs?v=39ee882d4a';
// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS} from './app-reader-context.mjs?v=79061a1d1e';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs?v=da7d84ddc9';
import {readNativeIntent} from './native-intent-reader.mjs?v=660c9416d2';
import {observePlacementCorrection,prunePlacementLinks} from '../../worlds/app.project/spatial-profile.mjs?v=980467d502';

export async function invokeNativeControl(session,{view,sop}={}){
 if(typeof sop!=='string')throw Error('invalid-control-intent');
 const area=NATIVE_AREAS[view];
 if(!area)throw Error('unknown-native-control');
 if(isAuthoredRequest(sop))return runHistoryControlQuery(session,view,sop);
 let state=session.isession.state[area.world];
 if(!state)throw Error('native-state-unavailable');
 if(area.canonicalizeState)state=session.isession.state[area.world]=area.canonicalizeState(state);
 const invocation=globalThis.crypto.randomUUID();
 const declaredHost=await prepareNativeControlHost(session,{view,invocation});
 const interpreted=readNativeIntent(sop,{operations:declaredHost.bindings()});
 const {operation,args}=interpreted;
 const before=structuredClone(state),host=await prepareNativeControlHost(session,{view,operation,args,invocation,host:declaredHost});
 const observation=host.observe();
 const declaration=host.bindings().find(op=>op.id===operation);if(!declaration)throw Error('undeclared-native-control');
 const targets=declaration.spatial?.idsKey&&args[declaration.spatial.idsKey];
 const movedId=declaration.act==='place'&&Array.isArray(targets)&&targets.length===1?targets[0]:null;
 const observeSpatial=()=>{try{return host.observeSpatial?.();}catch{return null;}};
 const spatialBefore=movedId?observeSpatial():null;
 const intent=describeNativeControl({operation:declaration,args,before:observation});
 intent.wires=sop;
 const receipt=await invokeObservedNativeTool(session,{area,host,invocation,expectedVersion:observation.version,sop:intent.wires});
 const changed=JSON.stringify(before)!==JSON.stringify(state),ok=['changed','unchanged','supported'].includes(receipt.status);
 if(!ok&&changed){session.isession.state[area.world]=before;throw Error('native-refusal-mutated-state');}
 let historyEntry;
 if(changed&&!['ask','pick'].includes(declaration.act)){
  historyEntry={area:view,before:{[area.world]:before},after:{[area.world]:structuredClone(state)},operation};
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
 if(historyEntry)recordHistory(session,historyEntry);
 const intentRecord={format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:interpreted,before:observation,after,verification,outcome:receipt.status};
 return {ok,changed,receipt,intentRecord,message:ok?(changed?'Saved.':'Already up to date.'):(receipt.reason==='calendar-policy-denied'||JSON.stringify(receipt).includes('calendar-policy-denied')?'This time overlaps another booking for that calendar, participant or room.':(JSON.stringify(receipt).includes('missing_resource')?'Remove or reassign this resource’s events first.':`Could not save: ${receipt.reason??receipt.code??'the tool refused this change'}.`))};
}
