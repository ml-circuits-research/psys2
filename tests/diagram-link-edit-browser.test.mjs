// Editing connections with the mouse in the Diagram tab: drag an end handle to another node and to another side of a
// node, drop an end on empty space (it stays free there), drag a middle handle to add a bend and a bend to move it,
// drag from a node's port to another node's port to draw a line of the toolbar's line type. Each gesture is the
// declared native command sent through host.tool (performGesture, the chat route) and reads back as its sentence.
// Real mouse events (CDP). Screenshots go to DIAGRAM_SHOTS when it names a folder.
import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,access,mkdir} from 'node:fs/promises';import {resolve,extname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),chrome=process.env.CHROME??'/usr/bin/chromium',shots=process.env.DIAGRAM_SHOTS??'';
let available=true;try{await access(chrome);}catch{available=false;}
const page=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui;height:100vh}#dg{width:100%;height:860px}</style><div id="dg"></div><script type="module">
import diagram from'/docs/webchat/ui/tabs/diagram.mjs';import{emptyDiagramState,projectDiagramArea,createDiagramArea}from'/worlds/diagram.sketch/sop-diagram.mjs';import{performGesture}from'/tests/fixtures/editor-gesture.mjs';
const session={isession:{state:{'diagram.sketch':emptyDiagramState()}},engine:{}},calls=[];let ui;
const projected=()=>projectDiagramArea(session.isession.state['diagram.sketch']);
const host={persistent:false,asset:p=>'/'+p,state:()=>projected(),isBusy:()=>false,tools:async()=>({operations:(await createDiagramArea({instanceId:'tools'})).bindings()}),
 tool:async(operation,args)=>{const result=await performGesture(session,{view:'diagram',operation,args});calls.push({operation,args,text:result.intentRecord?.text,ok:result.ok});ui.update(projected());return result;},download:()=>{},send:()=>{throw Error('UI gestures must use declared tools');}};
ui=diagram.make(document.querySelector('#dg'),host);ui.update(projected());ui.show?.();
window.dg={session,calls,ui,projected,host};window.psys2={engineClient:{ready:async()=>true,info:{}}};
</script>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const options={skip:available?false:'Chromium unavailable',timeout:300000};

test('reattach, re-side, free, bend and draw connections with the mouse in the Diagram tab',options,async()=>{
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return;}const file=resolve(root,'.'+pathname);if(!file.startsWith(resolve(root)+'/'))throw Error('outside');res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await openBrowserReaderRoute({url:'http://127.0.0.1:'+server.address().port+'/',chrome});await browser.viewport(1280,900);
  if(shots)await mkdir(shots,{recursive:true});
  const shot=async name=>{await wait(400);if(shots)await browser.screenshot(join(shots,name+'.png'));};
  const ev=expr=>browser.evaluate(expr);
  // The declared interface is read (the line type's choices are filled).
  await ev(`new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('#dg [aria-label="Line route"] option[value="curved"]')){clearInterval(t);r();}},50);})`);
  const tool=(operation,args)=>ev(`dg.host.tool(${JSON.stringify(operation)},${JSON.stringify(args)}).then(r=>r.ok)`);
  const inputs=id=>ev(`dg.projected().inputs[${JSON.stringify(id)}]??null`);
  const ends=()=>ev(`Object.fromEntries(dg.projected().objects.filter(o=>o.binding==='diagram.link').map(o=>[o.id,[o.from,o.to]]))`);
  const lastText=()=>ev(`dg.calls.at(-1).text`);
  // The screen point of an SVG point, and of an element's centre.
  const screen=(x,y)=>ev(`(()=>{const s=document.querySelector('#dg svg.dg-svg'),p=s.createSVGPoint();p.x=${x};p.y=${y};const q=p.matrixTransform(s.getScreenCTM());return {x:q.x,y:q.y};})()`);
  const centre=selector=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  const box=id=>ev(`dg.projected().boxes[${JSON.stringify(id)}]`);
  const mouse=(type,p,buttons=1)=>browser.input('dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount:1});
  const drag=async(from,to)=>{await mouse('mouseMoved',from,0);await wait(30);await mouse('mousePressed',from);for(let i=1;i<=8;i++){await mouse('mouseMoved',{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8});await wait(25);}
   await wait(60);await mouse('mouseReleased',to,0);await settle();};
  const settle=async()=>{let n=-1;for(let i=0;i<100;i++){const c=await ev('dg.calls.length');if(c===n)break;n=c;await wait(250);}};
  for(const label of ['Start','Test','Review','Check'])await tool('diagram.node.make',{kind:'rectangle',label});
  await tool('diagram.link.make',{from:'n1',to:'n2'});
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  await shot('1-selected-link-handles');
  assert.ok(await ev(`!!document.querySelector('#dg [data-end-link="e1"][data-end="to"]')`),'the selected connection shows its end handles');
  // Drag the end handle onto Review: the end at Test moves to Review.
  let b=await box('n3');
  await drag(await centre('#dg [data-end-link="e1"][data-end="to"]'),await screen((b.x0+b.x1)/2,(b.y0+b.y1)/2));
  assert.deepEqual((await ends()).e1,['n1','n3']);
  assert.equal(await lastText(),'Attach "e1" the end "to", to "Review".');
  // Drag it onto the left port of Review: the same node, another side.
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  b=await box('n3');
  await drag(await centre('#dg [data-end-link="e1"][data-end="to"]'),await screen(b.x0+2,(b.y0+b.y1)/2));
  assert.equal((await inputs('e1')).toSide,'left','snapped to the left side');
  assert.equal(await lastText(),'Attach "e1" the end "to", to "Review", at the side "left".');
  await shot('2-end-on-left-side-of-review');
  // Drag the start handle onto the right port of Start (another side of the same node).
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  b=await box('n1');
  await drag(await centre('#dg [data-end-link="e1"][data-end="from"]'),await screen(b.x1-1,(b.y0+b.y1)/2));
  assert.equal((await inputs('e1')).fromSide,'right');assert.deepEqual((await ends()).e1,['n1','n3']);
  // Drag the middle handle: a bend where it was dropped.
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  const mid=await centre('#dg [data-mid-link="e1"]');
  await drag(mid,{x:mid.x+30,y:mid.y-90});
  const bend=String((await inputs('e1')).bends).split(' ').map(Number);
  assert.equal(bend[0],1,'one bend');assert.match(await lastText(),/^Bend "e1" through x -?\d+, y -?\d+, after bend 0\.$/);
  await shot('3-bend-added');
  // Drag the bend: it moves.
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  const handle=await centre('#dg [data-bend-link="e1"]');
  await drag(handle,{x:handle.x-60,y:handle.y});
  const moved=String((await inputs('e1')).bends).split(' ').map(Number);
  assert.ok(moved[1]<bend[1]-20,'the bend moved left: '+moved+' from '+bend);
  // Drop the end on empty space: it stays free there.
  await tool('diagram.link.select',{ids:['e1']});await wait(300);
  const free=await screen(900,620);
  await drag(await centre('#dg [data-end-link="e1"][data-end="to"]'),free);
  assert.equal((await inputs('e1')).toFree,true,'a free end');
  assert.ok((await ev(`dg.calls.map(c=>c.text)`)).some(t=>/^Detach "e1" the end "to", leaving it at x \d+, y \d+\.$/.test(t)));
  assert.equal((await ends()).e1[1]??null,null,'a free end has no node');
  assert.ok(await ev(`!!document.querySelector('#dg [data-end-link="e1"][data-end="to"].free')`),'the link stays selected, its free end marked');
  await shot('4-free-end');
  // Draw a new line from the bottom port of Test to the top port of Check, with the toolbar's line type (curved).
  await ev(`(()=>{const s=document.querySelector('#dg [aria-label="Line route"]');s.value='curved';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await tool('diagram.node.select',{ids:[]});await wait(300);
  b=await box('n2');const hover=await screen((b.x0+b.x1)/2,(b.y0+b.y1)/2);await mouse('mouseMoved',hover,0);await wait(200);
  assert.ok(await ev(`!!document.querySelector('#dg .dg-ports [data-port-node="n2"][data-port-side="bottom"]')`),'hovering a node shows its ports');
  await shot('5-ports-on-hover');
  const c=await box('n4');
  await drag(await centre('#dg .dg-ports [data-port-node="n2"][data-port-side="bottom"]'),await screen((c.x0+c.x1)/2,c.y0+1));
  const made=Object.entries(await ends()).find(([id,[f,t]])=>id!=='e1'&&f==='n2'&&t==='n4');
  assert.ok(made,'a new connection from Test to Check');
  const look=await inputs(made[0]);
  assert.equal(look.fromSide,'bottom');assert.equal(look.toSide,'top');assert.equal(look.way,'curved');
  assert.equal(await lastText(),'Draw a link from "Test", to "Check", from the side "bottom", to the side "top", drawn "curved".');
  // Released over empty space, a drawn line makes nothing.
  const count=Object.keys(await ends()).length;
  b=await box('n2');await mouse('mouseMoved',await screen((b.x0+b.x1)/2,(b.y0+b.y1)/2),0);await wait(200);
  await drag(await centre('#dg .dg-ports [data-port-node="n2"][data-port-side="right"]'),await screen(980,120));
  assert.equal(Object.keys(await ends()).length,count);
  await tool('diagram.link.select',{ids:[made[0]]});await wait(300);
  await shot('6-drawn-curved-link');
  // Dragging a node: the links at it follow while it moves (a dashed line to its new place), and are routed on the drop.
  await tool('diagram.node.select',{ids:[]});await wait(300);
  b=await box('n4');const from=await screen((b.x0+b.x1)/2,(b.y0+b.y1)/2),to={x:from.x+160,y:from.y+60};
  await mouse('mousePressed',from);for(let i=1;i<=6;i++){await mouse('mouseMoved',{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6});await wait(30);}
  assert.ok(await ev(`!!document.querySelector('#dg .dg-follow')`),'the link follows the dragged node');
  await shot('7-link-follows-drag');
  await mouse('mouseReleased',to,0);await settle();
  assert.ok(await ev(`!document.querySelector('#dg .dg-follow')`));
  // Every gesture went through the declared tools; none was refused.
  assert.ok((await ev('dg.calls.every(c=>c.ok)')),'every gesture applied');
 }finally{await browser?.close?.();server.close();}
});
