// SPDX-License-Identifier: AGPL-3.0-only
// Bind native observations and concrete renderer capabilities to the SOP interface.
import {quote,str} from '../lib/vendor/sopworld/sopworld.mjs?v=d7baa85342';

const atom = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const spatialWire = (id,type,fields) => '@'+id+' '+type+' '+Object.entries(fields).flatMap(([key,value])=>
 (Array.isArray(value)?value:[value]).filter(value=>value!==undefined).map(value=>key+'='+value)).join(' ');
const row=spatialWire;
const observationFields = record => Object.fromEntries(Object.entries(record).map(([key,value])=>
 [key,typeof value==='string'&&!['kind','evidence'].includes(key)?quote(value):value]));
const scalar = value => typeof value==='string'?quote(value):JSON.stringify(value);

const labelOf=record=>['label','name'].map(key=>record.inputs.find(input=>input.key===key&&input.values?.length===1)).find(input=>input&&str(input.values[0]).trim());
function nativeGeometryWires(spatial,mappings,operations) {
 const {boxes,points,relations,observation,container,occupants}=spatial,rows=[];
 const byEntity = new Map(observation.objects.map(object=>[object.id,object]));
 const parent = new Map(relations.filter(edge=>edge.kind==='member_of').map(edge=>[edge.subject,edge.object]));
 const peer = new Set(occupants),aliases = new Map();
 for(const mapping of mappings){
  const tool=operations.find(operation=>operation.id===mapping.nativeFamilyBinding.operation);
  if(!tool||!atom.test(mapping.canonical)||typeof mapping.lemma!=='string'||mapping.familyIdentity)continue;
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
  const concepts=[...(aliases.get(JSON.stringify([object.sourceType,object.kind]))??[])];
  if(!concepts.length&&!peer.has(box.entity))continue;
  const name=labelOf(object);
  rows.push(row('native.spatial.identity.'+index,'std.placement.identity',{
   box:'$'+id,concept:concepts,name:name?name.values[0]:undefined,
   source:quote(object.source),container:quote(peer.has(box.entity)?container:parent.get(box.entity)??container),peer:peer.has(box.entity)?'true':undefined,
  }));
 }
 for(const [index,point] of points.entries())rows.push(row('native.spatial.point.'+index,'k.spatial2d.point',observationFields(point)));
 for(const [index,relation] of relations.entries())rows.push(row('native.spatial.relation.'+index,'k.spatial2d.relation',observationFields(relation)));
 return {wires:rows,bounds:names.get(spatial.bounds)};
}

function nativeCapabilityWires(host,operations,mappings,frame) {
 const rows=[],seen=new Set(),measurements=new Map();
 for(const [index,operation] of operations.entries()){
  const capability=operation.spatial;
  if(capability?.frame!==frame||operation.requires?.length)continue;
  const {kindKey,xKey,yKey,idsKey}=capability,tool='native.spatial.tool.'+index;
  rows.push(row(tool,'std.placement.tool',{act:operation.act,operation:operation.id,kindKey,xKey,yKey,idsKey,originX:.5,originY:.5}));
  for(const mapping of mappings){
   const constructor=operations.find(op=>op.id===mapping.nativeFamilyBinding.operation);
   if(!constructor?.spatial||constructor.on!==operation.on||operation.act==='make'&&constructor.id!==operation.id||
    mapping.familyIdentity||!atom.test(mapping.canonical)||!atom.test(mapping.lemma))continue;
   const args={...mapping.nativeFamilyBinding.arguments},nativeKey=constructor.spatial.kindKey;
   if(!constructor.params[nativeKey]?.enum?.includes(mapping.lemma))continue;
   args[nativeKey]=mapping.lemma;
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
   const {width,height,originX,originY}=extent;
   rows.push(row(kind,'std.placement.kind',{binding:'$'+tool,concept:mapping.canonical,native:mapping.lemma,width,height,originX,originY}));
   for(const [key,value] of Object.entries(args))if(operation.act==='make'&&key!==kindKey)rows.push(row('native.spatial.argument.'+rows.length,'std.placement.argument',{binding:'$'+kind,key,value:scalar(value)}));
  }
 }
 return rows;
}

export function placementInterfaceSop(host,spatial,mappings,requestId) {
 const {observation,revision,frame,scope,container}=spatial,operations=host.bindings();
 const {wires,bounds}=nativeGeometryWires(spatial,mappings,operations);
 const configuration=[...wires,...nativeCapabilityWires(host,operations,mappings,frame)].join('\n');
 const context=row('native.spatial.context','std.placement.context',{
  request:'$'+requestId,instance:quote(observation.instanceId),revision:quote(revision),
  frame:quote(frame),scope:quote(scope),container:quote(container),bounds:bounds?'$'+bounds:undefined,
 });
 return {configuration,context};
}
