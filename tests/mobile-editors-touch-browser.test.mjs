// Real editor modules and real native controls; CDP supplies genuine touch input.
import test from'node:test';import assert from'node:assert/strict';import{createServer}from'node:http';import{readFile,access}from'node:fs/promises';import{resolve,extname}from'node:path';import{fileURLToPath}from'node:url';import{openBrowserReaderRoute}from'../scripts/lib/browser-reader-route.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),chrome=process.env.CHROME??'/usr/bin/chromium';let available=true;try{await access(chrome);}catch{available=false;}
const page=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}#draw,#diagram{width:100%}[hidden]{display:none!important}nav button{min-height:44px}</style><nav><button id="draw-tab">Drawing</button><button id="diagram-tab">Diagram</button></nav><div id="draw"></div><div id="diagram" hidden></div><div id="below" style="height:900px">The page continues below the editors.</div><script type="module">
import draw from'/docs/webchat/ui/tabs/draw.mjs';import diagram from'/docs/webchat/ui/tabs/diagram.mjs';import{uiValues}from'/src/dialog/ui-defaults.mjs';import{englishOf}from'/src/lang/en-generate.mjs';import{languageWorld}from'/src/dialog/compose-world.mjs';import*as SOPWORLD from'/src/vendor/sopworld/sopworld.mjs';const ENGLISH=englishOf(SOPWORLD,languageWorld(SOPWORLD));import{emptyDrawingState,projectDrawingArea,createDrawingArea}from'/worlds/art.draw/sop-drawing.mjs';import{drawingObjects}from'/tests/drawing-state.mjs';import{emptyDiagramState,projectDiagramArea,createDiagramArea}from'/worlds/diagram.sketch/sop-diagram.mjs';import{diagramNodes,diagramEdges}from'/tests/diagram-state.mjs';import{performGesture}from'/tests/fixtures/editor-gesture.mjs';
// Both tabs start empty: every object is made with the tab's own controls.
const session={isession:{state:{'art.draw':emptyDrawingState(),'diagram.sketch':emptyDiagramState()}},engine:{}},calls=[],uis={};let active='draw';
const projected=view=>view==='draw'?projectDrawingArea(session.isession.state['art.draw']):projectDiagramArea(session.isession.state['diagram.sketch']);
const toolsOf={draw:()=>createDrawingArea({instanceId:'tools'}),diagram:()=>createDiagramArea({instanceId:'tools'})};
const host=view=>({persistent:false,ui:uiValues,english:()=>ENGLISH,asset:p=>p.startsWith('lib/')?'/src/'+p.slice(4):'/'+p,sample:async()=>[],state:()=>projected(view),isBusy:()=>false,tools:async()=>({operations:(await toolsOf[view]()).bindings()}),tool:async(operation,args)=>{const result=await performGesture(session,{view,operation,args});calls.push({operation,args,result});uis[view].update(projected(view));return result;},download:()=>{},send:()=>{throw Error('UI gestures must use declared tools');}});
uis.draw=draw.make(document.querySelector('#draw'),host('draw'));uis.diagram=diagram.make(document.querySelector('#diagram'),host('diagram'));uis.draw.update(projected('draw'));uis.diagram.update(projected('diagram'));uis.draw.show?.();
for(const view of ['draw','diagram'])document.querySelector('#'+view+'-tab').onclick=()=>{active=view;for(const item of ['draw','diagram']){document.querySelector('#'+item).hidden=item!==view;uis[item][item===view?'show':'hide']?.();}};
const groups=view=>(projected(view).objects??[]).filter(o=>o.binding===(view==='draw'?'drawing.group':'diagram.group')).length;
window.editors={session,calls,drawing:()=>({objects:drawingObjects(session.isession.state['art.draw']),groups:groups('draw'),selected:session.isession.state['art.draw'].runtime.view.selected??null}),diagram:()=>({nodes:diagramNodes(session.isession.state['diagram.sketch']),edges:diagramEdges(session.isession.state['diagram.sketch']),groups:groups('diagram'),selected:session.isession.state['diagram.sketch'].runtime.view.selected??null}),events:[]};for(const type of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(type,event=>window.editors.events.push({type,target:event.target.tagName,text:event.target.textContent?.slice(0,18),pointer:event.pointerId}),true);window.psys2={engineClient:{info:{fixture:'real-native-editors'},ready:async()=>{while(document.querySelector('.dr-toolbar>button')?.disabled!==false)await new Promise(r=>setTimeout(r,10));}}};
</script>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// One page with the real Drawing and Diagram tabs; run(ui) gets touch helpers bound to that browser, then the declared-tool records are checked.
async function withEditors(expected,run,{width=390,height=844}={}){
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return;}const overridden=process.env.PSYS2_TOUCH_SOURCE_ROOT&&['/docs/webchat/ui/tabs/draw.mjs','/docs/webchat/ui/tabs/diagram.mjs'].includes(pathname),file=resolve(overridden?process.env.PSYS2_TOUCH_SOURCE_ROOT:root,'.'+pathname);if(!file.startsWith(resolve(overridden?process.env.PSYS2_TOUCH_SOURCE_ROOT:root)+'/'))throw Error('outside test root');res.setHeader('content-type',extname(file)==='.mjs'?'text/javascript':extname(file)==='.json'?'application/json':'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await openBrowserReaderRoute({url:'http://127.0.0.1:'+server.address().port+'/',chrome});await browser.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await browser.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const touch=async(x,y,type='touchStart')=>browser.input('dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:2,radiusY:2,force:1}]});
  const point=async selector=>browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,180)};})()`);
  const tap=async selector=>{const p=await point(selector);assert.ok(p.width&&p.height,'Visible control '+selector);assert.ok(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height,'Reachable control '+selector);await touch(p.x,p.y);await wait(80);await touch(p.x,p.y,'touchEnd');await wait(350);};
  const button=async(scope,text)=>{const selector=await browser.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.dataset.touchButton='active';return '[data-touch-button="active"]';})()`);await tap(selector);await browser.evaluate(`document.querySelector('[data-touch-button="active"]')?.removeAttribute('data-touch-button')`);};
  const type=async(label,text)=>{await tap('#draw input[aria-label="'+label+'"]');await browser.input('insertText',{text});};
  await run({browser,touch,point,tap,button,type,width,height});
  const records=await browser.evaluate(`editors.calls.map(c=>({operation:c.operation,ok:c.result.ok,verification:c.result.intentRecord?.verification?.status,wires:c.result.intentRecord?.wires}))`);assert.ok(records.every(r=>r.ok&&typeof r.wires==='string'&&r.wires.startsWith('@')&&['verified','unverified'].includes(r.verification)),JSON.stringify(records));assert.ok(records.length&&records.every(r=>expected.some(prefix=>r.operation.startsWith(prefix))),JSON.stringify(records));assert.deepEqual(browser.logs.console.filter(x=>['error','exception','warning','warn'].includes(x.type)),[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
const options={skip:available?false:'Chromium unavailable',timeout:120000};
// The page position of a drawing object on the Drawing canvas (1000 x 700 page, letterboxed).
const drawingPoint=(browser,index)=>browser.evaluate(`(()=>{const c=document.querySelector('#draw .dr-canvas').getBoundingClientRect(),o=editors.drawing().objects[${index}],s=Math.min(c.width/1000,c.height/700);return{x:c.x+(c.width-1000*s)/2+o.x*s,y:c.y+(c.height-700*s)/2+o.y*s};})()`);
test('phone touch adds, drags, multi-selects, groups and deletes drawing objects through actual native SOP',options,()=>withEditors(['drawing.'],async({browser,touch,point,tap,button})=>{
  await browser.evaluate(`psys2.engineClient.ready()`);
  await button('#draw','Add');await button('.dr-shape-choices','house');assert.equal(await browser.evaluate(`editors.drawing().objects.length`),1);
  const before=await browser.evaluate(`editors.drawing().objects[0].x`),start=await drawingPoint(browser,0);
  await touch(start.x,start.y);for(let i=1;i<=5;i++){await wait(40);await touch(start.x-i*16,start.y,'touchMove');}await touch(start.x-80,start.y,'touchEnd');await wait(400);
  assert.ok(await browser.evaluate(`editors.drawing().objects[0].x`)<before-100,'the drag moved the house left');
  await button('#draw','Add');await button('.dr-shape-choices','circle');assert.equal(await browser.evaluate(`editors.drawing().objects.length`),2);
  await button('#draw','Select multiple');const house=await drawingPoint(browser,0);await touch(house.x,house.y);await wait(60);await touch(house.x,house.y,'touchEnd');await wait(400);
  assert.equal(await browser.evaluate(`document.querySelector('#draw .dr-selection-heading').textContent`),'2 objects');
  await button('#draw','Group objects');assert.equal(await browser.evaluate(`editors.drawing().groups`),1);
  await button('#draw','Ungroup');assert.equal(await browser.evaluate(`editors.drawing().groups`),0);assert.equal(await browser.evaluate(`editors.drawing().objects.length`),2);
  const beforeCancel=await browser.evaluate(`JSON.stringify(editors.drawing().objects)`),cancelPoint=await point('#draw .dr-canvas');await touch(cancelPoint.x,cancelPoint.y);await wait(40);await touch(cancelPoint.x+30,cancelPoint.y,'touchMove');await touch(cancelPoint.x+30,cancelPoint.y,'touchCancel');await wait(80);assert.equal(await browser.evaluate(`JSON.stringify(editors.drawing().objects)`),beforeCancel);
  await button('#draw','Select multiple');const circle=await drawingPoint(browser,1);await touch(circle.x,circle.y);await wait(60);await touch(circle.x,circle.y,'touchEnd');await wait(400);
  const circleId=await browser.evaluate(`editors.drawing().objects[1].id`);assert.equal(await browser.evaluate(`editors.drawing().selected`),circleId);
  await button('#draw','Delete selection');assert.deepEqual(await browser.evaluate(`editors.drawing().objects.map(o=>o.id)`),[await browser.evaluate(`editors.drawing().objects[0].id`)]);
  await button('#draw','Clear drawing');assert.equal(await browser.evaluate(`editors.drawing().objects.length`),0);
}));
test('phone touch adds, multi-selects, groups and connects diagram nodes through actual native SOP',options,()=>withEditors(['diagram.'],async({browser,touch,point,tap,button})=>{
  await tap('#diagram-tab');await wait(250);
  for(const [kind,fraction]of [['rectangle',.3],['circle',.7]]){await button('#diagram','Add node');await button('.dg-node-chooser',kind);const p=await browser.evaluate(`(()=>{const r=document.querySelector('#diagram .dg-svg').getBoundingClientRect();return{x:r.x+r.width*${fraction},y:r.y+r.height*.5};})()`);await touch(p.x,p.y);await wait(80);await touch(p.x,p.y,'touchEnd');await wait(300);}
  assert.equal(await browser.evaluate(`editors.diagram().nodes.length`),2);
  const ids=await browser.evaluate(`editors.diagram().nodes.map(n=>n.id)`);
  await button('#diagram','Select multiple');for(const id of ids)if(!await browser.evaluate(`(v=>v['selected.'+${JSON.stringify(id)}]===true||v.selected===${JSON.stringify(id)})(editors.session.isession.state['diagram.sketch'].runtime.view)`))await tap('#diagram [data-select="'+id+'"]');
  await button('#diagram','Group selected');assert.equal(await browser.evaluate(`editors.diagram().groups`),1);
  await button('#diagram','Ungroup');assert.equal(await browser.evaluate(`editors.diagram().groups`),0);
  await button('#diagram','Select multiple');
  await button('#diagram','Connect');await tap('#diagram [data-select="'+ids[0]+'"]');await tap('#diagram [data-select="'+ids[1]+'"]');
  assert.deepEqual(await browser.evaluate(`editors.diagram().edges.map(e=>[e.from,e.to])`),[[ids[0],ids[1]]]);
  const beforePinch=await browser.evaluate(`JSON.stringify(editors.diagram())`),pinchPoint=await point('#diagram .dg-svg');await browser.input('dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pinchPoint.x-40,y:pinchPoint.y,id:1},{x:pinchPoint.x+40,y:pinchPoint.y,id:2}]});await wait(40);await browser.input('dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pinchPoint.x-60,y:pinchPoint.y,id:1},{x:pinchPoint.x+60,y:pinchPoint.y,id:2}]});await browser.input('dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(100);assert.equal(await browser.evaluate(`JSON.stringify(editors.diagram())`),beforePinch);
  await button('#diagram','Clear diagram');assert.equal(await browser.evaluate(`editors.diagram().nodes.length`),0);
}));

// Phone layout: the page scrolls from empty canvas, a tapped object's properties open as a bottom sheet with a close
// button, the inspector changes the colour, two fingers zoom the canvas only, every toolbar control is reachable and
// nothing overflows the page sideways.
const swipe=async(touch,x,y,dy)=>{await touch(x,y);for(let i=1;i<=8;i++){await wait(16);await touch(x,y+dy*i/8,'touchMove');}await touch(x,y+dy,'touchEnd');await wait(500);};
const sheetOf=(browser,scope)=>browser.evaluate(`(()=>{const e=document.querySelector('${scope} .p2-inspector-sheet');if(!e)return null;const r=e.getBoundingClientRect(),c=e.querySelector('.p2-sheet-close').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right,inner:e.scrollHeight>e.clientHeight,close:{x:c.x+c.width/2,y:c.y+c.height/2}};})()`);
// Every toolbar control lies inside the viewport, or inside a horizontally scrolling toolbar that lies inside it.
const toolbarReachable=(browser,selector)=>browser.evaluate(`[...document.querySelectorAll('${selector}')].flatMap(bar=>[...bar.querySelectorAll('button,select,input')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect(),b=bar.getBoundingClientRect();return (r.left>=-1&&r.right<=innerWidth+1)||(bar.scrollWidth>bar.clientWidth&&b.left>=-1&&b.right<=innerWidth+1&&r.left>=b.left-1-bar.scrollLeft&&r.right<=b.left+bar.scrollWidth+1);})).every(Boolean)`);
const noSideOverflow=browser=>browser.evaluate(`document.scrollingElement.scrollWidth<=innerWidth`);
for(const [width,height]of [[375,812],[414,896],[812,375]])test(`phone ${width}x${height}: drawing canvas scrolls the page, a tapped object opens its properties sheet and is recoloured`,options,()=>withEditors(['drawing.'],async({browser,touch,point,button})=>{
  await browser.evaluate(`psys2.engineClient.ready()`);
  assert.ok(await toolbarReachable(browser,'#draw .dr-toolbar'),'every drawing toolbar control is reachable');
  await button('#draw','Add');await button('.dr-shape-choices','house');assert.equal(await browser.evaluate(`editors.drawing().objects.length`),1);
  const before=await browser.evaluate(`JSON.stringify(editors.drawing().objects)`);
  // One finger on empty paper scrolls the page and changes nothing.
  await browser.evaluate(`document.querySelector('#draw .dr-board').scrollIntoView({block:'start'})`);await wait(200);
  const paper=await browser.evaluate(`(()=>{const r=document.querySelector('#draw .dr-paper').getBoundingClientRect();return{x:r.x+8,y:Math.min(r.bottom,innerHeight)-30,scroll:document.scrollingElement.scrollTop};})()`);
  await swipe(touch,paper.x,paper.y,-150);
  assert.ok(await browser.evaluate(`document.scrollingElement.scrollTop`)>paper.scroll+60,'a swipe from empty paper scrolls the page');
  assert.equal(await browser.evaluate(`JSON.stringify(editors.drawing().objects)`),before);
  // A tap on the object selects it and opens the properties sheet, sized to the viewport and closable.
  await browser.evaluate(`document.querySelector('#draw .dr-board').scrollIntoView({block:'start'})`);await wait(200);
  const house=await drawingPoint(browser,0);await touch(house.x,house.y);await wait(60);await touch(house.x,house.y,'touchEnd');await wait(500);
  const id=await browser.evaluate(`editors.drawing().objects[0].id`);assert.equal(await browser.evaluate(`editors.drawing().selected`),id);
  if(!await browser.evaluate(`document.querySelector('#draw .dr-workspace').classList.contains('p2-inspector-stacked')`)){
   // A wide layout keeps the properties beside the canvas: the colour control is reachable there.
   const beside=await point('#draw .dr-inspector select[aria-label="Named colour"]');assert.ok(beside.width&&beside.x<width&&beside.y>=0&&beside.y<height,'the colour control is reachable beside the canvas');
   await browser.evaluate(`(()=>{const s=document.querySelector('#draw select[aria-label="Named colour"]');s.value='blue';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(600);assert.equal(await browser.evaluate(`editors.drawing().objects[0].color`),'blue');assert.ok(await noSideOverflow(browser));return;
  }
  const sheet=await sheetOf(browser,'#draw');assert.ok(sheet,'the properties sheet is open');assert.ok(sheet.top>=0&&Math.abs(sheet.bottom-height)<2&&sheet.height<=height*.62&&sheet.left>=0&&sheet.right<=width+1,JSON.stringify(sheet));
  assert.ok(await browser.evaluate(`(()=>{const r=document.querySelector('#draw .dr-paper').getBoundingClientRect();return r.top<${sheet.top}-60;})()`),'the canvas stays visible above the sheet');
  const colour=await point('#draw .p2-inspector-sheet select[aria-label="Named colour"]');assert.ok(colour.y>sheet.top&&colour.y<height,'the colour control is inside the sheet');
  await touch(colour.x,colour.y);await wait(60);await touch(colour.x,colour.y,'touchEnd');await wait(200);
  await browser.evaluate(`(()=>{const s=document.querySelector('#draw select[aria-label="Named colour"]'),o=[...s.options].find(o=>o.value==='blue');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(600);
  assert.equal(await browser.evaluate(`editors.drawing().objects[0].color`),'blue');
  await touch(sheet.close.x,sheet.close.y);await wait(60);await touch(sheet.close.x,sheet.close.y,'touchEnd');await wait(500);
  assert.equal(await sheetOf(browser,'#draw'),null);assert.equal(await browser.evaluate(`editors.drawing().selected`),null);
  // Two fingers zoom the canvas view, never the drawing; one finger on the object still drags it.
  const recoloured=await browser.evaluate(`JSON.stringify(editors.drawing().objects)`),mid=await drawingPoint(browser,0);
  await browser.input('dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mid.x-30,y:mid.y,id:1},{x:mid.x+30,y:mid.y,id:2}]});for(let i=1;i<=5;i++){await wait(20);await browser.input('dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-30-10*i,y:mid.y,id:1},{x:mid.x+30+10*i,y:mid.y,id:2}]});}await browser.input('dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(300);
  assert.match(await browser.evaluate(`document.querySelector('#draw .dr-canvas').style.transform`),/scale\(/);assert.equal(await browser.evaluate(`JSON.stringify(editors.drawing().objects)`),recoloured);
  await button('#draw','Reset zoom');assert.equal(await browser.evaluate(`document.querySelector('#draw .dr-canvas').style.transform`),'');
  const x0=await browser.evaluate(`editors.drawing().objects[0].x`),start=await drawingPoint(browser,0);
  await touch(start.x,start.y);for(let i=1;i<=5;i++){await wait(40);await touch(start.x-i*12,start.y,'touchMove');}await touch(start.x-60,start.y,'touchEnd');await wait(500);
  assert.ok(await browser.evaluate(`editors.drawing().objects[0].x`)<x0-30,'a one-finger drag on the object still moves it');
  assert.ok(await noSideOverflow(browser),'no horizontal page overflow');
},{width,height}));
for(const [width,height]of [[375,812],[812,375]])test(`phone ${width}x${height}: a tapped diagram node opens the inspector sheet and is recoloured`,options,()=>withEditors(['diagram.'],async({browser,touch,tap,point,button})=>{
  await tap('#diagram-tab');await wait(250);
  assert.ok(await toolbarReachable(browser,'#diagram .dg-tools, #diagram .dg-pagebar'),'every diagram toolbar control is reachable');
  await button('#diagram','Add node');await button('.dg-node-chooser','circle');
  const p=await browser.evaluate(`(()=>{const r=document.querySelector('#diagram .dg-svg').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+Math.min(r.height,innerHeight-r.y)*.4};})()`);await touch(p.x,p.y);await wait(80);await touch(p.x,p.y,'touchEnd');await wait(400);
  const [id]=await browser.evaluate(`editors.diagram().nodes.map(n=>n.id)`);assert.ok(id);
  const board=await browser.evaluate(`(()=>{document.querySelector('#diagram .dg-board').scrollIntoView({block:'start'});const r=document.querySelector('#diagram .dg-board').getBoundingClientRect();return{x:r.x+8,y:r.y+40,scroll:document.scrollingElement.scrollTop};})()`);
  await swipe(touch,board.x,board.y,-120);assert.ok(await browser.evaluate(`document.scrollingElement.scrollTop`)>board.scroll+40,'a swipe from empty board scrolls the page');
  await browser.evaluate(`document.querySelector('#diagram .dg-board').scrollIntoView({block:'start'})`);await wait(200);
  await tap('#diagram [data-select="'+id+'"]');
  if(!await browser.evaluate(`document.querySelector('#diagram .dg-workspace').classList.contains('p2-inspector-stacked')`)){
   const beside=await point('#diagram .dg-inspector select[aria-label="Node colour"]');assert.ok(beside.width&&beside.x<width&&beside.y>=0&&beside.y<height,'the colour control is reachable beside the board');
   await browser.evaluate(`(()=>{const s=document.querySelector('#diagram select[aria-label="Node colour"]');s.value='blue';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(600);assert.equal(await browser.evaluate(`editors.diagram().nodes[0].colour`),'blue');assert.ok(await noSideOverflow(browser));return;
  }
  const sheet=await sheetOf(browser,'#diagram');assert.ok(sheet&&Math.abs(sheet.bottom-height)<2&&sheet.height<=height*.62,JSON.stringify(sheet));
  await browser.evaluate(`(()=>{const s=document.querySelector('#diagram .p2-inspector-sheet select[aria-label="Node colour"]');s.scrollIntoView({block:'nearest'});s.value=[...s.options].find(o=>o.value==='blue').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(600);
  assert.equal(await browser.evaluate(`editors.diagram().nodes[0].colour`),'blue');
  await touch(sheet.close.x,sheet.close.y);await wait(60);await touch(sheet.close.x,sheet.close.y,'touchEnd');await wait(400);assert.equal(await sheetOf(browser,'#diagram'),null);
  assert.ok(await noSideOverflow(browser),'no horizontal page overflow');
},{width,height}));
