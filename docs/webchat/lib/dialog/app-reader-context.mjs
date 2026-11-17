// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs?v=2946a2d8ee';
import {createDrawingHost} from '../../worlds/art.draw/declared-host.mjs?v=18f0432d80';
import {createDiagramHost} from '../../worlds/diagram.sketch/declared-host.mjs?v=8ca86f7be1';
import {createDocumentHost} from '../../worlds/docs.editor/declared-host.mjs?v=0ab7205f05';
import {createCalendarHost} from '../../worlds/time.calendar/declared-host.mjs?v=82d3f9e703';
import {createChartHost} from '../../worlds/data.charts/declared-host.mjs?v=4828979363';
const areas={draw:{area:'drawing',world:'art.draw',create:createDrawingHost},diagram:{area:'diagram',world:'diagram.sketch',create:createDiagramHost},editor:{area:'document',world:'docs.editor',create:createDocumentHost},calendar:{area:'calendar',world:'time.calendar',create:createCalendarHost},charts:{area:'diagram',world:'data.charts',create:createChartHost}};
export function createAppReaderContext({getState,getPrevious=()=>null,onObservation=()=>{}}={}){
 if(typeof getState!=='function'||typeof getPrevious!=='function'||typeof onObservation!=='function')throw Error('invalid-app-reader-context');
 const hosts=new WeakMap();
 return async()=>{
  const state=getState(),tab=state?.['ui.shell']?.activeTab,area=areas[tab],native=area&&state[area.world];
  if(!area||!native||typeof native!=='object')throw Error('active-native-context-unavailable');
  let host=hosts.get(native);if(!host){host=await area.create({state:native,instanceId:'app-reader-'+globalThis.crypto.randomUUID()});hosts.set(native,host);}
  const observation=host.observe(),result=observedReaderContext(area.area,observation,getPrevious());onObservation({area:area.area,observation});return result;
 };
}
