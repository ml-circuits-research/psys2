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
