// SPDX-License-Identifier: AGPL-3.0-only
import { diagramToolInterface, DIAGRAM_COMPONENTS } from './tool-interface.mjs';
export { DIAGRAM_TOOL_BINDINGS, DIAGRAM_COMPONENTS } from './tool-interface.mjs';
import{projectNumericGroups}from'./chart-layout.mjs';
import {centeredSpatialBox,spatialBox,unionSpatialBoxes} from '../native-spatial-observation.mjs';
import {routeEdges,edgeAppearance} from './arrows.mjs';
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {canonicalDiagramState,toNativeDiagramState,diagramStateWorld,DIAGRAM_STATE_SCHEMA} from './canonical-state.mjs';
import {initialState,loadEngine,systemFor,writeBack,PREFIX,K} from './core.mjs';
import * as tool from './tool.mjs';
import{groupNativeObjects,groupNativeHandlers,projectGroupCharts}from'./group-tools.mjs';
import {initialChartState,chartNativeObjects,chartNativeHandlers} from '../data.charts/declared-host.mjs';
export const initialDiagramState=initialState;
export const initialCanonicalDiagramState=()=>canonicalDiagramState(initialState());
export const DIAGRAM_STATE_INTERFACE=Object.freeze({canonicalizeState:canonicalDiagramState,projectState:toNativeDiagramState,
 stateWorld:diagramStateWorld,stateSchema:DIAGRAM_STATE_SCHEMA,stateInterfaceTypeKey:'nativeType',separateRuntime:true,
 observationOnlyTypes:['diagram.sketch.page'],legacyHost:createDiagramHost});
const fail=code=>({status:'missing',code});
const ids=(s,list,kind='shapes')=>Array.isArray(list)&&list.length>0&&new Set(list).size===list.length&&list.every(id=>typeof id==='string'&&s[kind].some(item=>(kind==='shapes'?item.name:item.id)===id));
const edgeInputs=(edge,canonical)=>{
 const appearance=canonical?edgeAppearance(edge):edge.properties??{};
 return Object.entries({from:edge.from,to:edge.to,...appearance}).map(([field,value])=>{
  const key=field==='color'?'colour':field;
  return {binding:'diagram.link.'+key,key,values:canonical&&value==null?[]:[nativeToken(value)]};
 });
};
const view=(s,canonical)=>[
 ...(Object.hasOwn(s,'idDisplay')?[{id:'diagram.page',kind:'page',sourceType:'diagram.sketch.page',inputs:Object.entries(s.idDisplay).map(([key,value])=>({binding:'diagram.ids.'+key,key,values:[nativeToken(value)]}))}]:[]),
 ...s.shapes.map(n=>({id:n.name,kind:n.shape,sourceType:'diagram.sketch.node',inputs:Object.entries({colour:n.color,size:K.sizeName(n.size),sizePixels:n.size,label:n.label,value:n.value,x:n.x,y:n.y,...Object.fromEntries(['width','height','startAngle','endAngle','innerRadius'].filter(key=>Object.hasOwn(n.geometry??{},key)).map(key=>[key,key==='width'?K.dims(n).w:key==='height'?K.dims(n).h:n[key]]))}).map(([key,value])=>({binding:`diagram.node.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)],...(['x','y','sizePixels','width','height'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}:{})}))})),
 ...groupNativeObjects(s),
 ...chartNativeObjects(s.chartTools??initialChartState()).map(row=>{const chart=s.chartTools.charts.find(c=>c.id===row.id);return chart?.projection?{...row,inputs:[...row.inputs,{binding:'chart.projection.status',key:'projectionStatus',values:[nativeToken(chart.projection.status)]},{binding:'chart.projection.sourceGroup',key:'sourceGroup',values:[nativeToken(chart.projection.sourceGroup)]},...(chart.projection.reason?[{binding:'chart.projection.reason',key:'projectionReason',values:[nativeToken(chart.projection.reason)]}]:[])]}:row;}),
 ...s.edges.map(e=>({id:e.id,kind:'link',sourceType:'diagram.sketch.link',from:e.from,to:e.to,relations:{from:[e.from],to:[e.to]},predicate:'connected',inputs:edgeInputs(e,canonical)})),
];
const nodeExtents=new Map();
const spatial = state => {
 const frame = 'diagram.canvas', scope = frame;
 const {x,y} = state.frame ?? {x:0,y:0};
 const page = spatialBox(frame,scope,[x,y,x+K.CANVAS.W,y+K.CANVAS.H]);
 const boxes = page ? [page] : [], points = [], relations = [], occupants = [], unknown = [];
 const nodes = new Map(state.shapes.map(node => [node.name,centeredSpatialBox(node.name,scope,{...node,...K.dims(node)})]));
 const memberIds = new Set(state.groups.flatMap(group => group.members));
 const add = (id, box, occupant) => {
  if (box) boxes.push(box); else unknown.push(id);
  if (occupant) occupants.push(id);
 };
 for (const [id,box] of nodes) add(id,box,!memberIds.has(id));
 for (const group of state.groups) {
  add(group.name,unionSpatialBoxes(group.name,scope,group.members.map(id=>nodes.get(id))),true);
  for (const member of group.members) relations.push({subject:member,object:group.name,kind:'member_of',scope});
 }
 for (const chart of state.chartTools?.charts??[]) {
  const p = chart.placement;
  add(chart.id,p&&spatialBox(chart.id,scope,[p.x,p.y,p.x+p.width,p.y+p.height]),true);
 }
 // Use the same border intersections the diagram renders. Hidden routes retain
 // their logical endpoint ownership without an invented point.
 const routes = state.shapes.length+state.edges.length<=512?routeEdges(state.shapes,state.edges,K.dims):null;
 for (const edge of state.edges) for (const [role,index] of [['from',0],['to',-1]]) {
  const rendered = routes?.get(edge.id)?.pts.at(index);
  const endpoint = JSON.stringify([edge.id,role]), border = JSON.stringify([edge[role],edge.id,role]);
  relations.push({subject:edge.id,object:edge[role],kind:'endpoint_of',scope});
  if (!rendered?.every(Number.isFinite)) { unknown.push(endpoint); continue; }
  const [x,y] = rendered;
  points.push({entity:endpoint,scope,x,y},{entity:border,scope,x,y});
  relations.push({subject:endpoint,object:border,kind:'endpoint_of',scope,evidence:'coincident'});
 }
 return {frame,scope,container:frame,viewport:frame,boxes,points,relations,occupants,unknown};
};

/** One-time migration of chart data into the diagram instance; legacy ids are namespaced. */
export function migrateChartTools(state,legacy=null){
 if(!state.chartTools)state.chartTools={...initialChartState(),idPrefix:'chart:'};
 if(legacy?.charts?.length&&!state.chartTools.charts.length){
  state.chartTools=structuredClone(legacy);const names=new Map(state.chartTools.charts.map(c=>[c.id,'chart:'+c.id]));
  for(const [i,c]of state.chartTools.charts.entries()){c.id=names.get(c.id);c.placement??={x:60+(i%2)*460,y:60+Math.floor(i/2)*350,width:420,height:300};}
  state.chartTools.active=names.get(state.chartTools.active)??state.chartTools.charts[0].id;
  state.chartTools.history=[];state.chartTools.future=[];
 }
 state.chartTools.idPrefix='chart:';return state;
}
const compositionSnapshot=state=>{
 const copy=structuredClone(state);delete copy.compositionHistory;delete copy.compositionFuture;delete copy.idDisplay;
 copy.undo=[];copy.redo=[];
 if(copy.chartTools){copy.chartTools.history=[];copy.chartTools.future=[];}
 return copy;
};
const restoreComposition=(state,snapshot)=>{const copy=structuredClone(snapshot);delete copy.idDisplay;for(const key of Object.keys(state))if(!['compositionHistory','compositionFuture','idDisplay'].includes(key))delete state[key];Object.assign(state,copy);};
export async function createDiagramHost({state=initialState(),instanceId,...limits}={}){
 await loadEngine();
 const canonical=Object.hasOwn(state,'sop');
 const projected=canonical?toNativeDiagramState(state):state;
 migrateChartTools(projected);
 const colours=Object.keys(systemFor(projected).engine.plugin('shapes').legend.color.values);
 const toolInterface = diagramToolInterface.realize({ 'diagram.colours': colours });
 const run=(ctx,args)=>{try{const r=systemFor(ctx.state).engine.run([{id:'native',type:'command',args}]);writeBack(ctx.state);return r.ok?{status:'supported',changed:args.target||[]}:fail('native-refusal');}catch{return fail('native-refusal');}};
 const handlers={
  'diagram.node.make':(ctx,a,step)=>{const result=tool.addShapes(ctx,{...a,step});if(result.status==='supported'){const made=ctx.state.shapes.filter(n=>result.changed.includes(n.name));if(a.label!==undefined||a.kind==='text')for(const node of made)node.label=a.label??'Text';if(a.x!==undefined||a.y!==undefined){const cx=made.reduce((v,n)=>v+n.x,0)/made.length,cy=made.reduce((v,n)=>v+n.y,0)/made.length;for(const n of made){n.x+=(a.x??cx)-cx;n.y+=(a.y??cy)-cy;}}ctx.state.rev++;ctx.state.selected={shapes:result.changed,edges:[]};ctx.state.chartTools.active=null;}return result;},
  'diagram.node.change':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');if(!['colour','size','label','value'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');if(Object.hasOwn(a,'size'))for(const node of ctx.state.shapes.filter(node=>a.ids.includes(node.name))){delete node.w;delete node.h;if(node.geometry){delete node.geometry.width;delete node.geometry.height;}}const r=['colour','size','label'].some(k=>Object.hasOwn(a,k))?run(ctx,{action:'set',target:a.ids,...(Object.hasOwn(a,'colour')?{color:a.colour}:{}),...(Object.hasOwn(a,'size')?{size:a.size}:{}),...(Object.hasOwn(a,'label')?{label:a.label}:{})}):{status:'supported',changed:a.ids};if(r.status==='supported'&&Object.hasOwn(a,'value')){for(const n of ctx.state.shapes.filter(n=>a.ids.includes(n.name)))n.value=a.value;ctx.state.rev++;}return r;},
  'diagram.node.select':(ctx,a)=>{if(a.ids.length&&!ids(ctx.state,a.ids)||a.edges?.length&&!ids(ctx.state,a.edges,'edges'))return fail('missing-target');ctx.state.selected={shapes:[...a.ids],edges:[...(a.edges??[])]};ctx.state.chartTools.active=null;return {status:'supported',changed:a.ids};},
  'diagram.node.remove':(ctx,a,step)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');const result=tool.removeShapes(ctx,{...a,step});if(result.status==='supported')ctx.state.selected={shapes:(ctx.state.selected?.shapes??[]).filter(id=>ctx.state.shapes.some(n=>n.name===id)),edges:(ctx.state.selected?.edges??[]).filter(id=>ctx.state.edges.some(e=>e.id===id))};return result;},
  'diagram.node.place':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');const nodes=ctx.state.shapes.filter(node=>a.ids.includes(node.name)),cx=nodes.reduce((sum,node)=>sum+node.x/nodes.length,0),cy=nodes.reduce((sum,node)=>sum+node.y/nodes.length,0);for(const node of nodes){node.x+=a.x-cx;node.y+=a.y-cy;}ctx.state.rev++;ctx.state.selected={shapes:[...a.ids],edges:[]};ctx.state.chartTools.active=null;return {status:'supported',changed:a.ids};},
  'diagram.node.resize':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');const nodes=ctx.state.shapes.filter(node=>a.ids.includes(node.name));if(nodes.some(node=>['circle','square','sector'].includes(node.shape))&&a.width!==a.height)return fail('uniform-size-required');for(const node of nodes){node.w=a.width;node.h=a.height;node.geometry={...(node.geometry??{}),width:a.width,height:a.height};}ctx.state.rev++;return {status:'supported',changed:a.ids};},
  'diagram.node.layout':(ctx,a,step)=>ids(ctx.state,a.ids)?tool.arrangeShapes(ctx,{...a,step}):fail('missing-target'),
  'diagram.link.make':(ctx,a,step)=>{if(!ids(ctx.state,[a.from,a.to]))return fail('missing-endpoint');const prior=new Set(ctx.state.edges.map(edge=>edge.id)),result=tool.linkShapes(ctx,{a:a.from,b:a.to,step});if(result.status==='supported'){const made=ctx.state.edges.filter(edge=>!prior.has(edge.id)).map(edge=>edge.id);ctx.state.selected={shapes:[],edges:made};ctx.state.chartTools.active=null;result.changed=made;}return result;},
  'diagram.link.select':(ctx,a)=>{if(a.ids.length&&!ids(ctx.state,a.ids,'edges')||a.nodes?.length&&!ids(ctx.state,a.nodes))return fail('missing-target');ctx.state.selected={shapes:[...(a.nodes??[])],edges:[...a.ids]};ctx.state.chartTools.active=null;return {status:'supported',changed:a.ids};},
  'diagram.link.change':(ctx,a)=>{if(!ids(ctx.state,a.ids,'edges'))return fail('missing-target');if(a.from!==undefined&&!ids(ctx.state,[a.from])||a.to!==undefined&&!ids(ctx.state,[a.to]))return fail('missing-endpoint');const keys=['from','to','label','colour','style','arrow','width'].filter(key=>Object.hasOwn(a,key));if(!keys.length)return fail('missing-property');for(const edge of ctx.state.edges.filter(edge=>a.ids.includes(edge.id))){edge.properties??={};for(const key of keys){if(key==='from'||key==='to')edge[key]=a[key];else edge.properties[key==='colour'?'color':key]=a[key];}}ctx.state.rev++;return {status:'supported',changed:a.ids};},
  'diagram.link.remove':(ctx,a,step)=>ids(ctx.state,a.ids,'edges')?tool.removeLinks(ctx,{...a,step}):fail('missing-target'),
  'diagram.selection.remove':(ctx,a,step)=>{if(a.nodes.length&&!ids(ctx.state,a.nodes)||a.links.length&&!ids(ctx.state,a.links,'edges'))return fail('missing-target');const changed=[...a.nodes,...a.links];if(a.nodes.length){const result=tool.removeShapes(ctx,{ids:a.nodes,step});if(result.status!=='supported')return result;}const remaining=a.links.filter(id=>ctx.state.edges.some(edge=>edge.id===id));if(remaining.length){const result=tool.removeLinks(ctx,{ids:remaining,step});if(result.status!=='supported')return result;}ctx.state.selected={shapes:[],edges:[]};return {status:'supported',changed};},
  'diagram.page.clear':ctx=>{const s=ctx.state,empty=initialState(),changed=[...s.shapes.map(n=>n.name),...s.edges.map(e=>e.id),...s.groups.map(g=>g.name),...s.chartTools.charts.map(c=>c.id)];for(const key of Object.keys(s))if(!['compositionHistory','compositionFuture','idDisplay'].includes(key))delete s[key];delete empty.compositionHistory;delete empty.compositionFuture;Object.assign(s,empty);return {status:'supported',changed};},
  'diagram.ids.show':(ctx,a)=>{const next={mode:a.mode,...(a.mode==='temporary'?{expiresAt:Date.now()+a.duration}:{})};if(JSON.stringify(ctx.state.idDisplay)===JSON.stringify(next))return {status:'supported',changed:[]};ctx.state.idDisplay=next;return {status:'supported',changed:['diagram.page']};},
  'diagram.observe':ctx=>({status:'supported',data:view(ctx.state,canonical)}),
  'diagram.undo':tool.undoStep,'diagram.redo':tool.redoStep,
 };
 Object.assign(handlers,groupNativeHandlers({run}));
 const chartHandlers=chartNativeHandlers();
 for(const operation of DIAGRAM_COMPONENTS.flatMap(component=>component.operations))handlers[operation.id]=(ctx,args,step)=>{const result=chartHandlers[operation.id]({...ctx,state:ctx.state.chartTools},args,step);if(result?.status==='supported'&&['chart.select','chart.make','chart.place'].includes(operation.id))ctx.state.selected={shapes:[],edges:[]};return result;};
 handlers['diagram.undo']=ctx=>{const s=ctx.state;if(!s.compositionHistory?.length)return fail('nothing-to-undo');s.compositionFuture??=[];s.compositionFuture.push(compositionSnapshot(s));restoreComposition(s,s.compositionHistory.pop());return {status:'supported',changed:[]};};
 handlers['diagram.redo']=ctx=>{const s=ctx.state;if(!s.compositionFuture?.length)return fail('nothing-to-redo');s.compositionHistory??=[];s.compositionHistory.push(compositionSnapshot(s));restoreComposition(s,s.compositionFuture.pop());return {status:'supported',changed:[]};};
 for(const operation of toolInterface.bindings){if(['ask','undo','redo','pick'].includes(operation.act))continue;const handler=handlers[operation.id];handlers[operation.id]=(ctx,args,step)=>{const before=compositionSnapshot(ctx.state),result=handler(ctx,args,step);if(result?.status==='supported'){const derived=[...projectGroupCharts(ctx.state,{operation:operation.id,args}),...projectNumericGroups(ctx.state,{operation:operation.id,args})];if(derived.length)result.changed=[...new Set([...(result.changed??[]),...derived])];}if(result?.status==='supported'&&JSON.stringify(before)!==JSON.stringify(compositionSnapshot(ctx.state))){ctx.state.compositionHistory??=[];ctx.state.compositionHistory.push(before);if(ctx.state.compositionHistory.length>30)ctx.state.compositionHistory.shift();ctx.state.compositionFuture=[];}return result;};}
 const effectiveHandlers=canonical?Object.fromEntries(Object.entries(handlers).map(([id,handler])=>[id,(ctx,args,invocation)=>{
  const native=toNativeDiagramState(ctx.state),result=handler({...ctx,state:native},args,invocation);
  if(result?.status==='supported')Object.assign(ctx.state,canonicalDiagramState(native));
  return result;
 }])):handlers;
 function measure(operation,args){
  if(operation!=='diagram.node.make'||!Object.hasOwn(PREFIX,args.kind))return null;
  const native=canonical?toNativeDiagramState(state):state;
  const single=(args.n??1)===1;
  const key=single?JSON.stringify([native.rules,args]):null;
  if(key&&nodeExtents.has(key))return {...nodeExtents.get(key)};
  const {compositionHistory,compositionFuture,undo,redo,...live}=native;
  const scratch=single?initialState():structuredClone(live);
  if(single)scratch.rules=structuredClone(native.rules);
  const applied=tool.addShapes({state:scratch},{...args,step:'measure'});
  if(applied?.status!=='supported')return null;
  const ids=new Set(applied.changed),made=scratch.shapes.filter(node=>ids.has(node.name));
  if(made.length!==(args.n??1))return null;
  const cx=made.reduce((sum,node)=>sum+node.x,0)/made.length,cy=made.reduce((sum,node)=>sum+node.y,0)/made.length;
  const footprint=unionSpatialBoxes('measured','diagram.canvas',made.map(node=>centeredSpatialBox(node.name,'diagram.canvas',{...node,...K.dims(node)})));
  if(!footprint)return null;
  const {min_x,min_y,max_x,max_y}=footprint;
  const measurement={width:max_x-min_x,height:max_y-min_y,minX:min_x-cx,minY:min_y-cy,maxX:max_x-cx,maxY:max_y-cy};
  if(key){if(nodeExtents.size>=128)nodeExtents.clear();nodeExtents.set(key,measurement);}
  return {...measurement};
 }
 return createNativeToolHost({state,instanceId,scope:'diagram.nodes-links-and-charts',toolInterface,handlers:effectiveHandlers,
  view:carrier=>view(canonical?toNativeDiagramState(carrier):carrier,canonical),
  spatial:canonical?carrier=>spatial(toNativeDiagramState(carrier)):spatial,measure,...limits});
}

export async function createCanonicalDiagramHost({state=initialCanonicalDiagramState(),...options}={}){
 if(!Object.hasOwn(state,'sop')){
  const draft=structuredClone(state);
  migrateChartTools(draft);
  const carrier=canonicalDiagramState(draft);
  for(const key of Object.keys(state))delete state[key];
  Object.assign(state,carrier);
 }
 return createDiagramHost({state,...options});
}
