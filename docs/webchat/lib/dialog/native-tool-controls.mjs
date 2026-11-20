import { recordHistory } from './history-journal.mjs?v=5c2f095aac';
import{prepareNativeControlHost}from'./native-control-preparation.mjs?v=651baea853';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=1afc9437bc';
import{runHistoryControlQuery}from'./history-execution.mjs?v=43b72bf3c9';
import{invokeObservedNativeTool}from'./native-tool-activity.mjs?v=4e27e4efe9';
// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS} from './app-reader-context.mjs?v=6099bbfa7d';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs?v=247912d40c';
import {readNativeIntent} from './native-intent-reader.mjs?v=b6e22ea3a8';
import {observePlacementCorrection,prunePlacementLinks} from '../../worlds/app.project/spatial-profile.mjs?v=6f875e2b93';

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
