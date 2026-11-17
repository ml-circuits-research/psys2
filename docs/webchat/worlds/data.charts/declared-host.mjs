// SPDX-License-Identifier: AGPL-3.0-only
// Explicit numeric data only: no text parser, inferred values, or legacy dispatch.
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=463e762442';
const text={type:'string',required:true},array={type:'array',required:true};
export const CHART_TOOL_BINDINGS=[
 {id:'chart.make',act:'make',on:'data.charts.chart',params:{type:{type:'string',required:true,enum:['bar','line','pie','doughnut','radar','polarArea','scatter']},title:text,labels:array,values:array,series:{type:'string',required:true},source:array}},
 {id:'chart.change',act:'change',on:'data.charts.chart',params:{id:text,title:{type:'string'},type:{type:'string',enum:['bar','line','pie','doughnut','radar','polarArea','scatter']}}},
 {id:'chart.point.change',act:'change',on:'data.charts.point',params:{chart:text,index:{type:'integer',required:true,min:0},value:{type:'number',required:true}},measurement:{dimension:'number',unit:'unitless',frame:'chart.data'}},
 {id:'chart.remove',act:'remove',on:'data.charts.chart',params:{ids:array}},
 {id:'chart.observe',act:'ask',on:'data.charts.chart',params:{}},
 {id:'chart.undo',act:'undo',on:'data.charts.chart',params:{}},
 {id:'chart.redo',act:'redo',on:'data.charts.chart',params:{}},
];
export const initialChartState=()=>({charts:[],active:null,nextId:1,inputMode:null,history:[],future:[]});
const done=changed=>({status:'supported',changed}),fail=code=>({status:'missing',code});
const snapshot=s=>structuredClone({charts:s.charts,active:s.active,nextId:s.nextId,inputMode:s.inputMode});
const remember=s=>{s.history??=[];s.future??=[];s.history.push(snapshot(s));if(s.history.length>30)s.history.shift();s.future=[];};
const view=s=>{
 if(!Array.isArray(s.charts))throw new TypeError('invalid-chart-state');
 const rows=[];
 for(const chart of s.charts){
  if(!Array.isArray(chart.labels)||!Array.isArray(chart.datasets)||chart.datasets.length!==1||!Array.isArray(chart.datasets[0].data)||chart.labels.length!==chart.datasets[0].data.length)throw new TypeError('unsupported-chart-data');
  rows.push({id:chart.id,kind:'chart',sourceType:'data.charts.chart',inputs:[{binding:'chart.title',key:'title',values:[nativeToken(chart.title)]},{binding:'chart.type',key:'type',values:[nativeToken(chart.type)]}]});
  for(let index=0;index<chart.labels.length;index++){const value=chart.datasets[0].data[index];if(typeof value!=='number'||!Number.isFinite(value)||typeof chart.labels[index]!=='string')throw new TypeError('invalid-chart-point');rows.push({id:JSON.stringify([chart.id,index]),kind:'point',sourceType:'data.charts.point',in:chart.id,index,inputs:[{binding:'chart.point.label',key:'label',values:[nativeToken(chart.labels[index])]},{binding:'chart.point.value',key:'value',values:[nativeToken(value)],dimension:'number',unit:'unitless',frame:'chart.data'}]});}
 }
 return rows;
};
export function createChartHost({state=initialChartState(),instanceId,...limits}={}){
 const handlers={
  'chart.make':(ctx,a)=>{if(!a.labels.length||a.labels.length>200||a.labels.length!==a.values.length||a.labels.some(l=>typeof l!=='string')||a.values.some(v=>typeof v!=='number'||!Number.isFinite(v))||a.source.some(v=>typeof v!=='string'))return fail('invalid-chart-data');if(!Number.isSafeInteger(ctx.state.nextId)||ctx.state.nextId<1)return fail('invalid-sequence');remember(ctx.state);const id=`c${ctx.state.nextId++}`;if(ctx.state.charts.some(c=>c.id===id))return fail('duplicate-chart-id');ctx.state.charts.push({id,type:a.type,title:a.title,labels:a.labels,datasets:[{label:a.series,data:a.values,color:null}],options:{stacked:false,horizontal:false,showLegend:null,showValues:false,sort:null,palette:null,pointColors:{}},source:a.source,spec:null});ctx.state.active=id;ctx.state.inputMode=null;return done([id]);},
  'chart.change':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.id);if(!chart)return fail('missing-target');const keys=['title','type'].filter(k=>Object.hasOwn(a,k));if(!keys.length)return fail('missing-property');if(keys.every(k=>chart[k]===a[k]))return done([]);remember(ctx.state);for(const key of keys)chart[key]=a[key];return done([a.id]);},
  'chart.point.change':(ctx,a)=>{const chart=ctx.state.charts.find(c=>c.id===a.chart);if(!chart||a.index>=chart.labels.length)return fail('missing-target');if(chart.datasets[0].data[a.index]===a.value)return done([]);remember(ctx.state);chart.datasets[0].data[a.index]=a.value;return done([JSON.stringify([chart.id,a.index])]);},
  'chart.remove':(ctx,a)=>{if(!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.charts.some(c=>c.id===id)))return fail('missing-target');remember(ctx.state);ctx.state.charts=ctx.state.charts.filter(c=>!a.ids.includes(c.id));if(a.ids.includes(ctx.state.active))ctx.state.active=null;return done(a.ids);},
  'chart.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'chart.undo':ctx=>{const s=ctx.state;if(!s.history?.length)return fail('nothing-to-undo');s.future??=[];s.future.push(snapshot(s));Object.assign(s,s.history.pop());return done([]);},
  'chart.redo':ctx=>{const s=ctx.state;if(!s.future?.length)return fail('nothing-to-redo');s.history??=[];s.history.push(snapshot(s));Object.assign(s,s.future.pop());return done([]);},
 };
 return createNativeToolHost({state,instanceId,scope:'charts-and-points',operations:CHART_TOOL_BINDINGS,handlers,view,...limits});
}
