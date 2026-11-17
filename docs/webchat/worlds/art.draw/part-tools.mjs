// SPDX-License-Identifier: AGPL-3.0-only
// Geometry primitives for actual instance constituents. No words, parser or kind-specific branch.
import {partsOf,piecesOf,groupOf,registerShape,thingBuild,COMPOSITE,thingOfKey,kindKey,kindName,KINDS} from './scene.mjs?v=5bdf3e5957';
import {makeObject,remember} from './board.mjs?v=7ee7069df4';
const text={type:'string',required:true},index={type:'integer',required:true,min:0},number={type:'number',required:true};
export const DRAWING_PART_TOOL_BINDINGS=[
 {id:'drawing.object.parts',act:'ask',on:'art.draw.object',params:{id:text}},
 {id:'drawing.part.select',act:'ask',on:'art.draw.part',params:{id:text,index}},
 {id:'drawing.part.change',act:'change',on:'art.draw.part',params:{id:text,index,color:{type:'string'},width:{type:'number',min:.01},height:{type:'number',min:.01}}},
 {id:'drawing.part.place',act:'place',on:'art.draw.part',params:{id:text,index,x:number,y:number},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}},
 {id:'drawing.part.remove',act:'remove',on:'art.draw.part',params:{id:text,index}},
 {id:'drawing.part.extract',act:'ungroup',on:'art.draw.part',effectScope:{projection:'composite'},intent:{parameters:{id:{role:'source',reference:true,label:'from object'}}},params:{id:text,index}},
 {id:'drawing.object.group',act:'group',on:'art.draw.object',effectScope:{projection:'composite'},intent:{parameters:{ids:{role:'source',reference:true,label:'from members'}}},params:{ids:{type:'array',required:true},name:{type:'string',default:'Group'}}},
 {id:'drawing.object.ungroup',act:'ungroup',on:'art.draw.object',effectScope:{projection:'composite'},intent:{parameters:{id:{role:'source',reference:true,label:'from object'}}},params:{id:text}},
];
const fail=code=>({status:'missing',code}),done=(changed,data)=>({status:'supported',changed,...(data?{data}:{})}),object=(s,id)=>s.objects.find(o=>o.id===id);
const boxOf=p=>{if(p.pts){const xs=p.pts.map(q=>q[0]),ys=p.pts.map(q=>q[1]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};}return {x0:p.x-p.w/2,x1:p.x+p.w/2,y0:p.y-p.h/2,y1:p.y+p.h/2};};
const transform=(o,x,y)=>{const a=(o.rotation??0)*Math.PI/180,dx=x*o.size*(o.flip?-1:1),dy=y*o.size;return [o.x+dx*Math.cos(a)-dy*Math.sin(a),o.y+dx*Math.sin(a)+dy*Math.cos(a)];};
export function drawingPartsOf(o){
 return partsOf(o).map((p,index)=>{const b=boxOf(p),corners=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(([x,y])=>transform(o,x,y)),xs=corners.map(v=>v[0]),ys=corners.map(v=>v[1]),[x,y]=transform(o,(b.x0+b.x1)/2,(b.y0+b.y1)/2);return {id:JSON.stringify([o.id,'part',index]),object:o.id,index,role:p.n,primitive:p.s,color:p.hex,x,y,width:(b.x1-b.x0)*o.size,height:(b.y1-b.y0)*o.size,bounds:{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)},geometry:structuredClone(p),sourceKind:o.semanticKind??kindName(kindKey(o))};});
}
const baked=o=>partsOf(o).map(({color,hex,follows,...p})=>({...p,c:hex,...(follows?{m:1}:{})}));
function storeParts(o,parts){
 const sourceKind=o.semanticKind??kindName(kindKey(o)),shape={parts,aspect:KINDS[kindKey(o)]?.aspect??1,size:o.size,sourceKind};
 const key=registerShape(sourceKind,shape);Object.assign(o,{kind:'composite',thing:thingOfKey(key),shape,semanticKind:sourceKind,parts:{}});delete o.hide;delete o.extra;
}
const getPart=(s,a)=>{const o=object(s,a.id);if(!o)return null;const parts=baked(o);return parts[a.index]?{o,parts,p:parts[a.index]}:null;};
const focus=(s,o,index=null)=>{s.selected=o.id;s.selectedIds=[o.id];s.selectedPart=index===null?null:{id:o.id,index};s.last=[o.id];};
function restoreMembers(group){
 const ref=group.shape.ref,k=group.size/(ref.size||group.size),a=(group.rotation??0)*Math.PI/180,mirror=!!group.flip;
 return group.shape.members.map(original=>{const o=structuredClone(original);let dx=(o.x-ref.x)*k;const dy=(o.y-ref.y)*k;if(mirror)dx=-dx;o.x=group.x+dx*Math.cos(a)-dy*Math.sin(a);o.y=group.y+dx*Math.sin(a)+dy*Math.cos(a);o.size=Math.max(.01,o.size*k);o.rotation=(mirror?-(o.rotation??0):(o.rotation??0))+(group.rotation??0);if(mirror)o.flip=!o.flip;if(group.color)o.color=group.color;return o;});
}
const makePiece=(s,p,owner)=>{const o=makeObject(s,registerShape(p.name,p.shape),{fill:owner.fill});Object.assign(o,{x:p.x,y:p.y,size:p.size,rotation:p.rotation,z:p.z,name:p.name,semanticKind:'part',origin:{kind:owner.semanticKind??kindName(kindKey(owner)),object:owner.id,role:p.name}});return o;};
export const drawingPartHandlers={
 'drawing.object.parts':(ctx,a)=>{const o=object(ctx.state,a.id);return o?done([],drawingPartsOf(o)):fail('missing-target');},
 'drawing.part.select':(ctx,a)=>{const found=getPart(ctx.state,a);if(!found)return fail('missing-part');focus(ctx.state,found.o,a.index);return done([found.o.id]);},
 'drawing.part.change':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');const {o,parts,p}=found;
  if(!['color','width','height'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');if(a.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(a.color))return fail('invalid-native-color');
  const b=boxOf(p),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,w=b.x1-b.x0,h=b.y1-b.y0;
  if(a.width!==undefined&&w===0||a.height!==undefined&&h===0)return fail('degenerate-part-size');
  const sx=a.width===undefined?1:a.width/o.size/w,sy=a.height===undefined?1:a.height/o.size/h;
  if(p.pts)p.pts=p.pts.map(([x,y])=>[cx+(x-cx)*sx,cy+(y-cy)*sy]);else{p.w*=sx;p.h*=sy;}
  if(a.color!==undefined){p.c=a.color;delete p.m;}remember(ctx.state,null);storeParts(o,parts);focus(ctx.state,o,a.index);return done([o.id]);
 },
 'drawing.part.place':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');const {o,parts,p}=found,current=drawingPartsOf(o)[a.index],angle=(o.rotation??0)*Math.PI/180;
  const dx=a.x-current.x,dy=a.y-current.y,localX=(dx*Math.cos(angle)+dy*Math.sin(angle))/o.size*(o.flip?-1:1),localY=(-dx*Math.sin(angle)+dy*Math.cos(angle))/o.size;
  if(localX===0&&localY===0)return done([]);remember(ctx.state,null);
  if(p.pts)p.pts=p.pts.map(([x,y])=>[x+localX,y+localY]);else{p.x+=localX;p.y+=localY;}storeParts(o,parts);focus(ctx.state,o,a.index);return done([o.id]);
 },
 'drawing.part.remove':(ctx,a)=>{const found=getPart(ctx.state,a);if(!found)return fail('missing-part');if(found.parts.length===1)return fail('last-part');remember(ctx.state,null);found.parts.splice(a.index,1);storeParts(found.o,found.parts);focus(ctx.state,found.o);return done([found.o.id]);},
 'drawing.part.extract':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');if(found.parts.length===1)return fail('last-part');const {o,parts,p}=found;
  const single=structuredClone(o);storeParts(single,[p]);const piece=piecesOf(single)[0];if(!piece)return fail('unsupported-part');remember(ctx.state,null);parts.splice(a.index,1);storeParts(o,parts);const child=makePiece(ctx.state,piece,o);ctx.state.objects.push(child);focus(ctx.state,child);return done([o.id,child.id]);
 },
 'drawing.object.group':(ctx,a)=>{
  if(a.ids.length<2||a.ids.length>40||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>typeof id!=='string'||!object(ctx.state,id)))return fail('invalid-group-members');const members=a.ids.map(id=>object(ctx.state,id)),built=groupOf(members),shape={...built.shape,members:structuredClone(members),ref:{x:built.x,y:built.y,size:built.size}};
  remember(ctx.state,null);const grouped=makeObject(ctx.state,registerShape(a.name,shape),{});Object.assign(grouped,{x:built.x,y:built.y,size:built.size,z:built.z,shape,name:a.name,semanticKind:'group'});ctx.state.objects=ctx.state.objects.filter(o=>!a.ids.includes(o.id));ctx.state.objects.push(grouped);focus(ctx.state,grouped);return done([grouped.id]);
 },
 'drawing.object.ungroup':(ctx,a)=>{
  const o=object(ctx.state,a.id);if(!o)return fail('missing-target');const restored=o.shape?.members?.length&&o.shape.ref?restoreMembers(o):null,pieces=restored?null:piecesOf(o);if(!restored&&pieces.length<2)return fail('not-a-compound');remember(ctx.state,null);
  ctx.state.objects=ctx.state.objects.filter(item=>item.id!==o.id);const made=restored??pieces.map(p=>makePiece(ctx.state,p,o));
  for(const member of made){if(ctx.state.objects.some(x=>x.id===member.id))member.id='o'+ctx.state.nextId++;ctx.state.objects.push(member);}ctx.state.last=made.map(m=>m.id);ctx.state.selectedIds=[...ctx.state.last];ctx.state.selected=made[0]?.id??null;ctx.state.selectedIds=made.map(m=>m.id);ctx.state.selectedPart=null;return done(made.map(m=>m.id));
 },
};

/** Construct only from a worker-loaded knowledge result; UI never supplies geometry or provenance. */
export function makeKnowledgeDrawing(state,name,entry,properties={}){
 const supplied=entry?.objects?.[0]?.parts;if(!Array.isArray(supplied)||!supplied.length)return fail('knowledge-drawing-unavailable');
 if(supplied.some(p=>!p||typeof p.name!=='string'||!['rectangle','square','circle','oval','triangle','polygon','line','arc'].includes(p.shape)||['x','y','w','h'].some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k]))||p.points&&(!Array.isArray(p.points)||p.points.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>typeof v!=='number'||!Number.isFinite(v))))))return fail('unsupported-knowledge-geometry');
 const canonical=entry.name??name,raw=thingBuild(canonical,{[canonical]:structuredClone(supplied)});if(!raw.length)return fail('knowledge-geometry-unavailable');
 const xs=supplied.flatMap(p=>[p.x,p.x+p.w]),ys=supplied.flatMap(p=>[p.y,p.y+p.h]),width=Math.max(1,Math.max(...xs)-Math.min(...xs)),height=Math.max(1,Math.max(...ys)-Math.min(...ys)),aspect=height/width;
 const shape={parts:raw,aspect,size:Math.round(200/Math.max(1,aspect)),sourceKind:name};
 remember(state,null);const created=makeObject(state,registerShape(name,shape));created.semanticKind=name;created.name=name;
 created.origin={requested:name,realization:canonical,representation:'knowledge-vector-parts'};
 for(const key of ['x','y','size'])if(Object.hasOwn(properties,key))created[key]=properties[key];
 state.objects.push(created);focus(state,created);return done([created.id],{realization:{requested:name,drawing:canonical,parts:raw.length}});
}
