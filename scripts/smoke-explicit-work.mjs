// Actual application: edited worlds require explicit file save/open, never startup migration.
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';import assert from'node:assert/strict';
const b=await openBrowserReaderRoute();
const wait=async expression=>{const end=Date.now()+60000;while(!await b.evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,100));}};
try{
 await b.evaluate(`window.psys2.showTab('draw');true`);await wait(`!window.psys2.isBusy()&&document.querySelector('.dr-toolbar')`);
 const saved=await b.evaluate(`(async()=>{const p=window.psys2;const made=await p.session.tool('@create drawing.object.make kind="circle" x=120 y=100 size=60');await p.refreshState();const file=await p.workFiles.snapshot();const {createInstanceStore}=await import('./ui/instance-store.mjs');const old=createInstanceStore({persistent:true});await old.saveMany(file.records);await old.close();localStorage.setItem('psys2.demo.worlds.v1',JSON.stringify({'art.draw':made.state['art.draw']}));return {file,created:made.ok,buffer:await p.instanceStore.inspect()};})()`);
 assert.equal(saved.created,true);assert.equal(saved.buffer.backend,'memory');assert.equal(saved.buffer.persistent,false);
 await b.evaluate(`window.__oldWorkPage=true;location.reload();true`);
 await wait(`!window.__oldWorkPage&&window.psys2?.workFiles&&window.psys2.engineClient?.info`);
 await b.evaluate(`window.psys2.showTab('draw');true`);await wait(`!window.psys2.isBusy()&&document.querySelector('.dr-toolbar')`);
 assert.equal(await b.evaluate(`window.psys2.session.state('art.draw').objects.length`),0);
 const result=await b.evaluate(`(async()=>{const file=${JSON.stringify(saved.file)},p=window.psys2;let rejected=false;try{await p.workFiles.open(JSON.stringify({...file,version:'older-build'}));}catch(e){rejected=e.message.includes('No conversion');}const unchanged=p.session.state('art.draw').objects.length===0;await p.workFiles.open(JSON.stringify(file));const {createInstanceStore}=await import('./ui/instance-store.mjs');const old=createInstanceStore({persistent:true});const preserved=(await old.all()).find(r=>r.world==='art.draw').wires===file.records.find(r=>r.world==='art.draw').wires;await old.close();return {rejected,unchanged,count:p.session.state('art.draw').objects.length,preserved,legacyJSONPreserved:!!localStorage.getItem('psys2.demo.worlds.v1'),buttons:[...document.querySelectorAll('.p2-tools button')].map(n=>n.textContent)};})()`);
 assert.equal(result.rejected,true);assert.equal(result.unchanged,true);assert.equal(result.count,1);assert.equal(result.preserved,true);assert.equal(result.legacyJSONPreserved,true);assert.ok(result.buttons.includes('Save work'));assert.ok(result.buttons.includes('Open work'));
 assert.deepEqual(b.logs.console.filter(x=>x.type==='exception'),[]);console.log(JSON.stringify({complete:true,freshReload:true,noLegacyMigration:true,oldDataIntact:true,manualSameBuildRestore:true,incompatibleBuildRefusedBeforeMutation:true}));
}finally{await b.close();}
