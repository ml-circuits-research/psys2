// C1 source assembly for export-structural-bindings.mjs: the published declarations the structural bindings join, read
// from the catalog at the PSys2 pin (src/knowledge/catalog-pin.mjs). The execution context (src/dialog/new-engine-source.mjs)
// holds only value lookups, so the binding exporter needs its own source: the schema modules of the provider and entity
// families and their name-bearing facts and words. No model, corpus or evaluation input.
// usage: node training/sop-bert/build-binding-source.mjs OUT.mjs [CATALOG_FOLDER]
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {World,parse,format} from '../../src/vendor/sopworld/sopworld.mjs';
import {KIND_FAMILIES} from './export-structural-bindings.mjs';
const [out,given]=process.argv.slice(2);if(!out)throw Error('usage: build-binding-source.mjs OUT.mjs [CATALOG_FOLDER]');
const {pinnedCatalog}=await import('../../scripts/lib/catalog-pin.mjs');
const pinned=given?{dir:path.resolve(given),commit:null}:pinnedCatalog();
const catalog=JSON.parse(readFileSync(path.join(pinned.dir,'index.json'),'utf8'));
const entries=[...catalog.worlds,...(catalog.schemas??[])],byId=new Map(entries.map(e=>[e.id,e]));
const read=file=>readFileSync(path.join(pinned.dir,file),'utf8');
const library=Object.fromEntries(entries.map(e=>[e.id,read(e.schema)]));
// The provider value types and entity families the exporter reads, and the families its enrichment and catalogue join.
const providers=new Set(KIND_FAMILIES.flatMap(f=>f.providers));
const entities=KIND_FAMILIES.flatMap(f=>[...f.entities,...(f.entityBases??[])]);
const owner=id=>entries.filter(e=>id===e.id||id.startsWith(e.id+'.')).sort((a,b)=>b.id.length-a.id.length)[0];
const worlds=new Set([...[...providers,...entities].map(id=>owner(id)?.id).filter(Boolean),'k.units','k.attributes','k.diagrams','k.charts']);
const world=new World({library});const sources=[];
for(const id of [...worlds].sort())world.load(`@binding.source.${id.replace(/\./g,'_')} core.use world=${id}`);
for(const id of [...worlds].sort()){
 const entry=byId.get(id);if(!entry)continue;
 // Every shard of the world, listed or not (a schema-only index entry still owns its vocabulary shard).
 const shardDir=path.join(pinned.dir,id,'shards'),files=existsSync(shardDir)?readdirSync(shardDir).filter(f=>f.endsWith('.sop')).sort().map(f=>id+'/shards/'+f):[];
 for(const file of files){
  const text=read(file);
  // Name-bearing provider facts and the words that name them or the entity families; geometry and other facts stay in the catalog.
  const keep=parse(text).filter(w=>!w.pattern&&(providers.has(w.type)||w.type==='core.word'));
  if(!keep.length)continue;
  const result=world.tell(keep.map(format).join('\n'),{factsOnly:true});
  if(!result.ok)throw Error('binding source does not load '+file+': '+JSON.stringify(result.violations?.slice(0,3)));
  sources.push({path:'docs/worlds/'+file,owner:id,wires:keep.length});
 }
}
const provenance=JSON.parse(readFileSync(new URL('../../src/vendor/sopworld/provenance.json',import.meta.url),'utf8'));
const schemaModules=Object.fromEntries([...world.used].sort().filter(name=>byId.has(name)).map(name=>[name,library[name]]));
const data={knowledgePin:pinned.commit,libraryPin:provenance.commit,sources,schemaModules,snapshot:world.toJSON()};
World.fromJSON(data.snapshot,{library:schemaModules});
writeFileSync(out,'// Generated binding source (training/sop-bert/build-binding-source.mjs). Not a runtime module.\nexport default '+JSON.stringify(data)+';\n');
console.log(JSON.stringify({knowledgePin:data.knowledgePin,worlds:[...worlds].sort(),sources:sources.length,schemaModules:Object.keys(schemaModules).length,bytes:JSON.stringify(data).length}));
