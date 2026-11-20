// Versioned SOP instances; native projections are admitted only after their declared view agrees.
import{serializeInstanceState,readInstanceState,instanceStateWorld,serialize}from'../vendor/sopworld/sopworld.mjs?v=ebb9691a80';
import{NATIVE_AREAS,createAreaHost}from'./app-reader-context.mjs?v=ce8695be6e';
import{nativeObservationObjects,compareInstanceObjects}from'./instance-facts.mjs?v=ea78d1b6dc';
import{instanceIdFor}from'./instance-identity.mjs?v=024ef1ca83';
import{copyHostData}from'../../worlds/native-tool-host.mjs?v=48825109bb';
import{peekAreaBase,observationSupport}from'../../worlds/sop-area.mjs?v=8471db5800';
import{CATALOG_PIN}from'../knowledge/catalog-pin.mjs?v=6517940d74';
export const NATIVE_INSTANCE_SCHEMA='psys2.native-instance/1';
const RUNTIME_SCHEMA='psys2.native-runtime/1';
const byWorld=new Map(Object.values(NATIVE_AREAS).map(a=>[a.world,a]));
const create=(session,area,state,instanceId,prepareKnowledge=true)=>createAreaHost(area,{state,instanceId,prepareKnowledge,loader:session.engine?.loader,knowledge:session.engine?.knowledge});
function runtimeFromArchive(record,area){
 if(!Object.hasOwn(record,'runtime'))return {};
 if(!area.separateRuntime||typeof record.runtime!=='string')throw Error('unexpected-instance-runtime');
 const data=readInstanceState(record.runtime);
 if(data.schemaVersion!==RUNTIME_SCHEMA||data.world!==record.world||data.instanceId!==record.instanceId||data.revision!==record.revision||
  data.objects.length||!data.projection||typeof data.projection!=='object'||Array.isArray(data.projection))throw Error('instance-runtime-mismatch');
 return {runtime:data.projection};
}

/** Observe a compact semantic World without serializing native render caches or undo history.
 * Optional native interface metadata reuses this same host and observation for inspection.
 * prepareKnowledge=false is read-only inspection: an area whose base this session has not prepared gets no host
 * (creating one would read its knowledge and start its state); its record holds the instance facts it has.
 * includeSupport adds, per observed object, the state facts its observation was derived from. */
export async function observeNativeInstanceWorlds(session,{worlds=[...byWorld.keys()],includeHostInterface=false,includeSupport=false,prepareKnowledge=true}={}){
 session.nativeInstanceRevisions??={};session.nativeInstanceSnapshots??={};session.instanceWorlds??={};const records=[];
 for(const world of [...new Set(worlds)]){
  const area=byWorld.get(world),state=session.isession.state[world];if(!area||!state)continue;
  if(!prepareKnowledge&&area.stateWorld&&!peekAreaBase(world)){
   const instanceId=instanceIdFor(session,world),revision=session.nativeInstanceRevisions[world]??0,semantic=area.stateWorld(state);
   records.push({world,instanceId,revision,wires:serialize([...semantic.wires.values()]),carrier:serializeInstanceState({instanceId,world,schemaVersion:NATIVE_INSTANCE_SCHEMA,revision,objects:[],projection:null}),observation:null,prepared:false,authoritative:true,schema:area.stateSchema??null});
   continue;
  }
  const instanceId=instanceIdFor(session,world),host=await create(session,area,state,instanceId,prepareKnowledge),observation=host.observe(),objects=nativeObservationObjects(observation),canonical=JSON.stringify({objects,projection:state}),prior=session.nativeInstanceSnapshots[world];
  if(prior!==undefined&&prior!==canonical)session.nativeInstanceRevisions[world]=(session.nativeInstanceRevisions[world]??0)+1;
  const revision=session.nativeInstanceRevisions[world]??0,carrier=serializeInstanceState({instanceId,world,schemaVersion:NATIVE_INSTANCE_SCHEMA,revision,objects,projection:null});
  const semantic=area.stateWorld?area.stateWorld(state):instanceStateWorld(carrier);session.instanceWorlds[world]=semantic;session.nativeInstanceSnapshots[world]=canonical;
  records.push({world,instanceId,revision,wires:serialize([...semantic.wires.values()]),carrier,observation,prepared:true,authoritative:!!area.stateWorld,schema:area.stateSchema??null,...(includeSupport?{observationSupport:observationSupport(world,state)}:{}),...(includeHostInterface?{nativeInterface:{operations:host.bindings(),capabilities:host.capabilities?.()??null}}:{})});
 }
 return records;
}
export async function snapshotNativeInstances(session,{worlds=[...byWorld.keys()]}={}){
 session.nativeInstanceRevisions??={};session.nativeInstanceSnapshots??={};session.instanceWorlds??={};const records=[];
 for(const world of [...new Set(worlds)]){
  const area=byWorld.get(world),state=session.isession.state[world];if(!area||!state)continue;
  const instanceId=instanceIdFor(session,world),host=await create(session,area,state,instanceId),objects=nativeObservationObjects(host.observe()),projection=copyHostData(state);
  const canonical=JSON.stringify({objects,projection}),prior=session.nativeInstanceSnapshots[world];
  if(prior!==undefined&&prior!==canonical)session.nativeInstanceRevisions[world]=(session.nativeInstanceRevisions[world]??0)+1;
  const revision=session.nativeInstanceRevisions[world]??0;
  const wires=area.stateWorld?serialize([...area.stateWorld(state).wires.values()]):serializeInstanceState({instanceId,world,schemaVersion:NATIVE_INSTANCE_SCHEMA,revision,objects,projection,metadata:{knowledge:{repository:CATALOG_PIN.repo,version:CATALOG_PIN.commit},projection:'native-host-data/1'}});
  session.nativeInstanceSnapshots[world]=canonical;session.instanceWorlds[world]=area.stateWorld?area.stateWorld(state):instanceStateWorld(wires);
  const runtimeData=area.separateRuntime?(Object.hasOwn(state,'runtime')?state.runtime:area.canonicalizeState(state).runtime):undefined;
  const runtime=runtimeData===undefined?undefined:serializeInstanceState({instanceId,world,schemaVersion:RUNTIME_SCHEMA,revision,objects:[],projection:runtimeData});
  records.push({world,instanceId,revision,wires,...(runtime===undefined?{}:{runtime})});
 }
 return records;
}
/** All records validate before any state is adopted. Failed archives remain owned by the storage caller. */
export async function restoreNativeInstances(session,records){
 if(!Array.isArray(records))throw Error('invalid-instance-records');const staged=[],worlds=new Set(),ids=new Set();
 for(const record of records){
  const canonicalArea=byWorld.get(record.world);
  if(canonicalArea?.stateWorld&&!record.wires.includes(' std.instance.snapshot ')){
   if(typeof record.instanceId!=='string'||!record.instanceId||!Number.isSafeInteger(record.revision)||record.revision<0||worlds.has(record.world)||ids.has(record.instanceId))throw Error('instance-descriptor-conflict');
   const state=canonicalArea.canonicalizeState({sop:record.wires,...runtimeFromArchive(record,canonicalArea)}),world=canonicalArea.stateWorld(state),host=await create(session,canonicalArea,state,record.instanceId),objects=nativeObservationObjects(host.observe());
   staged.push({archive:{world:record.world,instanceId:record.instanceId,revision:record.revision},state,objects,world});worlds.add(record.world);ids.add(record.instanceId);continue;
  }
  if(Object.hasOwn(record,'runtime'))throw Error('unexpected-instance-runtime');
  const archive=readInstanceState(record.wires),area=byWorld.get(archive.world);
  if(!area||record.world!==archive.world||record.instanceId!==archive.instanceId||record.revision!==archive.revision||worlds.has(archive.world)||ids.has(archive.instanceId))throw Error('instance-descriptor-conflict');
  if(archive.schemaVersion!==NATIVE_INSTANCE_SCHEMA||archive.metadata?.projection!=='native-host-data/1'||!Number.isSafeInteger(archive.revision)||archive.revision<0)throw Error('instance-schema-migration-required');
  if(archive.metadata?.knowledge?.version!==CATALOG_PIN.commit)throw Error('instance-knowledge-migration-required');
  const projection=copyHostData(archive.projection);
  const original=area.legacyHost?await create(session,{...area,create:area.legacyHost},projection,archive.instanceId):null;
  const verify=host=>{const checked=compareInstanceObjects(archive.objects,host.observe());if(!checked.ok)throw Error('instance-projection-mismatch:'+checked.reason);};
  if(original)verify(original);
  const state=area.canonicalizeState?area.canonicalizeState(projection):projection,host=await create(session,area,state,archive.instanceId);
  if(!original)verify(host);
  staged.push({archive,state,objects:nativeObservationObjects(host.observe()),world:area.stateWorld?area.stateWorld(state):instanceStateWorld(record.wires)});worlds.add(archive.world);ids.add(archive.instanceId);
 }
 session.nativeInstanceIds??={};session.nativeInstanceRevisions??={};session.nativeInstanceSnapshots??={};session.instanceWorlds??={};
 for(const {archive,state,objects,world}of staged){session.isession.state[archive.world]=state;session.nativeInstanceIds[archive.world]=archive.instanceId;session.nativeInstanceRevisions[archive.world]=archive.revision;session.nativeInstanceSnapshots[archive.world]=JSON.stringify({objects,projection:state});session.instanceWorlds[archive.world]=world;}
 return {worlds:[...worlds]};
}
