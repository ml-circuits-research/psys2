// Actual application state only. No request annotations or invented semantic types.
import {observedReaderContext} from './native-reader-context.mjs?v=fd7d15346c';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=58e7ed30fe';
import {createDrawingArea,canonicalDrawingArea,projectDrawingArea,drawingAreaStateWorld} from '../../worlds/art.draw/sop-drawing.mjs?v=b11033e055';
import {createDiagramArea,canonicalDiagramArea,projectDiagramArea,diagramAreaStateWorld} from '../../worlds/diagram.sketch/sop-diagram.mjs?v=062cc31a21';
import {createDocumentArea,canonicalDocumentArea,projectDocumentArea,documentAreaStateWorld} from '../../worlds/docs.editor/sop-document.mjs?v=f77cbef5d8';
import {createAvatarArea,canonicalAvatarArea,projectAvatarArea,avatarAreaStateWorld} from '../../worlds/ui.avatar/sop-avatar.mjs?v=02a67433da';
import {createCalendarArea,canonicalCalendarArea,projectCalendarArea,calendarAreaStateWorld} from '../../worlds/time.calendar/sop-calendar.mjs?v=6ee9fa878b';
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import AREA_SCHEMA from '../../worlds/app.project/area-registry-schema-source.mjs?v=3e2ce9c453';
import AREA_REGISTRY from '../../worlds/app.project/area-registry-source.mjs?v=a9e593f4ad';
// The native host of each world (code: the factories its module exports). Which views exist, their reader area,
// focus paths and view-only history paths are declared facts (worlds/app.project/area-registry.sop).
const NATIVE_HOSTS={
 'ui.avatar':{create:createAvatarArea,canonicalizeState:canonicalAvatarArea,projectState:projectAvatarArea,stateWorld:avatarAreaStateWorld},
 'art.draw':{create:createDrawingArea,canonicalizeState:canonicalDrawingArea,projectState:projectDrawingArea,stateWorld:drawingAreaStateWorld},
 'diagram.sketch':{create:createDiagramArea,canonicalizeState:canonicalDiagramArea,projectState:projectDiagramArea,stateWorld:diagramAreaStateWorld},
 'docs.editor':{create:createDocumentArea,canonicalizeState:canonicalDocumentArea,projectState:projectDocumentArea,stateWorld:documentAreaStateWorld},
 'time.calendar':{create:createCalendarArea,canonicalizeState:canonicalCalendarArea,projectState:projectCalendarArea,stateWorld:calendarAreaStateWorld},
};
/** Reads the declared area registry into the view table the runtime uses. A view whose world has no native host, or a malformed registry, throws. */
export function loadAreaRegistry(source=AREA_REGISTRY,hosts=NATIVE_HOSTS){
 const world=new World({library:{'app.area':AREA_SCHEMA}}),told=world.tell(source);
 if(!told.ok)throw Error('invalid-area-registry: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 const one=(row,key)=>str(row.attrs[key][0]),paths=world.ofType('app.area.path'),areas={};
 for(const row of world.ofType('app.area.view')){
  const view=one(row,'view'),id=one(row,'world'),host=hosts[id];
  if(!host)throw Error('area-registry-view-without-native-host: '+view+' '+id);
  const pathsOf=role=>paths.filter(path=>one(path,'view')===view&&one(path,'role')===role).sort((a,b)=>Number(one(a,'order'))-Number(one(b,'order'))).map(path=>path.attrs.key.map(str));
  const focus=pathsOf('focus'),historyView=pathsOf('history.view');
  areas[view]={area:one(row,'area'),world:id,create:host.create,prepare:host.create,canonicalizeState:host.canonicalizeState,projectState:host.projectState,stateWorld:host.stateWorld,
   separateRuntime:one(row,'separate.runtime')==='true',historySelection:focus,...(historyView.length?{historyView}:{}),declaration:row.id};
 }
 for(const path of paths)if(!areas[one(path,'view')])throw Error('area-registry-path-without-view: '+path.id);
 return areas;
}
export const NATIVE_AREAS=loadAreaRegistry();
export const inspectAreaRegistry=()=>({source:'worlds/app.project/area-registry.sop',wires:AREA_REGISTRY,schema:AREA_SCHEMA});
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
