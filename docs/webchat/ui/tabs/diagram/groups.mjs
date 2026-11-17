// Group IDs stay stable; labels and layouts are editable native properties.
export function makeGroupTools(holder,{tool,asset,getState,tools}={}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},panel=el('section');panel.className='dg-chart-tools';const heading=el('h3','Group properties'),form=el('div');form.className='dg-chart-form';panel.append(heading,form);holder.prepend(panel);
 const field=(label,tag='input')=>{const wrap=el('label',label),input=el(tag);input.setAttribute('aria-label',label);wrap.append(input);form.append(wrap);return input;},button=(text,fn)=>{const button=el('button',text);button.type='button';button.className='dg-btn';button.addEventListener('click',fn);form.append(button);return button;};
 const objectId=field('Group Object ID');objectId.readOnly=true;const label=field('Group label'),layout=field('Group layout','select'),colour=field('Group colour','select'),size=field('Group size','select'),x=field('Group X'),y=field('Group Y');x.type=y.type='number';x.step=y.step='any';
 const scale=field('Scale group');scale.type='number';scale.min='.05';scale.max='20';scale.step='.1';scale.value='1';
 const current=()=>getState()?.groups?.find(group=>group.name===getState()?.selected?.group),nextId=()=>{const state=getState(),taken=new Set([...(state.shapes??[]).map(node=>node.name),...(state.edges??[]).map(edge=>edge.id),...(state.groups??[]).map(group=>group.name),...(state.chartTools?.charts??[]).map(chart=>chart.id)]);for(let n=1;n<=10000;n++)if(!taken.has('g'+n))return 'g'+n;return null;};
 const create=button('Group selected',()=>{const state=getState(),name=nextId();if(name)tool('diagram.group.make',{name,label:label.value.trim()||'Group',ids:[...(state.selected?.shapes??[])]});});
 label.addEventListener('change',()=>{const group=current();if(group)tool('diagram.group.change',{id:group.name,label:label.value});});
 for(const [input,key]of [[colour,'colour'],[size,'size']])input.addEventListener('change',()=>{const group=current();if(group&&input.value)tool('diagram.group.change',{id:group.name,[key]:input.value});});
 layout.addEventListener('change',()=>{const group=current();if(group)tool('diagram.group.layout',{id:group.name,layout:layout.value});});
 for(const input of [x,y])input.addEventListener('change',()=>{const group=current();if(group)tool('diagram.group.place',{id:group.name,x:Number(x.value),y:Number(y.value)});});
 scale.addEventListener('change',()=>{const group=current();if(group&&Number(scale.value)>0)tool('diagram.group.resize',{id:group.name,scale:Number(scale.value)});});
 const ungroup=button('Ungroup',()=>{const group=current();if(group)tool('diagram.group.ungroup',{id:group.name});}),remove=button('Delete group',()=>{});remove.addEventListener('click',()=>{const group=current();if(group)tool('diagram.group.remove',{id:group.name});});
 const members=el('div');members.className='dg-group-members';form.append(members);let loaded=false,lastGroup=null;
 const options=(input,values)=>{input.replaceChildren();for(const value of values){const option=el('option',value);option.value=value;input.append(option);}};
 (async()=>{let declarations=typeof tools==='function'?await tools():null;if(!declarations){const module=await import(asset('worlds/diagram.sketch/declared-host.mjs'));declarations=(await module.createDiagramHost({state:module.initialDiagramState(),instanceId:'group-controls'})).bindings();}declarations=Array.isArray(declarations)?declarations:declarations.operations??declarations.bindings??[];for(const [input,operation,key]of [[layout,'diagram.group.layout','layout'],[colour,'diagram.group.change','colour'],[size,'diagram.group.change','size']])options(input,key==='layout'?(declarations.find(item=>item.id===operation)?.params[key]?.enum??[]):['',...(declarations.find(item=>item.id===operation)?.params[key]?.enum??[])]);loaded=true;refresh();})().catch(()=>{});
 function refresh(){
  const state=getState()??{},group=current(),ids=state.selected?.shapes??[];panel.hidden=!group&&ids.length<2;if(panel.hidden)return;
  if(lastGroup!==(group?.name??null)){if(!group)label.value='';lastGroup=group?.name??null;}heading.textContent=group?'Group properties':ids.length+' selected objects';objectId.value=group?.name??nextId()??'';create.hidden=!!group;create.disabled=!!group||ids.length<2;
  for(const input of [layout,colour,size,x,y,scale,ungroup,remove]){(input.closest('label')??input).hidden=!group;input.disabled=!group||!loaded;}
  if(group){scale.value='1';label.value=group.label??'';layout.value=group.layout??'free';const nodes=group.members.map(id=>state.shapes.find(node=>node.name===id)).filter(Boolean);x.value=nodes.reduce((sum,node)=>sum+node.x/nodes.length,0);y.value=nodes.reduce((sum,node)=>sum+node.y/nodes.length,0);}
  members.replaceChildren();if(group)for(const id of group.members){const node=state.shapes.find(node=>node.name===id),button=el('button',(node?.label?node.label+' · ':'')+id);button.type='button';button.className='dg-btn';button.addEventListener('click',()=>tool('diagram.node.select',{ids:[id]}));members.append(button);}
 }
 refresh();return {update:refresh,destroy(){panel.remove();}};
}
