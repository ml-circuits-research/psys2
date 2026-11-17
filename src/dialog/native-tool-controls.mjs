import{instanceIdFor}from'./instance-identity.mjs';
// Typed UI gestures use the same declared native tools and undo history as model requests.
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs';
import {readNativeIntent} from './native-intent-reader.mjs';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
function activity(session,area,operation,phase,extra={}){try{session.engine?.onWorldActivity?.({nodeIds:['interpreter:'+area.world,'instance:'+area.world,'native:'+area.world],phase,label:operation,world:area.world,operation,...extra});}catch{/* Inspection must never change execution. */}}
// Focus navigation is declared by each host; it does not invalidate content undo.
function journalContent(world,state){
 const copy=structuredClone(state),area=Object.values(NATIVE_AREAS).find(area=>area.world===world),paths=[...(area?.historySelection??[]),...(area?.historyView??[])];
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
  for(const [world,state]of Object.entries(restored))for(const path of Object.values(NATIVE_AREAS).find(area=>area.world===world)?.historyView??[]){let from=session.isession.state[world],to=state;for(const key of path.slice(0,-1)){from=from?.[key];if(!to[key]||typeof to[key]!=='object')to[key]={};to=to[key];}const key=path.at(-1);if(from&&Object.hasOwn(from,key))to[key]=structuredClone(from[key]);else delete to[key];}
  Object.assign(session.isession.state,restored);session[key]=history.filter((_,i)=>i!==index);const other=redo?'newEngineUndo':'newEngineRedo';session[other]=[...(session[other]??[]).slice(-31),entry];
  return {ok:true,changed:true,message:redo?'Redid the last action.':'Undid the last action.',intentRecord:{format:'psys2.ui-training-pair/1',id:globalThis.crypto.randomUUID(),at:new Date().toISOString(),view,world:area.world,text:intent.text,wires:intent.wires,intent,tool:{operation:'ui.history.'+verb.toLowerCase(),args:{}},verification:{status:'verified',reason:'journal-content-restored-with-current-view-preferences'},before:actualBefore,after:restored}};
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
 const interpreted=readNativeIntent(intent.wires,{operation:declaration});
 if(interpreted.operation!==operation||JSON.stringify(interpreted.args)!==JSON.stringify(intent.expected.args))throw Error('native-intent-roundtrip');
 activity(session,area,operation,'start');
 let receipt;try{receipt=await host.invoke({invocation:globalThis.crypto.randomUUID(),expectedVersion:observation.version,operation:interpreted.operation,args:copyHostData(interpreted.args)});activity(session,area,operation,'end',{status:receipt.status});}catch(error){activity(session,area,operation,'error',{error:String(error?.message??error)});throw error;}
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
