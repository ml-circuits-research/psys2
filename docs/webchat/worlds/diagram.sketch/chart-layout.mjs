import{budget}from'./core.mjs?v=d8d28a904e';
// Numeric group layouts are actual editable node and link geometry.
export const CHART_LAYOUTS=['bar','line','pie','doughnut'];
export const GROUP_LAYOUTS=['free','tree','grid','row','column','circle','radial','layers',...CHART_LAYOUTS];
export function layoutNumericGroup(state,group,layout){
 const nodes=group.members.map(id=>state.shapes.find(node=>node.name===id));
 if(!nodes.length||nodes.some(node=>!node||!Number.isFinite(node.value)))return {ok:false,code:'explicit-numeric-values-required'};
 if(['pie','doughnut'].includes(layout)&&(nodes.some(node=>node.value<0)||nodes.reduce((sum,node)=>sum+node.value,0)<=0))return {ok:false,code:'positive-chart-total-required'};
 const center=group.layoutOrigin??{x:nodes.reduce((sum,node)=>sum+node.x/nodes.length,0),y:nodes.reduce((sum,node)=>sum+node.y/nodes.length,0)};
 group.layoutOrigin={...center};
 const oldLinks=new Set(group.links??[]),priorLinks=state.edges.filter(edge=>oldLinks.has(edge.id));state.edges=state.edges.filter(edge=>!oldLinks.has(edge.id));delete group.links;
 const maximum=Math.max(1,...nodes.map(node=>Math.abs(node.value))),width=Math.max(240,nodes.length*64),height=220;
 for(const [index,node]of nodes.entries()){
  delete node.startAngle;delete node.endAngle;delete node.innerRadius;
  if(layout==='bar'){node.shape='rectangle';node.w=Math.max(12,width/nodes.length*.7);node.h=Math.max(8,Math.abs(node.value)/maximum*height);node.x=center.x-width/2+(index+.5)*width/nodes.length;node.y=center.y+(node.value>=0?-1:1)*node.h/2;}
  else if(layout==='line'){node.shape='circle';node.w=node.h=16;node.x=center.x-width/2+(nodes.length===1?width/2:index*width/(nodes.length-1));node.y=center.y-node.value/maximum*height;}
  else{const total=nodes.reduce((sum,item)=>sum+item.value,0),before=nodes.slice(0,index).reduce((sum,item)=>sum+item.value,0);node.shape='sector';node.w=node.h=260;node.x=center.x;node.y=center.y;node.startAngle=-Math.PI/2+before/total*Math.PI*2;node.endAngle=node.startAngle+node.value/total*Math.PI*2;node.innerRadius=layout==='doughnut'?.52:0;}
  node.geometry={width:node.w,height:node.h,...(node.shape==='sector'?{startAngle:node.startAngle,endAngle:node.endAngle,innerRadius:node.innerRadius}:{})};
 }
 if(layout==='line'){
  const occupied=new Set([...state.edges.map(edge=>edge.id),...state.shapes.map(node=>node.name),...state.groups.map(g=>g.name)]);group.links=[];
  for(let index=1;index<nodes.length;index++){const existing=priorLinks.find(edge=>edge.from===nodes[index-1].name&&edge.to===nodes[index].name);let id=existing?.id;if(!id){let attempts=0;do{budget.tick('diagram.chart.edge-id');if(++attempts>10000||!Number.isSafeInteger(state.edgeSeq)||state.edgeSeq>=Number.MAX_SAFE_INTEGER)return {ok:false,code:'edge-id-budget'};id='a'+(++state.edgeSeq);}while(occupied.has(id));}occupied.add(id);state.edges.push(existing??{id,from:nodes[index-1].name,to:nodes[index].name,style:'solid',arrow:'none',label:null,color:null});group.links.push(id);}
 }
 group.layout=layout;state.rev++;return {ok:true,changed:[group.name,...group.members,...(group.links??[])]};
}
export function projectNumericGroups(state,{operation,args={}}={}){
 const changed=[];
 const liveNodes=new Set(state.shapes.map(node=>node.name)),liveEdges=new Set(state.edges.map(edge=>edge.id));
 for(const group of state.groups){
  const previousMembers=[...group.members],previousLinks=[...(group.links??[])];group.members=group.members.filter(id=>liveNodes.has(id));if(group.links)group.links=group.links.filter(id=>liveEdges.has(id));
  if(operation==='diagram.link.remove'&&args.ids?.some(id=>previousLinks.includes(id))){group.layout='free';delete group.layoutOrigin;}
  if(CHART_LAYOUTS.includes(group.layout)&&previousMembers.length!==group.members.length&&group.members.length){const result=layoutNumericGroup(state,group,group.layout);if(result.ok)changed.push(...result.changed);else group.layout='free';}
  if(!CHART_LAYOUTS.includes(group.layout))continue;
  if((['diagram.node.place','diagram.node.resize'].includes(operation)||operation==='diagram.node.change'&&Object.hasOwn(args,'size'))&&args.ids?.some(id=>group.members.includes(id))){group.layout='free';delete group.layoutOrigin;changed.push(group.name);continue;}
  if(operation==='diagram.node.change'&&Object.hasOwn(args,'value')&&args.ids.some(id=>group.members.includes(id))){const result=layoutNumericGroup(state,group,group.layout);if(result.ok)changed.push(...result.changed);else group.layout='free';}
 }
 state.groups=state.groups.filter(group=>group.members.length);return changed;
}
