// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=70dc2d3ab9';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=d1134285cd';
import {budget} from '../../lib/dialog/budget.mjs?v=00bce6e369';
import {canonicalDrawingState,toNativeDrawingState} from './canonical-state.mjs?v=936b96103f';
import {spatialBox} from '../native-spatial-observation.mjs?v=ced85b9a29';
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=66339be62d';
import {initialState,makeObject,remember,undoStep,redoStep,newPage} from './board.mjs?v=46852be6c7';
import {drawingPartHandlers,drawingPartsOf,makeKnowledgeDrawing,restoreMembers,drawingObjectsOf,findDrawingObject,replaceDrawingObject,independentDrawingIds,colourDrawingObject} from './part-tools.mjs?v=ac810f0369';
import {KINDS,W,H,bbox,objectMatrix} from './scene.mjs?v=2d9a84848f';
export {initialState as initialDrawingState};
export const initialCanonicalDrawingState=()=>canonicalDrawingState(initialState());
const toolInterface = readNativeToolInterface(NATIVE_INTERFACE).realize({ 'drawing.kinds': Object.keys(KINDS) });
export const DRAWING_TOOL_BINDINGS = toolInterface.bindings;
const keys=Object.keys(DRAWING_TOOL_BINDINGS.find(op=>op.id==='drawing.object.change').params).filter(key=>key!=='ids'),fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const validPatch=a=>!Object.hasOwn(a,'color')||a.color===null||/^#[a-fA-F0-9]{6}$/.test(a.color);
const select=(s,ids)=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&!!findDrawingObject(s,id))&&independentDrawingIds(s,ids);
const view=s=>{
 if(!Array.isArray(s.objects)||!Array.isArray(s.history)||!Array.isArray(s.future)||!Number.isSafeInteger(s.nextId)||s.nextId<1)throw new TypeError('invalid-drawing-store');
 const extra=[],walk=(o,parent)=>{const row=record(o);if(parent){row.in=parent;row.role='member';extra.push({o,row});}if(o.shape?.nativeMembers)for(const child of restoreMembers(o))walk(child,o.id);};
 const record=o=>({id:o.id,kind:o.semanticKind??o.kind,sourceType:'art.draw.object',...(o.shape?.nativeMembers?{relations:{members:restoreMembers(o).map(m=>m.id)}}:{}),inputs:keys.filter(key=>!['label','width','height'].includes(key)||Object.hasOwn(o,key)).map(key=>({binding:`drawing.object.${key}`,key,values:o[key]===undefined||o[key]===null?[]:[nativeToken(['width','height'].includes(key)?bbox(o)[key==='width'?'w':'h']:o[key])],...(['x','y','size','width','height'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}:{})}))});
 const roots=s.objects.map(record);for(const o of s.objects)walk(o,null);const members=extra.map(item=>item.row);
 const children=[...s.objects,...extra.map(item=>item.o)].flatMap(o=>drawingPartsOf(o).map(p=>({id:p.id,kind:p.primitive,sourceType:'art.draw.part',in:o.id,role:p.role,origin:{object:o.id,kind:p.sourceKind,representation:'actual-vector-constituent'},inputs:Object.entries({role:p.role,color:p.color,x:p.x,y:p.y,width:p.width,height:p.height,index:p.index}).map(([key,value])=>({binding:'drawing.part.'+key,key,values:[nativeToken(value)],...(['x','y','width','height'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}:{})}))})));
 const page=Object.hasOwn(s,'idDisplay')?[{id:'drawing.page',kind:'page',sourceType:'art.draw.page',inputs:Object.entries(s.idDisplay).map(([key,value])=>({binding:'drawing.ids.'+key,key,values:[nativeToken(value)]}))}]:[];
 return [...roots,...members,...children,...page];
};
const spatial = state => {
 const frame = 'drawing.canvas', scope = frame, boxes = [spatialBox(frame, scope, [0, 0, W, H], 'rectangle')];
 const relations = [], occupants = [], unknown = [];
 const walk = (object, parent, depth=0) => {
  budget.tick('drawing.native.spatial');
  if(depth>32)throw new RangeError('drawing-group-depth');
  const b = bbox(object);
  const box = spatialBox(object.id, scope, [b.x0, b.y0, b.x1, b.y1]);
  if (!parent) occupants.push(object.id);
  if (box) boxes.push(box); else unknown.push(object.id);
  if (parent) relations.push({subject:object.id,object:parent,kind:'member_of',scope});
  if (object.shape?.nativeMembers) for (const member of restoreMembers(object)) walk(member,object.id,depth+1);
  for (const part of drawingPartsOf(object)) {
   const b = part.bounds, bounds = spatialBox(part.id,scope,[b.x0,b.y0,b.x1,b.y1]);
   if (bounds) boxes.push(bounds); else unknown.push(part.id);
   relations.push({subject:part.id,object:object.id,kind:'member_of',scope});
  }
 };
 for (const object of state.objects) walk(object,null);
 return {frame,scope,container:frame,bounds:frame,boxes,relations,occupants,unknown};
};
const buildDrawingObject=(state,args)=>{
 const object=makeObject(state,args.kind);
 for(const key of keys)if(Object.hasOwn(args,key))object[key]=args[key];
 if(args.width!==undefined||args.height!==undefined)object.geometryMatrix=objectMatrix(object);
 return object;
};
export function createDrawingHost({state=initialState(),instanceId,knowledge=null,...limits}={}){
 const nativeHandlers={
  'drawing.object.make':(ctx,a)=>{
   if(!validPatch(a))return fail('invalid-native-color');
   if(ctx.state.objects.some(o=>o.id===`o${ctx.state.nextId}`)||!Number.isSafeInteger(ctx.state.nextId+1))return fail('native-id-collision');
   remember(ctx.state,null);const object=buildDrawingObject(ctx.state,a);
   ctx.state.objects.push(object);ctx.state.last=[object.id];ctx.state.selected=object.id;ctx.state.selectedIds=[object.id];ctx.state.selectedPart=null;return done([object.id]);
  },
  'drawing.catalog.make':(ctx,a)=>makeKnowledgeDrawing(ctx.state,a.name,knowledge?.peek?.(a.name),a),
  'drawing.object.change':(ctx,a)=>{
   if(!select(ctx.state,a.ids))return fail('missing-target');if(!validPatch(a))return fail('invalid-native-color');
   const patch=keys.filter(key=>Object.hasOwn(a,key));if(!patch.length)return fail('missing-property');
   const objects=a.ids.map(id=>findDrawingObject(ctx.state,id)),changed=objects.filter(o=>patch.some(key=>o[key]!==a[key]));
   if(!changed.length)return done([]);remember(ctx.state,null);for(const o of changed){
    const dimensions=Object.hasOwn(a,'width')||Object.hasOwn(a,'height');if(dimensions||Object.hasOwn(a,'size')&&(o.width!==undefined||o.height!==undefined))o.geometryMatrix=objectMatrix(o);
    for(const key of patch)if(!['width','height','color'].includes(key))o[key]=a[key];if(Object.hasOwn(a,'color'))colourDrawingObject(o,a.color);
    if(dimensions){const b=bbox(o),m=objectMatrix(o),sx=a.width===undefined?1:a.width/b.w,sy=a.height===undefined?1:a.height/b.h;o.geometryMatrix=[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy];for(const key of ['width','height'])if(Object.hasOwn(a,key))o[key]=a[key];}
    replaceDrawingObject(ctx.state,o.id,[o]);
   }return done(changed.map(o=>o.id));
  },
  'drawing.object.select':(ctx,a)=>{if(a.id!==null&&!findDrawingObject(ctx.state,a.id))return fail('missing-target');ctx.state.selected=a.id;ctx.state.selectedIds=a.id?[a.id]:[];ctx.state.selectedPart=null;return done(a.id?[a.id]:[]);},
  'drawing.objects.select':(ctx,a)=>{if(a.ids.length&&!select(ctx.state,a.ids))return fail('missing-target');ctx.state.selectedIds=[...a.ids];ctx.state.selected=a.ids[0]??null;ctx.state.selectedPart=null;return done(a.ids);},
  'drawing.object.place':(ctx,a)=>{if(!select(ctx.state,a.ids))return fail('missing-target');const objects=a.ids.map(id=>findDrawingObject(ctx.state,id));if(objects.every(o=>o.x===a.x&&o.y===a.y))return done([]);remember(ctx.state,null);for(const o of objects){o.x=a.x;o.y=a.y;replaceDrawingObject(ctx.state,o.id,[o]);}ctx.state.selected=objects[0].id;ctx.state.selectedIds=[...a.ids];ctx.state.selectedPart=null;ctx.state.last=a.ids;return done(a.ids);},
  'drawing.objects.transform':(ctx,a)=>{
   if(!select(ctx.state,a.ids))return fail('missing-target');
   const objects=a.ids.map(id=>findDrawingObject(ctx.state,id)),boxes=objects.map(bbox),x0=Math.min(...boxes.map(b=>b.x0)),y0=Math.min(...boxes.map(b=>b.y0)),w=Math.max(...boxes.map(b=>b.x1))-x0,h=Math.max(...boxes.map(b=>b.y1))-y0;
   if(w<=0||h<=0)return fail('degenerate-selection');
   const sx=a.width/w,sy=a.height/h;if(sx===1&&sy===1&&a.x===x0&&a.y===y0)return done([]);
   remember(ctx.state,null);
   for(const o of objects){const b=bbox(o),matrix=objectMatrix(o);o.x=a.x+(o.x-x0)*sx;o.y=a.y+(o.y-y0)*sy;o.geometryMatrix=[matrix[0]*sx,matrix[1]*sy,matrix[2]*sx,matrix[3]*sy];o.width=b.w*sx;o.height=b.h*sy;replaceDrawingObject(ctx.state,o.id,[o]);}
   ctx.state.selectedIds=[...a.ids];ctx.state.selected=a.ids[0];ctx.state.selectedPart=null;return done(a.ids);
  },
  'drawing.page.clear':ctx=>{const result=newPage(ctx);ctx.state.selectedIds=[];ctx.state.selectedPart=null;return result;},
  'drawing.object.remove':(ctx,a)=>{if(!select(ctx.state,a.ids))return fail('missing-target');remember(ctx.state,null);for(const id of a.ids)replaceDrawingObject(ctx.state,id,[]);const live=new Set(drawingObjectsOf(ctx.state).map(o=>o.id));ctx.state.last=[];ctx.state.selectedIds=(ctx.state.selectedIds??[]).filter(id=>live.has(id));if(!live.has(ctx.state.selected))ctx.state.selected=ctx.state.selectedIds[0]??null;if(ctx.state.selectedPart&&!live.has(ctx.state.selectedPart.id))ctx.state.selectedPart=null;for(const scene of ctx.state.scenes??[]){scene.members=scene.members.filter(id=>live.has(id));if(!scene.members.length)scene.gone=true;}return done(a.ids);},
  'drawing.ids.show':(ctx,a)=>{const next={mode:a.mode,...(a.mode==='temporary'?{expiresAt:Date.now()+a.duration}:{})};if(JSON.stringify(ctx.state.idDisplay)===JSON.stringify(next))return done([]);ctx.state.idDisplay=next;return done(['drawing.page']);},
  'drawing.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'drawing.undo':undoStep,'drawing.redo':redoStep,
  ...drawingPartHandlers,
 };
 const governed=Object.hasOwn(state,'sop');
 const handlers=governed?Object.fromEntries(Object.entries(nativeHandlers).map(([name,handler])=>[name,(ctx,args)=>{
  const native=toNativeDrawingState(ctx.state),before=JSON.stringify(native);
  const result=handler({...ctx,state:native},args);
  if(result?.status==='supported'&&JSON.stringify(native)!==before)Object.assign(ctx.state,canonicalDrawingState(native));
  return result;
 }])):nativeHandlers;
 const project=handler=>governed?carrier=>handler(toNativeDrawingState(carrier)):handler;
 function measure(operation,args){
  if(operation!=='drawing.object.make'||!Object.hasOwn(KINDS,args.kind)||!validPatch(args))return null;
  const {w,h}=bbox(buildDrawingObject({nextId:1},args));return {width:w,height:h};
 }
 return createNativeToolHost({state,instanceId,scope:'drawing.object-lifecycle',toolInterface,handlers,view:project(view),spatial:project(spatial),measure,...limits});
}
// Application entry point. Existing explicit native fixtures may still use createDrawingHost.
export function createCanonicalDrawingHost({state=initialCanonicalDrawingState(),...options}={}){
 if(!Object.hasOwn(state,'sop')){
  const carrier=canonicalDrawingState(state);
  for(const key of Object.keys(state))delete state[key];
  Object.assign(state,carrier);
 }
 return createDrawingHost({state,...options});
}
// Actual board construction defaults, not semantic-kind or request mappings.
export const DRAWING_NATIVE_DEFAULTS={x:W/2,y:H/2,size:'renderer-kind.size',color:null};
