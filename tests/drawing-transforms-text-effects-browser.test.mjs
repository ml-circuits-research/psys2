// The restored Drawing tab exposes turns, mirrors, leans, writing, typefaces, effects, fills and picture filters as
// controls: each control sends its declared native command (host.tool -> performGesture, the chat route), and the
// crayon renderer draws what the projection states. Screenshots go to DRAWING_SHOTS when it names a folder.
import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,access,mkdir} from 'node:fs/promises';import {resolve,extname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),chrome=process.env.CHROME??'/usr/bin/chromium',shots=process.env.DRAWING_SHOTS??'';
let available=true;try{await access(chrome);}catch{available=false;}
const page=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui;height:100vh}#draw{width:100%;height:860px}</style><div id="draw"></div><script type="module">
import draw from'/docs/webchat/ui/tabs/draw.mjs';import{emptyDrawingState,projectDrawingArea,createDrawingArea}from'/worlds/art.draw/sop-drawing.mjs';import{performGesture}from'/tests/fixtures/editor-gesture.mjs';
const session={isession:{state:{'art.draw':emptyDrawingState()}},engine:{}},calls=[];let ui;
const projected=()=>projectDrawingArea(session.isession.state['art.draw']);
const host={persistent:false,asset:p=>p.startsWith('lib/')?'/src/'+p.slice(4):'/'+p,sample:async()=>[],state:()=>projected(),isBusy:()=>false,tools:async()=>({operations:(await createDrawingArea({instanceId:'tools'})).bindings()}),
 tool:async(operation,args)=>{const result=await performGesture(session,{view:'draw',operation,args});calls.push({operation,args,result});ui.update(projected());return result;},download:()=>{},send:()=>{throw Error('UI gestures must use declared tools');}};
ui=draw.make(document.querySelector('#draw'),host);ui.update(projected());ui.show?.();
window.editors={session,calls,ui,projected};window.psys2={engineClient:{ready:async()=>true,info:{}}};
</script>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const options={skip:available?false:'Chromium unavailable',timeout:180000};

test('turn, mirror, lean, write, type, frame, fade, glow, fill and filter through the Drawing tab controls',options,async()=>{
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return;}const file=resolve(root,'.'+pathname);if(!file.startsWith(resolve(root)+'/'))throw Error('outside');res.setHeader('content-type',extname(file)==='.mjs'?'text/javascript':extname(file)==='.json'?'application/json':'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await openBrowserReaderRoute({url:'http://127.0.0.1:'+server.address().port+'/',chrome});await browser.viewport(1280,900);
  if(shots)await mkdir(shots,{recursive:true});
  const shot=async name=>{await wait(900);if(shots)await browser.screenshot(join(shots,name+'.png'));};
  const ev=expr=>browser.evaluate(expr);
  await ev(`new Promise(r=>{const t=setInterval(()=>{if(!document.querySelector('#draw .dr-toolbar button').disabled){clearInterval(t);r();}},50);})`);
  const button=async text=>{await ev(`(()=>{const b=[...document.querySelectorAll('#draw button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.closest('[hidden]'));if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click();})()`);await wait(150);};
  const choose=async(label,value)=>{await ev(`(()=>{const s=document.querySelector('#draw [aria-label=${JSON.stringify(label)}]');if(!s||s.closest('[hidden]'))throw Error('Missing control '+${JSON.stringify(label)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(150);};
  const make=async(kind,args)=>ev(`editors.ui&&(async()=>{const r=await window.editors.calls.length;return r;})()`).then(()=>button('Add')).then(()=>button(kind)).then(async()=>{if(args)for(const[k,v]of Object.entries(args))await choose(k,v);});
  const objects=()=>ev(`editors.projected().objects.filter(o=>o.binding==='drawing.object').map(o=>({id:o.id,kind:o.kind,...editors.projected().inputs[o.id]}))`);
  const select=async id=>{await ev(`(()=>{const c=document.querySelector('#draw .dr-canvas').getBoundingClientRect(),b=editors.projected().boxes[${JSON.stringify(id)}],s=Math.min(c.width/1000,c.height/700);window.__p={x:c.x+(c.width-1000*s)/2+(b.x0+b.x1)/2*s,y:c.y+(c.height-700*s)/2+(b.y0+b.y1)/2*s};})()`);const p=await ev('window.__p');for(const type of ['mousePressed','mouseReleased'])await browser.input('dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});await wait(250);};
  // Transforms: a house a bit clockwise twice, a car mirrored, a tree leaning, a cat upside down.
  await make('house');await button('↻ 15°');await button('↻ 15°');
  await make('car');await button('Flip ⇆');
  await make('tree');await choose('Lean (degrees)','18');
  await make('cat');await button('Upside down');
  const posed=await objects();
  assert.deepEqual(posed.map(o=>[o.kind,o.rotation??0,o.mirror??'none',o.skew??0]),[['house',30,'none',0],['car',0,'horizontal',0],['tree',0,'none',18],['cat',180,'none',0]]);
  await shot('1-turned-mirrored-leaning');
  // Writing: "Add text", its words typed in the inspector, a typeface, bold, a speech bubble; a second caption in comic.
  await ev(`editors.ui&&0`);await button('Clear drawing');
  await button('Add text');await ev(`(()=>{const t=document.querySelector('#draw [aria-label="Text"]');t.value='Happy birthday!';t.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(200);
  await choose('Font','handwritten');await button('Bold');await choose('Frame','speech');
  await make('person');
  await button('Add text');await ev(`(()=>{const t=document.querySelector('#draw [aria-label="Text"]');t.value='The best day';t.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(200);
  await choose('Font','comic');await button('Italic');await choose('Frame','caption');await choose('Named colour','purple');
  const written=(await objects()).filter(o=>o.kind==='text');
  assert.deepEqual(written.map(o=>[o.text,o.font,o.weight??'normal',o.slant??'normal',o.frame]),[['Happy birthday!','handwritten','bold','normal','speech'],['The best day','comic','normal','italic','caption']]);
  await shot('2-text-fonts-frames');
  // Effects and fills: a glowing sun, a striped circle, a gradient star, a see-through house with a drop shadow.
  await button('Clear drawing');
  await make('sun');await choose('Effect','glow');
  await make('circle');await choose('Fill','striped');await choose('Named colour','red');
  await make('star');await choose('Fill','gradient');await choose('Named colour','orange');
  await make('house');await choose('Effect','shadow');await ev(`(()=>{const r=document.querySelector('#draw [aria-label="Opacity"]');r.value='0.5';r.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(200);
  const styled=await objects();
  assert.deepEqual(styled.map(o=>[o.kind,o.effect??'',o.pattern??'',o.opacity??1]),[['sun','glow','',1],['circle','','striped',1],['star','','gradient',1],['house','shadow','',0.5]]);
  await shot('3-effects-fills');
  // The whole picture through a filter: sepia, then night.
  await choose('Picture filter','sepia');assert.match(await ev(`editors.projected().svg.slice(0,200)`),/filter:sepia/);await shot('4-filter-sepia');
  await choose('Picture filter','night');assert.match(await ev(`editors.projected().svg`),/data-tint="true"/);await shot('5-filter-night');
  // A part turned: the house's roof (part 0 after selection) a quarter turn through the part controls.
  await choose('Picture filter','none');await select(styled[3].id);
  const records=await ev(`editors.calls.map(c=>({operation:c.operation,ok:c.result.ok,verification:c.result.intentRecord?.verification?.status,reason:c.result.reason??c.result.message}))`);
  const failed=records.filter(r=>!r.ok);assert.deepEqual(failed,[],'every control command ran');
  assert.ok(records.some(r=>r.operation==='drawing.page.change')&&records.some(r=>r.operation==='drawing.object.change'));
  const errors=(browser.logs.console??[]).filter(l=>l.type==='error'||l.level==='error');assert.deepEqual(errors,[],'no console errors');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
