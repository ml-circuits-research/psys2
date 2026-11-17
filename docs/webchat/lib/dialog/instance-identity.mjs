// Stable identity of an editor's live instance, independent of host wrappers and display labels.
export function instanceIdFor(session,world){
 session.nativeInstanceIds??={};
 return session.nativeInstanceIds[world]??=(globalThis.crypto.randomUUID());
}
