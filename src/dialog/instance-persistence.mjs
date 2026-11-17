// Versioned SOP instances; native projections are admitted only after their declared view agrees.
import{serializeInstanceState,readInstanceState,instanceStateWorld}from'../vendor/sopworld/sopworld.mjs';
import{NATIVE_AREAS,createAreaHost}from'./app-reader-context.mjs';
import{nativeObservationObjects,compareInstanceObjects}from'./instance-facts.mjs';
import{instanceIdFor}from'./instance-identity.mjs';
import{copyHostData}from'../../worlds/native-tool-host.mjs';
import{CATALOG_PIN}from'../knowledge/catalog-pin.mjs';
export const NATIVE_INSTANCE_SCHEMA='psys2.native-instance/1';
const byWorld=new Map(Object.values(NATIVE_AREAS).map(a=>[a.world,a]));
const create=(session,area,state,instanceId)=>createAreaHost(area,{state,instanceId,loader:session.engine?.loader,knowledge:session.engine?.knowledge});
export async function snapshotNativeInstances(session,{worlds=[...byWorld.keys()]}={}){
 session.nativeInstanceRevisions??={};session.nativeInstanceSnapshots??={};session.instanceWorlds??={};const records=[];
 for(const world of [...new Set(worlds)]){
  const area=byWorld.get(world),state=session.isession.state[world];if(!area||!state)continue;
  const instanceId=instanceIdFor(session,world),host=await create(session,area,state,instanceId),objects=nativeObservationObjects(host.observe()),projection=copyHostData(state);
  const canonical=JSON.stringify({objects,projection}),prior=session.nativeInstanceSnapshots[world];
  if(prior!==undefined&&prior!==canonical)session.nativeInstanceRevisions[world]=(session.nativeInstanceRevisions[world]??0)+1;
  const revision=session.nativeInstanceRevisions[world]??0;
  const wires=serializeInstanceState({instanceId,world,schemaVersion:NATIVE_INSTANCE_SCHEMA,revision,objects,projection,metadata:{knowledge:{repository:CATALOG_PIN.repo,version:CATALOG_PIN.commit},projection:'native-host-data/1'}});
  session.nativeInstanceSnapshots[world]=canonical;session.instanceWorlds[world]=instanceStateWorld(wires);
  records.push({world,instanceId,revision,wires});
 }
 return records;
}
/** All records validate before any state is adopted. Failed archives remain owned by the storage caller. */
export async function restoreNativeInstances(session,records){
 if(!Array.isArray(records))throw Error('invalid-instance-records');const staged=[],worlds=new Set(),ids=new Set();
 for(const record of records){
  const archive=readInstanceState(record.wires),area=byWorld.get(archive.world);
  if(!area||record.world!==archive.world||record.instanceId!==archive.instanceId||record.revision!==archive.revision||worlds.has(archive.world)||ids.has(archive.instanceId))throw Error('instance-descriptor-conflict');
  if(archive.schemaVersion!==NATIVE_INSTANCE_SCHEMA||archive.metadata?.projection!=='native-host-data/1'||!Number.isSafeInteger(archive.revision)||archive.revision<0)throw Error('instance-schema-migration-required');
  if(archive.metadata?.knowledge?.version!==CATALOG_PIN.commit)throw Error('instance-knowledge-migration-required');
  const state=copyHostData(archive.projection),host=await create(session,area,state,archive.instanceId),checked=compareInstanceObjects(archive.objects,host.observe());
  if(!checked.ok)throw Error('instance-projection-mismatch:'+checked.reason);
  staged.push({archive,state,world:instanceStateWorld(record.wires)});worlds.add(archive.world);ids.add(archive.instanceId);
 }
 session.nativeInstanceIds??={};session.nativeInstanceRevisions??={};session.nativeInstanceSnapshots??={};session.instanceWorlds??={};
 for(const {archive,state,world}of staged){session.isession.state[archive.world]=state;session.nativeInstanceIds[archive.world]=archive.instanceId;session.nativeInstanceRevisions[archive.world]=archive.revision;session.nativeInstanceSnapshots[archive.world]=JSON.stringify({objects:archive.objects,projection:state});session.instanceWorlds[archive.world]=world;}
 return {worlds:[...worlds]};
}
