import {CHART_KIND_PARAMETERS,CHART_PROPERTY_ALIGNMENTS} from '../../worlds/data.charts/declared-host.mjs';
import {validateSemanticCatalogue,planCatalogueEnrichment} from './semantic-alignment-catalogue.mjs';
// C1 authorial declaration alignment. Never reads messages, evaluation or owner rows.
import {readFile,writeFile,link,chmod,lstat,statfs} from 'node:fs/promises';import {resolve,dirname,join,relative} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact raw inventory descriptor -> published semantic declaration -> actual
// operation parameter. This is reviewed C1 data, not prefix/name inference.
export const PROPERTY_ALIGNMENTS=[
 ['drawing','drawn.colour','k.attributes.attribute.colour','colour','string','drawing','drawing.object.change','color'],
 ['drawing','drawn.size','k.attributes.attribute.size','size','string','drawing','drawing.object.change','size'],
 ['diagram','node.colour','k.attributes.attribute.colour','colour','string','diagram','diagram.node.change','colour'],
 ['diagram','node.size','k.attributes.attribute.size','size','string','diagram','diagram.node.change','size'],
 ['diagram','node.label','w.diagram.node.label','w.diagram.node.label','string','diagram','diagram.node.change','label'],
 ['diagram','node.shape','w.diagram.node.shape','w.diagram.node.shape','string','diagram','diagram.node.make','kind'],
 ['diagram','diagram.layout','w.diagram.diagram.layout','w.diagram.diagram.layout','string','diagram','diagram.node.layout','layout'],
 ['document','text.title','w.document.document.title','w.document.document.title','string','document','document.write','title'],
 ['document','text.about','w.document.document.topic','w.document.document.topic','string','document','document.write','topic'],
 ['document','text.genre','w.document.document.genre','w.document.document.genre','string','document','document.write','genre'],
 ['document','text.words','w.document.document.words','w.document.document.words','literal','document','document.compose','words'],
 ['calendar','meeting.title','w.calendar.event.title','w.calendar.event.title','string','calendar','calendar.meeting.change','title'],
 ['calendar','meeting.day','w.calendar.event.date','w.calendar.event.date','string','calendar','calendar.meeting.change','start'],
 ['calendar','meeting.time','w.calendar.event.start','w.calendar.event.start','string','calendar','calendar.meeting.change','start'],
 ['calendar','meeting.length','k.attributes.family.duration','k.time.duration','string','calendar','calendar.meeting.change','duration'],
 ['calendar','person.name','w.person.person.name','w.person.person.name','string','calendar','calendar.person.change','label'],
].map(([area,key,sourceWire,canonical,valueKind,host,operation,parameter])=>({area,key,sourceWire,canonical,valueKind,host,operation,parameter}));
const NATIVE_KIND_FAMILIES={'avatar.part':['avatar','avatar.part.add'],'drawing.drawn':['drawing','drawing.object.make'],'diagram.node':['diagram','diagram.node.make'],'diagram.link':['diagram','diagram.link.make'],'document.text':['document','document.write'],'calendar.meeting':['calendar','calendar.meeting.add'],'calendar.person':['calendar','calendar.person.add']};
export const KIND_FAMILIES=[
 // k.scenes.thing is not a provider: it describes the usual place and size of a thing named as its k.objects drawing
 // (the same name, k.scenes schema), so it adds no meaning of its own and would only collide with that drawing.
 {area:'drawing',type:'drawn',providers:['k.shapes.shape','k.objects.object','k.animals.animal','k.people.kind'],entities:[]},
 {area:'drawing',type:'face',providers:[],entities:['w.face.face']},
 {area:'drawing',type:'part',providers:[],entities:[],entityBases:['w.face.part']},
 // The official-dataset label space reads the Avatar tab as its own area.
 {area:'avatar',type:'face',providers:[],entities:['w.face.face']},
 // nativeKinds: the catalog's declared join from an entity type to the tool's own kind name (w.face.slot: the part
 // type w.face.hair_front is drawn in the slot hair_front, the kind the Avatar tab observes).
 {area:'avatar',type:'part',providers:[],entities:[],entityBases:['w.face.part'],nativeKinds:{type:'w.face.slot',entity:'part',kind:'slot'}},
 {area:'diagram',type:'node',providers:['k.shapes.shape'],entities:['w.diagram.node']},
 {area:'diagram',type:'diagram',providers:['k.diagrams.kind','k.charts.kind'],entities:['w.diagram.diagram','w.chart.chart']},
 {area:'diagram',type:'chart',providers:['k.charts.kind'],entities:['w.chart.chart']},
 {area:'diagram',type:'link',providers:[],entities:['w.diagram.edge']},
 {area:'diagram',type:'group',providers:[],entities:['w.diagram.group']},
 {area:'document',type:'text',providers:['k.genres.genre'],entities:['w.document.document']},
 {area:'document',type:'section',providers:[],entities:['w.document.section','w.document.chapter','w.document.paragraph']},
 {area:'calendar',type:'meeting',providers:[],entities:['w.calendar.event']},
 {area:'calendar',type:'person',providers:['k.people.kind'],entities:['w.person.person']},
];
export function buildStructuralBindings({world,str,inventory,snapshotSHA,hostTables,propertyAlignments=PROPERTY_ALIGNMENTS,kindFamilies=KIND_FAMILIES,familyAlignments=[]}){
 const kinds=[],properties=[],units=[],families=[],unresolved=[],modules=world.modules(),words=world.ofType('core.word');
 const get=id=>world.get(id)||world.matrix?.get(id),owner=id=>modules.filter(m=>id===m.name||id.startsWith(m.name+'.')).sort((a,b)=>b.name.length-a.name.length)[0];
 const metadata=id=>{const wire=get(id),module=owner(id);if(!wire||!module||!module.version)throw Error('missing declaration/module '+id);return {sourceWire:id,sourceSnapshotSHA:snapshotSHA,sourceWorld:module.name,moduleVersion:String(module.version)};};
 const descriptor=(area,key)=>{for(const [type,row]of Object.entries(inventory[area]??{}))for(const [property,spec]of Object.entries(row.keys??{}))if(type+'.'+property===key)return {area,type,key:property,...spec};return null;};
 for(const family of kindFamilies){
  for(const provider of family.providers){const facts=world.ofType(provider);if(!facts.length)unresolved.push({family:'kinds',area:family.area,type:family.type,provider,reason:'provider-has-no-published-facts'});for(const wire of facts)for(const raw of wire.attrs.name??[]){const lemma=str(raw);if(!lemma||lemma.startsWith('?'))continue;kinds.push({area:family.area,type:family.type,lemma,canonical:wire.id,...metadata(wire.id),rawDescriptor:{area:family.area,type:family.type,kind:lemma},alignment:{kind:'whole-source-family',provider}});for(const word of words)if(word.attrs.of?.some(raw=>str(raw)===provider+'.name')&&word.attrs.means?.some(raw=>str(raw)===lemma))for(const alias of word.attrs.text??[])kinds.push({area:family.area,type:family.type,lemma:str(alias),canonical:wire.id,...metadata(word.id),rawDescriptor:{area:family.area,type:family.type,kind:str(alias)},meaningWire:wire.id,alignment:{kind:'source-word-value-join',provider,word:word.id}});}}
  const entities=new Set(family.entities);for(const base of family.entityBases??[])for(const declaration of world.matrix.values())if(declaration.type==='core.type'){const type=str(declaration.attrs.of[0]);if(world.schema(type)?.lineage.includes(base))entities.add(type);}
  for(const entity of entities){if(!get(entity)){unresolved.push({family:'kinds',area:family.area,type:family.type,sourceWire:entity,reason:'missing-entity-declaration'});continue;}for(const word of words)if(word.attrs.means?.some(raw=>str(raw)===entity))for(const raw of word.attrs.text??[]){const lemma=str(raw);if(lemma&&!lemma.startsWith('?'))kinds.push({area:family.area,type:family.type,lemma,canonical:entity,...metadata(word.id),rawDescriptor:{area:family.area,type:family.type,kind:lemma},meaningWire:entity,alignment:{kind:'owning-core.word',word:word.id}});}
   const join=family.nativeKinds;if(join)for(const fact of world.ofType(join.type))if(fact.attrs[join.entity]?.some(raw=>str(raw)===entity))for(const raw of fact.attrs[join.kind]??[]){const lemma=str(raw);
    // A native kind name that is already a word of the same entity ("beard") needs no second row.
    if(lemma&&!lemma.startsWith('?')&&!kinds.some(k=>k.area===family.area&&k.type===family.type&&k.lemma===lemma&&k.canonical===entity))kinds.push({area:family.area,type:family.type,lemma,canonical:entity,...metadata(fact.id),rawDescriptor:{area:family.area,type:family.type,kind:lemma},meaningWire:entity,alignment:{kind:'native-kind-join',join:fact.id}});}}
 }
 if(!Array.isArray(familyAlignments)||familyAlignments.length>256||!Array.isArray(propertyAlignments)||propertyAlignments.length>4096)throw Error('binding-alignment-budget');
 for(const mapping of familyAlignments){
  if(!mapping||typeof mapping.authority!=='string'||!mapping.authority.trim())throw Error('invalid-family-alignment-authority');
  if(!inventory[mapping.area]?.[mapping.type]||get(mapping.canonical)?.type!=='core.type'||get(mapping.canonical)?.attrs.of?.length!==1||str(get(mapping.canonical).attrs.of[0])!==mapping.canonical||mapping.sourceWire!==mapping.canonical){unresolved.push({family:'families',area:mapping.area,type:mapping.type,reason:'missing-or-incompatible-family-declaration'});continue;}
  families.push({area:mapping.area,type:mapping.type,canonical:mapping.canonical,...metadata(mapping.sourceWire),alignment:{kind:'explicit-raw-family-identity',authority:mapping.authority},...(mapping.evidence?{catalogueEvidence:mapping.evidence}:{})});
 }
 const chartAlignments=inventory.diagram?.chart?CHART_PROPERTY_ALIGNMENTS:[];
 propertyAlignments=[...propertyAlignments.filter(m=>!chartAlignments.some(c=>c.area===m.area&&c.key===m.key)),...chartAlignments];
 for(const mapping of propertyAlignments){
  const raw=descriptor(mapping.area,mapping.key),table=hostTables[mapping.host],op=table?.operations?.find(op=>op.id===mapping.operation),declaration=get(mapping.sourceWire);
  if(!raw||!declaration){unresolved.push({family:'properties',area:mapping.area,key:mapping.key,sourceWire:mapping.sourceWire,reason:!raw?'missing-inventory-descriptor':'missing-semantic-declaration'});continue;}
  const native=op&&Object.hasOwn(op.params??{},mapping.parameter);
  const record={area:mapping.area,key:mapping.key,canonical:mapping.canonical,valueKind:mapping.valueKind,...metadata(mapping.sourceWire),rawDescriptor:raw,...(mapping.projection?{projection:structuredClone(mapping.projection)}:{}),...(mapping.evidence?{catalogueEvidence:mapping.evidence,valueContract:mapping.valueContract}:{}),alignment:{kind:native?'explicit-C1-declaration-native-chain':'explicit-C1-semantic-declaration',authority:'Owner-authorized inventory/owning-declaration alignment; native capability is separate, no descriptor-prefix inference.',valueBoundary:'Raw annotation token only. Native values, units, date/time composition, regions and defaults require separate declared resolution.'}};
  if(native)record.hostBinding={id:op.id,sourceType:op.on,key:mapping.parameter,operation:op.id,parameter:mapping.parameter,exportName:table.exportName,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256,...(mapping.codec?{codec:mapping.codec}:{})};
  else {record.nativeCapability={status:'unsupported',reason:'missing-native-operation-parameter'};unresolved.push({family:'nativeCapabilities',area:mapping.area,key:mapping.key,reason:'missing-native-operation-parameter'});}
  properties.push(record);
 }
 for(const record of kinds){const chartParameters=record.area==='diagram'?CHART_KIND_PARAMETERS[record.canonical]:null;const route=chartParameters?['diagram','chart.make']:NATIVE_KIND_FAMILIES[record.area+'.'+record.type];if(!route)continue;const table=hostTables[route[0]],operation=table?.operations?.find(op=>op.id===route[1]);if(!operation)continue;record.nativeFamilyBinding={operation:operation.id,sourceType:operation.on,exportName:table.exportName,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256,...(chartParameters?{arguments:chartParameters}:{}),boundary:chartParameters?'Owning chart declaration maps semantic form to a native type; explicit data only.':'Family eligibility only; canonical-to-native kind/value conversion is not asserted.'};}
 // The projector's lookup is exact and single-valued. Keep ambiguity unresolved,
 // never select a provider from corpus frequency or a preferred acceptance row.
 const groups=new Map();for(const record of kinds){const key=JSON.stringify([record.area,record.type,record.lemma]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
 // A declared by-name reference joins two published meanings of one lemma: a candidate whose fact names another
 // candidate through a slot declared type=T by=name (an animal's drawing= names its k.objects drawing) denotes that
 // candidate's depiction, so the referenced one is the binding. Any candidate not joined keeps the ambiguity.
 const byName=[...world.matrix.values()].filter(w=>w.type==='core.slot'&&w.attrs.by?.some(v=>str(v)==='name')&&w.attrs.type?.length===1).map(w=>({of:str(w.attrs.of[0]),key:str(w.attrs.key[0]),type:str(w.attrs.type[0]),slot:w.id}));
 const joined=records=>{const facts=records.map(r=>({r,wire:get(r.canonical)}));
  for(const target of facts){const names=(target.wire?.attrs.name??[]).map(str);if(!names.length)continue;
   const rest=facts.filter(f=>f.r.canonical!==target.r.canonical);
   const proofs=rest.map(f=>byName.find(s=>s.of===f.wire?.type&&s.type===target.wire.type&&(f.wire.attrs[s.key]??[]).some(v=>names.includes(str(v)))));
   if(rest.length&&proofs.every(Boolean))return {canonical:target.r.canonical,slots:[...new Set(proofs.map(p=>p.slot))]};}
  return null;};
 const unique=[];for(let records of groups.values()){let canonicals=[...new Set(records.map(r=>r.canonical))];
  if(canonicals.length>1){const join=joined(records.filter((r,i,all)=>all.findIndex(x=>x.canonical===r.canonical)===i));if(join){records=records.filter(r=>r.canonical===join.canonical).map(r=>({...r,alignment:{...r.alignment,byNameJoin:join.slots}}));canonicals=[join.canonical];}}
  if(canonicals.length>1){unresolved.push({family:'kinds',rawDescriptor:records[0].rawDescriptor,reason:'ambiguous-canonical-kind',candidates:records.map(r=>({canonical:r.canonical,sourceWire:r.sourceWire,sourceWorld:r.sourceWorld,moduleVersion:r.moduleVersion,sourceSnapshotSHA:r.sourceSnapshotSHA,...(r.nativeFamilyBinding?{nativeFamilyBinding:r.nativeFamilyBinding}:{})}))});continue;}records.sort((a,b)=>a.sourceWire.localeCompare(b.sourceWire));unique.push({...records[0],supportingSourceWires:[...new Set(records.map(r=>r.sourceWire))]});}
 for(const wire of world.ofType('k.units.unit'))for(const raw of wire.attrs.name??[]){const lemma=str(raw);if(lemma&&!lemma.startsWith('?')){units.push({lemma,canonical:wire.id,...metadata(wire.id),rawDescriptor:{unit:lemma}});for(const word of words)if(word.attrs.of?.some(raw=>str(raw)==='k.units.unit.name')&&word.attrs.means?.some(raw=>str(raw)===lemma))for(const alias of word.attrs.text??[])units.push({lemma:str(alias),canonical:wire.id,...metadata(word.id),meaningWire:wire.id,rawDescriptor:{unit:str(alias)}});}}
 const covered=new Set(properties.map(r=>r.area+'\0'+r.key));for(const [area,types]of Object.entries(inventory))if(['drawing','diagram','document','calendar'].includes(area))for(const [type,row]of Object.entries(types))for(const key of Object.keys(row.keys??{}))if(!covered.has(area+'\0'+type+'.'+key))unresolved.push({family:'properties',area,key:type+'.'+key,rawDescriptor:descriptor(area,type+'.'+key),reason:'no-explicit-semantic-source-alignment'});

 const sort=values=>values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {format:'sop.structural-bindings/1',kindFamilyAlignment:'Whole published provider families and exact owning core.word meanings; canonical collisions unresolved, native capability not implied.',...(families.length?{families:sort(families)}:{}),kinds:sort(unique),properties:sort(properties),units:sort(units),unresolved:sort(unresolved)};
}
export function serializeBindingArtifacts(snapshot,result,{maxOutputBytes,compact=false}={}){
 if(typeof compact!=='boolean')throw Error('invalid-compact-option');
 const source=JSON.stringify(snapshot),bindings=(compact?JSON.stringify(result):JSON.stringify(result,null,2))+'\n',bytes=Buffer.byteLength(source)+Buffer.byteLength(bindings);
 if(maxOutputBytes!==undefined&&(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||bytes>maxOutputBytes))throw Error('binding-artifact-byte-budget');
 return {source,bindings,bytes};
}
async function main(){
 const [sourcePath,libraryPath,drawingHost,diagramHost,out,...rest]=process.argv.slice(2);if(!out)throw Error('usage: SOURCE LIBRARY DRAWING_AREA DIAGRAM_AREA OUT [--inventory PATH] [--native-root PATH] [--knowledge PATH] [--alignments PATH] [--max-output-bytes N] [--compact true] [--reuse-source-snapshot PATH] [--reserve-bytes N]');const opts={};for(let i=0;i<rest.length;i+=2){if(!['--inventory','--native-root','--knowledge','--alignments','--max-output-bytes','--compact','--reuse-source-snapshot','--reserve-bytes'].includes(rest[i])||!rest[i+1])throw Error('invalid option');opts[rest[i]]=rest[i+1];}
 const source=(await import(pathToFileURL(resolve(sourcePath)))).default,{World,str,parse,format,version}=await import(pathToFileURL(resolve(libraryPath))),world=World.fromJSON(source.snapshot,source.schemaModules?{library:source.schemaModules}:undefined),nativeRoot=resolve(opts['--native-root']??resolve(dirname(drawingHost),'../..')),inventoryPath=opts['--inventory']??join(nativeRoot,'training/sop-bert/heads/inventory.json'),inventory=JSON.parse(await readFile(inventoryPath,'utf8')),enrichment=[];
 if(opts['--knowledge']){const repository=resolve(opts['--knowledge']);for(const [name,types]of [['k.diagrams',['k.diagrams.kind']],['k.charts',['k.charts.kind']],['k.attributes',['k.attributes.family']],['k.units',['k.units.unit']]]){const paths=execFileSync('git',['-C',repository,'ls-tree','-r','--name-only',source.knowledgePin,'docs/worlds/'+name+'/'],{encoding:'utf8'}).trim().split('\n').filter(path=>path.endsWith('.sop'));for(const path of paths){const bytes=execFileSync('git',['-C',repository,'show',source.knowledgePin+':'+path]);const records=parse(bytes.toString()).filter(w=>(types.includes(w.type)||w.type==='core.word'&&w.attrs.of?.some(raw=>types.some(type=>str(raw)===type+'.name')))&&!w.pattern&&!world.get(w.id));if(records.length){const result=world.tell(records.map(format).join('\n'));if(!result.ok)throw Error('published family does not load '+path);enrichment.push({path,sha256:hash(bytes),wires:records.map(w=>w.id)});}}}}
 const promptPath=join(nativeRoot,'training/sop-bert/data/haiku-v2/INSTRUCTIONS-v2.md');let catalogue=null,catalogueProjection=null,catalogueProvenance=null;
 if(opts['--alignments']){if(!opts['--knowledge'])throw Error('alignments require pinned knowledge repository');const bytes=await readFile(opts['--alignments']);if(bytes.length>1024*1024)throw Error('catalogue-byte-budget');catalogue=JSON.parse(bytes);catalogueProjection=validateSemanticCatalogue(catalogue,{inventoryBytes:await readFile(inventoryPath),promptBytes:await readFile(promptPath)});const planned=await planCatalogueEnrichment(catalogue,{world,parse,format,str,readSource:async(pin,path)=>execFileSync('git',['-C',resolve(opts['--knowledge']),'show',pin+':'+path])});if(planned.records.length){const loaded=world.tell(planned.records.map(format).join('\n'));if(!loaded.ok)throw Error('catalogue-declarations-do-not-load');}catalogueProvenance={path:resolve(opts['--alignments']),sha256:hash(bytes),knowledgePin:catalogue.knowledgePin,baseKnowledgePin:source.knowledgePin,inventory:catalogue.inventory,prompt:catalogue.prompt,sources:planned.sources};}
 // The native binding tables are the SOP areas' realized interfaces (each area module's factory, its native-interface.sop beside it).
 const specs={drawing:[resolve(drawingHost),'createDrawingArea'],diagram:[resolve(diagramHost),'createDiagramArea'],document:['worlds/docs.editor/sop-document.mjs','createDocumentArea'],calendar:['worlds/time.calendar/sop-calendar.mjs','createCalendarArea'],avatar:['worlds/ui.avatar/sop-avatar.mjs','createAvatarArea']},hostTables={};
 for(const [area,[path,exportName]]of Object.entries(specs)){const modulePath=resolve(nativeRoot,path),sourcePath=resolve(dirname(modulePath),'native-interface.sop'),bytes=await readFile(sourcePath),module=await import(pathToFileURL(modulePath));if(typeof module[exportName]!=='function')throw Error('missing native area factory '+modulePath);const operations=(await module[exportName]({instanceId:'structural-bindings.'+area})).bindings();if(!Array.isArray(operations))throw Error('missing native binding table '+modulePath);hostTables[area]={operations,sourcePath:relative(nativeRoot,sourcePath),sourceSha256:hash(bytes),exportName};}
 const snapshot=world.toJSON(),snapshotSHA=hash(JSON.stringify(snapshot)),result=buildStructuralBindings({world,str,inventory,snapshotSHA,hostTables,...(catalogueProjection?{familyAlignments:catalogueProjection.familyAlignments,propertyAlignments:catalogueProjection.propertyAlignments}:{})});
 if(catalogueProjection){result.unresolved.push(...catalogueProjection.unresolved);result.catalogue=catalogueProvenance;}
 const sourceSnapshotPath=join(dirname(resolve(out)),'structural-bindings-source.snapshot.json');
 result.provenance={runtimeLibraryPath:libraryPath,runtimeLibrarySha256:hash(await readFile(libraryPath)),runtimeLibraryVersion:version,sourceSnapshotPath,knowledgePin:source.knowledgePin,libraryPin:source.libraryPin,sourcePath,sourceFileSha256:hash(await readFile(sourcePath)),baseSourceSnapshotSHA:hash(JSON.stringify(source.snapshot)),sourceSnapshotSHA:snapshotSHA,enrichment,inventoryPath,inventorySha256:hash(await readFile(inventoryPath)),exporterSha256:hash(await readFile(new URL(import.meta.url)))};
 // Kinds share the exporter and catalogue identities of provenance (stated once: the artifact stays within the runtime's 4 MB JSON budget).
 for(const record of [...result.properties,...(result.families??[])])record.alignment={...record.alignment,authoritySourcePath:'training/sop-bert/export-structural-bindings.mjs',authoritySourceSha256:result.provenance.exporterSha256,...(catalogueProvenance?{catalogueSha256:catalogueProvenance.sha256}:{})};
 result.kindAlignmentAuthority={authoritySourcePath:'training/sop-bert/export-structural-bindings.mjs',authoritySourceSha256:result.provenance.exporterSha256,...(catalogueProvenance?{catalogueSha256:catalogueProvenance.sha256}:{})};
 result.projectionPolicy={unmarkedConditions:'and',sourcePromptPath:'training/sop-bert/data/haiku-v2/INSTRUCTIONS-v2.md',sourcePromptSha256:hash(await readFile(promptPath)),authority:'Owner-reviewed C1 interpretation: each unmarked listed condition must hold; explicit alternatives are not inferred.'};
 const limit=opts['--max-output-bytes']===undefined?undefined:Number(opts['--max-output-bytes']),serialized=serializeBindingArtifacts(snapshot,result,{maxOutputBytes:limit,compact:opts['--compact']===undefined?false:opts['--compact']==='true'?true:null}),writeOptions=limit===undefined?{}:{flag:'wx'};
 const reuse=opts['--reuse-source-snapshot'];if(reuse){if(limit===undefined||!(await lstat(reuse)).isFile()||!Buffer.from(serialized.source).equals(await readFile(reuse)))throw Error('source-snapshot-reuse-mismatch');}
 if(opts['--reserve-bytes']!==undefined){const reserve=Number(opts['--reserve-bytes']),space=await statfs(dirname(resolve(out))),allocation=Buffer.byteLength(serialized.bindings)+(reuse?0:Buffer.byteLength(serialized.source));if(!Number.isSafeInteger(reserve)||reserve<0||space.bavail*space.bsize-allocation-65536<reserve)throw Error('insufficient-artifact-reserve');}
 if(reuse){await link(reuse,sourceSnapshotPath);await chmod(sourceSnapshotPath,0o444);}else await writeFile(sourceSnapshotPath,serialized.source,writeOptions);await writeFile(out,serialized.bindings,writeOptions);if(limit!==undefined){await chmod(sourceSnapshotPath,0o444);await chmod(out,0o444);}
console.log(JSON.stringify({kinds:result.kinds.length,properties:result.properties.length,units:result.units.length,unresolved:result.unresolved.length,sourceSnapshotSHA:snapshotSHA}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
