// SPDX-License-Identifier: AGPL-3.0-only
// Pointer and keyboard resizing of the desktop conversation pane.
export function mountPaneSplitter(root,chat,{persist=true}={}){
 const key='psys2.webchat.chat-width',grip=document.createElement('div');
 grip.className='p2-pane-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Resize chat width');grip.title='Drag to resize chat. Arrow keys adjust width; double-click resets.';chat.append(grip);
 let chosen=null,drag=null;
 const bounds=()=>{const width=root.getBoundingClientRect().width;return {min:Math.min(320,width/2),max:Math.max(320,width-300)};};
 const save=()=>{if(persist)try{if(chosen===null)localStorage.removeItem(key);else localStorage.setItem(key,String(chosen));}catch{}};
 function sync(){if(root.getBoundingClientRect().width<=760)return;const {min,max}=bounds();if(chosen!==null){chosen=Math.round(Math.max(min,Math.min(max,chosen)));root.style.setProperty('--p2-chat-width',chosen+'px');}grip.setAttribute('aria-valuemin',String(Math.round(min)));grip.setAttribute('aria-valuemax',String(Math.round(max)));grip.setAttribute('aria-valuenow',String(Math.round(chat.getBoundingClientRect().width)));}
 if(persist)try{const saved=Number(localStorage.getItem(key));if(saved>=320&&Number.isFinite(saved))chosen=saved;}catch{}
 const set=value=>{chosen=value;sync();};
 const down=event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,width:chat.getBoundingClientRect().width,chosen};grip.setPointerCapture(event.pointerId);root.classList.add('is-resizing-chat');};
 const move=event=>{if(drag&&drag.id===event.pointerId)set(drag.width+event.clientX-drag.x);};
 const end=event=>{if(!drag||drag.id!==event.pointerId)return;const original=drag.chosen;if(event.type==='pointerup')set(drag.width+event.clientX-drag.x);drag=null;root.classList.remove('is-resizing-chat');if(event.type==='pointercancel'){chosen=original;if(chosen===null)root.style.removeProperty('--p2-chat-width');sync();}else save();if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);};
 const reset=()=>{chosen=null;root.style.removeProperty('--p2-chat-width');save();sync();};
 const keyboard=event=>{const {min,max}=bounds();let value=chat.getBoundingClientRect().width;const step=event.shiftKey?60:20;if(event.key==='ArrowLeft')value-=step;else if(event.key==='ArrowRight')value+=step;else if(event.key==='Home')value=min;else if(event.key==='End')value=max;else return;event.preventDefault();set(value);save();};
 const listeners=[['pointerdown',down],['keydown',keyboard],['dblclick',reset]];
 const globalListeners=[['pointermove',move],['pointerup',end],['pointercancel',end]];
 for(const [type,listener]of globalListeners)window.addEventListener(type,listener,true);
 for(const [type,listener]of listeners)grip.addEventListener(type,listener);
 const observer=new ResizeObserver(sync);observer.observe(root);sync();
 return ()=>{observer.disconnect();for(const [type,listener]of globalListeners)window.removeEventListener(type,listener,true);for(const [type,listener]of listeners)grip.removeEventListener(type,listener);root.classList.remove('is-resizing-chat');grip.remove();};
}

// A right-hand inspector uses the same physical separator movement in every editor.
export function mountInspectorSplitter(layout,inspector,{id,persist=true,width=280,min=190,stackBelow=540}={}){
 const key=`psys2.webchat.inspector-width.${id}`,grip=document.createElement('div');
 if(!document.getElementById('p2-inspector-splitter-css')){
  const style=document.createElement('style');style.id='p2-inspector-splitter-css';style.textContent=`.p2-inspector-layout{position:relative;min-width:0}.p2-inspector-layout>.p2-inspector-grip{position:absolute;top:0;bottom:0;width:10px;z-index:8;cursor:col-resize;touch-action:none;outline:none;background:transparent}.p2-inspector-grip::after{content:'';position:absolute;left:3px;top:calc(50% - 22px);height:44px;width:4px;border-radius:4px;background:#8192aa99}.p2-inspector-grip:hover::after,.p2-inspector-grip:focus-visible::after{background:#4478d8}.p2-inspector-grip:focus-visible{box-shadow:inset 0 0 0 2px #4478d8}.p2-inspector-layout.is-resizing-inspector{user-select:none;cursor:col-resize}.p2-inspector-layout [data-selected-native-id]{overflow-wrap:anywhere;font-size:12px;margin:0 0 8px}.p2-inspector-layout.p2-inspector-stacked>.p2-inspector-grip{display:none}`;document.head.append(style);
 }
 grip.className='p2-inspector-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Resize properties width');grip.title='Drag to resize properties. Arrow keys adjust width; double-click resets.';
 layout.classList.add('p2-inspector-layout');layout.dataset.inspector=id;layout.append(grip);
 const originalColumns=layout.style.gridTemplateColumns,originalRows=layout.style.gridTemplateRows;let chosen=null,drag=null;
 if(persist)try{const value=localStorage.getItem(key),n=Number(value);if(value!==null&&Number.isFinite(n)&&n>=min)chosen=n;}catch{}
 const bounds=()=>({min,max:Math.max(min,Math.min(560,layout.getBoundingClientRect().width-240))});
 const save=()=>{if(persist)try{if(chosen===null)localStorage.removeItem(key);else localStorage.setItem(key,String(chosen));}catch{}};
 function sync(){
  const available=layout.getBoundingClientRect().width;if(!available)return;
  const stacked=available<stackBelow;layout.classList.toggle('p2-inspector-stacked',stacked);grip.hidden=stacked;
  if(stacked){layout.style.gridTemplateColumns='minmax(0,1fr)';layout.style.gridTemplateRows='minmax(240px,1fr) auto';return;}
  const range=bounds(),actual=Math.round(Math.max(range.min,Math.min(range.max,chosen??width)));
  layout.style.gridTemplateColumns=`minmax(0,1fr) ${actual}px`;layout.style.gridTemplateRows=originalRows;grip.style.right=(actual-5)+'px';
  grip.setAttribute('aria-valuemin',String(range.min));grip.setAttribute('aria-valuemax',String(Math.round(range.max)));grip.setAttribute('aria-valuenow',String(actual));
 }
 const set=value=>{const range=bounds();chosen=Math.round(Math.max(range.min,Math.min(range.max,value)));sync();};
 const down=event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,width:inspector.getBoundingClientRect().width,chosen};grip.setPointerCapture(event.pointerId);layout.classList.add('is-resizing-inspector');};
 const move=event=>{if(drag?.id===event.pointerId)set(drag.width+drag.x-event.clientX);};
 const end=event=>{if(drag?.id!==event.pointerId)return;const original=drag.chosen;if(event.type==='pointerup')set(drag.width+drag.x-event.clientX);drag=null;layout.classList.remove('is-resizing-inspector');if(event.type==='pointercancel'){chosen=original;sync();}else save();if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);};
 const reset=()=>{chosen=null;save();sync();};
 const keyboard=event=>{const range=bounds(),step=event.shiftKey?60:20;let value=inspector.getBoundingClientRect().width;if(event.key==='ArrowLeft')value+=step;else if(event.key==='ArrowRight')value-=step;else if(event.key==='Home')value=range.min;else if(event.key==='End')value=range.max;else return;event.preventDefault();set(value);save();};
 const local=[['pointerdown',down],['keydown',keyboard],['dblclick',reset]],global=[['pointermove',move],['pointerup',end],['pointercancel',end]];
 for(const [type,fn]of local)grip.addEventListener(type,fn);for(const [type,fn]of global)window.addEventListener(type,fn,true);
 const observer=new ResizeObserver(sync);observer.observe(layout);sync();
 return ()=>{observer.disconnect();for(const [type,fn]of local)grip.removeEventListener(type,fn);for(const [type,fn]of global)window.removeEventListener(type,fn,true);layout.classList.remove('p2-inspector-layout','p2-inspector-stacked','is-resizing-inspector');delete layout.dataset.inspector;layout.style.gridTemplateColumns=originalColumns;layout.style.gridTemplateRows=originalRows;grip.remove();};
}
