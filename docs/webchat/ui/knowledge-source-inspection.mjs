// Exact source inspection is separate from catalog parsing, reasoning and execution.
const sopPath=path=>typeof path==='string'&&path.length<=512&&/^[A-Za-z0-9_.\/-]+\.sop$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(part=>part==='.'||part==='..');
export async function inspectCatalogSources({nodeId,index,readText,offset=0,maxFiles=8,maxBytes=2*1024*1024}){
 if(typeof nodeId!=='string'||typeof readText!=='function'||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>8||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024)throw Error('invalid-source-inspection-request');
 const worlds=Array.isArray(index?.worlds)?index.worlds:[],world=worlds.find(world=>nodeId==='knowledge-world:'+world.id);
 const pathsFor=world=>[...(world.schema?[{path:world.schema,role:'schema'}]:[]),...(world.shards??[]).map(shard=>({path:shard.path,role:'shard',...(Number.isSafeInteger(shard.bytes)?{bytes:shard.bytes}:{})}))].map(source=>{if(!sopPath(source.path))throw Error('invalid-catalog-sop-path');return {...source,nodeId:'knowledge-file:'+source.path,sourceWorld:world.id,language:'sop'};});
 const declared=world?pathsFor(world):worlds.flatMap(pathsFor).filter(source=>nodeId===source.nodeId),availableSources=[...new Map(declared.map(source=>[source.path,source])).values()];
 if(!world&&availableSources.length!==1)throw Error('unknown-catalog-source-node');
 if(offset>availableSources.length)throw Error('invalid-source-inspection-offset');
 const sources=[],errors=[];let position=offset,totalBytes=0;
 for(;position<availableSources.length&&position-offset<maxFiles;position++){
  const descriptor=availableSources[position];
  if(descriptor.bytes>maxBytes){if(!world)throw Error('catalog-source-exceeds-byte-limit');errors.push({path:descriptor.path,reason:'catalog-source-exceeds-byte-limit',declaredBytes:descriptor.bytes});continue;}
  if(totalBytes&&descriptor.bytes>maxBytes-totalBytes)break;
  const text=await readText(descriptor.path);
  if(typeof text!=='string'){errors.push({path:descriptor.path,reason:'catalog-source-unavailable'});continue;}
  const bytes=new TextEncoder().encode(text).length;
  if(bytes>maxBytes){if(!world)throw Error('catalog-source-exceeds-byte-limit');errors.push({path:descriptor.path,reason:'catalog-source-exceeds-byte-limit',bytes});continue;}
  if(bytes+totalBytes>maxBytes)break;
  totalBytes+=bytes;sources.push({...descriptor,text,bytes,purpose:'inspection',loaded:true,compiledByInspection:false});
 }
 return {nodeId,status:position<availableSources.length?'partial':errors.length?'unavailable':'loaded',inspectionOnly:true,runtimeUseStatus:'unchanged',compiledByInspection:false,truncated:false,sources,errors,availableSources,totalFiles:availableSources.length,nextOffset:position<availableSources.length?position:null,bytes:totalBytes};
}
