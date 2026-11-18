// Stable identity of an editor's live instance, independent of host wrappers and display labels.
export function instanceIdFor(session,world){
 session.nativeInstanceIds??={};
 return session.nativeInstanceIds[world]??=(globalThis.crypto.randomUUID());
}

// Host wrappers are short lived. An editor's object epochs belong to its live instance.
const identities = new WeakMap();
export function identityRegistryFor(session,world){
 const instance=instanceIdFor(session,world);
 if(!identities.has(session))identities.set(session,new Map());
 const byInstance=identities.get(session);
 if(!byInstance.has(instance))byInstance.set(instance,new Map());
 return byInstance.get(instance);
}

export function nativeIdentitySnapshot(session){
 const byInstance=identities.get(session),liveInstances=new Set(Object.values(session.nativeInstanceIds??{}));
 return [...(byInstance??[])].filter(([instance])=>liveInstances.has(instance)).map(([instance,scopes])=>
  [instance,[...scopes].map(([scope,{sequence,live}])=>[scope,sequence,[...live]])]);
}

export function restoreNativeIdentitySnapshot(session,entries){
 if(!Array.isArray(entries))return;
 const liveInstances=new Set(Object.values(session.nativeInstanceIds??{}));
 const valid=entries.filter(entry=>Array.isArray(entry)&&liveInstances.has(entry[0])&&Array.isArray(entry[1]));
 const byInstance=new Map();
 for(const [instance,entries] of valid){
  const scopes=new Map();
  for(const entry of entries){
   if(!Array.isArray(entry))continue;
   const [scope,sequence,live]=entry;
   if(typeof scope==='string'&&Number.isSafeInteger(sequence)&&sequence>=0&&Array.isArray(live)&&
    live.every(row=>Array.isArray(row)&&typeof row[0]==='string'&&Number.isSafeInteger(row[1])&&row[1]>0&&row[1]<=sequence)){
    scopes.set(scope,{sequence,live:new Map(live)});
   }
  }
  byInstance.set(instance,scopes);
 }
 identities.set(session,byInstance);
}
