// The avatar's native face tools, with choices derived from the supplied knowledge.
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {DEFAULT_FACE} from './default-face.mjs';
import {newFace,wearPreset,putPart,takeOff,setParts,moveParts,toolView,roleOf,neighbours,NONE,PART_SIZE_GRADES,PART_MOVE_DIRECTIONS,undoStep,redoStep} from './face.mjs';
const text={type:'string',required:true},ids={type:'array',required:true},faceId={type:'string',default:'face',enum:['face']};
const available=(slot,variant)=>slot?.variants.some(v=>v.name===variant&&v.parts?.length>0);
export const initialAvatarState=(data=DEFAULT_FACE)=>({face:newFace(data)});
/** A role colour is shared by its visible parts; callers must name that whole scope. */
export function avatarColourScope(data,face,id,colour){
 const role=roleOf(data,id);
 return role&&data.colours[role]?.[colour]?data.slots.filter(s=>face.slots[s.name]&&face.slots[s.name]!==NONE&&roleOf(data,s.name)===role).map(s=>s.name):[id];
}
export function avatarColoursFor(data,face,id){
 const role=roleOf(data,id),variant=data.slots.find(s=>s.name===id)?.variants.find(v=>v.name===face.slots[id]);
 return [...new Set([...Object.keys(data.colours[role]??{}),...(variant?.parts??[]).flatMap(p=>p.tint?[]:p.colour??[])])];
}
export function avatarResizeScope(data,id){const slot=data.slots.find(s=>s.name===id);if(!slot)return [];const groups=neighbours(data,slot);return [...groups.inside,...groups.riders].map(part=>part.name);}
export function avatarCapabilities(data=DEFAULT_FACE){
 const presets=Object.values(data.presets).filter(p=>Object.entries(p.slots).every(([name,variant])=>variant===NONE||available(data.slots.find(s=>s.name===name),variant))).map(p=>p.name);
 const expressions=Object.entries(data.expressions).filter(([,e])=>Object.entries(e.over).every(([slot,variant])=>available(data.slots.find(s=>s.name===slot),variant))).map(([name])=>name);
 return {presets,expressions,sizes:[...PART_SIZE_GRADES],directions:[...PART_MOVE_DIRECTIONS],slots:data.slots.map(slot=>({id:slot.name,label:slot.name.replace(/_/g,' '),optional:slot.optional===true,colourRole:roleOf(data,slot.name),variants:slot.variants.filter(v=>v.parts?.length>0).map(v=>v.name),colours:[...new Set([...Object.keys(data.colours[roleOf(data,slot.name)]??{}),...slot.variants.flatMap(v=>v.parts??[]).flatMap(p=>p.tint?[]:p.colour??[])])]}))};
}
export function createAvatarHost({state=null,instanceId,knowledge=null,data=null,...limits}={}){
 const catalog=data??knowledge?.peekFaces?.()??DEFAULT_FACE,capabilities=avatarCapabilities(catalog);
 const variants=[...new Set(capabilities.slots.flatMap(s=>s.variants))];
 const resizeRelated=catalog.slots.flatMap(slot=>{const group=neighbours(catalog,slot);return [...group.inside,...group.riders].map(part=>({when:{parameter:'ids',includes:slot.name,provided:'size'},id:part.name,keys:['dx','dy','scale','place'],relationship:group.inside.includes(part)?'inside':'rests-on'}));});
 state??=initialAvatarState(catalog);
 if(state.face?.v!==2)throw Error('avatar-initialization-required');
 const operations=[
  {id:'avatar.face.preset',act:'change',on:'ui.avatar.face',intent:{subject:'face',parameters:{preset:{label:'using preset'}}},params:{id:faceId,preset:{...text,enum:capabilities.presets}}},
  {id:'avatar.face.expression',act:'change',on:'ui.avatar.face',intent:{subject:'face',parameters:{expression:{label:'with expression'}}},params:{id:faceId,expression:{...text,enum:capabilities.expressions}}},
  {id:'avatar.face.name',act:'change',on:'ui.avatar.face',params:{id:faceId,name:text}},
  {id:'avatar.part.add',act:'make',on:'ui.avatar.part',params:{id:{...text,enum:capabilities.slots.filter(s=>s.optional&&s.variants.length).map(s=>s.id)},variant:{...text,enum:variants}}},
  {id:'avatar.part.change',act:'change',on:'ui.avatar.part',effectScope:{related:resizeRelated},params:{ids,variant:{type:'string',enum:variants},colour:{type:'string',enum:[...new Set(capabilities.slots.flatMap(s=>s.colours))]},size:{type:'string',enum:capabilities.sizes}}},
  {id:'avatar.part.move',act:'place',on:'ui.avatar.part',params:{ids,place:{...text,enum:capabilities.directions}}},
  {id:'avatar.part.remove',act:'remove',on:'ui.avatar.part',params:{ids}},
  {id:'avatar.observe',act:'ask',on:'ui.avatar.face',params:{}},
  {id:'avatar.undo',act:'undo',on:'ui.avatar.face',params:{}},
  {id:'avatar.redo',act:'redo',on:'ui.avatar.face',params:{}},
 ];
 const view=s=>toolView({state:s,knowledge:{peekFaces:()=>catalog}}).map(row=>({id:row.id,kind:row.kind,sourceType:row.id==='face'?'ui.avatar.face':'ui.avatar.part',inputs:Object.entries({...row,...(row.id==='face'?{name:s.name??'Avatar'}:{name:capabilities.slots.find(slot=>slot.id===row.id)?.label??row.id,dx:s.face.adj?.[row.id]?.dx??0,dy:s.face.adj?.[row.id]?.dy??0,scale:s.face.adj?.[row.id]?.s??1,tintRole:roleOf(catalog,row.id)})}).filter(([key])=>!['id','kind'].includes(key)).map(([key,value])=>({binding:`avatar.${row.id==='face'?'face':'part'}.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)]}))}));
 const context=ctx=>({...ctx,knowledge:{peekFaces:()=>catalog}}),validIds=(ctx,a)=>a.ids.length>0&&new Set(a.ids).size===a.ids.length&&a.ids.every(id=>typeof id==='string'&&ctx.state.face.slots[id]&&ctx.state.face.slots[id]!==NONE);
 const fail=code=>({status:'missing',code});
 const handlers={
  'avatar.face.preset':(ctx,a)=>{const result=wearPreset(context(ctx),{preset:a.preset});if(ctx.state.face.stepGroup===undefined)delete ctx.state.face.stepGroup;return result;},
  'avatar.face.expression':(ctx,a)=>setParts(context(ctx),{ids:['face'],expression:a.expression}),
  'avatar.face.name':(ctx,a)=>{if(!a.name.trim()||a.name.length>40)return fail('invalid-avatar-name');ctx.state.name=a.name;return {status:'supported',changed:['face']};},
  'avatar.part.add':(ctx,a)=>{if(ctx.state.face.slots[a.id]!==undefined&&ctx.state.face.slots[a.id]!==NONE)return fail('part-already-present');if(!available(catalog.slots.find(s=>s.name===a.id),a.variant))return fail('unavailable-variant-drawing');return putPart(context(ctx),{part:a.id,variant:a.variant});},
  'avatar.part.change':(ctx,a)=>{if(!validIds(ctx,a))return fail('missing-target');if(a.variant!==undefined&&a.ids.some(id=>!available(catalog.slots.find(s=>s.name===id),a.variant)))return fail('unavailable-variant-drawing');if(a.colour!==undefined&&a.ids.some(id=>avatarColourScope(catalog,ctx.state.face,id,a.colour).some(other=>!a.ids.includes(other))))return fail('shared-colour-scope-required');return setParts(context(ctx),a);},
  'avatar.part.move':(ctx,a)=>validIds(ctx,a)?moveParts(context(ctx),a):fail('missing-target'),
  'avatar.part.remove':(ctx,a)=>validIds(ctx,a)?takeOff(context(ctx),a):fail('missing-target'),
  'avatar.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'avatar.undo':ctx=>undoStep(context(ctx)),
  'avatar.redo':ctx=>redoStep(context(ctx)),
 };
 return {...createNativeToolHost({state,instanceId,scope:'avatar.face-and-parts',operations,handlers,view,...limits}),capabilities:()=>structuredClone(capabilities)};
}
