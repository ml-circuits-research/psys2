// Stable groups over actual diagram nodes; coordinates come from declared native layout tools.
import{nativeToken}from'../native-tool-host.mjs';
import{arrangeShapes}from'./tool.mjs';
import{chartNativeHandlers,CHART_TOOL_BINDINGS}from'../data.charts/declared-host.mjs';
const id={type:'string',required:true},layouts=['tree','grid','row','column','circle','radial','layers'];
export const GROUP_TOOL_BINDINGS=[
 {id:'diagram.group.make',act:'make',on:'diagram.sketch.group',params:{name:id,ids:{type:'array',required:true}}},
 {id:'diagram.group.select',act:'ask',on:'diagram.sketch.group',params:{id}},
 {id:'diagram.group.change',act:'change',on:'diagram.sketch.group',params:{id,label:{type:'string'},colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']}}},
 {id:'diagram.group.layout',act:'place',on:'diagram.sketch.group',params:{id,layout:{type:'string',required:true,enum:layouts}}},
 {id:'diagram.group.place',act:'place',on:'diagram.sketch.group',params:{id,x:{type:'number',required:true},y:{type:'number',required:true}},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}},
 {id:'diagram.group.ungroup',act:'remove',on:'diagram.sketch.group',params:{id}},
 {id:'diagram.group.chart',act:'make',on:'data.charts.chart',result:{identityParameter:null},intent:{parameters:{id:{role:'source',reference:true,label:'from group'}}},params:{id,type:CHART_TOOL_BINDINGS.find(o=>o.id==='chart.make').params.type,title:{type:'string'}}},
];
const group=(s,id)=>s.groups.find(g=>g.name===id),members=(s,g)=>g.members.map(id=>s.shapes.find(n=>n.name===id)).filter(Boolean),center=nodes=>({x:nodes.reduce((n,o)=>n+o.x/nodes.length,0),y:nodes.reduce((n,o)=>n+o.y/nodes.length,0)});
const fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
export const groupNativeObjects=s=>(s.groups??[]).map(g=>({id:g.name,kind:'group',sourceType:'diagram.sketch.group',members:[...g.members],inputs:Object.entries({label:g.label??g.name,members:g.members,layout:g.layout??null,...(members(s,g).length?center(members(s,g)):{}),chart:g.chartId??null}).map(([key,value])=>({binding:'diagram.group.'+key,key,values:value===null?[]:(Array.isArray(value)?value:[value]).map(nativeToken)}))}));
export function groupNativeHandlers({run}){
 const charts=chartNativeHandlers();return {
  'diagram.group.make':(ctx,a)=>{if(!a.name.trim()||a.name.length>80||ctx.state.groups.some(g=>g.name===a.name)||ctx.state.shapes.some(n=>n.name===a.name)||ctx.state.chartTools.charts.some(c=>c.id===a.name))return fail('invalid-or-duplicate-group-name');if(a.ids.length<1||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.shapes.some(n=>n.name===id)))return fail('missing-group-member');ctx.state.groups.push({name:a.name,label:a.name,members:[...a.ids]});ctx.state.rev++;return done([a.name]);},
  'diagram.group.select':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g||members(ctx.state,g).length!==g.members.length)return fail('missing-group-member');ctx.state.selected={shapes:[...g.members],edges:[],group:g.name};ctx.state.chartTools.active=null;return done([g.name,...g.members]);},
  'diagram.group.change':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');if(!['label','colour','size'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');if(a.label!==undefined){if(!a.label.trim())return fail('empty-group-label');g.label=a.label;}if(a.colour!==undefined||a.size!==undefined){const r=run(ctx,{action:'set',target:g.members,...(a.colour!==undefined?{color:a.colour}:{}),...(a.size!==undefined?{size:a.size}:{})});if(r.status!=='supported')return r;}ctx.state.rev++;return done([a.id,...g.members]);},
  'diagram.group.layout':(ctx,a,step)=>{const g=group(ctx.state,a.id);if(!g||members(ctx.state,g).length!==g.members.length)return fail('missing-group-member');g.layout=a.layout;const r=arrangeShapes(ctx,{ids:g.members,layout:a.layout,step});if(r.status==='supported')return done([a.id,...g.members]);return r;},
  'diagram.group.place':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const nodes=members(ctx.state,g);if(!nodes.length)return fail('empty-group');const c=center(nodes);for(const n of nodes){n.x+=a.x-c.x;n.y+=a.y-c.y;}ctx.state.rev++;return done([a.id,...g.members]);},
  'diagram.group.ungroup':(ctx,a)=>{if(!group(ctx.state,a.id))return fail('missing-group');ctx.state.groups=ctx.state.groups.filter(g=>g.name!==a.id);ctx.state.rev++;return done([a.id]);},
  'diagram.group.chart':(ctx,a,step)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const nodes=members(ctx.state,g);if(!nodes.length||nodes.some(n=>!Number.isFinite(n.value)))return fail('explicit-numeric-values-required');const c=center(nodes);const r=charts['chart.make']({...ctx,state:ctx.state.chartTools},{type:a.type,title:a.title??g.label??g.name,labels:nodes.map(n=>n.label||n.name),values:nodes.map(n=>n.value),series:g.label??g.name,source:[g.name,...g.members]},step);if(r.status!=='supported')return r;g.chartId=ctx.state.chartTools.active;const chart=ctx.state.chartTools.charts.find(c=>c.id===g.chartId);chart.placement={x:c.x,y:c.y,width:420,height:300};chart.group=g.name;ctx.state.selected={shapes:[],edges:[]};return r;},
 };
}
