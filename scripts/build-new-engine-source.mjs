// Build only the declared value-lookup context used by native execution.
// Schema modules, vocabulary and knowledge keep their source ownership; no editor state is bundled.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {World,str} from '../src/vendor/sopworld/sopworld.mjs';
import {executionPolicyWorld} from '../src/dialog/execution-policy.mjs';
import {catalogFolder,emit,done} from './lib/generated.mjs';

const {dir,commit}=await catalogFolder(),catalog=JSON.parse(readFileSync(path.join(dir,'index.json'),'utf8'));
const entries=[...catalog.worlds,...(catalog.schemas??[])],byId=new Map(entries.map(entry=>[entry.id,entry]));
const read=file=>readFileSync(path.join(dir,file),'utf8');
const library=Object.fromEntries(entries.map(entry=>[entry.id,read(entry.schema)]));
const valueTypes=[...new Set([
 ...executionPolicyWorld().ofType('app.execution.values').map(row=>str(row.attrs.valueType[0])),
])].sort();
const world=new World({library}),sources=[],seen=new Set(),owners=[];
const record=(file,owner,role)=>{
 if(seen.has(file))return;seen.add(file);const text=read(file);
 sources.push({path:'docs/worlds/'+file,owner,role,sha256:createHash('sha256').update(text).digest('hex')});
 return text;
};
for(const [index,type]of valueTypes.entries()){
 const candidates=catalog.worlds.filter(entry=>entry.exports?.includes(type));
 if(candidates.length!==1)throw Error('execution-value-owner:'+type);
 const owner=candidates[0];if(owners.includes(owner.id))continue;owners.push(owner.id);
 world.load(`@execution.schema.${index} core.use world=${owner.id}`);
 // Only the shards holding facts of a declared value type (and the vocabulary) are execution context.
 const owned=valueTypes.filter(t=>owner.exports.includes(t)),holds=text=>owned.some(t=>new RegExp('^@\\S+ '+t.replace(/\./g,'\\.')+'( |$)','m').test(text));
 for(const shard of owner.shards??[]){const file=shard.path??shard.id+'.sop',vocabulary=file===owner.vocabulary;if(!vocabulary&&!holds(read(file)))continue;const text=record(file,owner.id,vocabulary?'vocabulary':'knowledge');if(text)world.load(text);}
 // A vocabulary is an explicit dependency even when the catalog exposes it outside the shard list.
 if(owner.vocabulary){const text=record(owner.vocabulary,owner.id,'vocabulary');if(text)world.load(text);}
}
const schemaModules={};
for(const name of [...world.used].sort()){
 const entry=byId.get(name);if(!entry)continue;
 schemaModules[name]=read(entry.schema);record(entry.schema,name,'schema');
}
const spatialEntry=byId.get('k.spatial2d');
const spatial=spatialEntry&&{
 schema:record(spatialEntry.schema,spatialEntry.id,'schema'),
 facts:(spatialEntry.shards??[]).map(shard=>record(shard.path??shard.id+'.sop',spatialEntry.id,'knowledge')).filter(Boolean).join('\n'),
 policy:readFileSync(new URL('../worlds/app.project/spatial-placement.sop',import.meta.url),'utf8'),
};
const provenance=JSON.parse(readFileSync(new URL('../src/vendor/sopworld/provenance.json',import.meta.url),'utf8'));
const data={knowledgePin:commit,libraryPin:provenance.commit,sources,schemaModules,valueTypes,worlds:owners,spatial,snapshot:world.toJSON()};
// Prove that persisted context imports replay using only the separately held schema modules.
const restored=World.fromJSON(data.snapshot,{library:schemaModules});
for(const type of valueTypes)if(!restored.ofType(type).length)throw Error('empty-execution-value-type:'+type);
emit(new URL('../src/dialog/new-engine-source.mjs',import.meta.url).pathname,'// Generated execution knowledge context. Schema modules are separate dependencies, never instance facts.\nexport default '+JSON.stringify(data)+';\n');
console.log(`Execution knowledge: ${valueTypes.length} declared value families, ${sources.length} owned sources, catalog ${commit??'explicit folder'}`);
done('build-new-engine-source');
