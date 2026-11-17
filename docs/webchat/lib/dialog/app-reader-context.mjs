// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs?v=c51a7d6eb4';
import {createDrawingHost} from '../../worlds/art.draw/declared-host.mjs?v=18f0432d80';
import {createDiagramHost} from '../../worlds/diagram.sketch/declared-host.mjs?v=1a1d433c5e';
import {createDocumentHost} from '../../worlds/docs.editor/declared-host.mjs?v=0ab7205f05';
import {createCalendarHost} from '../../worlds/time.calendar/declared-host.mjs?v=ad4802d70b';
export const NATIVE_AREAS={draw:{area:'drawing',world:'art.draw',create:createDrawingHost},diagram:{area:'diagram',world:'diagram.sketch',create:createDiagramHost},editor:{area:'document',world:'docs.editor',create:createDocumentHost},calendar:{area:'calendar',world:'time.calendar',create:createCalendarHost,policyFile:'scheduling-policy.sop'}};
/** Application composition: the same declared policy guards controls and spoken requests. */
export async function createAreaHost(area,{loader,...options}={}){
 if(!area)throw Error('unknown-native-area');
 const policySource=area.policyFile?await loader?.readFile?.(area.world,area.policyFile):undefined;
 if(area.policyFile&&!policySource)throw Error('native-policy-unavailable');
 return area.create({...options,...(policySource?{policySource}:{})});
}
export function createAppReaderContext({getState,getPrevious=()=>null,onObservation=()=>{}}={}){
 if(typeof getState!=='function'||typeof getPrevious!=='function'||typeof onObservation!=='function')throw Error('invalid-app-reader-context');
 const hosts=new WeakMap();
 return async()=>{
  const state=getState(),tab=state?.['ui.shell']?.activeTab,area=NATIVE_AREAS[tab],native=area&&state[area.world];
  if(!area||!native||typeof native!=='object')throw Error('active-native-context-unavailable');
  let host=hosts.get(native);if(!host){host=await area.create({state:native,instanceId:'app-reader-'+globalThis.crypto.randomUUID()});hosts.set(native,host);}
  const observation=host.observe(),result=observedReaderContext(area.area,observation,getPrevious());onObservation({area:area.area,observation});return result;
 };
}
