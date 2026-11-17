// Read-only views of the worker's actual instance archive and object facts.
import {h} from './util.mjs';

const STYLE_ID='p2-world-code-style';
function styles(){
 if(document.getElementById(STYLE_ID))return;
 const style=h('style',{id:STYLE_ID,text:`
.p2-world-code,.p2-object-code{box-sizing:border-box;min-width:0;color:inherit;font:inherit}
.p2-world-code{height:100%;min-height:240px;display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto}
.p2-object-code{padding:10px;border-top:1px solid #8884;overflow-wrap:anywhere}
.p2-world-code header,.p2-object-code header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.p2-world-code h3,.p2-object-code h3,.p2-object-code h4{font-size:inherit;margin:0}
.p2-world-code p,.p2-object-code p{margin:6px 0;font-size:12px}
.p2-world-code .p2-world-code-actions,.p2-object-code .p2-object-code-actions{display:flex;gap:6px;flex-wrap:wrap}
.p2-world-code button,.p2-object-code button{font:inherit;font-size:12px;padding:5px 9px;cursor:pointer}
.p2-world-code button:disabled,.p2-object-code button:disabled{cursor:default;opacity:.55}
.p2-world-code dl,.p2-object-code dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 10px;font-size:12px;margin:4px 0}
.p2-world-code dt,.p2-object-code dt{opacity:.7}
.p2-world-code dd,.p2-object-code dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.p2-world-code pre,.p2-object-code pre{box-sizing:border-box;max-width:100%;margin:0;padding:10px;white-space:pre;overflow:auto;tab-size:2;background:#8881;border:1px solid #8883;border-radius:5px;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
.p2-world-code>.p2-world-code-wires{flex:1;min-height:160px}
.p2-object-code pre{max-height:380px}
.p2-world-code details,.p2-object-code details{margin:7px 0;min-width:0}
.p2-world-code summary,.p2-object-code summary{cursor:pointer;font-size:12px;padding:3px 0}
.p2-world-code [role=alert],.p2-object-code [role=alert]{color:#b33a36}
.p2-world-code-status,.p2-object-code-status{min-height:1.5em;font-size:12px;white-space:pre-wrap}
.p2-object-code article{padding:10px 0;border-bottom:1px solid #8883}
`});
 document.head.append(style);
}
const errorText=error=>error instanceof Error?error.message:String(error);
const supplied=value=>value===undefined?'Not supplied':typeof value==='string'?value:JSON.stringify(value,null,2);
function identity(rows){return h('dl',{},rows.flatMap(([label,value])=>[h('dt',{text:label}),h('dd',{text:supplied(value)})]));}
function details(label,value,{open=false,code=false}={}){
 return h('details',{open},h('summary',{text:label}),h('pre',{text:code?value:supplied(value)}));
}
function inspection(data,world){
 if(!data||typeof data!=='object'||typeof data.world!=='string'||typeof data.wires!=='string'||!Array.isArray(data.objects))throw Error('Invalid instance inspection: expected world, SOP wires and objects.');
 if(world!==undefined&&data.world!==world)throw Error(`Inspection returned world ${data.world}; expected ${world}.`);
 return data;
}
function panelState(prefix,{load,copy}={}){
 if(typeof load!=='function')throw TypeError('Instance inspection loader is required.');
 if(copy!==undefined&&typeof copy!=='function')throw TypeError('SOP copy handler must be a function.');
 styles();
 const abort=new AbortController(),element=h('section',{class:prefix}),status=h('div',{class:prefix+'-status',role:'status','aria-live':'polite'});
 let generation=0,destroyed=false;
 const current=token=>!destroyed&&token===generation;
 const message=(text,error=false)=>{status.textContent=text;status.setAttribute('role',error?'alert':'status');};
 const on=(node,event,handler)=>node.addEventListener(event,handler,{signal:abort.signal});
 const button=(label,handler)=>{const node=h('button',{type:'button',text:label});on(node,'click',handler);return node;};
 const copyButton=(label,wires,token)=>button(label,async event=>{
  const node=event.currentTarget;if(!current(token))return;
  node.disabled=true;
  try{
   if(copy){const result=await copy(wires);if(result?.ok===false)throw Error(result.detail??'Clipboard access was refused.');}
   else{
    if(typeof navigator.clipboard?.writeText!=='function')throw Error('Clipboard access is unavailable.');
    await navigator.clipboard.writeText(wires);
   }
   if(current(token))message('Copied SOP.');
  }catch(error){if(current(token))message('Could not copy SOP: '+errorText(error),true);}
  finally{if(current(token))node.disabled=false;}
 });
 return {element,status,load,button,copyButton,message,current,
  begin(){const token=++generation;element.setAttribute('aria-busy','true');message('Loading instance SOP…');return token;},
  finish(token){if(current(token))element.setAttribute('aria-busy','false');},
  destroy(){destroyed=true;generation++;abort.abort();element.remove();},
  get destroyed(){return destroyed;}
 };
}

/** Shows the unmodified archive, including facts, renderer projection and history. */
export function createWorldCodePanel({world,load,copy}={}){
 const state=panelState('p2-world-code',{load,copy}),{element}=state;
 const header=h('header',{},h('h3',{text:'World SOP archive'})),actions=h('div',{class:'p2-world-code-actions'}),info=h('div'),metadata=h('div'),wires=h('pre',{class:'p2-world-code-wires','aria-label':'Full instance SOP archive'});
 header.append(actions);
 const refreshButton=state.button('Refresh',()=>{void refresh();});actions.append(refreshButton);
 element.append(header,h('p',{text:'Full instance: facts, renderer projection and native history.'}),info,state.status,wires,metadata);
 async function refresh(){
  if(state.destroyed)return false;
  const token=state.begin();info.replaceChildren();wires.textContent='';metadata.replaceChildren();
  for(const child of [...actions.children])if(child!==refreshButton)child.remove();
  try{
   const data=inspection(await state.load(),world);
   if(!state.current(token))return false;
   info.append(identity([['World',data.world],['Instance',data.instanceId],['Revision',data.revision],['Schema version',data.schemaVersion]]));
   wires.textContent=data.wires;
   metadata.append(h('p',{text:'Instance metadata is retained in the exact SOP archive above.'}));
   actions.prepend(state.copyButton('Copy SOP',data.wires,token));
   state.message(`${data.objects.length} objects in this instance snapshot.`);
   return true;
  }catch(error){if(state.current(token))state.message('Could not load instance SOP: '+errorText(error),true);return false;}
  finally{state.finish(token);}
 }
 void refresh();
 return {element,refresh,destroy:()=>state.destroy()};
}

/** Shows only facts returned for the selected exact object identities. */
export function createObjectCodePanel({load,copy}={}){
 const state=panelState('p2-object-code',{load,copy}),{element}=state,content=h('div');let selected=[];
 const refreshButton=state.button('Refresh',()=>{void refresh();});
 element.append(h('header',{},h('h3',{text:'Selected object SOP'}),refreshButton),state.status,content);
 state.message('Select an object to inspect its SOP.');
 async function refresh(ids=selected){
  if(state.destroyed)return false;
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw TypeError('Selected object IDs must be nonempty strings.');
  selected=[...new Set(ids)];const token=state.begin();content.replaceChildren();
  if(!selected.length){state.message('Select an object to inspect its SOP.');state.finish(token);return true;}
  // Capture this request's selection; a later refresh owns a new generation.
  const requested=[...selected];
  try{
   const data=inspection(await state.load());
   if(!state.current(token))return false;
   content.append(identity([['World',data.world],['Instance',data.instanceId],['Revision',data.revision],['Schema version',data.schemaVersion]]));
   for(const id of requested){
    const matches=data.objects.filter(object=>object.id===id),article=h('article',{'data-object-id':id});
    if(matches.length!==1){article.append(h('h4',{text:id}),h('p',{text:matches.length?'Object identity occurs more than once in this snapshot.':'Object is absent from this instance snapshot.'}));content.append(article);continue;}
    const object=matches[0];if(typeof object.wires!=='string')throw Error(`Object ${id} has no SOP wires in the inspection.`);
    const actions=h('div',{class:'p2-object-code-actions'},state.copyButton('Copy SOP',object.wires,token));
    article.append(h('header',{},h('h4',{text:id}),actions),identity([['Object ID',object.id],['Type',object.type],['Fact ID',object.factId],['Observation source',object.observation?.source],['Observation version',object.observation?.version]]),details('Object facts and related SOP references',object.wires,{open:true,code:true}));
    content.append(article);
   }
   state.message(`${requested.length} selected ${requested.length===1?'object':'objects'}.`);
   return true;
  }catch(error){if(state.current(token)){content.replaceChildren();state.message('Could not load object SOP: '+errorText(error),true);}return false;}
  finally{state.finish(token);}
 }
 return {element,refresh,destroy:()=>state.destroy()};
}
