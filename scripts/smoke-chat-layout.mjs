// Real pointer/keyboard layout controls and real UI-generated SOP transcript.
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
const browser=await openBrowserReaderRoute();
const evaluate=body=>browser.evaluate(`(async()=>{const wait=async(fn)=>{const end=Date.now()+60000;while(!await fn()){if(Date.now()>end)throw Error('readiness timeout');await new Promise(r=>setTimeout(r,80));}};${body}})()`);
try{
 await browser.viewport(1440,1000);
 const initial=await evaluate(`await wait(()=>window.psys2&&document.querySelector('.p2-pane-grip'));const g=document.querySelector('.p2-pane-grip').getBoundingClientRect();return {width:document.querySelector('.p2-chat').getBoundingClientRect().width,x:g.x+g.width/2,y:g.y+g.height/2};`);
 if(initial.width<450)throw Error('default chat is too narrow');
 await browser.input('dispatchMouseEvent',{type:'mouseMoved',x:initial.x,y:initial.y});
 await browser.input('dispatchMouseEvent',{type:'mousePressed',x:initial.x,y:initial.y,button:'left',buttons:1,clickCount:1});
 await browser.input('dispatchMouseEvent',{type:'mouseMoved',x:initial.x+180,y:initial.y,button:'left',buttons:1});
 await browser.input('dispatchMouseEvent',{type:'mouseReleased',x:initial.x+180,y:initial.y,button:'left',buttons:0,clickCount:1});
 const dragged=await evaluate(`await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const width=document.querySelector('.p2-chat').getBoundingClientRect().width;if(Math.abs(width-${initial.width+180})>2)throw Error('drag width '+width);document.querySelector('.p2-pane-grip').focus();return width;`);
 await browser.input('dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await browser.input('dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
 const keyboard=await evaluate(`const width=document.querySelector('.p2-chat').getBoundingClientRect().width;if(Math.abs(width-${dragged-20})>2)throw Error('keyboard width '+width);window.psys2.showTab('calendar');await wait(()=>document.querySelector('.cal-root')&&!window.psys2.isBusy());return width;`);
 const wires=await evaluate(`const button=[...document.querySelectorAll('.cal-root button')].find(e=>e.textContent==='+ New event');button.click();const title=[...document.querySelectorAll('[data-calendar-form] input')].find(e=>e.type==='text');title.value='Layout check';document.querySelector('[data-calendar-form] form').requestSubmit();await wait(()=>document.querySelector('.p2-intent .p2-code'));const detail=document.querySelector('.p2-intent');if(detail.open)throw Error('SOP should start collapsed');detail.open=true;const pre=detail.querySelector('.p2-code'),style=getComputedStyle(pre);if(pre.scrollHeight>pre.clientHeight+1||style.overflowY==='auto'||style.overflowY==='scroll')throw Error('nested SOP vertical scrolling');if(document.querySelectorAll('.p2-die').length!==1||document.querySelector('.p2-tabdice'))throw Error('multiple dice');return {height:pre.clientHeight,scrollHeight:pre.scrollHeight,overflowY:style.overflowY};`);
 await browser.evaluate('location.reload();true');
 const restored=await evaluate(`await wait(()=>window.psys2&&document.querySelector('.p2-pane-grip'));const width=document.querySelector('.p2-chat').getBoundingClientRect().width;if(Math.abs(width-${keyboard})>2)throw Error('width not restored '+width);return width;`);
 console.log(JSON.stringify({defaultWidth:initial.width,dragged,keyboard,restored,wires,oneDice:true,documentWidth:await browser.evaluate('document.documentElement.scrollWidth'),viewport:1440,complete:true}));
}finally{await browser.close();}
