// Native-interface identities supplement, rather than replace, published semantics.
export function mergeNativeReaderBindings(base,overlay){
 if(base?.format!=='sop.structural-bindings/1'||overlay?.format!=='sop.structural-bindings/1')throw Error('invalid-native-reader-binding-overlay');
 const result=structuredClone(base);
 for(const [family,identity]of [['families',r=>JSON.stringify([r.area,r.type])],['properties',r=>JSON.stringify([r.area,r.key])]]){
  const existing=new Set((result[family]??[]).map(identity));result[family]??=[];
  for(const record of overlay[family]??[])if(!existing.has(identity(record))){result[family].push(structuredClone(record));existing.add(identity(record));}
 }
 result.nativeInterfaces=structuredClone(overlay.nativeInterfaces??[]);
 result.readerAreaByView={...base.readerAreaByView,...overlay.readerAreaByView};
 result.unresolved=[...(base.unresolved??[]),...(overlay.unresolved??[])];
 return result;
}
