// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs?v=2a5811cb21';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=0ea11ee275';
import {createCanonicalDrawingHost} from '../../worlds/art.draw/declared-host.mjs?v=98bbe9598e';
import {DRAWING_STATE_INTERFACE} from '../../worlds/art.draw/canonical-state.mjs?v=3a482fe4a1';
import {createCanonicalDiagramHost,DIAGRAM_STATE_INTERFACE} from '../../worlds/diagram.sketch/declared-host.mjs?v=31e9d95c65';
import {createDocumentHost,DOCUMENT_STATE_INTERFACE} from '../../worlds/docs.editor/declared-host.mjs?v=62d2e3de84';
import {createAvatarArea,canonicalAvatarArea,projectAvatarArea,avatarAreaStateWorld} from '../../worlds/ui.avatar/sop-avatar.mjs?v=97be0c3b66';
import {createCalendarHost,canonicalCalendarState,toNativeCalendarState} from '../../worlds/time.calendar/declared-host.mjs?v=fb6822da26';
import {calendarStateWorld,CALENDAR_STATE_SCHEMA} from '../../worlds/time.calendar/canonical-state.mjs?v=9bd7badef7';
export const NATIVE_AREAS={
 avatar:{area:'drawing',world:'ui.avatar',create:createAvatarArea,prepare:createAvatarArea,canonicalizeState:canonicalAvatarArea,projectState:projectAvatarArea,
  stateWorld:avatarAreaStateWorld,separateRuntime:true,historySelection:[['runtime','view','selected']],historyView:[['runtime','view','ids']]},
 draw:{area:'drawing',world:'art.draw',create:createCanonicalDrawingHost,...DRAWING_STATE_INTERFACE,
  historySelection:[['selected'],['selectedIds'],['selectedPart']],historyView:[['idDisplay']]},
 diagram:{area:'diagram',world:'diagram.sketch',create:createCanonicalDiagramHost,...DIAGRAM_STATE_INTERFACE,historySelection:[['selected'],['chartTools','active']],historyView:[['idDisplay']]},
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
 return area.create({...options,knowledge,loader,...(policySource?{policySource}:{})});
}
export function createAppReaderContext({getState,getPrevious=()=>null,getInstanceId=()=>globalThis.crypto.randomUUID(),getIdentityRegistry,includeObservationIdentity=false,onObservation=()=>{}}={}){
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
  // An authored graph has its own source and reaches execution without the text reader.
  const prior=getPrevious(),previous=isAuthoredRequest(prior)?null:prior;
  let contextSelection;const result=observedReaderContext(area.area,observation,previous,{compact:true,text,focus,onSummary:summary=>contextSelection=summary});onObservation({area:area.area,world:area.world,observation,contextSelection});
  return includeObservationIdentity?{...result,observation:{scope:observation.scope,instance:observation.instanceId,revision:observation.version}}:result;
 };
}
