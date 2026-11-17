// SPDX-License-Identifier: AGPL-3.0-only
// Geometry primitives for actual instance constituents. No words, parser or kind-specific branch.
import {partsOf,piecesOf,groupOf,registerShape,thingBuild,COMPOSITE,thingOfKey,kindKey,kindName,KINDS,objectMatrix,multiplyMatrix,inverseMatrix,geometryPoint,bbox} from './scene.mjs';
import {makeObject,remember} from './board.mjs';
const budget={tick:(site,n=1)=>globalThis[Symbol.for('psys2.budget')]?.tick(site,n)};
const text={type:'string',required:true},index={type:'integer',required:true,min:0},number={type:'number',required:true};
export const DRAWING_PART_TOOL_BINDINGS=[
 {id:'drawing.object.parts',act:'ask',on:'art.draw.object',params:{id:text}},
 {id:'drawing.part.select',act:'ask',on:'art.draw.part',params:{id:text,index}},
 {id:'drawing.part.change',act:'change',on:'art.draw.part',params:{id:text,index,color:{type:'string'},width:{type:'number',min:.01},height:{type:'number',min:.01}}},
 {id:'drawing.part.place',act:'place',on:'art.draw.part',params:{id:text,index,x:number,y:number},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}},
 {id:'drawing.part.remove',act:'remove',on:'art.draw.part',params:{id:text,index}},
 {id:'drawing.part.extract',act:'ungroup',on:'art.draw.part',effectScope:{projection:'composite'},intent:{parameters:{id:{role:'source',reference:true,label:'from object'}}},params:{id:text,index}},
 {id:'drawing.object.group',act:'group',on:'art.draw.object',effectScope:{projection:'composite'},intent:{parameters:{ids:{role:'source',reference:true,label:'from members'}}},params:{ids:{type:'array',required:true},name:{type:'string',default:'Group'},label:{type:'string'}}},
 {id:'drawing.object.ungroup',act:'ungroup',on:'art.draw.object',effectScope:{projection:'composite'},intent:{parameters:{id:{role:'source',reference:true,label:'from object'}}},params:{id:text}},
];
const fail=code=>({status:'missing',code}),done=(changed,data)=>({status:'supported',changed,...(data?{data}:{})}),object=(s,id)=>findDrawingObject(s,id);
const boxOf=p=>{if(p.pts){const xs=p.pts.map(q=>q[0]),ys=p.pts.map(q=>q[1]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};}return {x0:p.x-p.w/2,x1:p.x+p.w/2,y0:p.y-p.h/2,y1:p.y+p.h/2};};
const transform=(o,x,y)=>{const p=geometryPoint(objectMatrix(o),x*o.size,y*o.size);return [o.x+p[0],o.y+p[1]];};
export function drawingPartsOf(o){
 const parts=partsOf(o);
 // Archives authored before affine geometry retain their exact observed numeric projection.
 if(!o.geometryMatrix&&o.width===undefined&&o.height===undefined&&!parts.some(p=>p.matrix)){
  const legacy=(x,y)=>{const a=(o.rotation??0)*Math.PI/180,dx=x*o.size*(o.flip?-1:1),dy=y*o.size;return [o.x+dx*Math.cos(a)-dy*Math.sin(a),o.y+dx*Math.sin(a)+dy*Math.cos(a)];};
  return parts.map((p,index)=>{const b=boxOf(p),corners=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(([x,y])=>legacy(x,y)),xs=corners.map(v=>v[0]),ys=corners.map(v=>v[1]),[x,y]=legacy((b.x0+b.x1)/2,(b.y0+b.y1)/2);return {id:JSON.stringify([o.id,'part',index]),object:o.id,index,role:p.n,primitive:p.s,color:p.hex,x,y,width:(b.x1-b.x0)*o.size,height:(b.y1-b.y0)*o.size,bounds:{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)},geometry:structuredClone(p),sourceKind:o.semanticKind??kindName(kindKey(o))};});
 }

 return partsOf(o).map((p,index)=>{const b=boxOf(p),angle=(p.r??0)*Math.PI/180,local=(x,y)=>{if(!p.pts&&p.r){const dx=x-p.x,dy=y-p.y;x=p.x+dx*Math.cos(angle)-dy*Math.sin(angle);y=p.y+dx*Math.sin(angle)+dy*Math.cos(angle);}return geometryPoint(p.matrix??[1,0,0,1,0,0],x,y);},corners=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(([x,y])=>transform(o,...local(x,y))),xs=corners.map(v=>v[0]),ys=corners.map(v=>v[1]),[x,y]=transform(o,...local((b.x0+b.x1)/2,(b.y0+b.y1)/2)),bounds={x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};return {id:JSON.stringify([o.id,'part',index]),object:o.id,index,role:p.n,primitive:p.s,color:p.hex,x,y,width:bounds.x1-bounds.x0,height:bounds.y1-bounds.y0,bounds,geometry:structuredClone(p),sourceKind:o.semanticKind??kindName(kindKey(o))};});
}

const baked=o=>partsOf(o).map(({color,hex,follows,...p})=>({...p,c:hex,...(follows?{m:1}:{})}));
function storeParts(o,parts,depth=0){
 budget.tick('drawing.native.parts');if(depth>32)throw new RangeError('drawing-group-depth');
 const sourceKind=o.semanticKind??kindName(kindKey(o)),shape={parts,aspect:KINDS[kindKey(o)]?.aspect??1,size:o.size,sourceKind};
 if(o.shape?.nativeMembers){
  const previous=o.shape,ref=previous.ref,members=[];
  for(const original of previous.members){const mine=parts.filter(p=>p.memberId===original.id);if(!mine.length)continue;const member=structuredClone(original),m=objectMatrix(member),s=member.size/ref.size,frame=[m[0]*s,m[1]*s,m[2]*s,m[3]*s,(member.x-ref.x)/ref.size,(member.y-ref.y)/ref.size],back=inverseMatrix(frame),local=mine.map(p=>{const {memberId,memberPart,memberOrigin,...geometry}=p;return {...geometry,...(memberOrigin??{}),matrix:multiplyMatrix(back,p.matrix??[1,0,0,1,0,0])};});storeParts(member,local,depth+1);members.push(member);}
  Object.assign(shape,{nativeMembers:true,members,ref:structuredClone(ref)});
 }

 const key=registerShape(sourceKind,shape);Object.assign(o,{kind:'composite',thing:thingOfKey(key),shape,semanticKind:sourceKind,parts:{}});delete o.hide;delete o.extra;
}
const getPart=(s,a)=>{const o=object(s,a.id);if(!o)return null;const parts=baked(o);return parts[a.index]?{o,parts,p:parts[a.index]}:null;};
const focus=(s,o,index=null)=>{s.selected=o.id;s.selectedIds=[o.id];s.selectedPart=index===null?null:{id:o.id,index};s.last=[o.id];};
export function restoreMembers(group){
 const ref=group.shape.ref,k=group.size/(ref.size||group.size),m=objectMatrix(group);
 return group.shape.members.map(original=>{const o=structuredClone(original),[dx,dy]=geometryPoint(m,(o.x-ref.x)*k,(o.y-ref.y)*k),child=objectMatrix(o);o.x=group.x+dx;o.y=group.y+dy;o.size=Math.max(.01,o.size*k);o.geometryMatrix=multiplyMatrix([...m,0,0],[...child,0,0]).slice(0,4);if(Object.hasOwn(o,'width')||Object.hasOwn(o,'height')){const b=bbox(o);o.width=b.w;o.height=b.h;}if(group.color&&!original.groupColorOverride)o.color=group.color;return o;});
}
/** Actual native scene objects, including group members in their current canvas frame. */
export function drawingObjectsOf(state){const visit=(o,depth=0)=>{budget.tick('drawing.native.objects');if(depth>32)throw new RangeError('drawing-group-depth');return[o,...(o.shape?.nativeMembers?restoreMembers(o).flatMap(child=>visit(child,depth+1)):[])];};return state.objects.flatMap(o=>visit(o,0));}
export const findDrawingObject=(state,id)=>drawingObjectsOf(state).find(o=>o.id===id)??null;
function rebuildNativeGroup(group,members){
 for(const member of members){if(group.color&&member.color!==group.color)member.groupColorOverride=true;else delete member.groupColorOverride;}
 const built=groupOf(members),shape={...built.shape,nativeMembers:true,members:structuredClone(members),ref:{x:built.x,y:built.y,size:built.size}},key=registerShape(group.name??group.semanticKind,shape);
 Object.assign(group,{kind:'composite',thing:thingOfKey(key),shape,x:built.x,y:built.y,size:built.size,z:built.z,rotation:0,flip:false,geometryMatrix:[1,0,0,1],parts:{}});
 if(Object.hasOwn(group,'width'))group.width=built.size;if(Object.hasOwn(group,'height'))group.height=built.size*built.shape.aspect;
 return group;
}
/** Apply a declared whole-object colour through native groups while retaining explicit part overrides. */
export function colourDrawingObject(o,color,depth=0){budget.tick('drawing.native.colour');if(depth>32)throw new RangeError('drawing-group-depth');if(o.shape?.nativeMembers){const members=restoreMembers(o);for(const child of members)colourDrawingObject(child,color,depth+1);o.color=color;rebuildNativeGroup(o,members);}else o.color=color;delete o.groupColorOverride;}
/** Replace one actual ID in place; ancestors are rebuilt from the same native member geometry. */
export function replaceDrawingObject(state,id,replacements){
 let found=false;
 const visit=(o,depth=0)=>{budget.tick('drawing.native.replace');if(depth>32)throw new RangeError('drawing-group-depth');if(o.id===id){found=true;return replacements;}if(!o.shape?.nativeMembers)return[o];let changed=false;const members=restoreMembers(o).flatMap(child=>{const before=found,next=visit(child,depth+1);if(found!==before)changed=true;return next;});return changed?members.length?[rebuildNativeGroup(o,members)]:[]:[o];};
 state.objects=state.objects.flatMap(o=>visit(o,0));return found;
}
export function independentDrawingIds(state,ids){return ids.every(id=>{const o=findDrawingObject(state,id);return !o?.shape?.nativeMembers||!drawingObjectsOf({objects:restoreMembers(o)}).some(child=>ids.includes(child.id));});}
const editPartMatrix=(o,p,world)=>{const m=objectMatrix(o),frame=[m[0]*o.size,m[1]*o.size,m[2]*o.size,m[3]*o.size,o.x,o.y];p.matrix=multiplyMatrix(multiplyMatrix(inverseMatrix(frame),world),multiplyMatrix(frame,p.matrix??[1,0,0,1,0,0]));};

const makePiece=(s,p,owner)=>{const o=makeObject(s,registerShape(p.name,p.shape),{fill:owner.fill});Object.assign(o,{x:p.x,y:p.y,size:p.size,rotation:p.rotation,z:p.z,name:p.name,semanticKind:'part',origin:{kind:owner.semanticKind??kindName(kindKey(owner)),object:owner.id,role:p.name}});return o;};
export const drawingPartHandlers={
 'drawing.object.parts':(ctx,a)=>{const o=object(ctx.state,a.id);return o?done([],drawingPartsOf(o)):fail('missing-target');},
 'drawing.part.select':(ctx,a)=>{const found=getPart(ctx.state,a);if(!found)return fail('missing-part');focus(ctx.state,found.o,a.index);return done([found.o.id]);},
 'drawing.part.change':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');const {o,parts,p}=found;
  if(!['color','width','height'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');if(a.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(a.color))return fail('invalid-native-color');
  const current=drawingPartsOf(o)[a.index];if(a.width!==undefined&&current.width===0||a.height!==undefined&&current.height===0)return fail('degenerate-part-size');
  const sx=a.width===undefined?1:a.width/current.width,sy=a.height===undefined?1:a.height/current.height;
  editPartMatrix(o,p,[sx,0,0,sy,current.x*(1-sx),current.y*(1-sy)]);
  if(a.color!==undefined){p.c=a.color;delete p.m;}remember(ctx.state,null);storeParts(o,parts);replaceDrawingObject(ctx.state,o.id,[o]);focus(ctx.state,o,a.index);return done([o.id]);
 },
 'drawing.part.place':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');const {o,parts,p}=found,current=drawingPartsOf(o)[a.index],dx=a.x-current.x,dy=a.y-current.y;
  if(dx===0&&dy===0)return done([]);remember(ctx.state,null);editPartMatrix(o,p,[1,0,0,1,dx,dy]);storeParts(o,parts);replaceDrawingObject(ctx.state,o.id,[o]);focus(ctx.state,o,a.index);return done([o.id]);
 },
 'drawing.part.remove':(ctx,a)=>{const found=getPart(ctx.state,a);if(!found)return fail('missing-part');if(found.parts.length===1)return fail('last-part');remember(ctx.state,null);found.parts.splice(a.index,1);storeParts(found.o,found.parts);replaceDrawingObject(ctx.state,found.o.id,[found.o]);focus(ctx.state,found.o);return done([found.o.id]);},
 'drawing.part.extract':(ctx,a)=>{
  const found=getPart(ctx.state,a);if(!found)return fail('missing-part');if(found.parts.length===1)return fail('last-part');const {o,parts,p}=found;
  const single=structuredClone(o);storeParts(single,[p]);const piece=piecesOf(single)[0];if(!piece)return fail('unsupported-part');remember(ctx.state,null);parts.splice(a.index,1);storeParts(o,parts);replaceDrawingObject(ctx.state,o.id,[o]);const child=makePiece(ctx.state,piece,o);ctx.state.objects.push(child);focus(ctx.state,child);return done([o.id,child.id]);
 },
 'drawing.object.group':(ctx,a)=>{
  if(a.ids.length<2||a.ids.length>40||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>typeof id!=='string'||!object(ctx.state,id))||!independentDrawingIds(ctx.state,a.ids))return fail('invalid-group-members');const members=a.ids.map(id=>object(ctx.state,id)),built=groupOf(members),shape={...built.shape,nativeMembers:true,members:structuredClone(members),ref:{x:built.x,y:built.y,size:built.size}};
  remember(ctx.state,null);const grouped=makeObject(ctx.state,registerShape(a.name,shape),{});Object.assign(grouped,{x:built.x,y:built.y,size:built.size,z:built.z,shape,name:a.name,label:a.label??a.name,semanticKind:'group'});for(const id of a.ids)replaceDrawingObject(ctx.state,id,[]);ctx.state.objects.push(grouped);focus(ctx.state,grouped);return done([grouped.id]);
 },
 'drawing.object.ungroup':(ctx,a)=>{
  const o=object(ctx.state,a.id);if(!o)return fail('missing-target');const restored=o.shape?.members?.length&&o.shape.ref?restoreMembers(o):null,pieces=restored?null:piecesOf(o);if(!restored&&pieces.length<2)return fail('not-a-compound');remember(ctx.state,null);
  const made=restored??pieces.map(p=>makePiece(ctx.state,p,o));replaceDrawingObject(ctx.state,o.id,made);ctx.state.last=made.map(m=>m.id);ctx.state.selectedIds=[...ctx.state.last];ctx.state.selected=made[0]?.id??null;ctx.state.selectedIds=made.map(m=>m.id);ctx.state.selectedPart=null;return done(made.map(m=>m.id));
 },
};

/** Construct only from a worker-loaded knowledge result; UI never supplies geometry or provenance. */
export function makeKnowledgeDrawing(state,name,entry,properties={}){
 const supplied=entry?.objects?.[0]?.parts;if(!Array.isArray(supplied)||!supplied.length)return fail('knowledge-drawing-unavailable');
 if(supplied.some(p=>!p||typeof p.name!=='string'||!['rectangle','square','circle','oval','triangle','polygon','line','arc'].includes(p.shape)||['x','y','w','h'].some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k]))||p.points&&(!Array.isArray(p.points)||p.points.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>typeof v!=='number'||!Number.isFinite(v))))))return fail('unsupported-knowledge-geometry');
 const canonical=entry.name??name,raw=thingBuild(canonical,{[canonical]:structuredClone(supplied)});if(!raw.length)return fail('knowledge-geometry-unavailable');
 const xs=supplied.flatMap(p=>[p.x,p.x+p.w]),ys=supplied.flatMap(p=>[p.y,p.y+p.h]),width=Math.max(1,Math.max(...xs)-Math.min(...xs)),height=Math.max(1,Math.max(...ys)-Math.min(...ys)),aspect=height/width;
 const shape={parts:raw,aspect,size:Math.round(200/Math.max(1,aspect)),sourceKind:name};
 remember(state,null);const created=makeObject(state,registerShape(name,shape));created.semanticKind=name;created.name=name;created.label='';
 created.origin={requested:name,realization:canonical,representation:'knowledge-vector-parts'};
 for(const key of ['x','y','size'])if(Object.hasOwn(properties,key))created[key]=properties[key];
 state.objects.push(created);focus(state,created);return done([created.id],{realization:{requested:name,drawing:canonical,parts:raw.length}});
}
