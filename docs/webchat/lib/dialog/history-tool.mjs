// The concrete session journal owns restoration. The compiler supplies one observed head.
import {parse, quote, serialize, str} from '../vendor/sopworld/sopworld.mjs?v=b7d50d9480';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=be2be0e135';
import {readToolInvocation} from '../../worlds/native-tool-host.mjs?v=cb157b31d6';
import {discardPlacementLinks,withdrawPlacementCorrection} from '../../worlds/app.project/spatial-profile.mjs?v=9c5b466409';

const areaForWorld=world=>Object.values(NATIVE_AREAS).find(area=>area.world===world);
const stacks={undo:['newEngineUndo','newEngineRedo'],redo:['newEngineRedo','newEngineUndo']};
const identities=new WeakMap();
const entryId=entry=>{
 if(!identities.has(entry))identities.set(entry,globalThis.crypto.randomUUID());
 return identities.get(entry);
};
function head(session,view,direction){
 const [from,to]=stacks[direction],entries=session[from]??[];
 const index=entries.findLastIndex(entry=>entry.area===view);
 const entry=entries[index];
 return entry?{from,to,index,entries,entry,id:entryId(entry)}:null;
}
export function observeHistory(session,view){
 if(!NATIVE_AREAS[view])return [];
 return Object.keys(stacks).flatMap(direction=>{
  const current=head(session,view,direction);
  return current?[{id:'history.live.'+direction,type:'app.history.head',attrs:{direction:[direction],view:[quote(view)],entry:[quote(current.id)]}}]:[];
 });
}
const projected=(owner,state)=>owner?.projectState?owner.projectState(state):state;
function content(world,state){
 const owner=areaForWorld(world);
 const canonical=owner?.canonicalizeState?owner.canonicalizeState(state):state;
 const copy=structuredClone(projected(owner,canonical));
 for(const path of [...(owner?.historySelection??[]),...(owner?.historyView??[])]){
  const node=path.slice(0,-1).reduce((value,key)=>value?.[key],copy);
  if(node&&typeof node==='object')delete node[path.at(-1)];
 }
 return JSON.stringify(copy);
}
function prepareRestore(session,destination){
 return Object.fromEntries(Object.entries(destination).map(([world,state])=>{
  const owner=areaForWorld(world),paths=owner?.historyView??[];
  if(!paths.length)return [world,owner?.canonicalizeState?owner.canonicalizeState(state):structuredClone(state)];
  const current=projected(owner,session.isession.state[world]),target=structuredClone(projected(owner,state));
  for(const path of paths){
   const parents=path.slice(0,-1),from=parents.reduce((value,key)=>value?.[key],current);
   const to=parents.reduce((value,key)=>value[key]??={},target),key=path.at(-1);
   if(from&&Object.hasOwn(from,key))to[key]=structuredClone(from[key]);else delete to[key];
  }
  return [world,owner.canonicalizeState?owner.canonicalizeState(target):target];
 }));
}
const keys=['action','order','arg.direction','arg.entry','arg.view'];
function readCall(sop){
 if(typeof sop!=='string'||sop.length>65536)throw Error('invalid-history-call');
 const [wire,...extra]=parse(sop),attrs=wire?.attrs;
 if(extra.length||wire?.pattern||wire?.type!=='app.history.restore'||Object.keys(attrs).length!==keys.length||
    !keys.every(key=>attrs[key]?.length===1)||attrs.action[0]!=='restore-history'||attrs.order[0]!=='1')throw Error('invalid-history-call');
 const direction=attrs['arg.direction'][0],entry=attrs['arg.entry'][0],view=attrs['arg.view'][0];
 if(!Object.hasOwn(stacks,direction)||!entry.startsWith('"')||!view.startsWith('"')||!str(entry)||!str(view))throw Error('invalid-history-call');
 return {operation:'app.history.restore',args:{direction,entry:str(entry),view:str(view)}};
}
const resultSop=attrs=>serialize([{id:'history.outcome',type:'app.history.result',attrs}]);
const refuse=reason=>({status:'refused',reason,verification:'unverified',
 sop:resultSop({status:['refused'],verification:['unverified'],reason:[reason]})});
export function createHistoryTool(session,view){
 const observe=()=>serialize(observeHistory(session,view));
 return {readCall,observe,invoke(sop,context){
  let call,invocation,version;
  try{call=readCall(sop);[invocation,version]=readToolInvocation(context);}catch{return refuse('invalid-history-call');}
  const {direction,entry:id,view:callView}=call.args,current=head(session,view,direction);
  if(!current||callView!==view||id!==current.id||version!==id)return refuse('stale-history-head');
  const {entry,from,to,index,entries}=current;
  const redo=direction==='redo',baseline=redo?entry.before:entry.after,destination=redo?entry.after:entry.before;
  const worlds=Object.keys(baseline);
  if(!worlds.every(world=>content(world,session.isession.state[world])===content(world,baseline[world])))return refuse('history-content-changed');
  const originals=Object.fromEntries(worlds.map(world=>[world,session.isession.state[world]]));
  const before=Object.fromEntries(worlds.map(world=>[world,structuredClone(originals[world])]));
  const restored=prepareRestore(session,destination),beforeHeads=observe();
  Object.assign(session.isession.state,restored);
  const after=Object.fromEntries(worlds.map(world=>[world,structuredClone(session.isession.state[world])]));
  if(!worlds.every(world=>content(world,after[world])===content(world,destination[world]))){
   Object.assign(session.isession.state,originals);
   return refuse('unverified-history-effect');
  }
  identities.delete(entry);
  session[from]=entries.filter((_,position)=>position!==index);
  session[to]=[...(session[to]??[]).slice(-31),entry];
  for(const world of worlds)discardPlacementLinks(session,session.nativeInstanceIds?.[world]);
  if(entry.placementCorrection)withdrawPlacementCorrection(session,entry.placementCorrection,redo);
  const afterVersion=head(session,view,direction)?.id??'empty';
  return {status:'changed',verification:'verified',invocation,operation:call.operation,direction,before,after,
   beforeVersion:id,afterVersion,changed:worlds,beforeHeads,afterHeads:observe(),
   sop:resultSop({status:['changed'],verification:['verified'],direction:[direction],invocation:[quote(invocation)],
    before:[quote(id)],after:[quote(afterVersion)],world:worlds.map(quote)})};
 }};
}
