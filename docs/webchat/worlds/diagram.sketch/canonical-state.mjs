// SPDX-License-Identifier: AGPL-3.0-only
// Current graph and chart data use the authored state schema. Native tools use detached records.
import {toolInstanceStateCodec} from '../tool-instance-state.mjs?v=b467da7d2d';
import {copyHostData} from '../native-tool-host.mjs?v=2bfbd36d18';
import {initialState} from './core.mjs?v=0908b31ffb';
import {initialChartState} from '../data.charts/declared-host.mjs?v=f4bbe7030e';
import {edgeAppearance} from './arrows.mjs?v=e2ec6e110c';
import schema from './state-schema-source.mjs?v=dfe86ffc09';

const codec=toolInstanceStateCodec(schema,'diagram.sketch.state.board');
export const DIAGRAM_STATE_SCHEMA=schema;
const own=(object,key)=>Object.hasOwn(object,key);
const fields=(object,keys)=>Object.fromEntries(keys.filter(key=>own(object,key)).map(key=>[key,object[key]]));
const need=(condition,reason)=>{if(!condition)throw new TypeError('diagram-canonical:'+reason);};
function known(value,keys,reason){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),reason);
}

const nodeFields=['shape','x','y','size','color','outline','label','value','w','h','font','order','fill','layer','quiet','template',
 'startAngle','endAngle','innerRadius','geometry'];
const rootFields=['shapes','edges','groups','rules','frame','frames','chartTools','wholes'];
const runtimeFields=['seq','edgeSeq','ruleSeq','order','last','selected','pending','undo','redo','rev','compositionHistory','compositionFuture',
 'toolStep','wholeSeq','idDisplay','legacyCharts','facts'];
const chartFields=['type','title','placement','proper'];
const chartRuntimeFields=['active','nextId','inputMode','history','future','idPrefix'];
const chartOptions=['stacked','horizontal','showLegend','showValues','sort','palette'];

const sourceRefs=names=>names.map(id=>({id}));
const sourceNames=refs=>refs.map(row=>row.id);
const chartId=(...values)=>JSON.stringify(values);
function nativeIdentity(row,type){
 need(row?.nativeType===type&&typeof row.id==='string'&&row.id.length>0,'native-identity');
 return row.id;
}

function encodeNode(node){
 known(node,['name','id','kind',...nodeFields],'node-fields');
 return {id:node.name,nativeType:'diagram.sketch.node',...(own(node,'id')?{shortId:node.id}:{}),...fields(node,nodeFields)};
}
function decodeNode(row){
 const name=nativeIdentity(row,'diagram.sketch.node');
 return {name,...(own(row,'shortId')?{id:row.shortId,kind:row.shape}:{}),...fields(row,nodeFields)};
}

function encodeEdge(edge){
 known(edge,['id','from','to','style','arrow','label','color','width','properties'],'edge-fields');
 if(own(edge,'properties'))known(edge.properties,['style','arrow','label','color','width'],'edge-style');
 return {id:edge.id,nativeType:'diagram.sketch.link',from:edge.from,to:edge.to,...edgeAppearance(edge)};
}
function decodeEdge(row){
 const id=nativeIdentity(row,'diagram.sketch.link'),appearance=edgeAppearance(row);
 need(['solid','dashed','dotted'].includes(appearance.style)&&['forward','both','none'].includes(appearance.arrow)&&appearance.width>0,'link-style');
 return {id,from:row.from,to:row.to,...appearance};
}

function encodeGroup(group){
 known(group,['name','label','layout','members','links','chartId','layoutOrigin'],'group-fields');
 return {id:group.name,nativeType:'diagram.sketch.group',member:group.members,...fields(group,['label','layout','layoutOrigin']),
  ...(own(group,'links')?{link:group.links}:{}),...(own(group,'chartId')?{chart:group.chartId}:{})};
}
function decodeGroup(row){
 const name=nativeIdentity(row,'diagram.sketch.group');
 return {name,members:row.member,...fields(row,['label','layout','layoutOrigin']),
  ...(own(row,'link')?{links:row.link}:{}),...(own(row,'chart')?{chartId:row.chart}:{})};
}

function encodeProjection(origin){
 known(origin,['contract','status','sourceGroup','members','titleMode','reason'],'chart-projection');
 need(['linked','detached'].includes(origin.status),'chart-projection-status');
 return {...fields(origin,['contract','status','titleMode','reason']),
  ...(origin.status==='linked'?{linkedGroup:origin.sourceGroup,linkedMember:origin.members}:
    {priorGroup:origin.sourceGroup,priorMember:sourceRefs(origin.members)})};
}
function decodeProjection(row){
 need(['linked','detached'].includes(row.status),'chart-projection-status');
 const linked=row.status==='linked';
 need(linked?typeof row.linkedGroup==='string'&&Array.isArray(row.linkedMember)&&!own(row,'priorGroup')&&!own(row,'priorMember'):
  typeof row.priorGroup==='string'&&Array.isArray(row.priorMember)&&!own(row,'linkedGroup')&&!own(row,'linkedMember'),'chart-projection-owner');
 return {...fields(row,['contract','status','titleMode','reason']),
  sourceGroup:linked?row.linkedGroup:row.priorGroup,members:linked?row.linkedMember:sourceNames(row.priorMember)};
}
function encodeChart(chart){
 known(chart,['id','labels','datasets','options','source','spec','group','projection',...chartFields],'chart-fields');
 const category=chart.labels.map((label,index)=>({id:chartId(chart.id,'category',index),label,index}));
 const series=chart.datasets.map((dataset,index)=>{
  known(dataset,['label','color','data'],'chart-series');
  need(dataset.data.length===category.length,'chart-size');
  return {id:chartId(chart.id,'series',index),...(chart.datasets.length>1?{nativeType:'data.charts.series'}:{}),...fields(dataset,['label','color']),
   point:dataset.data.map((value,i)=>({id:index?chartId(chart.id,index,i):chartId(chart.id,i),nativeType:'data.charts.point',category:category[i].id,value}))};
 });
 const row={id:chart.id,nativeType:'data.charts.chart',category,series,...fields(chart,[...chartFields,'group'])};
 if(own(chart,'options')){
  known(chart.options,[...chartOptions,'pointColors'],'chart-options');
  row.options=fields(chart.options,chartOptions);
  if(own(chart.options,'pointColors'))row.options.pointColor=Object.entries(chart.options.pointColors).map(([label,color])=>({label,color}));
 }
 if(own(chart,'source'))row.source=sourceRefs(chart.source);
 if(own(chart,'projection'))row.projection=encodeProjection(chart.projection);
 if(own(chart,'spec')){
  if(chart.spec===null)row.recipe=null;
  else {
   known(chart.spec,['kind','args'],'chart-recipe');
   row.recipe={kind:chart.spec.kind,argument:Object.entries(chart.spec.args).map(([key,value])=>({key,value}))};
  }
 }
 return row;
}
function decodeChart(row){
 const id=nativeIdentity(row,'data.charts.chart');
 const labels=row.category.map((category,index)=>{
  need(category.id===chartId(id,'category',index)&&category.index===index,'category-order');
  return category.label;
 });
 const datasets=row.series.map((series,index)=>{
  need(series.id===chartId(id,'series',index)&&series.nativeType===(row.series.length>1?'data.charts.series':undefined)&&
   series.point.length===labels.length,'series-identity');
  return {...fields(series,['label','color']),data:series.point.map((point,i)=>{
   const identity=nativeIdentity(point,'data.charts.point');
   need(identity===(index?chartId(id,index,i):chartId(id,i))&&point.category===row.category[i].id,'point-identity');
   return point.value;
  })};
 });
 const chart={id,labels,datasets,...fields(row,[...chartFields,'group'])};
 if(own(row,'options')){
  chart.options=fields(row.options,chartOptions);
  if(own(row.options,'pointColor')){
   need(new Set(row.options.pointColor.map(colour=>colour.label)).size===row.options.pointColor.length,'duplicate-point-colour');
   chart.options.pointColors=Object.fromEntries(row.options.pointColor.map(({label,color})=>[label,color]));
  }
 }
 if(own(row,'source'))chart.source=sourceNames(row.source);
 if(own(row,'projection'))chart.projection=decodeProjection(row.projection);
 if(own(row,'recipe')){
  if(row.recipe===null)chart.spec=null;
  else{
   need(new Set(row.recipe.argument.map(arg=>arg.key)).size===row.recipe.argument.length,'duplicate-recipe-argument');
   chart.spec={kind:row.recipe.kind,args:Object.fromEntries(row.recipe.argument.map(({key,value})=>[key,value]))};
  }
 }
 return chart;
}

function encodeBoard(state){
 const result={node:state.shapes.map(encodeNode),link:state.edges.map(encodeEdge),group:state.groups.map(encodeGroup),rule:state.rules,
  frame:state.frame,frames:state.frames,chart:state.chartTools.charts.map(encodeChart)};
 if(own(state,'wholes'))result.whole=state.wholes.map(whole=>{
  known(whole,['id','kind','layout','links','members'],'whole-fields');
  return {...fields(whole,['id','kind','layout','links']),member:whole.members};
 });
 return result;
}
function decodeBoard(row){
 const state={shapes:row.node.map(decodeNode),edges:row.link.map(decodeEdge),groups:row.group.map(decodeGroup),
  rules:row.rule,frame:row.frame,frames:row.frames,chartTools:{charts:row.chart.map(decodeChart)}};
 if(own(row,'whole'))state.wholes=row.whole.map(whole=>({...fields(whole,['id','kind','layout','links']),members:whole.member}));
 for(const chart of state.chartTools.charts){
  if(chart.projection?.status==='linked'){
   const group=state.groups.find(group=>group.name===chart.group);
   need(group&&chart.group===chart.projection.sourceGroup&&group.members.length===chart.projection.members.length&&
    group.members.every((member,index)=>member===chart.projection.members[index]),'chart-linked-group');
  }
 }
 return state;
}
function readRuntime(state,provided){
 const defaults=initialState(),chartDefaults=initialChartState();
 const runtime=provided===undefined?{}:copyHostData(provided);
 known(runtime,[...runtimeFields,'chart'],'runtime-fields');
 const chartRuntime=runtime.chart??{};
 known(chartRuntime,chartRuntimeFields,'chart-runtime-fields');
 const set={...fields(defaults,runtimeFields),...fields(runtime,runtimeFields)};
 const chart={...fields(chartDefaults,chartRuntimeFields),idPrefix:'chart:',...chartRuntime};
 need([set.undo,set.redo,set.compositionHistory,set.compositionFuture,chart.history,chart.future].every(Array.isArray),'runtime-history');
 if(provided===undefined){
  set.order=state.shapes.reduce((highest,node)=>Math.max(highest,node.order??0),0);
  const sequenceFor=(ids,prefix)=>ids.reduce((highest,id)=>Math.max(highest,Number(id.startsWith(prefix)?id.slice(prefix.length):0)||0),0);
  set.edgeSeq=sequenceFor(state.edges.map(row=>row.id),'a');
  set.ruleSeq=sequenceFor(state.rules.map(row=>row.id),'r');
  chart.nextId=1+sequenceFor(state.chartTools.charts.map(row=>row.id),chart.idPrefix);
 }
 return {...set,chart};
}
export function toNativeDiagramState(input){
 if(!own(input,'sop'))return copyHostData(input);
 known(input,['sop','runtime'],'carrier-fields');
 const state=decodeBoard(codec.decode(input.sop).data),{chart,...runtime}=readRuntime(state,input.runtime);
 return {...state,...runtime,chartTools:{...state.chartTools,...chart}};
}
export function canonicalDiagramState(input){
 if(own(input,'sop')){
  toNativeDiagramState(input);
  if(!own(input,'runtime'))return {sop:input.sop,runtime:readRuntime(decodeBoard(codec.decode(input.sop).data))};
  return {sop:input.sop,runtime:copyHostData(input.runtime)};
 }
 const state=copyHostData(input);
 known(state,[...rootFields,...runtimeFields],'board-fields');
 state.chartTools??={...initialChartState(),idPrefix:'chart:'};
 known(state.chartTools,['charts',...chartRuntimeFields],'chart-state');
 const board=encodeBoard(state);
 const shaped=decodeBoard(board);
 const runtime=readRuntime(shaped,{...fields(state,runtimeFields),chart:fields(state.chartTools,chartRuntimeFields)});
 return {sop:codec.encode(board),runtime};
}
export function diagramStateWorld(input){
 const carrier=own(input,'sop')?input:canonicalDiagramState(input);
 const decoded=codec.decode(carrier.sop);
 decodeBoard(decoded.data);
 return decoded.world;
}
