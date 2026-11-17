// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {initialState,makeObject,remember,removeThings,undoStep,redoStep,newPage} from './board.mjs';
import {DRAWING_PART_TOOL_BINDINGS,drawingPartHandlers,drawingPartsOf,makeKnowledgeDrawing} from './part-tools.mjs';
import {KINDS,W,H} from './scene.mjs';
export {initialState as initialDrawingState};
const kinds=Object.keys(KINDS),array={type:'array',required:true};
const properties={name:{type:'string'},x:{type:'number'},y:{type:'number'},size:{type:'number',min:0.001},color:{type:'string',nullable:true}};
export const DRAWING_TOOL_BINDINGS=[
 {id:'drawing.object.make',sample:[{args:{kind:{enum:true},name:{unique:{prefix:'Shape'}},x:{number:{min:80,max:650}},y:{number:{min:80,max:450}},size:{number:{min:40,max:100}}}}],act:'make',on:'art.draw.object',params:{kind:{type:'string',required:true,enum:kinds},...properties}},
 {id:'drawing.catalog.make',act:'make',on:'art.draw.object',knowledgeInputs:[{argument:'name',load:'thing'}],params:{name:{type:'string',required:true},x:{type:'number'},y:{type:'number'},size:{type:'number',min:.001}}},
 {id:'drawing.object.change',sample:[{args:{ids:{ref:{on:'art.draw.object',many:true}},name:{unique:{prefix:'Shape'}}}}],act:'change',on:'art.draw.object',params:{ids:array,...properties}},
 {id:'drawing.object.select',act:'ask',on:'art.draw.object',params:{id:{type:'string',required:true,nullable:true}}},
 {id:'drawing.objects.select',act:'ask',on:'art.draw.object',params:{ids:array}},
 {id:'drawing.object.place',act:'place',on:'art.draw.object',params:{ids:array,x:{type:'number',required:true},y:{type:'number',required:true}},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}},
 {id:'drawing.page.clear',act:'remove',on:'art.draw.page',intent:{subject:'contents of the drawing',determiner:'the'},params:{}},
 {id:'drawing.object.remove',act:'remove',on:'art.draw.object',params:{ids:array}},
 {id:'drawing.observe',act:'ask',on:'art.draw.object',params:{}},
 {id:'drawing.undo',act:'undo',on:'art.draw.object',params:{}},
 {id:'drawing.redo',act:'redo',on:'art.draw.object',params:{}},
 ...DRAWING_PART_TOOL_BINDINGS,
];
const keys=Object.keys(properties),fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const validPatch=a=>!Object.hasOwn(a,'color')||a.color===null||/^#[a-fA-F0-9]{6}$/.test(a.color);
const select=(s,ids)=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&s.objects.some(o=>o.id===id));
const view=s=>{
 if(!Array.isArray(s.objects)||!Array.isArray(s.history)||!Array.isArray(s.future)||!Number.isSafeInteger(s.nextId)||s.nextId<1)throw new TypeError('invalid-drawing-store');
 const roots=s.objects.map(o=>({id:o.id,kind:o.semanticKind??o.kind,sourceType:'art.draw.object',inputs:keys.map(key=>({binding:`drawing.object.${key}`,key,values:o[key]===undefined||o[key]===null?[]:[nativeToken(o[key])],...(['x','y','size'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}:{})}))}));
 const children=s.objects.flatMap(o=>drawingPartsOf(o).map(p=>({id:p.id,kind:p.primitive,sourceType:'art.draw.part',in:o.id,role:p.role,origin:{object:o.id,kind:p.sourceKind,representation:'actual-vector-constituent'},inputs:Object.entries({role:p.role,color:p.color,x:p.x,y:p.y,width:p.width,height:p.height,index:p.index}).map(([key,value])=>({binding:'drawing.part.'+key,key,values:[nativeToken(value)],...(['x','y','width','height'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}:{})}))})));
 return [...roots,...children];
};
export function createDrawingHost({state=initialState(),instanceId,knowledge=null,...limits}={}){
 const handlers={
  'drawing.object.make':(ctx,a)=>{
   if(!validPatch(a))return fail('invalid-native-color');
   if(ctx.state.objects.some(o=>o.id===`o${ctx.state.nextId}`)||!Number.isSafeInteger(ctx.state.nextId+1))return fail('native-id-collision');
   remember(ctx.state,null);const object=makeObject(ctx.state,a.kind);
   for(const key of keys)if(Object.hasOwn(a,key))object[key]=a[key];
   ctx.state.objects.push(object);ctx.state.last=[object.id];ctx.state.selected=object.id;ctx.state.selectedIds=[object.id];ctx.state.selectedPart=null;return done([object.id]);
  },
  'drawing.catalog.make':(ctx,a)=>makeKnowledgeDrawing(ctx.state,a.name,knowledge?.peek?.(a.name),a),
  'drawing.object.change':(ctx,a)=>{
   if(!select(ctx.state,a.ids))return fail('missing-target');if(!validPatch(a))return fail('invalid-native-color');
   const patch=keys.filter(key=>Object.hasOwn(a,key));if(!patch.length)return fail('missing-property');
   const objects=ctx.state.objects.filter(o=>a.ids.includes(o.id)),changed=objects.filter(o=>patch.some(key=>o[key]!==a[key]));
   if(!changed.length)return done([]);remember(ctx.state,null);for(const o of changed)for(const key of patch)o[key]=a[key];return done(changed.map(o=>o.id));
  },
  'drawing.object.select':(ctx,a)=>{if(a.id!==null&&!ctx.state.objects.some(o=>o.id===a.id))return fail('missing-target');ctx.state.selected=a.id;ctx.state.selectedIds=a.id?[a.id]:[];ctx.state.selectedPart=null;return done(a.id?[a.id]:[]);},
  'drawing.objects.select':(ctx,a)=>{if(a.ids.length&&!select(ctx.state,a.ids))return fail('missing-target');ctx.state.selectedIds=[...a.ids];ctx.state.selected=a.ids[0]??null;ctx.state.selectedPart=null;return done(a.ids);},
  'drawing.object.place':(ctx,a)=>{if(!select(ctx.state,a.ids))return fail('missing-target');const objects=ctx.state.objects.filter(o=>a.ids.includes(o.id));if(objects.every(o=>o.x===a.x&&o.y===a.y))return done([]);remember(ctx.state,null);for(const o of objects){o.x=a.x;o.y=a.y;}ctx.state.selected=objects[0].id;ctx.state.selectedIds=[...a.ids];ctx.state.selectedPart=null;ctx.state.last=a.ids;return done(a.ids);},
  'drawing.page.clear':ctx=>{const result=newPage(ctx);ctx.state.selectedIds=[];ctx.state.selectedPart=null;return result;},
  'drawing.object.remove':(ctx,a)=>{if(!select(ctx.state,a.ids))return fail('missing-target');const result=removeThings(ctx,a);if(result.status==='supported'){ctx.state.selectedIds=(ctx.state.selectedIds??[]).filter(id=>ctx.state.objects.some(o=>o.id===id));if(ctx.state.selectedPart&&!ctx.state.objects.some(o=>o.id===ctx.state.selectedPart.id))ctx.state.selectedPart=null;}return result;},
  'drawing.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'drawing.undo':undoStep,'drawing.redo':redoStep,
  ...drawingPartHandlers,
 };
 return createNativeToolHost({state,instanceId,scope:'drawing.object-lifecycle',operations:DRAWING_TOOL_BINDINGS,handlers,view,...limits});
}
// Actual board construction defaults, not semantic-kind or request mappings.
export const DRAWING_NATIVE_DEFAULTS={x:W/2,y:H/2,size:'renderer-kind.size',color:null};
