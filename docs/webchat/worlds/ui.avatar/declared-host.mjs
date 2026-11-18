import { readNativeToolInterface } from '../native-tool-interface.mjs?v=70dc2d3ab9';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=e227fb4b70';
// The avatar's native face tools, with choices derived from the supplied knowledge.
import {centeredSpatialBox,unionSpatialBoxes} from '../native-spatial-observation.mjs?v=ced85b9a29';
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=66339be62d';
import {compositionBase,compositionOverrides,expressionParts} from './composition.mjs?v=b3e12b14a5';
import {toNativeAvatarState,adoptCanonicalAvatarState} from './canonical-state.mjs?v=e957aeef37';
import {DEFAULT_FACE} from './default-face.mjs?v=3876f66308';
import {variantFor} from './facedraw.mjs?v=708c1180b9';
import {newFace,mark,wearPreset,putPart,takeOff,setParts,moveParts,toolView,roleOf,neighbours,centre,SCALE_MIN,SCALE_MAX,NONE,PART_SIZE_GRADES,PART_MOVE_DIRECTIONS,undoStep,redoStep} from './face.mjs?v=a3a1c78853';
const nativeInterface = readNativeToolInterface(NATIVE_INTERFACE);
const available=(slot,variant)=>slot?.variants.some(v=>v.name===variant&&v.parts?.length>0);
export const initialAvatarState=(data=DEFAULT_FACE)=>({face:newFace(data),selectedSlot:null});
/** A role colour is shared by its visible parts; callers must name that whole scope. */
export function avatarColourScope(data,face,id,colour){
 const role=roleOf(data,id);
 return role&&data.colours[role]?.[colour]?data.slots.filter(s=>(face.expressionParts?.[s.name]??face.slots[s.name])&&(face.expressionParts?.[s.name]??face.slots[s.name])!==NONE&&roleOf(data,s.name)===role).map(s=>s.name):[id];
}
export function avatarColoursFor(data,face,id){
 const role=roleOf(data,id),variant=data.slots.find(s=>s.name===id)?.variants.find(v=>v.name===(face.expressionParts?.[id]??face.slots[id]));
 return [...new Set([...Object.keys(data.colours[role]??{}),...(variant?.parts??[]).flatMap(p=>p.tint?[]:p.colour??[])])];
}
export function avatarResizeScope(data,id){const slot=data.slots.find(s=>s.name===id);if(!slot)return [];const groups=neighbours(data,slot);return [...groups.inside,...groups.riders].map(part=>part.name);}
export function avatarCapabilities(data=DEFAULT_FACE){
 const presets=Object.values(data.presets).filter(p=>Object.entries(p.slots).every(([name,variant])=>variant===NONE||available(data.slots.find(s=>s.name===name),variant))).map(p=>p.name);
 const expressions=Object.entries(data.expressions).filter(([name,e])=>Object.entries(e.over).every(([slot,variant])=>available(data.slots.find(s=>s.name===slot),variant))&&expressionParts(data,{slots:{}},name)!==null).map(([name])=>name);
 return {presets,geometry:{minScale:SCALE_MIN,maxScale:SCALE_MAX},characterKinds:[...new Set(presets.map(name=>data.presets[name].kind).filter(Boolean))],bases:presets.map(name=>({name,kind:data.presets[name].kind??null})),emotions:expressions.filter(name=>data.expressions[name].goals?.length),expressions,sizes:[...PART_SIZE_GRADES],directions:[...PART_MOVE_DIRECTIONS],slots:data.slots.map(slot=>({id:slot.name,label:slot.name.replace(/_/g,' '),optional:slot.optional===true,features:Object.fromEntries([...new Set(slot.variants.flatMap(v=>Object.keys(v.features??{})))].map(key=>[key,[...new Set(slot.variants.filter(v=>v.parts?.length).flatMap(v=>v.features?.[key]??[]))]])),colourRole:roleOf(data,slot.name),variants:slot.variants.filter(v=>v.parts?.length>0).map(v=>v.name),colours:[...new Set([...Object.keys(data.colours[roleOf(data,slot.name)]??{}),...slot.variants.flatMap(v=>v.parts??[]).flatMap(p=>p.tint?[]:p.colour??[])])]}))};
}
export function createAvatarHost({state=null,instanceId,knowledge=null,data=null,...limits}={}){
 const catalog=data??knowledge?.peekFaces?.()??DEFAULT_FACE,capabilities=avatarCapabilities(catalog);
 const variants=[...new Set(capabilities.slots.flatMap(s=>s.variants))];
 const resizeRelated=catalog.slots.flatMap(slot=>{const group=neighbours(catalog,slot);return [...group.inside,...group.riders].map(part=>({when:{parameter:'ids',includes:slot.name,provided:'size'},id:part.name,keys:['dx','dy','scale','place'],relationship:group.inside.includes(part)?'inside':'rests-on'}));});
 state??=initialAvatarState(catalog);
 if(toNativeAvatarState(state).face?.v!==2)throw Error('avatar-initialization-required');
 adoptCanonicalAvatarState(state,state);
 const toolInterface = nativeInterface.realize({
  'avatar.characterKinds': capabilities.characterKinds,
  'avatar.presets': capabilities.presets,
  'avatar.expressions': capabilities.expressions,
  'avatar.visibleSlots': capabilities.slots.filter(slot=>slot.variants.length).map(slot=>slot.id),
  'avatar.minScale': SCALE_MIN,
  'avatar.maxScale': SCALE_MAX,
  'avatar.variants': variants,
  'avatar.colours': [...new Set(capabilities.slots.flatMap(slot=>slot.colours))],
  'avatar.features': [...new Set(capabilities.slots.flatMap(slot=>Object.keys(slot.features)))],
  'avatar.featureValues': [...new Set(capabilities.slots.flatMap(slot=>Object.values(slot.features).flat()))],
  'avatar.sizes': capabilities.sizes,
  'avatar.directions': capabilities.directions,
  'avatar.resizeRelated': resizeRelated.map(row=>({...row,when:{...row.when,provided:'scale'}})),
  'avatar.sizeRelated': resizeRelated,
 });
 const nativeView=s=>toolView({state:s,knowledge:{peekFaces:()=>catalog}}).map(row=>({id:row.id,kind:row.kind,sourceType:row.id==='face'?'ui.avatar.face':'ui.avatar.part',inputs:Object.entries({...row,...(row.id==='face'?{name:s.name??'Avatar',...(Object.hasOwn(s,'idDisplay')?s.idDisplay:{}),...(s.face.adj?.face?{scale:s.face.adj.face.s??1}:{}),...(Object.hasOwn(s,'selectedSlot')?{selectedSlot:s.selectedSlot??null}:{}),base:s.face.base,characterKind:catalog.presets[s.face.base]?.kind??null}:{...(Object.hasOwn(s,'selectedSlot')?{selected:s.selectedSlot===row.id}:{}),name:capabilities.slots.find(slot=>slot.id===row.id)?.label??row.id,dx:s.face.adj?.[row.id]?.dx??0,dy:s.face.adj?.[row.id]?.dy??0,scale:s.face.adj?.[row.id]?.s??1,tintRole:roleOf(catalog,row.id)})}).filter(([key])=>!['id','kind'].includes(key)).map(([key,value])=>({binding:`avatar.${row.id==='face'?'face':'part'}.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)]}))}));
 const context=ctx=>({...ctx,knowledge:{peekFaces:()=>catalog}}),validIds=(ctx,a)=>a.ids.length>0&&new Set(a.ids).size===a.ids.length&&a.ids.every(id=>typeof id==='string'&&(ctx.state.face.expressionParts?.[id]??ctx.state.face.slots[id])&&(ctx.state.face.expressionParts?.[id]??ctx.state.face.slots[id])!==NONE);
 const noteExplicit=(f,args)=>{f.explicit??=compositionOverrides(catalog,f);if(args.variant!==undefined)f.explicit.slots=[...new Set([...f.explicit.slots,...args.ids])];if(args.colour!==undefined)for(const id of args.ids){const role=roleOf(catalog,id);if(role&&catalog.colours[role]?.[args.colour])f.explicit.roles=[...new Set([...f.explicit.roles,role])];else f.explicit.paint=[...new Set([...f.explicit.paint,id])];}};
 const noteExplicitVariant=(face,id)=>{face.explicit??=compositionOverrides(catalog,face);if(!face.explicit.slots.includes(id))face.explicit.slots.push(id);};
 const fail=code=>({status:'missing',code});
 const presentIds=f=>catalog.slots.filter(slot=>(f.expressionParts?.[slot.name]??f.slots[slot.name])&&((f.expressionParts?.[slot.name]??f.slots[slot.name])!==NONE)).map(slot=>slot.name);
 const removeConcrete=(ctx,a,clear=false)=>{const f=ctx.state.face,present=presentIds(f);if(new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!present.includes(id)))return fail('missing-target');if(clear&&(a.ids.length!==present.length||present.some(id=>!a.ids.includes(id))))return fail('incomplete-avatar-scope');if(!a.ids.length)return {status:'supported',changed:[]};mark(f);if(clear||a.ids.some(id=>Object.hasOwn(f.expressionParts??{},id))){Object.assign(f.slots,f.expressionParts??{});f.expression='';f.expressionParts={};}for(const id of a.ids)f.slots[id]=NONE;if(clear)f.explicit={slots:[],roles:[],paint:[]};else for(const id of a.ids)noteExplicitVariant(f,id);return {status:'supported',changed:[...a.ids]};};
 const nativeHandlers={
  'avatar.face.compose':(ctx,a)=>{if(a.characterKind===undefined&&a.base===undefined)return fail('missing-composition-property');const f=ctx.state.face,base=compositionBase(catalog,f,{kind:a.characterKind,base:a.base},capabilities.presets);if(!base)return fail('incompatible-composition-base');if(base===f.base)return {status:'supported',changed:[]};const explicit=f.explicit??compositionOverrides(catalog,f),fresh=newFace(catalog,base);mark(f);for(const id of explicit.slots)if(Object.hasOwn(f.slots,id))fresh.slots[id]=f.slots[id];for(const role of explicit.roles)fresh.colours[role]=f.colours[role];fresh.paint={...f.paint};fresh.grade={...f.grade};fresh.adj=structuredClone(f.adj);fresh.explicit=structuredClone(explicit);fresh.expression=f.expression;fresh.expressionParts=f.expression?expressionParts(catalog,{...fresh,expressionParts:f.expressionParts},f.expression)??{}:{};Object.assign(f,{slots:fresh.slots,colours:fresh.colours,paint:fresh.paint,grade:fresh.grade,adj:fresh.adj,explicit:fresh.explicit,expression:fresh.expression,expressionParts:fresh.expressionParts,base});return {status:'supported',changed:['face']};},

  'avatar.face.preset':(ctx,a)=>{const result=wearPreset(context(ctx),{preset:a.preset});if(ctx.state.face.stepGroup===undefined)delete ctx.state.face.stepGroup;return result;},
  'avatar.face.expression':(ctx,a)=>setParts(context(ctx),{ids:['face'],expression:a.expression}),
  'avatar.face.name':(ctx,a)=>{if(!a.name.trim()||a.name.length>40)return fail('invalid-avatar-name');ctx.state.name=a.name;return {status:'supported',changed:['face']};},
  'avatar.part.add':(ctx,a)=>{if((ctx.state.face.expressionParts?.[a.id]??ctx.state.face.slots[a.id])!==undefined&&(ctx.state.face.expressionParts?.[a.id]??ctx.state.face.slots[a.id])!==NONE)return fail('part-already-present');if(!available(catalog.slots.find(s=>s.name===a.id),a.variant))return fail('unavailable-variant-drawing');ctx.state.face.explicit??=compositionOverrides(catalog,ctx.state.face);const r=putPart(context(ctx),{part:a.id,variant:a.variant});if(r.status==='supported')noteExplicit(ctx.state.face,{ids:[a.id],variant:a.variant});return r;},
  'avatar.part.change':(ctx,a)=>{if(!validIds(ctx,a))return fail('missing-target');if(a.variant!==undefined&&a.ids.some(id=>!available(catalog.slots.find(s=>s.name===id),a.variant)))return fail('unavailable-variant-drawing');if(a.colour!==undefined&&a.ids.some(id=>avatarColourScope(catalog,ctx.state.face,id,a.colour).some(other=>!a.ids.includes(other))))return fail('shared-colour-scope-required');ctx.state.face.explicit??=compositionOverrides(catalog,ctx.state.face);const r=setParts(context(ctx),a);if(r.status==='supported')noteExplicit(ctx.state.face,a);return r;},
  'avatar.part.feature':(ctx,a)=>{if(!validIds(ctx,{ids:[a.id]}))return fail('missing-target');const slot=catalog.slots.find(s=>s.name===a.id),candidates=slot.variants.filter(v=>v.parts?.length&&v.features?.[a.property]?.includes(a.value));if(!candidates.length)return fail('unavailable-feature-combination');const current=ctx.state.face.expressionParts?.[a.id]??ctx.state.face.slots[a.id],variant=candidates.find(v=>v.name===current)?.name??candidates[0].name;ctx.state.face.explicit??=compositionOverrides(catalog,ctx.state.face);const r=setParts(context(ctx),{ids:[a.id],variant});if(r.status==='supported')noteExplicitVariant(ctx.state.face,a.id);return r;},
  'avatar.face.select':ctx=>{ctx.state.selectedSlot='face';return {status:'supported',changed:['face']};},
  'avatar.ids.show':(ctx,a)=>{const next={mode:a.mode,...(a.mode==='temporary'?{expiresAt:Date.now()+a.duration}:{})};if(JSON.stringify(ctx.state.idDisplay)===JSON.stringify(next))return {status:'supported',changed:[]};ctx.state.idDisplay=next;return {status:'supported',changed:['face']};},
  'avatar.face.resize':(ctx,a)=>{const f=ctx.state.face;if(f.adj.face?.s===a.scale)return {status:'supported',changed:[]};mark(f);f.adj.face={...(f.adj.face??{}),s:a.scale};return {status:'supported',changed:['face']};},
  'avatar.part.resize':(ctx,a)=>{
   if(!validIds(ctx,a))return fail('missing-target');
   const f=ctx.state.face,planned=new Map(),explicit=new Set(a.ids);
   for(const id of a.ids){
    const slot=catalog.slots.find(s=>s.name===id),before=f.adj[id]??{},ratio=a.scale/(before.s??1),origin=centre(slot,f);
    planned.set(id,{...before,s:a.scale});
    if(ratio===1)continue;
    const group=neighbours(catalog,slot);
    for(const child of [...group.inside,...group.riders]){
     if(explicit.has(child.name))continue;
     if(planned.has(child.name))return fail('conflicting-attachment-resize');
     const prior=f.adj[child.name]??{},position=centre(child,f),inside=group.inside.includes(child);
     const next={...prior,s:(prior.s??1)*ratio,dx:(prior.dx??0)+(inside?(position.x-origin.x)*(ratio-1):0),dy:(prior.dy??0)+(inside?(position.y-origin.y)*(ratio-1):-origin.h/2*(ratio-1))};
     if(next.s<SCALE_MIN||next.s>SCALE_MAX)return fail('attached-part-scale-bound');
     planned.set(child.name,next);
    }
   }
   if([...planned].every(([id,value])=>JSON.stringify(value)===JSON.stringify(f.adj[id]??{s:1})))return {status:'supported',changed:[]};
   mark(f);for(const [id,value]of planned)f.adj[id]=value;
   return {status:'supported',changed:[...planned.keys()]};
  },
  'avatar.part.select':(ctx,a)=>{if(a.id!==null&&!capabilities.slots.some(slot=>slot.id===a.id&&slot.variants.length))return fail('missing-target');ctx.state.selectedSlot=a.id;return {status:'supported',changed:['face']};},
  'avatar.part.move':(ctx,a)=>validIds(ctx,a)?moveParts(context(ctx),a):fail('missing-target'),
  'avatar.part.remove':(ctx,a)=>{if(!validIds(ctx,a))return fail('missing-target');ctx.state.face.explicit??=compositionOverrides(catalog,ctx.state.face);const r=takeOff(context(ctx),a);if(r.status==='supported')noteExplicit(ctx.state.face,{...a,variant:NONE});return r;},
  'avatar.parts.remove':(ctx,a)=>removeConcrete(ctx,a),
  'avatar.clear':(ctx,a)=>removeConcrete(ctx,a,true),
  'avatar.observe':ctx=>({status:'supported',data:nativeView(ctx.state)}),
  'avatar.undo':ctx=>undoStep(context(ctx)),
  'avatar.redo':ctx=>redoStep(context(ctx)),
 };
 const handlers=Object.fromEntries(Object.entries(nativeHandlers).map(([operation,handler])=>[operation,(ctx,args,invocation)=>{
  const native=toNativeAvatarState(ctx.state),result=handler({...ctx,state:native},args,invocation);
  if(result?.status==='supported')adoptCanonicalAvatarState(ctx.state,native);
  return result;
 }]));
 const view=carrier=>nativeView(toNativeAvatarState(carrier));
 const spatial=(carrier,records)=>{
  const frame='avatar.face-plane',scope=frame,face=toNativeAvatarState(carrier).face;
  const visible=new Set(records.map(row=>row.id)),slots=catalog.slots.filter(slot=>visible.has(slot.name));
  const scale=face.adj?.face?.s??1, cx=catalog.frame.w/2,cy=catalog.frame.h/2;
  const boxes=[],relations=[],unknown=[];
  for(const slot of slots){
   const b=centre(slot,face),x=cx+(b.x-cx)*scale,y=cy+(b.y-cy)*scale;
   const extent={y,w:b.w*scale,h:b.h*scale},sides=[];
   if(variantFor(catalog,face,slot.name,'left'))sides.push(centeredSpatialBox(slot.name,scope,{...extent,x}));
   if(slot.mirror&&variantFor(catalog,face,slot.name,'right'))sides.push(centeredSpatialBox(slot.name,scope,{...extent,x:catalog.frame.w-x}));
   const box=unionSpatialBoxes(slot.name,scope,sides);
   if(box)boxes.push(box);else unknown.push(slot.name);
   const {inside,riders}=neighbours(catalog,slot);
   for(const part of inside)if(visible.has(part.name))relations.push({subject:part.name,object:slot.name,kind:'member_of',scope});
   for(const part of riders)if(visible.has(part.name))relations.push({subject:part.name,object:slot.name,kind:'anchored_to',scope});
  }
  return {frame,scope,container:'face',boxes,relations,occupants:[],unknown};
 };
 return {...createNativeToolHost({state,instanceId,scope:'avatar.face-and-parts',toolInterface,handlers,view,spatial,...limits}),capabilities:()=>structuredClone(capabilities)};
}
