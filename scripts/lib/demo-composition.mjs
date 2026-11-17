// SPDX-License-Identifier: AGPL-3.0-only
// One explicit application composition for browser packaging and shipped replay.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import{pathToFileURL}from'node:url';
import{serializeInstanceState,instanceStateWorld,serialize}from'../../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../../src/worlds/index.mjs';

export async function selectWorlds(loader, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Composition requires unique world identifiers');
  const available = new Set(await loader.listWorlds());
  for (const id of ids) if (!available.has(id)) throw new Error(`Composition names missing world ${id}`);
  const selected = new Set(ids);
  return {
    listWorlds: async () => [...selected],
    readFile: (id, file) => selected.has(id) ? loader.readFile(id, file) : Promise.resolve(null),
    loadOps: (id) => selected.has(id) ? loader.loadOps(id) : Promise.resolve(null),
    loadFns: (id) => selected.has(id) ? loader.loadFns(id) : Promise.resolve(null),
  };
}

export function validateDependencies(set) {
  const ids = new Set(set.list().map((w) => w.id));
  for (const w of set.list()) for (const kind of ['imports', 'reads', 'compose']) {
    for (const id of w[kind] ?? []) if (!ids.has(id)) throw new Error(`Composition: ${w.id} ${kind} missing world ${id}`);
  }
}

export async function readDemoComposition(){return JSON.parse(await readFile(new URL('./demo-composition.json',import.meta.url),'utf8'));}
export async function createDemoLoader({root=DEFAULT_ROOT}={}){
 const composition=await readDemoComposition(),source=await selectWorlds(createFsLoader({roots:[root]}),composition.worlds),repo=path.dirname(root),modules=new Map(),interfaces=new Map();
 const moduleFor=async descriptor=>{if(!modules.has(descriptor.module))modules.set(descriptor.module,import(pathToFileURL(path.join(repo,descriptor.module)).href));return modules.get(descriptor.module);};
 const initializer=async id=>{const descriptor=composition.profiles[id]?.nativeInitializer;if(!descriptor)return source.loadOps(id);const module=await moduleFor(descriptor);if(typeof module[descriptor.export]!=='function')throw Error('Missing native initializer '+id);return {initialState:module[descriptor.export]};};
 const interfaceOf=async id=>{
  if(interfaces.has(id))return interfaces.get(id);
  const profile=composition.profiles[id],hostModule=await moduleFor(profile.nativeHost),init=await initializer(id),host=await hostModule[profile.nativeHost.factory]({state:init.initialState(),instanceId:'native-interface.'+id}),operations=host.bindings();
  const schema=await readFile(new URL('./native-demo/interface-schema.sop',import.meta.url),'utf8'),objects=[];
  for(const [index,type]of [...new Set(operations.map(operation=>operation.on).filter(Boolean))].entries())objects.push({id:'native.kind.'+index,type:'app.native.kind',attributes:{name:[type]}});
  for(const [index,operation]of operations.entries()){
   const operationId='native.operation.'+index;
   objects.push({id:operationId,type:'app.native.operation',attributes:{id:[operation.id],...(operation.act?{act:[operation.act]}:{}),...(operation.on?{on:[operation.on]}:{}),definition:[operation]}});
   for(const [parameterIndex,[name,parameter]]of Object.entries(operation.params).entries())objects.push({id:'native.parameter.'+index+'.'+parameterIndex,type:'app.native.parameter',attributes:{name:[name],type:[parameter.type],...Object.fromEntries(Object.entries(parameter).filter(([key])=>['required','nullable','min','max'].includes(key)).map(([key,value])=>[key,[value]])),definition:[parameter]},relations:{operation:[operationId]}});
  }
  const archive=serializeInstanceState({instanceId:'native.interface.'+id,world:profile.schemaWorld,schemaVersion:'native-interface/1',revision:0,objects,projection:null}),world=instanceStateWorld(archive,{schema}),text=schema+'\n'+serialize([...world.wires.values()])+'\n';
  interfaces.set(id,text);return text;
 };
 const loader={...source,composition,retiredAreas:composition.retiredAreas??[],always:composition.always,
  filesFor:id=>[...(composition.profiles[id]?.profileFiles??[]),...(composition.profiles[id]?.sourceFiles??[]),...(composition.profiles[id]?.nativeHost?['native-interface.sop']:[])],
  readFile:async(id,file)=>{const profile=composition.profiles[id];if(!profile)return null;if(profile.profileFiles?.includes(file))return readFile(new URL('./native-demo/'+id+'/'+file,import.meta.url),'utf8');if(profile.sourceFiles?.includes(file))return source.readFile(id,file);if(file==='native-interface.sop'&&profile.nativeHost)return interfaceOf(id);return null;},
  loadOps:initializer,loadFns:async()=>null};
 const set=await loadWorlds(loader,{reasoner:'matrix'});validateDependencies(set);
 if(set.allErrors().length)throw Error('Native demo declarations: '+JSON.stringify(set.allErrors()));
 return loader;
}
