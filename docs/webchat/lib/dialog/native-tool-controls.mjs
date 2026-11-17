// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs?v=5ff36b453a';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=463e762442';
export async function invokeNativeControl(session,{view,operation,args={}}={}){
 const area=NATIVE_AREAS[view];
 if(!area||typeof operation!=='string')throw Error('unknown-native-control');
 if(operation==='undo'){
  const history=session.newEngineUndo??[],index=history.findLastIndex(r=>r.area===view),entry=history[index];
  if(!entry)return {ok:false,changed:false,message:'There is no earlier action to undo.'};
  if(!Object.keys(entry.after).every(k=>JSON.stringify(session.isession.state[k])===JSON.stringify(entry.after[k])))return {ok:false,changed:false,message:'The objects changed after that action. Nothing was undone.'};
  Object.assign(session.isession.state,structuredClone(entry.before));session.newEngineUndo=history.filter((_,i)=>i!==index);
  return {ok:true,changed:true,message:'Undid the last action.'};
 }
 const state=session.isession.state[area.world];
 if(!state)throw Error('native-state-unavailable');
 const before=structuredClone(state),host=await createAreaHost(area,{state,instanceId:'control-'+globalThis.crypto.randomUUID(),loader:session.engine?.loader}),observation=host.observe();
 if(!host.bindings().some(op=>op.id===operation))throw Error('undeclared-native-control');
 const receipt=await host.invoke({invocation:globalThis.crypto.randomUUID(),expectedVersion:observation.version,operation,args:copyHostData(args)});
 const changed=JSON.stringify(before)!==JSON.stringify(state),ok=['changed','unchanged','supported'].includes(receipt.status);
 if(!ok&&changed){session.isession.state[area.world]=before;throw Error('native-refusal-mutated-state');}
 if(changed){
  session.newEngineUndo=[...(session.newEngineUndo??[]).slice(-31),{area:view,before:{[area.world]:before},after:{[area.world]:structuredClone(state)},operation}];
  const object=host.observe().objects.find(o=>!observation.objects.some(b=>b.id===o.id));
  if(object)session.newEngineFocus={...session.newEngineFocus,[view]:object.id};
 }
 return {ok,changed,receipt,message:ok?(changed?'Saved.':'Already up to date.'):(receipt.reason==='calendar-policy-denied'||JSON.stringify(receipt).includes('calendar-policy-denied')?'This time overlaps another booking for that calendar, participant or room.':(JSON.stringify(receipt).includes('missing_resource')?'Remove or reassign this resource’s events first.':`Could not save: ${receipt.reason??receipt.code??'the tool refused this change'}.`))};
}
