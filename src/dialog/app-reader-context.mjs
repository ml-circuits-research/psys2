// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs';
import {createDrawingHost} from '../../worlds/art.draw/declared-host.mjs';
import {createDiagramHost} from '../../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost} from '../../worlds/docs.editor/declared-host.mjs';
import {createAvatarHost} from '../../worlds/ui.avatar/declared-host.mjs';
import {createCalendarHost} from '../../worlds/time.calendar/declared-host.mjs';
export const NATIVE_AREAS={avatar:{area:'drawing',world:'ui.avatar',create:createAvatarHost,loadKnowledge:'faces',historySelection:[['selectedSlot']],historyView:[['idDisplay']]},draw:{area:'drawing',world:'art.draw',create:createDrawingHost,historySelection:[['selected'],['selectedIds'],['selectedPart']],historyView:[['idDisplay']]},diagram:{area:'diagram',world:'diagram.sketch',create:createDiagramHost,historySelection:[['selected'],['chartTools','active']],historyView:[['idDisplay']]},editor:{area:'document',world:'docs.editor',create:createDocumentHost,historySelection:[['selection']]},calendar:{area:'calendar',world:'time.calendar',create:createCalendarHost,policyFile:'scheduling-policy.sop',historySelection:[['selectedEvent']]}};
/** Application composition: the same declared policy guards controls and spoken requests. */
export async function createAreaHost(area,{loader,knowledge,...options}={}){
 if(!area)throw Error('unknown-native-area');
 if(area.loadKnowledge)await knowledge?.[area.loadKnowledge]?.();
 const policySource=area.policyFile?await loader?.readFile?.(area.world,area.policyFile):undefined;
 if(area.policyFile&&!policySource)throw Error('native-policy-unavailable');
 return area.create({...options,knowledge,...(policySource?{policySource}:{})});
}
export function createAppReaderContext({getState,getPrevious=()=>null,getInstanceId=()=>globalThis.crypto.randomUUID(),onObservation=()=>{}}={}){
 if(typeof getState!=='function'||typeof getPrevious!=='function'||typeof onObservation!=='function')throw Error('invalid-app-reader-context');
 const hosts=new WeakMap();
 return async()=>{
  const state=getState(),tab=state?.['ui.shell']?.activeTab,area=NATIVE_AREAS[tab],native=area&&state[area.world];
  if(!area||!native||typeof native!=='object')throw Error('active-native-context-unavailable');
  let host=hosts.get(native);if(!host){host=await area.create({state:native,instanceId:getInstanceId(area.world)});hosts.set(native,host);}
  const observation=host.observe(),result=observedReaderContext(area.area,observation,getPrevious());onObservation({area:area.area,observation});return result;
 };
}
