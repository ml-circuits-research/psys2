// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {initialState,makeObject,remember,removeThings,undoStep,redoStep} from './board.mjs';
import {KINDS,W,H} from './scene.mjs';
export {initialState as initialDrawingState};
const kinds=Object.keys(KINDS),array={type:'array',required:true};
const properties={name:{type:'string'},x:{type:'number'},y:{type:'number'},size:{type:'number',min:0.001},color:{type:'string',nullable:true}};
export const DRAWING_TOOL_BINDINGS=[
 {id:'drawing.object.make',act:'make',on:'art.draw.object',params:{kind:{type:'string',required:true,enum:kinds},...properties}},
 {id:'drawing.object.change',act:'change',on:'art.draw.object',params:{ids:array,...properties}},
 {id:'drawing.object.remove',act:'remove',on:'art.draw.object',params:{ids:array}},
 {id:'drawing.observe',act:'ask',on:'art.draw.object',params:{}},
 {id:'drawing.undo',act:'undo',on:'art.draw.object',params:{}},
 {id:'drawing.redo',act:'redo',on:'art.draw.object',params:{}},
];
const keys=Object.keys(properties),fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const validPatch=a=>!Object.hasOwn(a,'color')||a.color===null||/^#[a-fA-F0-9]{6}$/.test(a.color);
const select=(s,ids)=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&s.objects.some(o=>o.id===id));
const view=s=>{
 if(!Array.isArray(s.objects)||!Array.isArray(s.history)||!Array.isArray(s.future)||!Number.isSafeInteger(s.nextId)||s.nextId<1)throw new TypeError('invalid-drawing-store');
 return s.objects.map(o=>({id:o.id,kind:o.kind,sourceType:'art.draw.object',inputs:keys.map(key=>({binding:`drawing.object.${key}`,key,values:o[key]===undefined||o[key]===null?[]:[nativeToken(o[key])],...(['x','y','size'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'drawing.canvas'}:{})}))}));
};
export function createDrawingHost({state=initialState(),instanceId,...limits}={}){
 const handlers={
  'drawing.object.make':(ctx,a)=>{
   if(!validPatch(a))return fail('invalid-native-color');
   if(ctx.state.objects.some(o=>o.id===`o${ctx.state.nextId}`)||!Number.isSafeInteger(ctx.state.nextId+1))return fail('native-id-collision');
   remember(ctx.state,null);const object=makeObject(ctx.state,a.kind);
   for(const key of keys)if(Object.hasOwn(a,key))object[key]=a[key];
   ctx.state.objects.push(object);ctx.state.last=[object.id];return done([object.id]);
  },
  'drawing.object.change':(ctx,a)=>{
   if(!select(ctx.state,a.ids))return fail('missing-target');if(!validPatch(a))return fail('invalid-native-color');
   const patch=keys.filter(key=>Object.hasOwn(a,key));if(!patch.length)return fail('missing-property');
   const objects=ctx.state.objects.filter(o=>a.ids.includes(o.id)),changed=objects.filter(o=>patch.some(key=>o[key]!==a[key]));
   if(!changed.length)return done([]);remember(ctx.state,null);for(const o of changed)for(const key of patch)o[key]=a[key];return done(changed.map(o=>o.id));
  },
  'drawing.object.remove':(ctx,a)=>select(ctx.state,a.ids)?removeThings(ctx,a):fail('missing-target'),
  'drawing.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'drawing.undo':undoStep,'drawing.redo':redoStep,
 };
 return createNativeToolHost({state,instanceId,scope:'drawing.object-lifecycle',operations:DRAWING_TOOL_BINDINGS,handlers,view,...limits});
}
// Actual board construction defaults, not semantic-kind or request mappings.
export const DRAWING_NATIVE_DEFAULTS={x:W/2,y:H/2,size:'renderer-kind.size',color:null};
