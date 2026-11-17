// Real application boot and reload in one Chromium profile; no mocked artifact fetches.
import assert from'node:assert/strict';
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
const browser=await openBrowserReaderRoute();
const modelRequests=()=>browser.logs.network.filter(entry=>/^\/models\/sop-bert\//.test(entry.path)&&!entry.path.endsWith('/deployment.json'));
try{
 const cold=await browser.evaluate(`(()=>{const reader=window.psys2.engineClient.info.reader;return {state:reader.state,cache:reader.cache};})()`);
 assert.equal(cold.state,'ready');assert.ok(cold.cache,'Reader cache diagnostics must be exposed by the actual worker.');
 assert.equal(cold.cache.stats.hits,0);assert.ok(cold.cache.stats.networkRequests>=7);
 const coldRequests=modelRequests().length;
 await browser.evaluate(`window.__cacheReloadPending=true;setTimeout(()=>location.reload(),0);true`);
 const until=Date.now()+180000;let warm;
 while(Date.now()<until){
  try{warm=await browser.evaluate(`(async()=>{if(window.__cacheReloadPending||!window.psys2?.engineClient)return null;await window.psys2.engineClient.ready();const reader=window.psys2.engineClient.info.reader;return {state:reader.state,cache:reader.cache};})()`);if(warm)break;}catch{/* Navigation replaces the execution context. */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(warm,'Application did not finish its real reload.');assert.equal(warm.state,'ready');assert.equal(warm.cache.stats.networkRequests,0);assert.ok(warm.cache.stats.hits>=7);assert.equal(warm.cache.stats.downloadedBytes,0);
 const warmRequests=modelRequests().length-coldRequests;assert.equal(warmRequests,0,'Reload must not request unchanged model/tokenizer/config/binding/manifest artifacts.');
 console.log(JSON.stringify({cold,warm,actualNetworkRequests:{cold:coldRequests,warm:warmRequests}},null,2));
}finally{await browser.close();}
