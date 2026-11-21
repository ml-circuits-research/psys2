import {CHART_KIND_PARAMETERS,CHART_PROPERTY_ALIGNMENTS} from './chart-bindings.mjs';
import {validateSemanticCatalogue,planCatalogueEnrichment} from './semantic-alignment-catalogue.mjs';
// C1 authorial declaration alignment. Never reads messages, evaluation or owner rows.
import {readFile,writeFile,link,chmod,lstat,statfs} from 'node:fs/promises';import {readFileSync as readFileSyncText} from 'node:fs';import {resolve,dirname,join,relative} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
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
const NATIVE_KIND_FAMILIES={'avatar.part':['avatar','avatar.part.add'],'drawing.part':['drawing','drawing.part.add'],'drawing.drawn':['drawing','drawing.object.make'],'diagram.node':['diagram','diagram.node.make'],'diagram.diagram':['diagram','diagram.layout'],'diagram.page':['diagram','diagram.layout'],'diagram.link':['diagram','diagram.link.make'],'document.text':['document','document.write'],'calendar.meeting':['calendar','calendar.meeting.add'],'calendar.person':['calendar','calendar.person.add']};
// The areas whose inventory keys are bound from their declared native interfaces (NATIVE-CHAIN COVERAGE), the catalog
// entity of each reader family, and the reader families whose source type is not named by their own type.
export const NATIVE_CHAIN_AREAS=['diagram','drawing'];
const FAMILY_ENTITIES={'diagram.node':'w.diagram.node','diagram.link':'w.diagram.edge','diagram.group':'w.diagram.group','diagram.diagram':'w.diagram.diagram','diagram.page':'w.diagram.diagram','diagram.sketch':'w.diagram.diagram','diagram.chart':'w.chart.chart','drawing.drawn':'w.drawing.object','drawing.group':'w.drawing.group','drawing.part':'w.drawing.part','drawing.page':'w.picture.picture'};
// British and American spellings of one parameter name (the drawing tool's `color`, the reader's `colour`).
const PARAMETER_SPELLINGS={colour:'color',color:'colour'};
// The parameters the declared kind seed fills from a target's kind (worlds/app.project/capability-policy.sop).
const KIND_SEED_PARAMETERS=[...readFileSyncText(new URL('../../worlds/app.project/capability-policy.sop',import.meta.url),'utf8').matchAll(/std\.capability\.seed parameter="([^"]+)" source=kind /g)].map(m=>m[1]);
// A chart in the Diagram tab is a numeric group (diagram.group.chart.make draws it; its formats, values and categories
// are group operations), and a chart point is one of its values: those families act on the group as well.
const SOURCE_TYPE_OF={'diagram.diagram':'page','diagram.chart':['data.charts.chart','group'],'diagram.point':['group'],'drawing.drawn':'object','drawing.group':'object'};
// The source type a reader family acts on: the interface's source type ending in the family's name (or its declared
// name above), or the area's own whole (diagram.sketch for a sketch).
function nativeSourceTypes(area,type,sourceTypes){return [].concat(SOURCE_TYPE_OF[area+'.'+type]??type).flatMap(name=>{if(sourceTypes.has(name))return [name];
 const matches=[...sourceTypes].filter(on=>on.split('.').at(-1)===name);return matches.length===1?matches:[];});}
export const KIND_FAMILIES=[
 // k.scenes.thing is not a provider: it describes the usual place and size of a thing named as its k.objects drawing
 // (the same name, k.scenes schema), so it adds no meaning of its own and would only collide with that drawing.
 {area:'drawing',type:'drawn',providers:['k.shapes.shape','k.objects.object','k.animals.animal','k.people.kind'],entities:[]},
 {area:'drawing',type:'face',providers:[],entities:['w.face.face']},
 // A drawing's part is named by the word for it whatever the whole is (k.parts.name: the roof, the rays, her hair),
 // the kind its observed part has (worlds/art.draw/act-rules.sop: a look part is observed as the word of its slot).
 {area:'drawing',type:'part',providers:['k.parts.name'],entities:[]},
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
// The operations a native interface declares (std.capability.operation and .parameter), read from its SOP file: the
// declared interface itself, not an instance of the area.
export function declaredOperations(rows,str){const byId=new Map();
 for(const r of rows)if(r.type==='std.capability.operation')byId.set(r.id,{id:str(r.attrs.name[0]),act:str(r.attrs.act?.[0]),on:str(r.attrs.on?.[0]),params:{}});
 for(const r of rows)if(r.type==='std.capability.parameter'){const op=byId.get(String(r.attrs.operation?.[0]).slice(1));if(op)op.params[str(r.attrs.name[0])]={kind:str(r.attrs.kind?.[0]),...(r.attrs.enum?{enum:r.attrs.enum.map(str)}:{}),...(r.attrs.required?.some(v=>str(v)==='true')?{required:true}:{})};}
 return [...byId.values()];}
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
 // NATIVE-CHAIN COVERAGE (2026-11-20): every inventory key of an area with a declared native interface that an operation
 // parameter can consume is bound, generated from the interface (native-interface.sop) and the catalog: the key's
 // reader family acts on one source type (the `on` of the family's own operations), the parameter is the one the
 // descriptor names ("Native parameter: op.param", "op {param}") or the parameter of that name on the source type,
 // and the concept is the family entity's catalog slot of that name when there is one, else the parameter itself.
 // A parameter already bound by a reviewed alignment keeps that concept (drawn.color and drawn.colour are one
 // colour). Every other key is listed in `coverage` with the reason it has no binding.
 const coverage=[];
 for(const area of NATIVE_CHAIN_AREAS){const table=hostTables[area];if(!table||!inventory[area])continue;
  const sourceTypes=new Set(table.operations.map(op=>op.on));
  for(const [type,row]of Object.entries(inventory[area])){
   const ons=nativeSourceTypes(area,type,sourceTypes),on=ons[0]??null,entity=FAMILY_ENTITIES[area+'.'+type];
   for(const [name,spec]of Object.entries(row.keys??{})){const key=type+'.'+name;
    const known=properties.find(r=>r.area===area&&r.key===key);
    if(known?.hostBinding){coverage.push({area,key,status:'bound',by:'reviewed-alignment'});continue;}
    // A reviewed key bound without a parameter of its own: a relation pair the bridge joins, or the count a make's
    // declared count port takes.
    if(known?.projection||known?.canonical==='count'){coverage.push({area,key,status:'bound',by:known.projection?'reviewed-projection':'count-port'});continue;}
    const named=/(?:Native parameter: |^)([a-z][a-z.]*[a-z])(?:\.| \{)([A-Za-z_]+)\}?/.exec(String(spec.src??''));
    let op=named&&table.operations.find(o=>o.id===named[1]&&Object.hasOwn(o.params??{},named[2])),parameter=op?named[2]:null;
    if(!op&&on){const spelled=[name,PARAMETER_SPELLINGS[name]].filter(Boolean);for(const form of spelled){const candidates=table.operations.filter(o=>ons.includes(o.on)&&Object.hasOwn(o.params??{},form));op=candidates.find(o=>o.act==='change')??candidates[0];if(op){parameter=form;break;}}}
    if(!op){coverage.push({area,key,status:'unbound',reason:on?'no-native-parameter':'no-native-source-type'});continue;}
    // The parameter a make fills from the target's kind (capability-policy.sop: the seed whose source is the kind) is
    // named by the target, never by a property, unless another operation also takes it.
    if(op.act==='make'&&KIND_SEED_PARAMETERS.includes(parameter)&&!table.operations.some(o=>o.on===op.on&&o.act!=='make'&&Object.hasOwn(o.params??{},parameter))){coverage.push({area,key,status:'unbound',reason:'constructor-target-parameter',operation:op.id,parameter});continue;}
    const reviewed=properties.find(r=>r.area===area&&r.hostBinding?.sourceType===op.on&&r.hostBinding?.parameter===parameter);
    const snake=v=>v.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
    const slot=entity&&[name,parameter,snake(name),snake(parameter)].map(k=>entity+'.'+k).find(id=>get(id)?.type==='core.slot');
    const declared=reviewed?{canonical:reviewed.canonical,sourceWire:reviewed.sourceWire,sourceSnapshotSHA:reviewed.sourceSnapshotSHA,sourceWorld:reviewed.sourceWorld,moduleVersion:reviewed.moduleVersion}:slot?{canonical:slot,...metadata(slot)}
     :{canonical:op.on+'.'+parameter,sourceWire:'native.'+table.world+'.op.'+op.id+'.param.'+parameter,sourceSnapshotSHA:table.sourceSha256,sourceWorld:table.world,moduleVersion:'1'};
    const param=op.params[parameter],codec=param?.kind==='array'?'string-list':undefined;
    const existing=properties.findIndex(r=>r.area===area&&r.key===key);if(existing>=0)properties.splice(existing,1);
    properties.push({area,key,valueKind:'string',...declared,rawDescriptor:descriptor(area,key),
     alignment:{kind:'native-parameter-chain',concept:reviewed?(reviewed.alignment?.kind==='native-parameter-chain'?reviewed.alignment.concept:'reviewed-alignment'):slot?'catalog-slot':'native-parameter',authority:'Generated from the declared native interface and the catalog: the reader key reaches this operation parameter on the family’s source type.',valueBoundary:'The said value as the parameter takes it (its enum, number or string); arrays take a comma list.'},
     hostBinding:{id:op.id,sourceType:op.on,key:parameter,operation:op.id,parameter,exportName:table.exportName,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256,...(codec?{codec}:{})}});
    coverage.push({area,key,status:'bound',by:declared.canonical===op.on+'.'+parameter?'native-parameter':reviewed?'reviewed-concept':'catalog-slot',operation:op.id,parameter});
   }}}
 // A family no kind word names (the page: "improve the layout") acts as a whole through its native family binding.
 for(const family of families){if(kinds.some(k=>k.area===family.area&&k.type===family.type))continue;const route=NATIVE_KIND_FAMILIES[family.area+'.'+family.type],table=route&&hostTables[route[0]],operation=table?.operations?.find(op=>op.id===route[1]);
  if(operation)family.nativeFamilyBinding={operation:operation.id,sourceType:operation.on,exportName:table.exportName,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256,boundary:'Family eligibility only.'};}
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
 // A family whose entity declares a slot typed by another family's entity of the same area lies in it (a diagram
 // node's `diagram` slot is a w.diagram.diagram): a kind of that family named for a new member ("a diagram with 5
 // nodes") names the page or whole the members are made in, not another kind of member.
 const containment=[];for(const family of kindFamilies)for(const entity of family.entities)for(const slot of world.matrix.values()){
  // A required typed slot is a thing the member needs (a line's two ends), not where it lies.
  if(slot.type!=='core.slot'||str(slot.attrs.of?.[0])!==entity||slot.attrs.type?.length!==1||slot.attrs.required?.some(v=>str(v)==='true'))continue;const container=str(slot.attrs.type[0]);
  for(const other of kindFamilies)if(other.area===family.area&&other.type!==family.type&&other.entities.includes(container)){
   // One row per member and container: the slot's own id, not a module-qualified copy of it.
   const row={area:family.area,type:family.type,member:entity,containerType:other.type,container,...metadata(slot.id)},at=containment.findIndex(r=>r.area===row.area&&r.type===row.type&&r.member===entity&&r.container===container);
   if(at<0)containment.push(row);else if(row.sourceWire.length<containment[at].sourceWire.length)containment[at]=row;}}
 const covered=new Set(properties.map(r=>r.area+'\0'+r.key));for(const [area,types]of Object.entries(inventory))if(['drawing','diagram','document','calendar'].includes(area))for(const [type,row]of Object.entries(types))for(const key of Object.keys(row.keys??{}))if(!covered.has(area+'\0'+type+'.'+key))unresolved.push({family:'properties',area,key:type+'.'+key,rawDescriptor:descriptor(area,type+'.'+key),reason:'no-explicit-semantic-source-alignment'});

 const sort=values=>values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {format:'sop.structural-bindings/1',kindFamilyAlignment:'Whole published provider families and exact owning core.word meanings; canonical collisions unresolved, native capability not implied.',...(families.length?{families:sort(families)}:{}),kinds:sort(unique),properties:sort(properties),units:sort(units),unresolved:sort(unresolved),...(containment.length?{containment:sort(containment)}:{}),...(coverage.length?{coverage:sort(coverage)}:{})};
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
 for(const [area,[path,exportName]]of Object.entries(specs)){const modulePath=resolve(nativeRoot,path),sourcePath=resolve(dirname(modulePath),'native-interface.sop'),bytes=await readFile(sourcePath),module=await import(pathToFileURL(modulePath));if(typeof module[exportName]!=='function')throw Error('missing native area factory '+modulePath);const operations=declaredOperations(parse(bytes.toString()),str);if(!operations.length)throw Error('missing native binding table '+modulePath);hostTables[area]={operations,sourcePath:relative(nativeRoot,sourcePath),sourceSha256:hash(bytes),exportName,world:relative(join(nativeRoot,'worlds'),dirname(modulePath))};}
 const snapshot=world.toJSON(),snapshotSHA=hash(JSON.stringify(snapshot)),result=buildStructuralBindings({world,str,inventory,snapshotSHA,hostTables,...(catalogueProjection?{familyAlignments:catalogueProjection.familyAlignments,propertyAlignments:catalogueProjection.propertyAlignments}:{})});
 if(catalogueProjection){const bound=new Set(result.properties.map(r=>r.area+'\0'+r.key));result.unresolved.push(...catalogueProjection.unresolved.filter(r=>r.family!=='properties'||!bound.has(r.area+'\0'+r.key)));result.catalogue=catalogueProvenance;}
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
