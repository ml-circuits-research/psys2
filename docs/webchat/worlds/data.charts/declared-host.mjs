// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=2164423411';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=6c0dc1d746';
// Explicit numeric data only: no text parser, inferred values, or legacy dispatch.
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=cfffe619de';
export const CHART_KIND_PARAMETERS={
 'w.chart.chart':{type:'bar'},'k.charts.kind.bar_chart':{type:'bar'},'k.charts.kind.line_chart':{type:'line'},
 'k.charts.kind.pie_chart':{type:'pie'},'k.charts.kind.scatter_plot':{type:'scatter'},
};
export const CHART_PROPERTY_ALIGNMENTS=[
 {key:'chart.labels',sourceWire:'w.chart.point.category',canonical:'w.chart.point.category',operation:'chart.make',parameter:'labels',codec:'string-list'},
 {key:'chart.values',sourceWire:'w.chart.point.value',canonical:'w.chart.point.value',operation:'chart.make',parameter:'values',codec:'number-list'},
 {key:'chart.series',sourceWire:'w.chart.series.name',canonical:'w.chart.series.name',operation:'chart.make',parameter:'series'},
].map(row=>({...row,area:'diagram',host:'diagram',valueKind:'string'}));
export const chartToolInterface = readNativeToolInterface(NATIVE_INTERFACE);
const toolInterface = chartToolInterface.realize();
export const CHART_TOOL_BINDINGS = toolInterface.bindings;
export const CHART_TYPES = CHART_TOOL_BINDINGS.find(op=>op.id==='chart.make').params.type.enum;
export const initialChartState=()=>({charts:[],active:null,nextId:1,inputMode:null,history:[],future:[]});
const done=changed=>({status:'supported',changed}),fail=code=>({status:'missing',code});
const snapshot=s=>structuredClone({charts:s.charts,active:s.active,nextId:s.nextId,inputMode:s.inputMode});
const remember=s=>{s.history??=[];s.future??=[];s.history.push(snapshot(s));if(s.history.length>30)s.history.shift();s.future=[];};
const colourOK=value=>value===null||typeof value==='string'&&/^#[a-fA-F0-9]{6}$/.test(value);
const radial=type=>['pie','doughnut','polarArea'].includes(type);
const validData=(labels,datasets,type)=>Array.isArray(labels)&&labels.length<=200&&labels.every(l=>typeof l==='string')&&Array.isArray(datasets)&&datasets.length>0&&datasets.length<=12&&datasets.every(d=>d&&Object.keys(d).every(k=>['label','data','color'].includes(k))&&typeof d.label==='string'&&colourOK(d.color??null)&&Array.isArray(d.data)&&d.data.length===labels.length&&d.data.every(v=>typeof v==='number'&&Number.isFinite(v)&&(!radial(type)||v>=0)));
export const chartNativeObjects=s=>{
 if(!Array.isArray(s.charts))throw new TypeError('invalid-chart-state');const rows=[];
 for(const chart of s.charts){
  if(!validData(chart.labels,chart.datasets,chart.type))throw new TypeError('unsupported-chart-data');
  rows.push({id:chart.id,kind:'chart',sourceType:'data.charts.chart',...(chart.projection?.status==='linked'?{relations:{sourceGroup:[chart.projection.sourceGroup],sourceMembers:[...chart.projection.members]}}:{}),inputs:[{binding:'chart.title',key:'title',values:[nativeToken(chart.title)]},{binding:'chart.type',key:'type',values:[nativeToken(chart.type)]},...Object.entries(chart.options??{}).filter(([,v])=>v!==null&&typeof v!=='object').map(([key,v])=>({binding:'chart.'+key,key,values:[nativeToken(v)]}))]});
  for(const [si,ds]of chart.datasets.entries()){
   if(chart.datasets.length>1)rows.push({id:JSON.stringify([chart.id,'series',si]),kind:'series',sourceType:'data.charts.series',in:chart.id,index:si,inputs:[{binding:'chart.series.label',key:'label',values:[nativeToken(ds.label)]}]});
   for(let index=0;index<chart.labels.length;index++)rows.push({id:JSON.stringify(si?[chart.id,si,index]:[chart.id,index]),kind:'point',sourceType:'data.charts.point',in:chart.id,index,series:si,inputs:[{binding:'chart.point.label',key:'label',values:[nativeToken(chart.labels[index])]},{binding:'chart.point.value',key:'value',values:[nativeToken(ds.data[index])],dimension:'number',unit:'unitless',frame:'chart.data'}]});
  }
 }
 return rows;
};
export function chartNativeHandlers(){return {
 'chart.make':(ctx,a)=>{
  if(!a.labels.length&&(a.values.length||a.datasets?.[0]?.data?.length))a.labels=Array.from({length:a.values.length||a.datasets[0].data.length},(_,i)=>String(i+1));
  if(ctx.state.charts.length>=20)return fail('chart-limit');const datasets=a.datasets??[{label:a.series,data:a.values,color:null}];
  if(!validData(a.labels,datasets,a.type)||a.source.some(v=>typeof v!=='string'))return fail('invalid-chart-data');
  if(!Number.isSafeInteger(ctx.state.nextId)||ctx.state.nextId<1)return fail('invalid-sequence');
  const id=`${ctx.state.idPrefix??'c'}${ctx.state.nextId}`;if(ctx.state.charts.some(c=>c.id===id))return fail('duplicate-chart-id');remember(ctx.state);ctx.state.nextId++;
  ctx.state.charts.push({id,type:a.type,title:a.title,labels:a.labels,datasets,options:{stacked:false,horizontal:false,showLegend:null,showValues:false,sort:null,palette:null,pointColors:{}},source:a.source,spec:null,placement:{x:60+(ctx.state.charts.length%2)*460,y:60+Math.floor(ctx.state.charts.length/2)*350,width:420,height:300}});ctx.state.active=id;ctx.state.inputMode=null;return done([id]);
 },
 'chart.change':(ctx,a)=>{
  const chart=ctx.state.charts.find(c=>c.id===a.id);if(!chart)return fail('missing-target');const keys=['title','type','horizontal','stacked','showLegend','showValues','sort','colour','palette'].filter(k=>Object.hasOwn(a,k));
  if(!keys.length)return fail('missing-property');if(a.colour!==undefined&&!colourOK(a.colour))return fail('invalid-colour');if(!validData(chart.labels,chart.datasets,a.type??chart.type))return fail('invalid-chart-data');remember(ctx.state);
  for(const key of keys){if(['horizontal','stacked','showLegend','showValues','sort','palette'].includes(key))chart.options[key]=a[key]==='default'?null:a[key];else if(key==='colour')chart.datasets[0].color=a[key];else chart[key]=a[key];}return done([a.id]);
 },
 'chart.datasets.change':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.id);if(!chart)return fail('missing-target');if(!validData(a.labels,a.datasets,chart.type))return fail('invalid-chart-data');remember(ctx.state);chart.labels=a.labels;chart.datasets=a.datasets;return done([a.id]);},
 'chart.data.change':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.id);if(!chart||!chart.datasets[a.series])return fail('missing-target');const datasets=structuredClone(chart.datasets);datasets[a.series].data=a.values;if(!validData(a.labels,datasets,chart.type))return fail('invalid-chart-data');remember(ctx.state);chart.labels=a.labels;chart.datasets=datasets;return done([a.id]);},
 'chart.series.add':(ctx,a)=>{const c=ctx.state.charts.find(c=>c.id===a.chart);if(!c)return fail('missing-target');const datasets=[...c.datasets,{label:a.label,data:a.values,color:a.colour??null}];if(!validData(c.labels,datasets,c.type))return fail('invalid-chart-data');remember(ctx.state);c.datasets=datasets;return done([c.id]);},
 'chart.series.change':(ctx,a)=>{const c=ctx.state.charts.find(c=>c.id===a.chart);if(!c||!c.datasets[a.index])return fail('missing-target');if(!['label','values','colour'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');const datasets=structuredClone(c.datasets),d=datasets[a.index];for(const [key,to]of [['label','label'],['values','data'],['colour','color']])if(Object.hasOwn(a,key))d[to]=a[key];if(!validData(c.labels,datasets,c.type))return fail('invalid-chart-data');remember(ctx.state);c.datasets=datasets;return done([c.id]);},
 'chart.series.remove':(ctx,a)=>{const c=ctx.state.charts.find(c=>c.id===a.chart);if(!c||!c.datasets[a.index])return fail('missing-target');if(c.datasets.length===1)return fail('last-series');remember(ctx.state);c.datasets.splice(a.index,1);return done([c.id]);},
 'chart.point.change':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.chart),d=chart?.datasets[a.series];if(!d||a.index>=chart.labels.length)return fail('missing-target');if(radial(chart.type)&&a.value<0)return fail('negative-radial-value');if(d.data[a.index]===a.value)return done([]);remember(ctx.state);d.data[a.index]=a.value;return done([JSON.stringify(a.series?[chart.id,a.series,a.index]:[chart.id,a.index])]);},
 'chart.select':(ctx,a)=>{if(!ctx.state.charts.some(c=>c.id===a.id))return fail('missing-target');ctx.state.active=a.id;return done([a.id]);},
 'chart.place':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.id);if(!chart)return fail('missing-target');remember(ctx.state);ctx.state.active=a.id;chart.placement={...(chart.placement??{width:420,height:300}),...Object.fromEntries(Object.entries(a).filter(([k])=>k!=='id'))};return done([a.id]);},
 'chart.remove':(ctx,a)=>{if(!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.charts.some(c=>c.id===id)))return fail('missing-target');remember(ctx.state);ctx.state.charts=ctx.state.charts.filter(c=>!a.ids.includes(c.id));if(a.ids.includes(ctx.state.active))ctx.state.active=null;return done(a.ids);},
 'chart.observe':ctx=>({status:'supported',data:chartNativeObjects(ctx.state)}),
 'chart.undo':ctx=>{const s=ctx.state;if(!s.history?.length)return fail('nothing-to-undo');s.future??=[];s.future.push(snapshot(s));Object.assign(s,s.history.pop());return done([]);},
 'chart.redo':ctx=>{const s=ctx.state;if(!s.future?.length)return fail('nothing-to-redo');s.history??=[];s.history.push(snapshot(s));Object.assign(s,s.future.pop());return done([]);},
};}
export function createChartHost({state=initialChartState(),instanceId,...limits}={}){return createNativeToolHost({state,instanceId,scope:'charts-and-points',toolInterface,handlers:chartNativeHandlers(),view:chartNativeObjects,...limits});}
