// SPDX-License-Identifier: AGPL-3.0-only
// One explicit application composition for browser packaging and shipped replay.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import{pathToFileURL}from'node:url';
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
 const composition=await readDemoComposition(),loaderFS=createFsLoader({roots:[root]});
 const source=await selectWorlds(loaderFS,composition.worlds),repo=path.dirname(root),modules=new Map();
 const moduleFor=async descriptor=>{if(!modules.has(descriptor.module))modules.set(descriptor.module,import(pathToFileURL(path.join(repo,descriptor.module)).href));return modules.get(descriptor.module);};
 const initializer=async id=>{const descriptor=composition.profiles[id]?.nativeInitializer;if(!descriptor)return source.loadOps(id);const module=await moduleFor(descriptor);if(typeof module[descriptor.export]!=='function')throw Error('Missing native initializer '+id);return {initialState:module[descriptor.export]};};
 const loader={...source,composition,retiredAreas:composition.retiredAreas??[],always:composition.always,
  filesFor:id=>[...new Set([...(composition.profiles[id]?.profileFiles??[]),...(composition.profiles[id]?.sourceFiles??[]),...(composition.profiles[id]?.schemaFiles??[]).filter(entry=>entry.role==='native-tool-interface').map(entry=>entry.file)])],
  readFile:async(id,file)=>{
   const profile=composition.profiles[id];
   if(!profile)return null;
   if(profile.profileFiles?.includes(file))return readFile(new URL('./native-demo/'+id+'/'+file,import.meta.url),'utf8');
   if(profile.sourceFiles?.includes(file))return source.readFile(id,file);
   const tool=profile.schemaFiles?.find(entry=>entry.file===file&&entry.role==='native-tool-interface');
   return tool ? loaderFS.readFile(tool.owner??id,tool.source??file) : null;
  },
  loadOps:initializer,loadFns:async()=>null};
 const set=await loadWorlds(loader,{reasoner:'matrix'});validateDependencies(set);
 if(set.allErrors().length)throw Error('Native demo declarations: '+JSON.stringify(set.allErrors()));
 return loader;
}
