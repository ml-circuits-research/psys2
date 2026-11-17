import{K}from'./core.mjs';
import{CHART_LAYOUTS,GROUP_LAYOUTS,layoutNumericGroup}from'./chart-layout.mjs';
// Stable groups over actual diagram nodes; coordinates come from declared native layout tools.
import{nativeToken}from'../native-tool-host.mjs';
import{addShapes,arrangeShapes}from'./tool.mjs';
import{chartNativeHandlers,CHART_TOOL_BINDINGS}from'../data.charts/declared-host.mjs';
export const GROUP_CHART_PROJECTION=Object.freeze({id:'diagram.group.numeric-chart',source:'diagram.sketch.group',members:'members',label:'label',memberLabel:'label',memberValue:'value',missingSource:'detach-snapshot',directDataEdit:'detach-snapshot',preserve:['type','placement','options','dataset.color']});
const id={type:'string',required:true},layouts=GROUP_LAYOUTS;
export const GROUP_TOOL_BINDINGS=[
 {id:'diagram.group.make',act:'make',on:'diagram.sketch.group',params:{name:id,label:{type:'string'},ids:{type:'array',required:true}}},
 {id:'diagram.group.select',act:'ask',on:'diagram.sketch.group',params:{id}},
 {id:'diagram.group.change',act:'change',on:'diagram.sketch.group',params:{id,label:{type:'string'},colour:{type:'string'},size:{type:'string',enum:['tiny','small','medium','large','huge']}}},
 {id:'diagram.group.layout',act:'place',on:'diagram.sketch.group',params:{id,layout:{type:'string',required:true,enum:layouts}}},
 {id:'diagram.group.resize',act:'change',on:'diagram.sketch.group',params:{id,scale:{type:'number',required:true,min:.05,max:20}}},
 {id:'diagram.group.place',act:'place',on:'diagram.sketch.group',params:{id,x:{type:'number',required:true},y:{type:'number',required:true}},coordinates:{dimension:'length',unit:'canvas.pixel',frame:'diagram.canvas'}},
 {id:'diagram.group.remove',act:'remove',on:'diagram.sketch.group',params:{id}},
 {id:'diagram.group.ungroup',act:'remove',on:'diagram.sketch.group',params:{id}},
 {id:'diagram.group.chart.make',sample:[{args:{label:{unique:{prefix:'Values'}},labels:{value:['A','B','C']},values:{value:[3,7,5]},layout:{enum:true}}}],act:'make',on:'diagram.sketch.group',result:{identityParameter:null},params:{label:{type:'string',required:true},labels:{type:'array',required:true},values:{type:'array',required:true},layout:{type:'string',required:true,enum:CHART_LAYOUTS}}},
 {id:'diagram.group.chart.adopt',act:'make',on:'diagram.sketch.group',result:{identityParameter:null},params:{id}},
 {id:'diagram.group.chart',derivedProjection:GROUP_CHART_PROJECTION,act:'make',on:'data.charts.chart',result:{identityParameter:null},intent:{parameters:{id:{role:'source',reference:true,label:'from group'}}},params:{id,type:CHART_TOOL_BINDINGS.find(o=>o.id==='chart.make').params.type,title:{type:'string'}}},
];
const group=(s,id)=>s.groups.find(g=>g.name===id),members=(s,g)=>g.members.map(id=>s.shapes.find(n=>n.name===id)).filter(Boolean),center=nodes=>({x:nodes.reduce((n,o)=>n+o.x/nodes.length,0),y:nodes.reduce((n,o)=>n+o.y/nodes.length,0)});
const fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
export const groupNativeObjects=s=>(s.groups??[]).map(g=>({id:g.name,kind:'group',sourceType:'diagram.sketch.group',members:[...g.members],...(g.links?.length||g.chartId?{relations:{...(g.links?.length?{links:[...g.links]}:{}),...(g.chartId?{chart:[g.chartId]}:{})}}:{}),inputs:Object.entries({label:g.label??g.name,members:g.members,layout:g.layout??null,...(g.layoutOrigin?{layoutOriginX:g.layoutOrigin.x,layoutOriginY:g.layoutOrigin.y}:{}),...(members(s,g).length?center(members(s,g)):{}),chart:g.chartId??null}).map(([key,value])=>({binding:'diagram.group.'+key,key,values:value===null?[]:(Array.isArray(value)?value:[value]).map(nativeToken)}))}));
export function groupNativeHandlers({run}){
 const charts=chartNativeHandlers();
 const createNumeric=(ctx,a,step)=>{
  if(!a.label.trim()||!a.labels.length||a.labels.length>128||a.labels.length!==a.values.length||a.labels.some(label=>typeof label!=='string')||a.values.some(value=>!Number.isFinite(value)))return fail('invalid-chart-data');
  const occupied=new Set([...ctx.state.groups.map(g=>g.name),...ctx.state.shapes.map(n=>n.name),...ctx.state.edges.map(e=>e.id),...ctx.state.chartTools.charts.map(c=>c.id)]);let name;for(let n=1;n<=10000;n++){if(!occupied.has('g'+n)){name='g'+n;break;}}if(!name)return fail('group-id-budget');
  const result=addShapes(ctx,{kind:'rectangle',n:a.labels.length,step});if(result.status!=='supported')return result;
  const nodes=result.changed.map(id=>ctx.state.shapes.find(node=>node.name===id));for(const [index,node]of nodes.entries()){node.label=a.labels[index];node.value=a.values[index];}
  const group={name,label:a.label,members:nodes.map(node=>node.name)};ctx.state.groups.push(group);const layout=layoutNumericGroup(ctx.state,group,a.layout);if(!layout.ok)return fail(layout.code);ctx.state.selected={shapes:[...group.members],edges:[...(group.links??[])],group:name};ctx.state.chartTools.active=null;return done(layout.changed);
 };
 return {
  'diagram.group.chart.make':createNumeric,
  'diagram.group.chart.adopt':(ctx,a,step)=>{const chart=ctx.state.chartTools.charts.find(chart=>chart.id===a.id);if(!chart)return fail('missing-chart');if(chart.datasets.length!==1)return fail('single-series-conversion-required');const result=createNumeric(ctx,{label:chart.title,labels:chart.labels,values:chart.datasets[0].data,layout:CHART_LAYOUTS.includes(chart.type)?chart.type:'bar'},step);if(result.status!=='supported')return result;ctx.state.legacyCharts??=[];ctx.state.legacyCharts.push(structuredClone(chart));ctx.state.chartTools.charts=ctx.state.chartTools.charts.filter(chart=>chart.id!==a.id);return result;},
  'diagram.group.make':(ctx,a)=>{if(!a.name.trim()||a.name.length>80||ctx.state.groups.some(g=>g.name===a.name)||ctx.state.shapes.some(n=>n.name===a.name)||ctx.state.chartTools.charts.some(c=>c.id===a.name))return fail('invalid-or-duplicate-group-name');if(a.ids.length<1||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.shapes.some(n=>n.name===id)))return fail('missing-group-member');ctx.state.groups.push({name:a.name,label:a.label??a.name,members:[...a.ids]});ctx.state.selected={shapes:[...a.ids],edges:[],group:a.name};ctx.state.rev++;return done([a.name]);},
  'diagram.group.select':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g||members(ctx.state,g).length!==g.members.length)return fail('missing-group-member');ctx.state.selected={shapes:[...g.members],edges:[...(g.links??[])],group:g.name};ctx.state.chartTools.active=null;return done([g.name,...g.members]);},
  'diagram.group.change':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');if(!['label','colour','size'].some(k=>Object.hasOwn(a,k)))return fail('missing-property');if(a.label!==undefined)g.label=a.label;if(a.colour!==undefined||a.size!==undefined){const r=run(ctx,{action:'set',target:g.members,...(a.colour!==undefined?{color:a.colour}:{}),...(a.size!==undefined?{size:a.size}:{})});if(r.status!=='supported')return r;if(a.size!==undefined){for(const node of ctx.state.shapes.filter(node=>g.members.includes(node.name))){const dimensions=K.dims(node);node.geometry={...(node.geometry??{}),width:dimensions.w,height:dimensions.h};}const current=group(ctx.state,a.id);if(CHART_LAYOUTS.includes(current.layout)){current.layout='free';delete current.layoutOrigin;}}}ctx.state.rev++;return done([a.id,...g.members]);},
  'diagram.group.layout':(ctx,a,step)=>{const g=group(ctx.state,a.id);if(!g||members(ctx.state,g).length!==g.members.length)return fail('missing-group-member');if(CHART_LAYOUTS.includes(a.layout)){const result=layoutNumericGroup(ctx.state,g,a.layout);return result.ok?done(result.changed):fail(result.code);}g.layout=a.layout;if(a.layout==='free')return done([g.name]);const r=arrangeShapes(ctx,{ids:g.members,layout:a.layout,step});if(r.status==='supported')return done([a.id,...g.members]);return r;},
  'diagram.group.resize':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const nodes=members(ctx.state,g),c=center(nodes);if(nodes.some(node=>{const d=K.dims(node);return d.w*a.scale<8||d.h*a.scale<8||d.w*a.scale>4096||d.h*a.scale>4096;}))return fail('size-out-of-range');for(const node of nodes){const d=K.dims(node);node.x=c.x+(node.x-c.x)*a.scale;node.y=c.y+(node.y-c.y)*a.scale;node.w=d.w*a.scale;node.h=d.h*a.scale;node.geometry={...(node.geometry??{}),width:node.w,height:node.h};}g.layout='free';delete g.layoutOrigin;ctx.state.rev++;return done([g.name,...g.members]);},
  'diagram.group.place':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const nodes=members(ctx.state,g);if(!nodes.length)return fail('empty-group');const c=center(nodes);for(const n of nodes){n.x+=a.x-c.x;n.y+=a.y-c.y;}if(g.layoutOrigin){g.layoutOrigin.x+=a.x-c.x;g.layoutOrigin.y+=a.y-c.y;}ctx.state.rev++;return done([a.id,...g.members]);},
  'diagram.group.remove':(ctx,a)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const changed=[g.name,...g.members,...(g.links??[])],result=run(ctx,{action:'delete',target:g.members});if(result.status!=='supported')return result;ctx.state.groups=ctx.state.groups.filter(group=>group.name!==a.id);ctx.state.selected={shapes:[],edges:[]};ctx.state.rev++;return done(changed);},
  'diagram.group.ungroup':(ctx,a)=>{if(!group(ctx.state,a.id))return fail('missing-group');const g=group(ctx.state,a.id);ctx.state.groups=ctx.state.groups.filter(g=>g.name!==a.id);ctx.state.selected={shapes:[...g.members],edges:[...(g.links??[])]};ctx.state.rev++;return done([a.id]);},
  'diagram.group.chart':(ctx,a,step)=>{const g=group(ctx.state,a.id);if(!g)return fail('missing-group');const nodes=members(ctx.state,g);if(!nodes.length||nodes.some(n=>!Number.isFinite(n.value)))return fail('explicit-numeric-values-required');const c=center(nodes);const r=charts['chart.make']({...ctx,state:ctx.state.chartTools},{type:a.type,title:a.title??g.label??g.name,labels:nodes.map(n=>n.label||n.name),values:nodes.map(n=>n.value),series:g.label??g.name,source:[g.name,...g.members]},step);if(r.status!=='supported')return r;g.chartId=ctx.state.chartTools.active;const chart=ctx.state.chartTools.charts.find(c=>c.id===g.chartId);chart.placement={x:c.x,y:c.y,width:420,height:300};chart.group=g.name;chart.projection={contract:GROUP_CHART_PROJECTION.id,status:'linked',sourceGroup:g.name,members:[...g.members],titleMode:a.title===undefined?'group':'authored'};ctx.state.selected={shapes:[],edges:[]};return r;},
 };
}

// Owning projection contract: chart data is a view of explicit instance values, never inferred numbers.
const chartDataEdits=new Set(['chart.data.change','chart.datasets.change','chart.series.add','chart.series.change','chart.series.remove','chart.point.change']);
/** Refresh only derived fields, inside the same admitted native mutation and composition undo entry. */
export function projectGroupCharts(state,{operation,args={}}={}){
 const changed=[];
 for(const g of state.groups)if(g.chartId&&!state.chartTools.charts.some(c=>c.id===g.chartId))delete g.chartId;
 for(const chart of state.chartTools.charts){
  if(!chart.group||chart.projection?.status==='detached')continue;
  const g=group(state,chart.group),projection=chart.projection??{contract:GROUP_CHART_PROJECTION.id,status:'linked',sourceGroup:chart.group,members:[...(g?.members??[])],titleMode:'authored'};
  chart.projection=projection;const nodes=g?members(state,g):[];
  const detach=reason=>{projection.status='detached';projection.reason=reason;delete chart.group;if(g?.chartId===chart.id)delete g.chartId;changed.push(chart.id);};
  if((args.id??args.chart)===chart.id&&chartDataEdits.has(operation)&&!(operation==='chart.series.change'&&!Object.hasOwn(args,'label')&&!Object.hasOwn(args,'values'))){detach('chart-data-edited');continue;}
  if(!g||nodes.length!==projection.members.length||projection.members.some((id,index)=>g.members[index]!==id)){detach('source-removed');continue;}
  if(!nodes.length||nodes.some(n=>!Number.isFinite(n.value)||(['pie','doughnut','polarArea'].includes(chart.type)&&n.value<0))){detach('source-values-incompatible');continue;}
  if(operation==='chart.change'&&args.id===chart.id&&Object.hasOwn(args,'title'))projection.titleMode='authored';
  const before=JSON.stringify([chart.labels,chart.datasets,chart.title,chart.source]);
  chart.labels=nodes.map(n=>n.label||n.name);chart.datasets=[{...chart.datasets[0],label:g.label??g.name,data:nodes.map(n=>n.value)}];chart.source=[g.name,...g.members];
  if(projection.titleMode==='group')chart.title=g.label??g.name;
  if(before!==JSON.stringify([chart.labels,chart.datasets,chart.title,chart.source]))changed.push(chart.id);
 }
 return changed;
}
