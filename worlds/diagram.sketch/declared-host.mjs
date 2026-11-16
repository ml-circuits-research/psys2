// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {initialState,loadEngine,systemFor,writeBack,PREFIX} from './core.mjs';
import * as tool from './tool.mjs';
const array={type:'array',required:true},id={type:'string',required:true};
export const DIAGRAM_TOOL_BINDINGS=[
 {id:'diagram.node.make',act:'make',on:'diagram.sketch.node',params:{kind:{type:'string',required:true,enum:Object.keys(PREFIX).filter(k=>k!=='text')},n:{type:'integer',default:1,min:1,max:12},colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']},layout:{type:'string',enum:['tree','grid','row','column','circle','radial','layers']}}},
 {id:'diagram.node.change',act:'change',on:'diagram.sketch.node',params:{ids:array,colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']},label:{type:'string'}}},
 {id:'diagram.node.remove',act:'remove',on:'diagram.sketch.node',params:{ids:array}},
 {id:'diagram.node.place',act:'place',on:'diagram.sketch.node',params:{ids:array,x:{type:'number',required:true},y:{type:'number',required:true}},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}},
 {id:'diagram.node.layout',act:'change',on:'diagram.sketch.node',params:{ids:array,layout:{type:'string',required:true,enum:['tree','grid','row','column','circle','radial','layers']}}},
 {id:'diagram.link.make',act:'make',on:'diagram.sketch.link',params:{from:id,to:id}},
 {id:'diagram.link.remove',act:'remove',on:'diagram.sketch.link',params:{ids:array}},
 {id:'diagram.observe',act:'ask',on:'diagram.sketch',params:{}},
 {id:'diagram.undo',act:'undo',on:'diagram.sketch',params:{}},
 {id:'diagram.redo',act:'redo',on:'diagram.sketch',params:{}},
];
export const initialDiagramState=initialState;
const fail=code=>({status:'missing',code});
const ids=(s,list,kind='shapes')=>Array.isArray(list)&&list.length>0&&new Set(list).size===list.length&&list.every(id=>typeof id==='string'&&s[kind].some(item=>(kind==='shapes'?item.name:item.id)===id));
const view=s=>[
 ...s.shapes.map(n=>({id:n.name,kind:n.shape,sourceType:'diagram.sketch.node',inputs:Object.entries({colour:n.color,size:n.size,label:n.label,x:n.x,y:n.y}).map(([key,value])=>({binding:`diagram.node.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)],...(['x','y','size'].includes(key)?{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}:{})}))})),
 ...s.edges.map(e=>({id:e.id,kind:'link',sourceType:'diagram.sketch.link',from:e.from,to:e.to,predicate:'connected',inputs:['from','to'].map(key=>({binding:`diagram.link.${key}`,key,values:[nativeToken(e[key])]}))})),
];
export async function createDiagramHost({state=initialState(),instanceId,...limits}={}){
 await loadEngine();
 const colours=Object.keys(systemFor(state).engine.plugin('shapes').legend.color.values);
 const operations=DIAGRAM_TOOL_BINDINGS.map(op=>({...op,params:Object.fromEntries(Object.entries(op.params).map(([key,value])=>[key,key==='colour'?{...value,enum:colours}:value]))}));
 const run=(ctx,args)=>{try{const r=systemFor(ctx.state).engine.run([{id:'native',type:'command',args}]);writeBack(ctx.state);return r.ok?{status:'supported',changed:args.target||[]}:fail('native-refusal');}catch{return fail('native-refusal');}};
 const handlers={
  'diagram.node.make':(ctx,a,step)=>tool.addShapes(ctx,{...a,step}),
  'diagram.node.change':(ctx,a)=>{if(!ids(ctx.state,a.ids))return fail('missing-target');if(!['colour','size','label'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');return run(ctx,{action:'set',target:a.ids,...(Object.hasOwn(a,'colour')?{color:a.colour}:{}),...(Object.hasOwn(a,'size')?{size:a.size}:{}),...(Object.hasOwn(a,'label')?{label:a.label}:{})});},
  'diagram.node.remove':(ctx,a,step)=>ids(ctx.state,a.ids)?tool.removeShapes(ctx,{...a,step}):fail('missing-target'),
  'diagram.node.place':(ctx,a)=>ids(ctx.state,a.ids)?run(ctx,{action:'move',target:a.ids,at:[a.x,a.y]}):fail('missing-target'),
  'diagram.node.layout':(ctx,a,step)=>ids(ctx.state,a.ids)?tool.arrangeShapes(ctx,{...a,step}):fail('missing-target'),
  'diagram.link.make':(ctx,a,step)=>ids(ctx.state,[a.from,a.to])?tool.linkShapes(ctx,{a:a.from,b:a.to,step}):fail('missing-endpoint'),
  'diagram.link.remove':(ctx,a,step)=>ids(ctx.state,a.ids,'edges')?tool.removeLinks(ctx,{...a,step}):fail('missing-target'),
  'diagram.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'diagram.undo':tool.undoStep,'diagram.redo':tool.redoStep,
 };
 return createNativeToolHost({state,instanceId,scope:'diagram.nodes-and-links',operations,handlers,view,...limits});
}
