// Real seven-world application build and five editor actions; no historical fixture loader.
import assert from'node:assert/strict';import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
const browser=await openBrowserReaderRoute(),expected=['art.draw','core','diagram.sketch','docs.editor','time.calendar','ui.avatar','ui.shell'];
try{
 assert.deepEqual([...browser.info.known].sort(),expected);
 const initial=await browser.evaluate(`(async()=>{const graph=await window.psys2.engineClient.call('worldsInspection');return {worlds:graph.nodes.filter(n=>n.id.startsWith('world:')).map(n=>({id:n.id,loaded:n.details.loaded})),instances:graph.nodes.filter(n=>n.id.startsWith('instance:')).map(n=>n.id)};})()`);
 assert.deepEqual(initial.worlds.map(node=>node.id.slice(6)).sort(),expected);assert.ok(initial.worlds.every(node=>node.loaded));assert.equal(initial.instances.length,5);
 const actions=[];
 for(const area of ['draw','diagram','calendar','editor','avatar'])actions.push(await browser.evaluate(`(async()=>{const app=window.psys2;app.showTab(${JSON.stringify(area)});const wait=async(fn)=>{const until=Date.now()+40000;while(!await fn()){if(Date.now()>until)throw Error('Action readiness timeout');await new Promise(resolve=>setTimeout(resolve,50));}};await wait(()=>!app.isBusy()&&!document.querySelector('.p2-die')?.disabled);const before=await app.trainingPairs.all();document.querySelector('.p2-die').click();await wait(async()=>!app.isBusy()&&(await app.trainingPairs.all()).length>before.length);const record=(await app.trainingPairs.all()).find(row=>!before.some(old=>old.id===row.id));return {view:record.view,operation:record.tool.operation,outcome:record.outcome,verification:record.verification.status};})()`));
 for(const [index,row]of actions.entries()){assert.equal(row.view,['draw','diagram','calendar','editor','avatar'][index]);assert.equal(row.outcome,'changed');assert.ok(!['refused','mismatch'].includes(row.verification));}
 const exceptions=browser.logs.console.filter(row=>row.type==='exception');assert.deepEqual(exceptions,[]);
 console.log(JSON.stringify({worlds:initial.worlds,instances:initial.instances,actions,exceptions,complete:true},null,2));
}finally{await browser.close();}
