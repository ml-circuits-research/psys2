// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=463e762442';
import {initialState,loadEngine,systemFor,writeBack,PREFIX} from './core.mjs?v=143c9a7464';
import * as tool from './tool.mjs?v=110e7f7a00';
import {CHART_TOOL_BINDINGS,initialChartState,chartNativeObjects,chartNativeHandlers} from '../data.charts/declared-host.mjs?v=f9e3064f7b';
export const DIAGRAM_COMPONENTS=[{world:'data.charts',stateKey:'chartTools',operations:CHART_TOOL_BINDINGS.filter(op=>!['chart.undo','chart.redo'].includes(op.id))}];
const array={type:'array',required:true},id={type:'string',required:true};
export const DIAGRAM_TOOL_BINDINGS=[
 {id:'diagram.node.make',act:'make',on:'diagram.sketch.node',params:{kind:{type:'string',required:true,enum:Object.keys(PREFIX).filter(k=>k!=='text')},n:{type:'integer',default:1,min:1,max:12},colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']},layout:{type:'string',enum:['tree','grid','row','column','circle','radial','layers']}}},
 {id:'diagram.node.change',act:'change',on:'diagram.sketch.node',params:{ids:array,colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']},label:{type:'string'}}},
 {id:'diagram.node.select',act:'pick',on:'diagram.sketch.node',params:{ids:array}},
 {id:'diagram.node.remove',act:'remove',on:'diagram.sketch.node',params:{ids:array}},
 {id:'diagram.node.place',act:'place',on:'diagram.sketch.node',params:{ids:array,x:{type:'number',required:true},y:{type:'number',required:true}},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}},
 {id:'diagram.node.layout',act:'change',on:'diagram.sketch.node',params:{ids:array,layout:{type:'string',required:true,enum:['tree','grid','row','column','circle','radial','layers']}}},
 {id:'diagram.link.make',act:'make',on:'diagram.sketch.link',params:{from:id,to:id}},
 {id:'diagram.link.remove',act:'remove',on:'diagram.sketch.link',params:{ids:array}},
 {id:'diagram.observe',act:'ask',on:'diagram.sketch',params:{}},
 {id:'diagram.undo',act:'undo',on:'diagram.sketch',params:{}},
 {id:'diagram.redo',act:'redo',on:'diagram.sketch',params:{}},
 ...DIAGRAM_COMPONENTS.flatMap(component=>component.operations),
];
export const initialDiagramState=initialState;
const fail=code=>({status:'missing',code});
const ids=(s,list,kind='shapes')=>Array.isArray(list)&&list.length>0&&new Set(list).size===list.length&&list.every(id=>typeof id==='string'&&s[kind].some(item=>(kind==='shapes'?item.name:item.id)===id));
const view=s=>[
 ...s.shapes.map(n=>({id:n.name,kind:n.shape,sourceType:'diagram.sketch.node',inputs:Object.entries({colour:n.color,size:n.size,label:n.label,x:n.x,y:n.y}).map(([key,value])=>({binding:`diagram.node.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)],...(['x','y','size'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}:{})}))})),
 ...chartNativeObjects(s.chartTools??initialChartState()),
 ...s.edges.map(e=>({id:e.id,kind:'link',sourceType:'diagram.sketch.link',from:e.from,to:e.to,predicate:'connected',inputs:['from','to'].map(key=>({binding:`diagram.link.${key}`,key,values:[nativeToken(e[key])]}))})),
];
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
 const copy=structuredClone(state);delete copy.compositionHistory;delete copy.compositionFuture;
 copy.undo=[];copy.redo=[];
 if(copy.chartTools){copy.chartTools.history=[];copy.chartTools.future=[];}
 return copy;
};
const restoreComposition=(state,snapshot)=>{for(const key of Object.keys(state))if(!['compositionHistory','compositionFuture'].includes(key))delete state[key];Object.assign(state,structuredClone(snapshot));};
export async function createDiagramHost({state=initialState(),instanceId,...limits}={}){
 await loadEngine();migrateChartTools(state);
 const colours=Object.keys(systemFor(state).engine.plugin('shapes').legend.color.values);
 const operations=DIAGRAM_TOOL_BINDINGS.map(op=>({...op,params:Object.fromEntries(Object.entries(op.params).map(([key,value])=>[key,op.id.startsWith('diagram.')&&key==='colour'?{...value,enum:colours}:value]))}));
 const run=(ctx,args)=>{try{const r=systemFor(ctx.state).engine.run([{id:'native',type:'command',args}]);writeBack(ctx.state);return r.ok?{status:'supported',changed:args.target||[]}:fail('native-refusal');}catch{return fail('native-refusal');}};
 const handlers={
  'diagram.node.make':(ctx,a,step)=>tool.addShapes(ctx,{...a,step}),
  'diagram.node.change':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');if(!['colour','size','label'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');return run(ctx,{action:'set',target:a.ids,...(Object.hasOwn(a,'colour')?{color:a.colour}:{}),...(Object.hasOwn(a,'size')?{size:a.size}:{}),...(Object.hasOwn(a,'label')?{label:a.label}:{})});},
  'diagram.node.select':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');ctx.state.selected={shapes:a.ids,edges:[]};ctx.state.chartTools.active=null;return {status:'supported',changed:a.ids};},
  'diagram.node.remove':(ctx,a,step)=>ids(ctx.state,a.ids)?tool.removeShapes(ctx,{...a,step}):fail('missing-target'),
  'diagram.node.place':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');const result=run(ctx,{action:'move',target:a.ids,at:[a.x,a.y]});if(result.status==='supported'){ctx.state.selected={shapes:a.ids,edges:[]};ctx.state.chartTools.active=null;}return result;},
  'diagram.node.layout':(ctx,a,step)=>ids(ctx.state,a.ids)?tool.arrangeShapes(ctx,{...a,step}):fail('missing-target'),
  'diagram.link.make':(ctx,a,step)=>ids(ctx.state,[a.from,a.to])?tool.linkShapes(ctx,{a:a.from,b:a.to,step}):fail('missing-endpoint'),
  'diagram.link.remove':(ctx,a,step)=>ids(ctx.state,a.ids,'edges')?tool.removeLinks(ctx,{...a,step}):fail('missing-target'),
  'diagram.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'diagram.undo':tool.undoStep,'diagram.redo':tool.redoStep,
 };
 const chartHandlers=chartNativeHandlers();
 for(const operation of CHART_TOOL_BINDINGS.filter(op=>!['chart.undo','chart.redo'].includes(op.id)))handlers[operation.id]=(ctx,args,step)=>{const result=chartHandlers[operation.id]({...ctx,state:ctx.state.chartTools},args,step);if(result?.status==='supported'&&['chart.select','chart.make','chart.place'].includes(operation.id))ctx.state.selected={shapes:[],edges:[]};return result;};
 handlers['diagram.undo']=ctx=>{const s=ctx.state;if(!s.compositionHistory?.length)return fail('nothing-to-undo');s.compositionFuture??=[];s.compositionFuture.push(compositionSnapshot(s));restoreComposition(s,s.compositionHistory.pop());return {status:'supported',changed:[]};};
 handlers['diagram.redo']=ctx=>{const s=ctx.state;if(!s.compositionFuture?.length)return fail('nothing-to-redo');s.compositionHistory??=[];s.compositionHistory.push(compositionSnapshot(s));restoreComposition(s,s.compositionFuture.pop());return {status:'supported',changed:[]};};
 for(const operation of operations){if(['ask','undo','redo','pick'].includes(operation.act))continue;const handler=handlers[operation.id];handlers[operation.id]=(ctx,args,step)=>{const before=compositionSnapshot(ctx.state),result=handler(ctx,args,step);if(result?.status==='supported'&&JSON.stringify(before)!==JSON.stringify(compositionSnapshot(ctx.state))){ctx.state.compositionHistory??=[];ctx.state.compositionHistory.push(before);if(ctx.state.compositionHistory.length>30)ctx.state.compositionHistory.shift();ctx.state.compositionFuture=[];}return result;};}
 return createNativeToolHost({state,instanceId,scope:'diagram.nodes-links-and-charts',operations,handlers,view,...limits});
}
