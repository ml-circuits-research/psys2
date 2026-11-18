// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs?v=0b0220ad07';
import {createCanonicalDrawingHost} from '../../worlds/art.draw/declared-host.mjs?v=9a5cbc733a';
import {DRAWING_STATE_INTERFACE} from '../../worlds/art.draw/canonical-state.mjs?v=368d518f98';
import {createDiagramHost} from '../../worlds/diagram.sketch/declared-host.mjs?v=e5b1edb8ee';
import {createDocumentHost,DOCUMENT_STATE_INTERFACE} from '../../worlds/docs.editor/declared-host.mjs?v=8e6863b870';
import {createAvatarHost} from '../../worlds/ui.avatar/declared-host.mjs?v=de1d9c428e';
import {canonicalAvatarState,toNativeAvatarState,avatarStateWorld,AVATAR_STATE_SCHEMA} from '../../worlds/ui.avatar/canonical-state.mjs?v=0fe6c48089';
import {createCalendarHost,canonicalCalendarState,toNativeCalendarState} from '../../worlds/time.calendar/declared-host.mjs?v=ee359fcd83';
import {calendarStateWorld,CALENDAR_STATE_SCHEMA} from '../../worlds/time.calendar/canonical-state.mjs?v=a4e222288c';
export const NATIVE_AREAS={
 avatar:{area:'drawing',world:'ui.avatar',create:createAvatarHost,canonicalizeState:canonicalAvatarState,projectState:toNativeAvatarState,
  stateWorld:avatarStateWorld,stateSchema:AVATAR_STATE_SCHEMA,stateInterfaceTypeKey:'nativeType',loadKnowledge:'faces',
  historySelection:[['selectedSlot']],historyView:[['idDisplay']]},
 draw:{area:'drawing',world:'art.draw',create:createCanonicalDrawingHost,...DRAWING_STATE_INTERFACE,
  historySelection:[['selected'],['selectedIds'],['selectedPart']],historyView:[['idDisplay']]},
 diagram:{area:'diagram',world:'diagram.sketch',create:createDiagramHost,historySelection:[['selected'],['chartTools','active']],historyView:[['idDisplay']]},
 editor:{area:'document',world:'docs.editor',create:createDocumentHost,...DOCUMENT_STATE_INTERFACE,historySelection:[['selection']]},
 calendar:{area:'calendar',world:'time.calendar',create:createCalendarHost,canonicalizeState:canonicalCalendarState,projectState:toNativeCalendarState,
  stateWorld:calendarStateWorld,stateSchema:CALENDAR_STATE_SCHEMA,policyFile:'scheduling-policy.sop',historySelection:[['selectedEvent']]},
};
/** Application composition: the same declared policy guards controls and spoken requests. */
export async function createAreaHost(area,{loader,knowledge,prepareKnowledge=true,...options}={}){
 if(!area)throw Error('unknown-native-area');
 if(prepareKnowledge&&area.loadKnowledge)await knowledge?.[area.loadKnowledge]?.();
 const policySource=area.policyFile?await loader?.readFile?.(area.world,area.policyFile):undefined;
 if(area.policyFile&&!policySource)throw Error('native-policy-unavailable');
 return area.create({...options,knowledge,...(policySource?{policySource}:{})});
}
export function createAppReaderContext({getState,getPrevious=()=>null,getInstanceId=()=>globalThis.crypto.randomUUID(),getIdentityRegistry,onObservation=()=>{}}={}){
 if(typeof getState!=='function'||typeof getPrevious!=='function'||typeof onObservation!=='function')throw Error('invalid-app-reader-context');
 const hosts=new WeakMap();
 return async(text='')=>{
  const state=getState(),tab=state?.['ui.shell']?.activeTab,area=NATIVE_AREAS[tab],native=area&&state[area.world];
  if(!area||!native||typeof native!=='object')throw Error('active-native-context-unavailable');
  let host=hosts.get(native);if(!host){host=await area.create({state:native,instanceId:getInstanceId(area.world),identityRegistry:getIdentityRegistry?.(area.world)});hosts.set(native,host);}
  const observation=host.observe(),ids=new Set(observation.objects.map(object=>String(object.id))),focus=[];
  const collect=value=>{if(typeof value==='string'&&ids.has(value))focus.push(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object'){
   if(typeof value.id==='string'){const fields=Object.entries(value).filter(([key])=>key!=='id');if(fields.length)for(const object of observation.objects){const owner=object.id===value.id||object.in===value.id||object.parent===value.id;if(owner&&fields.every(([key,wanted])=>object.inputs.some(input=>input.key===key&&input.values.length===1&&(()=>{try{return JSON.parse(input.values[0])===wanted;}catch{return false;}})())))focus.push(String(object.id));}}
   Object.values(value).forEach(collect);
  }};
  const nativeView=area.projectState?area.projectState(native):native;
  for(const path of area.historySelection??[]){let value=nativeView;for(const key of path)value=value?.[key];collect(value);}
  let contextSelection;const result=observedReaderContext(area.area,observation,getPrevious(),{compact:true,text,focus,onSummary:summary=>contextSelection=summary});onObservation({area:area.area,world:area.world,observation,contextSelection});return result;
 };
}
