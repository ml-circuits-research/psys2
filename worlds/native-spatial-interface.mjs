// SPDX-License-Identifier: AGPL-3.0-only
// Bind native observations and concrete renderer capabilities to the SOP interface.
import {quote,str} from '../src/vendor/sopworld/sopworld.mjs';

const atom = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const spatialWire = (id,type,fields) => '@'+id+' '+type+' '+Object.entries(fields).flatMap(([key,value])=>
 (Array.isArray(value)?value:[value]).filter(value=>value!==undefined).map(value=>key+'='+value)).join(' ');
const row=spatialWire;
const observationFields = record => Object.fromEntries(Object.entries(record).map(([key,value])=>
 [key,typeof value==='string'&&!['kind','evidence'].includes(key)?quote(value):value]));
const scalar = value => typeof value==='string'?quote(value):JSON.stringify(value);
// A native kind of one word is an atom; one of several words ("shooting star") a string (library 0.238.0).
const nativeKind = lemma => atom.test(lemma)?lemma:quote(lemma);

const labelOf=record=>['label','name'].map(key=>record.inputs.find(input=>input.key===key&&input.values?.length===1)).find(input=>input&&str(input.values[0]).trim());
function nativeGeometryWires(spatial,mappings,operations) {
 const {boxes,points,relations,observation,container,occupants}=spatial,rows=[];
 const byEntity = new Map(observation.objects.map(object=>[object.id,object]));
 const parent = new Map(relations.filter(edge=>edge.kind==='member_of').map(edge=>[edge.subject,edge.object]));
 const peer = new Set(occupants),aliases = new Map(),families = new Map();
 for(const mapping of mappings){
  const tool=operations.find(operation=>operation.id===mapping.nativeFamilyBinding.operation);
  if(!tool||!atom.test(mapping.canonical)||typeof mapping.lemma!=='string')continue;
  // A family identity (a family named without a kind word) denotes every object of its tool's source type.
  if(mapping.familyIdentity){(families.get(tool.on)??families.set(tool.on,new Set()).get(tool.on)).add(mapping.canonical);continue;}
  const key=JSON.stringify([tool.on,mapping.lemma]);
  if(!aliases.has(key))aliases.set(key,new Set());
  aliases.get(key).add(mapping.canonical);
 }
 const names = new Map();
 for(const [index,box] of boxes.entries()){
  const id='native.spatial.box.'+index,object=byEntity.get(box.entity);
  names.set(box.entity,id);
  rows.push(row(id,'k.spatial2d.box',{...observationFields(box),'core.source':object?quote(object.source):undefined}));
  if(!object)continue;
  const concepts=[...(aliases.get(JSON.stringify([object.sourceType,object.kind]))??[]),...(families.get(object.sourceType)??[])];
  if(!concepts.length&&!peer.has(box.entity))continue;
  const name=labelOf(object);
  rows.push(row('native.spatial.identity.'+index,'std.placement.identity',{
   box:'$'+id,concept:concepts,name:name?name.values[0]:undefined,
   source:quote(object.source),container:quote(peer.has(box.entity)?container:parent.get(box.entity)??container),peer:peer.has(box.entity)?'true':undefined,
  }));
 }
 for(const [index,point] of points.entries())rows.push(row('native.spatial.point.'+index,'k.spatial2d.point',observationFields(point)));
 // Regions of observed things where others go (the water of a lake, the surface of a table), as the area declares them.
 for(const [index,{entity,kind,holds=[],min_x,min_y,max_x,max_y,instance,revision,frame,scope}] of (spatial.regions??[]).entries())
  if(atom.test(kind)&&[min_x,min_y,max_x,max_y].every(Number.isFinite))rows.push(row('native.spatial.region.'+index,'std.placement.region',
   {entity:quote(entity),kind,holds:holds.map(quote),min_x,min_y,max_x,max_y,instance:quote(instance),revision:quote(revision),frame:quote(frame),scope:quote(scope)}));
 for(const [index,relation] of relations.entries())rows.push(row('native.spatial.relation.'+index,'k.spatial2d.relation',observationFields(relation)));
 return {wires:rows,bounds:names.get(spatial.bounds)};
}

function nativeCapabilityWires(host,operations,mappings,frame,{constructors=[],concepts=null,defaults=[]}={}) {
 const rows=[],seen=new Set(),measurements=new Map();
 // One measured kind per act and concept: the first tool in declared order whose constructor can draw one of its
 // names (the compiler takes a single kind row for a subject).
 const placed=new Set();
 // The constructors a mapping may use: the operation its family names, and those the constructor policy pairs
 // with it (a catalog tool that takes any known name, for a kind the family tool does not list).
 const paired=new Map();
 for(const {mapping,operation} of constructors)(paired.get(mapping)??paired.set(mapping,[]).get(mapping)).push(operation);
 const constructorsOf=mapping=>[...new Set([operations.find(op=>op.id===mapping.nativeFamilyBinding.operation),...(paired.get(mapping)??[])])]
  .filter(Boolean).map(constructor=>{
   const own=constructor.id===mapping.nativeFamilyBinding.operation,parameter=constructor.params?.[constructor.spatial?.kindKey];
   // An enumerated kind argument admits only its members; an open one only through the policy's pairing.
   const admitted=parameter&&(parameter.enum?parameter.enum.includes(mapping.lemma):(paired.get(mapping)??[]).includes(constructor));
   return admitted?{constructor,args:own?{...mapping.nativeFamilyBinding.arguments}:{}}:null;
  }).filter(Boolean).concat(
   // A kind its family draws with a declared default (a seed of the kind argument: "a step", "a box" of a diagram node
   // drawn as the declared default shape) is placed as that default.
   defaults.filter(d=>d.canonical===mapping.canonical).map(d=>{const constructor=operations.find(op=>op.id===d.operation);
    return constructor&&constructor.spatial?.kindKey===d.parameter?{constructor,args:{},native:d.value}:null;}).filter(Boolean));
 for(const [index,operation] of operations.entries()){
  const capability=operation.spatial;
  if(capability?.frame!==frame||operation.requires?.length)continue;
  const {kindKey,xKey,yKey,idsKey}=capability,tool='native.spatial.tool.'+index;
  // sizeKey: the argument that sets the larger side of what a make command draws, when the tool declares one.
  const sizeKey=operation.act==='make'&&atom.test(capability.sizeKey??'')?capability.sizeKey:undefined;
  rows.push(row(tool,'std.placement.tool',{act:operation.act,operation:operation.id,kindKey,xKey,yKey,idsKey,sizeKey,originX:.5,originY:.5}));
  for(const mapping of mappings){
   if(concepts&&!concepts.has(mapping.canonical)||placed.has(operation.act+' '+mapping.canonical))continue;
   if(!atom.test(mapping.canonical))continue;
   // An existing member of a family named without a kind word moves with its own observed extent (the compiler
   // takes a moving subject's size from its geometry), so the kind row carries a unit extent, never measured or used.
   if(mapping.familyIdentity){
    const family=operations.find(op=>op.id===mapping.nativeFamilyBinding.operation);
    if(operation.act==='make'||!idsKey||family?.on!==operation.on||typeof mapping.lemma!=='string'||!mapping.lemma)continue;
    rows.push(row('native.spatial.kind.'+rows.length,'std.placement.kind',{binding:'$'+tool,concept:mapping.canonical,native:nativeKind(mapping.lemma),width:1,height:1}));
    placed.add(operation.act+' '+mapping.canonical);
    continue;
   }
   if(typeof mapping.lemma!=='string'||!mapping.lemma)continue;
   for(const {constructor,args:own,native:declaredNative} of constructorsOf(mapping)){
    if(!constructor.spatial||constructor.on!==operation.on||operation.act==='make'&&constructor.id!==operation.id)continue;
    const args={...own},nativeKey=constructor.spatial.kindKey;
    args[nativeKey]=declaredNative??mapping.lemma;
    if(Object.keys(args).some(key=>[xKey,yKey].includes(key)||!['string','number','boolean'].includes(typeof args[key])))continue;
    const material=JSON.stringify([constructor.id,args]),key=JSON.stringify([operation.id,mapping.canonical,mapping.lemma,material]);
    if(seen.has(key))continue;
    seen.add(key);
    if(!measurements.has(material)){
     const command=row('measure',constructor.id,Object.fromEntries(Object.entries(args).map(([key,value])=>[key,scalar(value)])));
     measurements.set(material,host.measureSpatial(command));
    }
    const extent=measurements.get(material);
    if(!extent||!(extent.width>0)||!(extent.height>0))continue;
    const kind='native.spatial.kind.'+rows.length;
    const {width,height,originX,originY,avoids=[]}=extent;
    // avoids: the kinds of observed regions the kind keeps out of (the water of a river for a house: k.scenes.support).
    rows.push(row(kind,'std.placement.kind',{binding:'$'+tool,concept:mapping.canonical,native:nativeKind(declaredNative??mapping.lemma),width,height,originX,originY,avoids:avoids.filter(a=>atom.test(a))}));
    for(const [key,value] of Object.entries(args))if(operation.act==='make'&&key!==kindKey)rows.push(row('native.spatial.argument.'+rows.length,'std.placement.argument',{binding:'$'+kind,key,value:scalar(value)}));
    placed.add(operation.act+' '+mapping.canonical);
    break;
   }
  }
 }
 return rows;
}

// constructors: the policy's constructor pairs ({mapping, operation}); concepts: the kinds the request names, the
// only ones whose extents are measured (a catalog tool admits thousands of names).
export function placementInterfaceSop(host,spatial,mappings,requestId,{constructors,concepts,defaults,flow}={}) {
 const {observation,revision,frame,scope,container}=spatial,operations=host.bindings();
 const {wires,bounds}=nativeGeometryWires(spatial,mappings,operations);
 const configuration=[...wires,...nativeCapabilityWires(host,operations,mappings,frame,{constructors,concepts,defaults})].join('\n');
 const context=row('native.spatial.context','std.placement.context',{
  request:'$'+requestId,instance:quote(observation.instanceId),revision:quote(revision),
  frame:quote(frame),scope:quote(scope),container:quote(container),bounds:bounds?'$'+bounds:undefined,flow:flow!==undefined?quote(flow):undefined,
 });
 return {configuration,context};
}
