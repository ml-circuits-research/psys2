import {mountInspectorSplitter} from '../pane-splitter.mjs';
// The Documents tab: a native document editor over the docs.editor SOP area projection (worlds/docs.editor/area.sop).
// The document is read from the projection (the observed document, its blocks in order, their text containers, list
// items, table cells and marks, and their inputs); every edit, selection and reorder sends a declared docs.editor
// command through host.tool, the same route as chat. Choice lists (block types, heading levels, alignments, list
// styles, marks) come from the declared interface (host.tools).
const WORLD='docs.editor',VIEW='editor';
const el=(tag,attrs={},text)=>{const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else if(k in e)e[k]=v;else e.setAttribute(k,v);}if(text!==undefined)e.textContent=text;return e;};
const CSS=`.nd-editor{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--ink,#243047);background:var(--surface-2,#eef1f6);font:14px system-ui}.nd-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--line,#ccd2dd);background:var(--surface,#fff)}.nd-toolbar button,.nd-inspector button{font:inherit;border:1px solid #94a0b655;border-radius:5px;padding:5px 8px;background:var(--surface,#fff);color:inherit;cursor:pointer}.nd-toolbar .nd-sep{width:1px;align-self:stretch;background:#94a0b644;margin:0 2px}.nd-toolbar input[type=color]{width:30px;height:28px;padding:1px;border:1px solid #94a0b655;border-radius:5px;background:var(--surface,#fff)}.nd-toolbar .nd-count{margin-left:auto;font-size:12px;color:var(--muted,#687489)}.nd-toolbar select,.nd-inspector select,.nd-inspector input{font:inherit;border:1px solid #94a0b655;border-radius:5px;padding:6px;background:var(--surface,#fff);color:inherit;max-width:100%;box-sizing:border-box}.nd-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 245px}.nd-page{min-width:0;overflow:auto;background:var(--surface,#fff);padding:12px 18px;box-sizing:border-box}.nd-inspector{min-width:0;overflow:auto;padding:12px;border-left:1px solid var(--line,#ccd2dd);display:flex;flex-direction:column;gap:12px}.nd-inspector label{display:flex;flex-direction:column;gap:5px;font-size:12px}.nd-title{border:0;border-bottom:1px solid #97a4bb44;background:none;color:inherit;font:600 26px system-ui;width:100%;box-sizing:border-box;padding:6px 0 12px;margin-bottom:10px}.nd-block{position:relative;border:1px solid transparent;border-radius:5px;padding:6px 8px;margin:3px 0;min-height:28px;outline:none}.nd-block.selected{border-color:#7294dd;background:#7294dd08}.nd-block:focus-visible{outline:2px solid #7294dd}.nd-block.drop{border-top:3px solid #527bce}.nd-block.drop-after{border-bottom:3px solid #527bce}.nd-block.dragging{opacity:.5}.nd-block-header{display:flex;gap:8px;align-items:center;justify-content:space-between;font:11px system-ui;color:var(--muted,#687489);margin-bottom:5px}.nd-handle{cursor:grab;border:0;background:none;color:inherit;font:inherit;touch-action:none;user-select:none}.nd-preview{font:16px/1.6 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;min-height:24px}.nd-preview blockquote{margin:0;padding-left:12px;border-left:3px solid #94a0b677}.nd-quote{padding-left:12px;border-left:3px solid #94a0b677;font-style:italic}.nd-preview table{border-collapse:collapse;width:100%;table-layout:fixed}.nd-preview td,.nd-preview th{border:1px solid #94a0b666;padding:5px;overflow-wrap:anywhere;white-space:pre-wrap}.nd-preview ul,.nd-preview ol{margin:0;padding-left:24px}.nd-preview li.nd-task{list-style:none;display:flex;gap:8px;align-items:baseline;margin-left:-20px}.nd-preview li.nd-task>.nd-preview{flex:1}.nd-preview code{background:#7a8bab22;padding:1px 4px}.nd-edit{width:100%;box-sizing:border-box;min-height:80px;resize:vertical;font:16px/1.6 Georgia,serif;border:1px solid #8ba1c777;border-radius:5px;padding:6px;background:var(--surface,#fff);color:inherit}.nd-note,.nd-status{font-size:12px;color:var(--muted,#687489);line-height:1.5}.nd-status{padding:5px 10px;min-height:20px;border-top:1px solid var(--line,#ccd2dd)}.nd-outline{display:flex;flex-direction:column;gap:5px;border-bottom:1px solid #94a0b644;padding-bottom:12px}.nd-outline button{overflow-wrap:anywhere;max-width:100%}.nd-inspector h3{font-size:14px;margin:0}.nd-inspector .nd-actions{display:flex;gap:6px;flex-wrap:wrap}.nd-empty{padding:24px 0;color:var(--muted,#687489)}.nd-selection{font-size:12px;min-width:0;overflow-wrap:anywhere}.nd-content-form form{display:flex;flex-direction:column;gap:10px}.nd-content-form textarea{min-height:180px;font:13px/1.5 monospace}@media(max-width:650px){.nd-body{grid-template-columns:minmax(0,1fr) 190px}.nd-page{padding:8px}.nd-inspector{padding:8px}}@media(max-width:480px){.nd-body{grid-template-columns:1fr;grid-template-rows:minmax(200px,1fr) auto}.nd-inspector{max-height:220px;border-left:0;border-top:1px solid var(--line,#ccd2dd)}}`;
// Presentation only: the toolbar face of each declared mark.
const MARK_FACE={bold:'B',italic:'I',underline:'U',strike:'S',code:'Code',highlight:'Highlight',link:'Link'};
const num=v=>v===undefined||v===null||v===''?undefined:Number(v);
/**
 * The document a projection observes: the document (options.document), its blocks (options.block) in order with their
 * observed form, alignment, parent, section-ness (an object whose source type is a section) and inputs, their text
 * containers (a block's text at "0", list items at "i", table cells at "r:c", each with its own id) and their marks.
 */
export function documentOf(projection){
 const objects=projection?.objects??[],inputs=projection?.inputs??{},byId=new Map(objects.map(o=>[o.id,o]));
 const textId=projection?.options?.document?.[0]??null,doc=textId?byId.get(textId):null;
 const blocks=(projection?.options?.block??[]).map(id=>byId.get(id)).filter(Boolean).sort((a,b)=>num(a.index)-num(b.index)).map(o=>{
  const own=inputs[o.id]??{},texts=objects.filter(t=>t.in===o.id&&t.at!==undefined&&t.text!==undefined&&t.from===undefined);
  const containers=Object.fromEntries(texts.map(t=>[t.at,t.id]));
  const b={id:o.id,kind:o.form??o.kind,section:String(o.sourceType??'').endsWith('.section'),sourceType:o.sourceType,parent:o.in,align:o.align??'left',name:own.name,level:num(own.level),style:own.style,header:own.header,containers,
   marks:objects.filter(m=>m.in===o.id&&m.from!==undefined&&m.to!==undefined).map(m=>({type:m.form,from:Number(m.from),to:Number(m.to),at:m.at??'0',attrs:{...(inputs[m.id]?.colour?{color:inputs[m.id].colour}:{}),...(inputs[m.id]?.href?{href:inputs[m.id].href}:{})}}))};
  if(b.kind==='list'){const items=texts.filter(t=>/^\d+$/.test(t.at)).sort((x,y)=>Number(x.at)-Number(y.at));b.items=items.map(t=>t.text);b.checked=items.map(t=>inputs[t.id]?.checked===true);}
  else if(b.kind==='table'){b.rows=[];for(const t of texts){const [r,c]=String(t.at).split(':').map(Number);if(Number.isInteger(r)&&Number.isInteger(c))(b.rows[r]??=[])[c]=t.text;}b.rows=[...b.rows].map(row=>[...(row??[])].map(v=>v??''));}
  else b.text=texts.find(t=>t.at==='0')?.text??own.text??'';
  return b;
 });
 return {pending:!!projection?.pending,textId,title:doc?.title??'',length:num(inputs[textId]?.length),blocks,selected:projection?.selected??projection?.runtime?.view?.selected??null};
}
function inline(parent,text,marks=[],at='0'){
 const relevant=marks.filter(m=>m.at===at),cuts=[...new Set([0,text.length,...relevant.flatMap(m=>[m.from,m.to])])].filter(n=>n>=0&&n<=text.length).sort((a,b)=>a-b);
 for(let i=1;i<cuts.length;i++){const from=cuts[i-1],to=cuts[i];let node=document.createTextNode(text.slice(from,to));for(const mark of relevant.filter(m=>m.from<=from&&m.to>=to)){const tag={bold:'strong',italic:'em',underline:'u',strike:'s',code:'code',highlight:'mark',link:'a'}[mark.type];if(!tag)continue;const wrap=el(tag);if(tag==='mark'&&/^#[a-f0-9]{6}$/i.test(mark.attrs?.color??''))wrap.style.background=mark.attrs.color;if(tag==='a'&&/^(https?:|mailto:|#)/i.test(mark.attrs?.href??'')){wrap.href=mark.attrs.href;wrap.rel='noopener';wrap.target='_blank';}wrap.append(node);node=wrap;}parent.append(node);}
}
function make(holder,host){
 if(!document.getElementById('native-document-css'))document.head.append(el('style',{id:'native-document-css'},CSS));
 Object.assign(holder.style,{padding:'0',height:'100%',minHeight:'0',maxWidth:'none',overflow:'hidden',boxSizing:'border-box'});
 const root=el('section',{class:'nd-editor','aria-label':'Document editor'}),bar=el('div',{class:'nd-toolbar',role:'toolbar','aria-label':'Document tools'}),body=el('div',{class:'nd-body'}),page=el('div',{class:'nd-page'}),inspector=el('aside',{class:'nd-inspector','aria-label':'Block inspector'}),status=el('div',{class:'nd-status',role:'status','aria-live':'polite'}),dock=el('section',{class:'nd-content-form'});holder.append(root);root.append(bar,body,status);body.append(page,inspector);const closeInspectorSplitter=mountInspectorSplitter(body,inspector,{id:'editor',width:245,persist:host.persistent!==false});
 let projection=host.state?.(WORLD)??{},state=documentOf(projection),selected=state.selected,seen=state.selected,editing=null,range=null,drag=null,suppressClick=false,pending=false,saving=null,destroyed=false,operations=[],highlight='#fff2a8';
 // The declared interface: enums and limits for the inspector's choices.
 Promise.resolve(host.tools?.({view:VIEW})).then(r=>{operations=r?.operations??[];if(!destroyed&&!editing)render();}).catch(()=>{});
 const param=(operation,name)=>operations.find(o=>o.id===operation)?.params?.[name];
 const choices=(operation,name)=>param(operation,name)?.enum??[];
 const levels=operation=>{const p=param(operation,'level');if(!Number.isInteger(p?.min)||!Number.isInteger(p?.max))return [];return Array.from({length:p.max-p.min+1},(_,i)=>p.min+i);};
 const button=(text,action,attrs={})=>{const b=el('button',{type:'button',...attrs},text);b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',action);return b;};
 const block=()=>state.blocks.find(b=>b.id===selected);
 // A section's heading has its own declared operations (document.section.*); every other block uses document.block.*.
 const prefix=b=>b?.section?'document.section':'document.block';
 const blockById=id=>state.blocks.find(b=>b.id===id);
 const textOf=(b,at)=>b?.kind==='list'?b.items?.[Number(at)]:b?.kind==='table'?b.rows?.[Number(String(at).split(':')[0])]?.[Number(String(at).split(':')[1])]:b?.text;
 async function tool(operation,args){if(pending||host.isBusy?.())return {ok:false,message:'Please wait for the current action.'};pending=true;root.setAttribute('aria-busy','true');try{const r=await host.tool(operation,args,{view:VIEW});status.textContent=r?.message??(r?.ok?'Saved.':'Could not save.');return r??{ok:false};}catch(error){status.textContent=error.message;return {ok:false,message:error.message};}finally{pending=false;root.removeAttribute('aria-busy');}}
 async function ensureDocument(){if(state.textId)return true;return (await tool('document.write',{title:'Untitled document',blocks:[]})).ok;}
 async function saveEditing(){if(saving)return saving;if(!editing)return true;const current=editing,text=current.input.value;editing=null;const b=blockById(current.id),cid=b?.containers?.[current.at];if(text===textOf(b,current.at)||!cid)return true;saving=tool('document.container.change',{id:cid,text}).then(r=>r.ok);try{return await saving;}finally{saving=null;}}
 // The block a command made: the one the projection observes now and did not before.
 const madeSince=before=>state.blocks.find(b=>!before.has(b.id))?.id??null;
 async function add(kind){
  if(!await saveEditing()||!await ensureDocument())return;
  if(kind==='list'){showContentDialog('Add list','One item per line',text=>tool('document.list.make',{parent:state.textId,style:choices('document.list.make','style')[0]??'bullet',items:text.split('\n')}));return;}
  if(kind==='table'){showContentDialog('Add table','Separate cells with tabs (or |); one row per line',text=>tool('document.table.make',{parent:state.textId,rows:text.split('\n').map(row=>row.split(/\t|\|/).map(c=>c.trim())),header:true}));return;}
  const before=new Set(state.blocks.map(b=>b.id)),level=kind==='heading'?levels('document.block.make')[0]:undefined;
  const r=await tool('document.block.make',{parent:state.textId,kind,text:'',...(level!==undefined?{level}:{})});if(r.ok){selected=madeSince(before)??selected;render();beginEdit(selected,'0');}
 }
 // The chapter a block lies in: the block itself or the nearest observed parent that is a section of the top level.
 function chapterOf(b){const topLevel=levels('document.section.make')[0];let at=b;for(let depth=0;depth<1000;depth++){if(!at)return null;if(at.section&&at.level===topLevel)return at;at=blockById(at.parent);}return null;}
 const within=(b,ancestor)=>{let at=b;for(let depth=0;depth<1000;depth++){if(!at)return false;if(at.id===ancestor.id)return true;at=blockById(at.parent);}return false;};
 async function addSection(level){
  if(!await saveEditing()||!await ensureDocument())return;
  // A subsection goes to the end of the chapter of the selected block (its last observed member).
  let after;const chapter=level!==(levels('document.section.make')[0])&&block()?chapterOf(block()):null;
  if(chapter)after=state.blocks.filter(b=>within(b,chapter)).at(-1)?.id;
  const before=new Set(state.blocks.map(b=>b.id)),r=await tool('document.section.make',{parent:state.textId,text:'',level,...(after?{after}:{})});if(r.ok){selected=madeSince(before)??selected;render();beginEdit(selected,'0');}
 }
 function outline(){const nav=el('nav',{'aria-label':'Document outline',class:'nd-outline'});nav.append(el('h3',{},'Outline'));const headings=state.blocks.filter(b=>b.section),topLevel=levels('document.section.make')[0];if(!headings.length)nav.append(el('p',{class:'nd-note'},'Add chapters and subchapters to structure the document.'));for(const heading of headings){const sub=heading.level!==topLevel,item=button((sub?'↳ ':'')+(heading.text||heading.name||(sub?'Untitled subchapter':'Untitled chapter')),async()=>{await choose(heading.id);page.querySelector('[data-block="'+globalThis.CSS.escape(heading.id)+'"]')?.scrollIntoView({block:'nearest'});},{'aria-label':'Go to '+(heading.text||heading.name||'section')});item.style.textAlign='left';item.style.marginLeft=sub?'12px':'0';nav.append(item);}return nav;}
 function showContentDialog(title,label,save,value='',single=false){
  dock.replaceChildren();const form=el('form'),field=el('label',{},label),input=single?el('input',{'aria-label':label,value,type:'text'}):el('textarea',{'aria-label':label,value,class:'nd-edit'}),message=el('p',{class:'nd-note'});field.append(input);form.append(el('h3',{},title),field,button('Cancel',()=>{dock.remove();paintInspector();}),el('button',{type:'submit'},'Save'),message);form.addEventListener('submit',async event=>{event.preventDefault();const r=await save(input.value);if(r?.ok){dock.remove();paintInspector();}else message.textContent=r?.message??'';});dock.append(form);inspector.replaceChildren(dock);input.focus();
 }
 async function reorder(id,offset=null,beforeId=null,after=false){if(!await saveEditing())return;const ids=state.blocks.map(b=>b.id),from=ids.indexOf(id);if(from<0)return;const value=ids.splice(from,1)[0],to=beforeId!==null?ids.indexOf(beforeId)+(after?1:0):Math.max(0,Math.min(ids.length,from+offset));if(to<0)return;ids.splice(to,0,value);if(ids.every((x,i)=>x===state.blocks[i].id))return;await tool('document.block.reorder',{ids});}
 async function choose(id){if(selected===id)return;await saveEditing();selected=id;range=null;render();const b=block();if(b)await tool(prefix(b)+'.select',{id,at:'0',from:0,to:0});}
 function beginEdit(id,at='0'){
  const b=blockById(id),box=page.querySelector(`[data-block="${globalThis.CSS.escape(id??'')}"] [data-at="${globalThis.CSS.escape(at)}"]`);if(!b||!box)return;
  const value=textOf(b,at);if(typeof value!=='string')return;
  selected=id;const input=el('textarea',{class:'nd-edit',value,'aria-label':'Edit '+(b.name||b.kind)+' text'});box.replaceChildren(input);editing={id,at,input};input.style.height=Math.min(400,Math.max(80,input.scrollHeight))+'px';input.focus();
  const select=()=>{range={id,at,from:input.selectionStart,to:input.selectionEnd};paintInspector();};input.addEventListener('select',select);input.addEventListener('keyup',select);input.addEventListener('mouseup',select);input.addEventListener('blur',()=>{saveEditing().then(()=>render());});input.addEventListener('keydown',event=>{if(event.key==='Escape'){editing=null;render();}else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();saveEditing().then(()=>render());}});
 }
 async function format(mark,enabled=true,attrs){const selection=range&&{...range};if(!selection||selection.to<=selection.from){status.textContent='Select some words in the text editor first.';return;}if(!await saveEditing())return;selected=selection.id;const b=block();await tool(prefix(b)+'.mark',{...selection,mark,enabled,...(attrs?{attrs}:{})});}
 function formatLink(){const selection=range&&{...range};if(!selection||selection.to<=selection.from){status.textContent='Select some words in the text editor first.';return;}saveEditing().then(ok=>{if(!ok)return;render();range=selection;showContentDialog('Link','Address (https://…, mailto:… or #…)',href=>{const b=blockById(selection.id);return tool(prefix(b)+'.mark',{...selection,mark:'link',enabled:true,attrs:{href:href.trim()}});},'https://',true);});}
 function paintInspector(){
  if(dock.isConnected)return;inspector.replaceChildren(outline());const b=block();inspector.append(el('h3',{},b?'Selected block':'Document'));
  if(!b){inspector.append(el('p',{class:'nd-note'},'Click a block to select it. Double-click text to edit. Drag the handle to reorder, or use Alt + ↑ / ↓.'));return;}
  const p=prefix(b),label=el('label',{},'Label'),name=el('input',{value:b.name??'','aria-label':'Block label'});label.append(name);name.addEventListener('change',async()=>{const value=name.value;if(await saveEditing())await tool(p+'.change',{id:b.id,name:value});});inspector.append(label);
  if(['paragraph','heading','quote'].includes(b.kind)){
   const kinds=choices(p+'.change','kind');if(kinds.length){const kindLabel=el('label',{},'Block type'),kind=el('select',{'aria-label':'Block type'});for(const value of kinds)kind.append(el('option',{value},value));kind.value=b.kind;kindLabel.append(kind);kind.addEventListener('change',()=>tool(p+'.change',{id:b.id,kind:kind.value,...(kind.value==='heading'&&b.kind!=='heading'?{level:b.level??levels(p+'.change')[0]}:{})}));inspector.append(kindLabel);}
   const allowed=levels(p+'.change');if(b.kind==='heading'&&allowed.length){const levelLabel=el('label',{},'Heading level'),level=el('select',{'aria-label':'Heading level'});for(const n of allowed)level.append(el('option',{value:String(n)},String(n)));level.value=String(b.level??allowed[0]);levelLabel.append(level);level.addEventListener('change',()=>tool(p+'.change',{id:b.id,level:Number(level.value)}));inspector.append(levelLabel);}
  }
  const aligns=choices(p+'.align','align');if(aligns.length){const alignLabel=el('label',{},'Alignment'),align=el('select',{'aria-label':'Alignment'});for(const value of aligns)align.append(el('option',{value},value));align.value=b.align??aligns[0];align.addEventListener('change',()=>tool(p+'.align',{id:b.id,align:align.value}));alignLabel.append(align);inspector.append(alignLabel);}
  const actions=el('div',{class:'nd-actions'});actions.append(button('↑ Move up',()=>reorder(b.id,-1)),button('↓ Move down',()=>reorder(b.id,1)),button(b.section?'Delete section':'Delete block',async()=>{if(await saveEditing()){const r=await tool(p+'.remove',{ids:[b.id]});if(r.ok){selected=null;render();}}}));inspector.append(actions);
  if(['paragraph','heading','quote'].includes(b.kind))inspector.append(button('Edit text',()=>beginEdit(b.id)));
  if(b.kind==='list'){const styles=choices('document.list.change','style');if(styles.length){const styleLabel=el('label',{},'List style'),style=el('select',{'aria-label':'List style'});for(const value of styles)style.append(el('option',{value},value));style.value=b.style??styles[0];style.addEventListener('change',()=>tool('document.list.change',{id:b.id,style:style.value}));styleLabel.append(style);inspector.append(styleLabel);}inspector.append(button('Edit list items',()=>showContentDialog('List items','One item per line',text=>tool('document.list.change',{id:b.id,items:text.split('\n')}),(b.items??[]).join('\n'))));}
  if(b.kind==='table'){const header=el('label',{},'Header row'),check=el('input',{type:'checkbox',checked:b.header!==false,'aria-label':'Header row'});header.style.flexDirection='row';header.style.alignItems='center';header.prepend(check);check.addEventListener('change',()=>tool('document.table.change',{id:b.id,header:check.checked}));inspector.append(header,button('Edit table cells',()=>showContentDialog('Table cells','Separate cells with tabs (or |); one row per line',text=>tool('document.table.change',{id:b.id,rows:text.split('\n').map(row=>row.split(/\t|\|/).map(c=>c.trim()))}),(b.rows??[]).map(row=>row.join('\t')).join('\n'))));}
  inspector.append(el('div',{class:'nd-selection'},range&&range.id===b.id?`Selected characters ${range.from}–${range.to}`:'Select words while editing to format a range.'));
 }
 // Reordering by dragging a block's handle (mouse, pen or touch): the drop goes before or after the block under the pointer.
 function rowAt(x,y){return document.elementFromPoint(x,y)?.closest?.('.nd-block[data-block]')??null;}
 function onPointerMove(e){if(!drag||e.pointerId!==drag.pointer)return;if(!drag.moving&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;if(!drag.moving){drag.moving=true;drag.row.classList.add('dragging');try{drag.handle.setPointerCapture(e.pointerId);}catch{}}e.preventDefault();const row=rowAt(e.clientX,e.clientY),box=row?.getBoundingClientRect(),after=!!box&&e.clientY>box.top+box.height/2;if(row!==drag.over||after!==drag.after){drag.over?.classList.remove('drop','drop-after');drag.over=row;drag.after=after;if(row&&row!==drag.row)row.classList.add(after?'drop-after':'drop');}}
 function onPointerEnd(e){if(!drag||e.pointerId!==drag.pointer)return;const {id,row,moving,over,after}=drag;drag=null;row.classList.remove('dragging');over?.classList.remove('drop','drop-after');if(!moving)return;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);if(e.type==='pointerup'&&over&&over.dataset.block!==id)reorder(id,null,over.dataset.block,after);}
 const listeners=[['pointermove',onPointerMove],['pointerup',onPointerEnd],['pointercancel',onPointerEnd]];for(const [type,listener]of listeners)window.addEventListener(type,listener,true);
 function toolbar(){
  bar.replaceChildren();const sectionLevels=levels('document.section.make');
  bar.append(button('New document',async()=>{if(await saveEditing()){const r=await tool('document.write',{title:'Untitled document',blocks:[]});if(r.ok){selected=null;render();}}},{title:'Start a new, empty document'}));
  bar.append(button('+ Chapter',()=>addSection(sectionLevels[0]??1)),button('+ Subchapter',()=>addSection(sectionLevels[1]??sectionLevels[0]??2)),button('+ Paragraph',()=>add('paragraph')),button('+ Heading',()=>add('heading')),button('+ Quote',()=>add('quote')),button('+ List',()=>add('list')),button('+ Table',()=>add('table')),el('span',{class:'nd-sep','aria-hidden':'true'}));
  const marks=choices('document.block.mark','mark');
  for(const mark of marks){if(mark==='link'){bar.append(button(MARK_FACE.link,formatLink,{title:'Link the selected words','aria-label':'Apply link'}));continue;}bar.append(button(MARK_FACE[mark]??mark,()=>format(mark,true,mark==='highlight'?{color:highlight}:undefined),{title:'Apply '+mark,'aria-label':'Apply '+mark}));if(mark==='highlight'){const colour=el('input',{type:'color',value:highlight,'aria-label':'Highlight colour',title:'Highlight colour'});colour.addEventListener('input',()=>{highlight=colour.value;});colour.addEventListener('mousedown',e=>e.stopPropagation());bar.append(colour);}}
  if(marks.length)bar.append(button('Clear format',async()=>{for(const mark of marks)await format(mark,false);}));
  bar.append(el('span',{class:'nd-sep','aria-hidden':'true'}),button('Clear document',async()=>{if(await saveEditing()&&state.blocks.length){const r=await tool('document.block.remove',{ids:state.blocks.map(b=>b.id)});if(r.ok){selected=null;render();}}}),button('Undo',()=>tool('document.undo',{})),button('Redo',()=>tool('document.redo',{})));
  if(Number.isFinite(state.length))bar.append(el('span',{class:'nd-count'},`${state.length} ${state.length===1?'word':'words'}`));
 }
 function render(){
  if(destroyed)return;inspector.dataset.selectedNativeIds=JSON.stringify(selected?[selected]:[]);page.replaceChildren();toolbar();
  if(state.pending){page.append(el('p',{class:'nd-empty'},'Loading the document…'));inspector.replaceChildren();return;}
  const title=el('input',{class:'nd-title',value:state.title??'',placeholder:'Untitled document','aria-label':'Document title'});title.addEventListener('change',async()=>{if(state.textId)await tool('document.title.change',{id:state.textId,title:title.value});else await tool('document.write',{title:title.value,blocks:[]});});page.append(title);
  if(!state.blocks.length)page.append(el('p',{class:'nd-empty'},'Start with a paragraph, heading, list or table. Type your own content; every saved edit is recorded as a command.'));
  for(const b of state.blocks){
   const row=el('section',{class:'nd-block'+(b.id===selected?' selected':''),tabIndex:0,'data-block':b.id,'aria-label':(b.name||b.kind)+' block'}),head=el('div',{class:'nd-block-header'}),handle=button('⋮⋮ '+(b.name||b.kind),()=>{if(!suppressClick)choose(b.id);},{class:'nd-handle',title:'Drag to reorder'});head.append(handle,el('span',{},b.name?b.kind:b.section?'section':''));row.append(head);
   handle.addEventListener('pointerdown',e=>{if(e.button!==0||pending)return;drag={id:b.id,row,handle,pointer:e.pointerId,x:e.clientX,y:e.clientY,moving:false,over:null,after:false};});
   row.addEventListener('click',event=>{if(!event.target.closest('textarea,input,button,a'))choose(b.id);});row.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();reorder(b.id,event.key==='ArrowUp'?-1:1);}});
   const textBox=(at,text,parent)=>{const box=el('div',{class:'nd-preview'+(b.kind==='quote'?' nd-quote':''),'data-at':at});box.style.textAlign=b.align??'left';if(b.kind==='heading'){box.style.fontSize=(28-(b.level??2)*2)+'px';box.style.fontWeight='600';}inline(box,text??'',b.marks??[],at);box.addEventListener('dblclick',event=>{event.stopPropagation();beginEdit(b.id,at);});parent.append(box);};
   if(b.kind==='list'){const list=el(b.style==='numbered'?'ol':'ul',{class:'nd-preview'});for(const [i,text]of(b.items??[]).entries()){const item=el('li');if(b.style==='task'){item.className='nd-task';const check=el('input',{type:'checkbox',checked:!!b.checked?.[i],'aria-label':'Complete '+text});check.addEventListener('change',()=>{const checked=b.items.map((_,j)=>j===i?check.checked:!!b.checked?.[j]);tool('document.list.change',{id:b.id,checked});});item.append(check);}textBox(String(i),text,item);list.append(item);}row.append(list);}
   else if(b.kind==='table'){const table=el('table',{class:'nd-preview'});for(const [ri,values]of(b.rows??[]).entries()){const tr=el('tr');for(const [ci,text]of values.entries()){const cell=el(ri===0&&b.header!==false?'th':'td');textBox(`${ri}:${ci}`,text,cell);tr.append(cell);}table.append(tr);}row.append(table);}
   else textBox('0',b.text??'',row);
   page.append(row);
  }
  if(selected&&!state.blocks.some(b=>b.id===selected))selected=null;paintInspector();
 }
 render();
 return {
  update(next){projection=next??projection;state=documentOf(projection);if(state.selected!==seen){seen=state.selected;if(state.selected)selected=state.selected;}if(!editing)render();},
  show(){if(!editing)render();},hide(){},setVisible(){if(!editing)render();},
  destroy(){destroyed=true;for(const [type,listener]of listeners)window.removeEventListener(type,listener,true);closeInspectorSplitter();root.remove();},
 };
}
export default {id:'editor',label:'Documents',world:WORLD,order:20,make};
