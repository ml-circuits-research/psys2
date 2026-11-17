// Read-only instance/object inspectors in real Chromium, without a DOM dependency.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),chrome=process.env.CHROME??'/usr/bin/chromium';
let available=true;try{await access(chrome);}catch{available=false;}
const scenario=`
import {createWorldsExplorer} from '/worlds-explorer.mjs';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function run(){
 let listener,unsubscribed=false,copies=[];
 const exact='@object invented.object x=18 label="<unsafe>unsafe</unsafe>"\\n';
 const model={nodes:[{id:'actual-schema',label:'Actual schema',kind:'schema',implementation:'SOP Lang',description:'Shared declaration',wires:exact,details:{version:2}},{id:'actual-instance',label:'Actual instance',kind:'instance',implementation:'SOP Lang',details:{id:'live'},tools:[{name:'move',parameters:['x','y']}]},{id:'actual-adapter',label:'Actual adapter',kind:'adapter',implementation:'JavaScript'}],edges:[{from:'actual-instance',to:'actual-schema',label:'instance of'}]};
 const panel=createWorldsExplorer({load:async()=>model,subscribe:fn=>{listener=fn;return ()=>{unsubscribed=true;};},copy:async text=>copies.push(text)});document.body.append(panel.element);await tick();
 assert(panel.element.querySelectorAll('[data-world-node]').length===3,'all actual nodes rendered');
 assert(panel.element.querySelectorAll('[data-edge-from]').length===1,'only actual link rendered');
 assert(panel.element.querySelector('.p2-worlds-event-list').textContent.includes('No activation events'),'no invented activity');
 panel.element.querySelector('[data-world-node="actual-schema"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
 assert(panel.element.querySelector('.p2-worlds-wires').textContent===exact,'exact SOP retained');assert(!panel.element.querySelector('script'),'unsafe text remains text');
 const copy=[...panel.element.querySelectorAll('button')].find(button=>button.textContent==='Copy SOP Lang');copy.click();await tick();assert(copies[0]===exact,'copy exact SOP');assert(copy.textContent==='Copied','async copy feedback works');
 listener({nodeIds:['actual-instance'],phase:'begin',label:'Move object',time:'2026-11-17T10:20:30Z',detail:{x:18}});
 assert(panel.element.querySelector('[data-world-node="actual-instance"]').classList.contains('active'),'actual bus event activates its node');
 assert(panel.element.querySelector('.p2-worlds-event-list').textContent.includes('Move object'),'actual event shown');
 assert(panel.element.querySelector('.p2-worlds-event-list pre').textContent.includes('"x": 18'),'actual event detail retained');
 const input=panel.element.querySelector('input');input.value='adapter';input.dispatchEvent(new Event('input'));assert(panel.element.querySelectorAll('.p2-worlds-node.dim').length===2,'search dims rather than loses nodes');
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));assert(panel.element.querySelector('.p2-worlds-inspector h3').textContent==='Actual adapter','search can focus a real matching node');
 panel.destroy();assert(unsubscribed&&!panel.element.isConnected,'destroy unsubscribes and removes component');

 const many={nodes:[...model.nodes,...Array.from({length:40},(_,i)=>({id:'schema:'+i,label:'Schema '+i,kind:'schema',wires:'@s'+i+' test.schema'})),...Array.from({length:60},(_,i)=>({id:'knowledge:'+i,label:'Knowledge '+i,kind:'knowledge'})),{id:'native:test',label:'Test native state',kind:'runtime'},{id:'instance:test',label:'Test instance',kind:'instance'}],edges:[{from:'native:test',to:'schema:0',label:'uses'},{from:'native:test',to:'schema:1',label:'uses'}]};
 const large=createWorldsExplorer({load:async()=>many});document.body.append(large.element);await tick();assert(large.element.querySelectorAll('[data-world-node]').length===6,'overview keeps actual groups compact');assert(large.element.querySelector('[data-world-node="native:test"]')&&large.element.querySelector('[data-world-node="instance:test"]'),'operational state and instances stay visible');
 const collection=large.element.querySelector('[data-ui-collection="ui-collection:schemas"]');collection.dispatchEvent(new MouseEvent('click',{bubbles:true}));assert(large.element.querySelector('.p2-worlds-inspector').textContent.includes('schema:39'),'collection contains all exact member IDs');
 const expand=[...large.element.querySelectorAll('button')].find(button=>button.textContent==='Expand all');expand.click();assert(large.element.querySelectorAll('[data-world-node]').length===many.nodes.length,'Expand all shows every actual node');assert(!large.element.querySelector('[data-ui-collection]'),'expanded graph has no synthetic collections');
 const overview=[...large.element.querySelectorAll('button')].find(button=>button.textContent==='Overview');overview.click();const find=large.element.querySelector('input');find.value='Schema 39';find.dispatchEvent(new Event('input'));assert(large.element.querySelector('[data-world-node="schema:39"]'),'search reveals exact collection members');large.destroy();
 return {ok:true};
}
run().then(result=>document.querySelector('#result').textContent=encodeURIComponent(JSON.stringify(result))).catch(error=>document.querySelector('#result').textContent=encodeURIComponent(JSON.stringify({error:error.message,stack:error.stack})));
`;
test('Worlds explorer shows actual architecture and bus events with exact inspectable data',{skip:available?false:'Chromium unavailable',timeout:30000},async()=>{
 const profile=await mkdtemp(path.join(root,'tests','.worlds-explorer-chrome-'));
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script type="module">'+scenario+'</script>');return;}
   if(!['/worlds-explorer.mjs','/util.mjs'].includes(req.url)){res.statusCode=404;res.end();return;}
   res.setHeader('content-type','text/javascript');res.end(await readFile(path.join(root,'docs/webchat/ui',req.url.slice(1))));
  }catch(error){res.statusCode=500;res.end(error.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const {stdout,stderr}=await promisify(execFile)(chrome,['--headless','--no-sandbox','--disable-gpu','--password-store=basic','--disable-extensions','--no-first-run','--disable-background-networking','--disable-dev-shm-usage','--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=5000',`http://127.0.0.1:${server.address().port}/`],{timeout:25000,maxBuffer:8*1024**2});
  const result=stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1];assert.ok(result&&result!=='pending','browser scenario completed: '+stdout.slice(0,600)+' '+stderr.slice(-1000));
  const report=JSON.parse(decodeURIComponent(result));assert.deepEqual(report,{ok:true},JSON.stringify(report));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});
