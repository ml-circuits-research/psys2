import{instanceIdFor}from'./instance-identity.mjs';
// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs';
import {readNativeIntent} from './native-intent-reader.mjs';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export async function invokeNativeControl(session,{view,operation,args={}}={},depth=0){
 if(depth>1)throw Error('native-history-alias-depth');
 const area=NATIVE_AREAS[view];
 if(!area||typeof operation!=='string')throw Error('unknown-native-control');
 if(['undo','redo','ui.history.undo','ui.history.redo'].includes(operation)){
  const redo=operation.endsWith('redo'),key=redo?'newEngineRedo':'newEngineUndo',history=session[key]??[],index=history.findLastIndex(r=>r.area===view),entry=history[index],verb=redo?'Redo':'Undo';
  if(!entry)return {ok:false,changed:false,message:'There is no earlier action to '+verb.toLowerCase()+'.'};
  const baseline=redo?entry.before:entry.after,next=redo?entry.after:entry.before;
  if(!Object.keys(baseline).every(k=>JSON.stringify(session.isession.state[k])===JSON.stringify(baseline[k])))return {ok:false,changed:false,message:'The objects changed after that action. Nothing changed.'};
  const intent=describeNativeControl({operation:{id:'ui.history.'+verb.toLowerCase(),act:verb.toLowerCase(),on:'app.history',intent:{subject:'last action',determiner:'the'},params:{}},args:{},before:null});
  Object.assign(session.isession.state,structuredClone(next));session[key]=history.filter((_,i)=>i!==index);const other=redo?'newEngineUndo':'newEngineRedo';session[other]=[...(session[other]??[]).slice(-31),entry];
  return {ok:true,changed:true,message:redo?'Redid the last action.':'Undid the last action.',intentRecord:{format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:{operation:'ui.history.'+verb.toLowerCase(),args:{}},verification:{status:'verified',reason:'exact-journal-state-restored'},before:baseline,after:next}};
 }
 const state=session.isession.state[area.world];
 if(!state)throw Error('native-state-unavailable');
 const before=structuredClone(state);let host=await createAreaHost(area,{state,instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
 const needs=host.bindings().find(op=>op.id===operation)?.knowledgeInputs??[];
 for(const input of needs){if(typeof session.engine?.knowledge?.[input.load]!=='function')throw Error('knowledge-service-unavailable');await session.engine.knowledge[input.load](args[input.argument]);}
 if(needs.length)host=await createAreaHost(area,{state,instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
 const observation=host.observe();
 const declaration=host.bindings().find(op=>op.id===operation);if(!declaration)throw Error('undeclared-native-control');
 if(['undo','redo'].includes(declaration.act))return invokeNativeControl(session,{view,operation:declaration.act,args:{}},depth+1);
 const intent=describeNativeControl({operation:declaration,args,before:observation});
 const interpreted=readNativeIntent(intent.wires);
 if(interpreted.operation!==operation||JSON.stringify(interpreted.args)!==JSON.stringify(intent.expected.args))throw Error('native-intent-roundtrip');
 const receipt=await host.invoke({invocation:globalThis.crypto.randomUUID(),expectedVersion:observation.version,operation:interpreted.operation,args:copyHostData(interpreted.args)});
 const changed=JSON.stringify(before)!==JSON.stringify(state),ok=['changed','unchanged','supported'].includes(receipt.status);
 if(!ok&&changed){session.isession.state[area.world]=before;throw Error('native-refusal-mutated-state');}
 if(changed&&!['ask','pick'].includes(declaration.act)){
  session.newEngineRedo=(session.newEngineRedo??[]).filter(r=>r.area!==view);
  session.newEngineUndo=[...(session.newEngineUndo??[]).slice(-31),{area:view,before:{[area.world]:before},after:{[area.world]:structuredClone(state)},operation}];
  const object=host.observe().objects.find(o=>!observation.objects.some(b=>b.id===o.id));
  if(object)session.newEngineFocus={...session.newEngineFocus,[view]:object.id};
 }
 const after=host.observe(),verification=verifyNativeControlEffect({intent,before:observation,after,receipt});
 const intentRecord={format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:interpreted,before:observation,after,verification,outcome:receipt.status};
 return {ok,changed,receipt,intentRecord,message:ok?(changed?'Saved.':'Already up to date.'):(receipt.reason==='calendar-policy-denied'||JSON.stringify(receipt).includes('calendar-policy-denied')?'This time overlaps another booking for that calendar, participant or room.':(JSON.stringify(receipt).includes('missing_resource')?'Remove or reassign this resource’s events first.':`Could not save: ${receipt.reason??receipt.code??'the tool refused this change'}.`))};
}
