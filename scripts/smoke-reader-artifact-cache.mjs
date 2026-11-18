// Real application boot and reload in one Chromium profile; no mocked artifact fetches.
import assert from'node:assert/strict';
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
const browser=await openBrowserReaderRoute();
const modelRequests=()=>browser.logs.network.filter(entry=>/^\/models\/sop-bert\//.test(entry.path)&&!entry.path.endsWith('/deployment.json'));
try{
 const early=await browser.evaluate(`(async()=>{const client=window.psys2.engineClient,readerState=client.info.reader.state;window.psys2.showTab('draw');const until=Date.now()+30000;while(!document.querySelector('.dr-toolbar')){if(Date.now()>until)throw Error('Drawing toolbar readiness timeout');await new Promise(resolve=>setTimeout(resolve,20));}const uiReadyMs=performance.now(),toolStarted=performance.now(),tool=await client.session.tool('@show drawing.ids.show mode="always"',{view:'draw'});return {readerState,uiReadyMs,nativeActionOK:tool.ok,nativeActionMs:performance.now()-toolStarted};})()`);
 assert.equal(early.readerState,'loading','Editors must become available before cold neural assembly.');assert.equal(early.nativeActionOK,true);
 const cold=await browser.evaluate(`(async()=>{const result=await window.psys2.engineClient.call('prepare'),reader=window.psys2.engineClient.info.reader;return {state:reader.state,available:result.available,cache:reader.cache,readerReadyMs:performance.now()};})()`);
 assert.equal(cold.available,true);assert.ok(cold.readerReadyMs>early.uiReadyMs);
 assert.equal(cold.state,'ready');assert.ok(cold.cache,'Reader cache diagnostics must be exposed by the actual worker.');
 assert.equal(cold.cache.stats.hits,0);assert.ok(cold.cache.stats.networkRequests>=7);
 const coldRequests=modelRequests().length;
 await browser.evaluate(`window.__cacheReloadPending=true;setTimeout(()=>location.reload(),0);true`);
 const until=Date.now()+180000;let warm;
 while(Date.now()<until){
  try{warm=await browser.evaluate(`(async()=>{if(window.__cacheReloadPending||!window.psys2?.engineClient)return null;await window.psys2.engineClient.ready();const uiReadyMs=performance.now();await window.psys2.engineClient.call('prepare');const reader=window.psys2.engineClient.info.reader;return {state:reader.state,cache:reader.cache,uiReadyMs,readerReadyMs:performance.now()};})()`);if(warm)break;}catch{/* Navigation replaces the execution context. */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(warm,'Application did not finish its real reload.');assert.equal(warm.state,'ready');assert.equal(warm.cache.stats.networkRequests,0);assert.ok(warm.cache.stats.hits>=7);assert.equal(warm.cache.stats.downloadedBytes,0);
 const warmRequests=modelRequests().length-coldRequests;assert.equal(warmRequests,0,'Reload must not request unchanged model/tokenizer/config/binding/manifest artifacts.');
 console.log(JSON.stringify({early,cold,warm,actualNetworkRequests:{cold:coldRequests,warm:warmRequests}},null,2));
}finally{await browser.close();}
