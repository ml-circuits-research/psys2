// The drawn person model through the restored Drawing tab (worlds/art.draw/figure-rules.sop): a selected person takes a
// pose, a trait, a thing to wear, an expression and a thing to hold from the inspector controls; each sends its declared
// native command (host.tool -> performGesture), and the limbs are drawn turned. Screenshots go to DRAWING_SHOTS.
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

test('pose, trait, wear, expression and hold a person through the Drawing tab controls',options,async()=>{
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
  await make('person');await choose('Pose','sitting');await choose('Trait','ginger');await choose('Wear','scarf');await choose('Emotion','happy');
  await make('person');await choose('Pose','waving');await choose('Wear','jacket');await ev(`(()=>{const t=document.querySelector('#draw [aria-label="Hold"]');t.value='balloon';})()`);await button('Hold');
  await make('person');await choose('Pose','kicking');await choose('Trait','bearded');await choose('Wear','cape');await choose('Emotion','shocked');
  const people=(await objects()).filter(o=>o.pose!==undefined);
  assert.deepEqual(people.map(o=>o.pose),['sitting','waving','kicking'],'a waving person keeps its pose and holds the balloon in the raised hand');
  assert.deepEqual(people.map(o=>o.expression??''),['happy','','shocked']);
  const held=await objects();assert.ok(held.some(o=>o.kind==='balloon'),'the balloon is drawn in the hand: '+JSON.stringify(held.map(o=>o.kind))+JSON.stringify(await ev(`editors.calls.map(c=>[c.operation,c.result.ok,c.result.reason??c.result.message])`)));
  assert.ok((await ev(`editors.projected().svg`)).match(/rotate\(-84\)/),'the sitting thighs are turned');
  await shot('person-model-1-poses-traits-garments');
  const records=await ev(`editors.calls.map(c=>({operation:c.operation,ok:c.result.ok,verification:c.result.intentRecord?.verification?.status,reason:c.result.reason??c.result.message}))`);
  const failed=records.filter(r=>!r.ok);assert.deepEqual(failed,[],'every control command ran');
  assert.ok(['drawing.person.pose','drawing.object.change','drawing.part.add','drawing.person.hold'].every(op=>records.some(r=>r.operation===op)));
  const errors=(browser.logs.console??[]).filter(l=>l.type==='error'||l.level==='error');assert.deepEqual(errors,[],'no console errors');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
