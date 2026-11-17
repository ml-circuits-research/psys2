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
import {createWorldCodePanel,createObjectCodePanel} from '/world-code.mjs';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const snapshot=revision=>({world:'invented.world',instanceId:'live-instance',revision,schemaVersion:'3',
 wires:'@instance core.instance id="live-instance"\\n@o2 invented.object value=271.1234567890123\\n@projection renderer.state data="<unsafe>"\\n@history native.history turn=7\\n',
 metadata:{source:'actual archive',projection:{present:true},history:[1,2]},
 objects:[{id:'o2',type:'invented.object',factId:'instance.o2',wires:'@instance.o2 invented.object value=271.1234567890123\\n@r invented.relation from=$instance.o2 to=$instance.o3\\n',attributes:{value:271.1234567890123},relations:[{id:'r',to:'instance.o3'}],metadata:{exact:true},observation:{source:'live-object-source',version:'14'}}]});
async function run(){
 const loads=[],copies=[],copyWait=deferred();let deferCopy=false;
 const world=createWorldCodePanel({world:'invented.world',load:()=>{const d=deferred();loads.push(d);return d.promise;},copy:text=>{copies.push(text);return deferCopy?copyWait.promise:undefined;}});
 document.body.append(world.element);assert(loads.length===1,'world loads immediately');
 const fresh=world.refresh();loads[1].resolve(snapshot('2'));assert(await fresh,'fresh load succeeds');
 loads[0].resolve(snapshot('1'));await tick();
 assert(world.element.querySelector('dl').textContent.includes('Revision2'),'old load cannot replace newer revision');
 const archive=world.element.querySelector('.p2-world-code-wires');assert(archive.textContent===snapshot('2').wires,'full actual archive stays byte-exact');
 assert(archive.children.length===0,'SOP is rendered as text');
 assert(world.element.textContent.includes('renderer projection and native history'),'archive scope is explicit');
 const copy=[...world.element.querySelectorAll('button')].find(b=>b.textContent==='Copy SOP');copy.click();await tick();assert(copies[0]===snapshot('2').wires,'copy receives exact full archive');
 deferCopy=true;copy.click();const next=world.refresh();loads[2].resolve(snapshot('3'));await next;copyWait.resolve();await tick();
 assert(world.element.querySelector('[role=status]').textContent.includes('objects in this instance snapshot'),'stale copy completion cannot overwrite current status');
 const failed=world.refresh();loads[3].reject(Error('Worker archive unavailable: revision conflict'));assert(!await failed,'failed refresh returns false');
 assert(world.element.querySelector('[role=alert]').textContent.includes('revision conflict'),'actual load cause is visible');assert(!archive.textContent,'failed refresh does not show an old archive as current');
 const wrong=world.refresh();loads[4].resolve({...snapshot('4'),world:'other.world'});assert(!await wrong,'world mismatch is visible');
 assert(world.element.querySelector('[role=alert]').textContent.includes('expected invented.world'),'mismatch displays actual world identity');
 const objectLoads=[],objectCopies=[];
 const object=createObjectCodePanel({load:()=>{const d=deferred();objectLoads.push(d);return d.promise;},copy:text=>objectCopies.push(text)});document.body.append(object.element);
 assert(objectLoads.length===0,'no guessed object selection is loaded');
 const first=object.refresh(['missing']),second=object.refresh(['o2']);objectLoads[1].resolve(snapshot('8'));assert(await second,'selected object loads');objectLoads[0].resolve(snapshot('7'));await first;
 const article=object.element.querySelector('article');assert(article.dataset.objectId==='o2','late selection cannot replace current object');
 assert(article.textContent.includes('invented.object')&&article.textContent.includes('instance.o2'),'actual type and fact identity are visible');
 assert(article.textContent.includes('live-object-source')&&article.textContent.includes('14'),'actual observation evidence is visible');
 assert(object.element.querySelector('dl').textContent.includes('live-instance')&&object.element.querySelector('dl').textContent.includes('Revision8'),'object inspector shows actual world revision');
 assert(article.querySelector('pre').textContent===snapshot('8').objects[0].wires,'object SOP and relation wires remain exact');
 assert(article.querySelector('details').open,'actual object wires are initially visible');
 assert(article.querySelectorAll('details').length===4,'attributes, relations and metadata remain expandable');
 article.querySelector('button').click();await tick();assert(objectCopies[0]===snapshot('8').objects[0].wires,'object copy receives only exact related wires');
 const absent=object.refresh(['not-there']);objectLoads[2].resolve(snapshot('9'));await absent;assert(object.element.textContent.includes('absent from this instance snapshot'),'missing selection stays missing');assert(!object.element.querySelector('article pre'),'missing id never borrows another object');
 const pending=object.refresh(['o2']);await object.refresh([]);objectLoads[3].resolve(snapshot('10'));await pending;
 assert(object.element.textContent.includes('Select an object')&&!object.element.querySelector('article'),'clearing selection invalidates pending loads');
 const objectError=object.refresh(['o2']);objectLoads[4].reject(Error('Observation failed: object removed'));assert(!await objectError,'object load error returns false');assert(object.element.querySelector('[role=alert]').textContent.includes('object removed'),'object failure displays actual cause');
 const removed=object.refresh(['o2']);object.destroy();objectLoads[5].resolve(snapshot('11'));assert(!await removed&&!object.element.isConnected,'destroy suppresses pending object render');
 const stopped=world.refresh();world.destroy();loads[5].resolve(snapshot('11'));assert(!await stopped&&!world.element.isConnected,'destroy suppresses pending world render');
 assert(document.querySelectorAll('#p2-world-code-style').length===1,'multiple panels share one scoped stylesheet');
 return {ok:true};
}
run().then(result=>document.querySelector('#result').textContent=encodeURIComponent(JSON.stringify(result))).catch(error=>document.querySelector('#result').textContent=encodeURIComponent(JSON.stringify({error:error.message,stack:error.stack})));
`;

test('world and selected-object code panels preserve actual SOP, identities, errors and latest-load ownership',{skip:available?false:'Chromium unavailable',timeout:30000},async()=>{
 const profile=await mkdtemp(path.join(root,'tests','.world-code-chrome-'));
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script type="module">'+scenario+'</script>');return;}
   if(!['/world-code.mjs','/util.mjs'].includes(req.url)){res.statusCode=404;res.end();return;}
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
