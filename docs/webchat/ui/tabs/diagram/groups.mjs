// SPDX-License-Identifier: AGPL-3.0-only
// Native group controls; all edits use the same declared operation door as other UI gestures.
export function makeGroupTools(holder,{tool,asset,getState,tools}={}){
 const create=(tag,label)=>{const e=document.createElement(tag);if(label)e.textContent=label;return e;},panel=create('details');panel.className='dg-chart-tools';panel.open=true;panel.append(create('summary','Groups and values'));
 const form=create('div');form.className='dg-chart-form';panel.append(form);holder.prepend(panel);
 const input=(label,type='text')=>{const l=create('label',label),e=create(type==='select'?'select':'input');if(type!=='select')e.type=type;e.setAttribute('aria-label',label);l.append(e);form.append(l);return e;};
 const button=(label,fn)=>{const b=create('button',label);b.type='button';b.className='dg-btn';b.addEventListener('click',fn);form.append(b);return b;};
 const members=input('Group members','select');members.multiple=true;members.size=5;
 const name=input('New group name');name.value='Group';const make=button('Create group',()=>tool('diagram.group.make',{name:name.value.trim()||'Group',ids:[...members.selectedOptions].map(o=>o.value)}));
 const group=input('Selected group','select'),label=input('Group label'),colour=input('Group colour','select'),size=input('Group size','select'),layout=input('Group layout','select'),x=input('Group X','number'),y=input('Group Y','number'),chartType=input('Group chart type','select');
 const selectedGroup=()=>getState()?.groups?.find(g=>g.name===group.value);
 const id=()=>selectedGroup()?.name;
 group.addEventListener('change',()=>{if(id())tool('diagram.group.select',{id:id()});});
 label.addEventListener('change',()=>{if(id())tool('diagram.group.change',{id:id(),label:label.value});});
 colour.addEventListener('change',()=>{if(id()&&colour.value)tool('diagram.group.change',{id:id(),colour:colour.value});});size.addEventListener('change',()=>{if(id()&&size.value)tool('diagram.group.change',{id:id(),size:size.value});});
 layout.addEventListener('change',()=>{if(id()&&layout.value)tool('diagram.group.layout',{id:id(),layout:layout.value});});
 const move=button('Move group',()=>{if(id())tool('diagram.group.place',{id:id(),x:Number(x.value),y:Number(y.value)});});
 const split=button('Ungroup',()=>{if(id())tool('diagram.group.ungroup',{id:id()});});
 const chart=button('Chart these values',()=>{if(id())tool('diagram.group.chart',{id:id(),type:chartType.value});});
 const note=create('p','Double-click a node to edit its label and numeric value. A chart uses exactly those values.');note.style.fontSize='12px';panel.append(note);
 const option=(select,value,label=value)=>{const o=create('option',label);o.value=value;select.append(o);};
 let loaded=false;
 const declarations=async()=>{let value=typeof tools==='function'?await tools():null;if(!value){const m=await import(asset('worlds/diagram.sketch/declared-host.mjs'));const capabilityHost=await m.createDiagramHost({state:m.initialDiagramState(),instanceId:'diagram-controls-metadata'});value=capabilityHost.bindings();}return Array.isArray(value)?value:value.operations??value.bindings??[];};
 declarations().then(operations=>{for(const [select,operation,param]of [[colour,'diagram.group.change','colour'],[size,'diagram.group.change','size'],[layout,'diagram.group.layout','layout'],[chartType,'diagram.group.chart','type']]){option(select,'','Choose');for(const value of operations.find(o=>o.id===operation)?.params?.[param]?.enum??(param==='colour'?operations.find(o=>o.id==='diagram.node.change')?.params?.colour?.enum:[])??[])option(select,value);}if([...chartType.options].some(o=>o.value==='bar'))chartType.value='bar';loaded=true;refresh();}).catch(()=>{});
 function refresh(){
  const state=getState()??{},old=group.value;group.textContent='';for(const g of state.groups??[])option(group,g.name,g.label||g.name);group.value=state.selected?.group??'';
  const selected=new Set(state.selected?.shapes??[]);members.textContent='';for(const n of state.shapes??[]){option(members,n.name,(n.label||n.name)+(typeof n.value==='number'?' · '+n.value:''));members.lastChild.selected=selected.has(n.name);}
  const g=selectedGroup(),nodes=g?(g.members??[]).map(id=>state.shapes?.find(n=>n.name===id)).filter(Boolean):[];
  panel.hidden=!g&&selected.size<2;panel.querySelector('summary').textContent=g?'Group properties':selected.size+' selected nodes';members.parentElement.hidden=true;group.parentElement.hidden=true;
  for(const control of [name,make]){const target=control.closest('label')??control;target.hidden=!!g;}
  for(const control of [label,colour,size,layout,x,y,move,split,chartType,chart]){const target=control.closest('label')??control;target.hidden=!g;}
  note.hidden=!g;
  for(const control of [group,label,colour,size,layout,x,y,move,split,chartType])control.disabled=!g||!loaded;
  if(g){label.value=g.label??g.name;x.value=Number(g.x??(nodes.length?nodes.reduce((sum,n)=>sum+n.x,0)/nodes.length:0)).toFixed(2);y.value=Number(g.y??(nodes.length?nodes.reduce((sum,n)=>sum+n.y,0)/nodes.length:0)).toFixed(2);layout.value=g.layout??'';}
  chart.disabled=!g||!loaded||!nodes.length||nodes.some(n=>typeof n.value!=='number'||!Number.isFinite(n.value));chart.title=chart.disabled?'Give every group member a numeric value first.':'Create a linked chart from the actual member values.';
 }
 refresh();return {update:refresh,destroy(){panel.remove();}};
}
