// Read the catalog module and its declared schema dependencies once per catalog.
// Each request derives regions from just its subject names, visible support kinds and layout.
import {World,quote,serialize,str} from '../vendor/sopworld/sopworld.mjs';

const moduleName='k.composition2d';
const schemas=new WeakMap();

async function compositionSchema(catalog){
 if(!schemas.has(catalog)){
  const pending=(async()=>{
   const library={},seen=new Set();
   async function load(id){
    if(seen.has(id))return;
    seen.add(id);
    const entry=await catalog.world(id);
    if(!entry)throw Error('missing-composition-schema:'+id);
    const [source]=await Promise.all([catalog.readText(entry.schema),...entry.depends.map(load)]);
    if(!source)throw Error('empty-composition-schema:'+id);
    library[id]=source;
   }
   await load(moduleName);
   const world=new World({library});
   if(!world.use(moduleName).ok)throw Error('invalid-composition-schema');
   return world;
  })();
  schemas.set(catalog,pending);
  pending.catch(()=>schemas.delete(catalog));
 }
 return schemas.get(catalog);
}

export async function readCompositionRegions(knowledge,{subjects,anchors,layout}){
 const catalog=knowledge?.base??knowledge;
 if(!catalog?.wireSource||!subjects.length)return '';
 const [base,things,slots,supports]=await Promise.all([
  compositionSchema(catalog),
  catalog.wireSource('k.scenes.thing',{keys:subjects}),
  catalog.wireSource('k.layouts.slot',{key:layout}),
  catalog.wireSource('k.layouts.anchor',{keys:anchors}),
 ]);
 const world=base.fork();
 const requests=[...new Set(subjects)].map((subject,index)=>'@composition.subject.'+index+' k.composition2d.subject name='+quote(subject));
 const derived=world.tell([things,slots,supports,...requests].join('\n'));
 if(!derived.ok)throw Error('invalid-composition-knowledge:'+derived.violations[0]?.kind);
 const candidates=[...world.ofType(moduleName+'.slot').filter(row=>str(row.attrs.layout[0])===layout),
  ...world.ofType(moduleName+'.anchor').filter(row=>anchors.includes(str(row.attrs.of[0])))];
 const evidence=new Set(candidates.flatMap(row=>row.attrs.evidence??[]));
 return serialize([...evidence].map(ref=>world.get(ref.slice(1))).concat(candidates));
}
