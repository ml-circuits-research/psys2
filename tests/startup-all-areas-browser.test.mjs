// Start-up prepares everything a turn needs (owner, 2026-11-21): SOP-BERT, the placement solver, every editor area and the
// catalog index. A message typed right after the page appears, before any of them is ready and without opening the Drawing
// tab, waits for start-up off the turn clock and then runs: "draw a lake with a house" read first in the Diagram (the first
// tab) is re-read in the other live editors (interpretation-policy.sop app.interpret.areaRetry) and drawn; a diagram request
// typed while the Drawing is shown reaches the Diagram the same way. No turn times out at the product watchdog (scaled only
// by the gate's load). A second visit with the same browser profile (warm: Cache Storage, service worker) is ready sooner
// and reads the reader artifacts from the cache. Needs Chromium; the placement solver loads from the library site when the
// network allows (otherwise the internal search places, which this test accepts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
import {functionalTurnLimitsScript,loadAwareLimit} from './fixtures/load-aware.mjs';
import {TIME_LIMIT_DEFAULTS} from '../src/dialog/time-limits.mjs';

const chrome=process.env.CHROME??'/usr/bin/chromium';
const skip=await access(chrome).then(()=>false,()=>'Chromium unavailable');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function type(browser,text){
 await browser.evaluate(`(()=>{const t=document.querySelector('textarea.p2-text');t.focus();t.value='';})()`);
 await browser.input('insertText',{text});
 await browser.input('dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await browser.input('dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
}
async function settle(browser){
 await delay(300);
 for(let i=0;i<3600&&await browser.evaluate('window.psys2.busy||window.psys2.queue.length>0||!window.psys2.startup.ready');i++)await delay(100);
}
const lastBot=browser=>browser.evaluate(`(()=>{const m=[...document.querySelectorAll('.p2-msg.is-bot')].at(-1);return {text:m?.querySelector('.p2-bubble')?.textContent??m?.textContent??'',cls:m?.className??''};})()`);
const objects=(browser,world)=>browser.evaluate(`window.psys2.engineClient.call('observe').then(x=>JSON.stringify(x.state[${JSON.stringify(world)}]??null).length)`);
const readyMs=browser=>browser.evaluate(`window.psys2.startup.whenReady().then(()=>Math.round(performance.getEntriesByName('psys2:startup-ready')[0]?.startTime??-1))`);

test('a chat turn typed at start waits for start-up, draws from the Diagram and reaches the Diagram from the Drawing; a warm visit is faster',{skip,timeout:600000},async()=>{
 const profileDir=await mkdtemp(resolve(tmpdir(),'psys2-startup-areas-'));
 const initScripts=[functionalTurnLimitsScript(loadAwareLimit(TIME_LIMIT_DEFAULTS.watchdogMs))];
 let browser=await openBrowserReaderRoute({chrome,profileDir,timeoutMs:240000,initScripts});
 try{
  // Cold: typed before start-up is done, with the Diagram shown (the first tab of a fresh profile).
  assert.equal(await browser.evaluate('window.psys2.startup.ready'),false,'start-up must still be preparing when the first message is typed');
  const drawBefore=await objects(browser,'art.draw');
  await type(browser,'draw a lake with a house');
  await settle(browser);
  const drawn=await lastBot(browser);
  assert.match(drawn.text,/Created a lake/,JSON.stringify(drawn));
  assert.doesNotMatch(drawn.cls,/is-stopped|is-error/,JSON.stringify(drawn));
  assert.ok(await objects(browser,'art.draw')>drawBefore,'the drawing changed');
  assert.equal(await browser.evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`),'Drawing');
  const parts=await browser.evaluate('window.psys2.startup.parts');
  assert.deepEqual(Object.keys(parts).sort(),['areas','catalog','reader','solver']);
  assert.equal(parts.reader,'ready');assert.equal(parts.areas,'ready');
  const cold=await readyMs(browser);
  // Every editor's UI exists without its tab having been opened.
  assert.equal(await browser.evaluate(`window.psys2.tabLoading.list().filter(t=>t.status==='ready').map(t=>t.id).sort().join(',')`),'avatar,calendar,diagram,draw,editor');
  // From the Drawing, a request only the Diagram can take reaches the Diagram.
  const diagramBefore=await objects(browser,'diagram.sketch');
  await type(browser,'add a node named server');
  await settle(browser);
  const node=await lastBot(browser);
  assert.doesNotMatch(node.cls,/is-stopped|is-error/,JSON.stringify(node));
  assert.ok(await objects(browser,'diagram.sketch')>diagramBefore,JSON.stringify(node));
  assert.equal(await browser.evaluate(`[...document.querySelectorAll('.p2-msg')].some(m=>/took too long|time limit/i.test(m.textContent))`),false);
  const url=new URL(browser.url);
  await browser.close();
  // Warm: the same profile and origin.
  browser=await openBrowserReaderRoute({chrome,profileDir,serverPort:Number(url.port),timeoutMs:240000,initScripts});
  const warm=await readyMs(browser);
  const reader=await browser.evaluate(`window.psys2.engineClient.call('prepare')`);
  assert.equal(reader.available,true);
  assert.equal(reader.reader.cache.stats.downloadedBytes,0,JSON.stringify(reader.reader.cache.stats));
  assert.ok(reader.reader.cache.stats.hits>0);
  console.log(`# start-up ready: cold ${cold} ms, warm ${warm} ms`);
  assert.ok(warm<cold,`warm ${warm} ms should be below cold ${cold} ms`);
 }finally{await browser.close();await rm(profileDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
