// One editor area that never finishes preparing must not hold start-up or the other editors (owner, 2026-11-21: the live page stuck at
// "Preparing the editors (4 of 5)" on the Avatar). The page's first request to prepare the Avatar area is lost (the worker never answers it);
// with the editor preparation limit at 3 s start-up completes with the Avatar marked unavailable, a chat turn for another editor runs, and the
// Avatar is prepared again in the background until it is ready. Needs Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
import {SETTINGS_KEY,SETTINGS_VERSION} from '../docs/webchat/ui/settings.mjs';
import {loadAwareLimit} from './fixtures/load-aware.mjs';
import {TIME_LIMIT_SPECS} from '../src/dialog/time-limits.mjs';

const chrome=process.env.CHROME??'/usr/bin/chromium';
const skip=await access(chrome).then(()=>false,()=>'Chromium unavailable');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// Settings: a short editor preparation limit and a functional turn limit.
const limits=`try{const k=${JSON.stringify(SETTINGS_KEY)},s=JSON.parse(localStorage.getItem(k)??'null')??{settingsVersion:${SETTINGS_VERSION}};`
 +`s.timeLimits={...(s.timeLimits??{}),areaMs:3000,watchdogMs:${loadAwareLimit(TIME_LIMIT_SPECS.watchdogMs.def)}};localStorage.setItem(k,JSON.stringify(s));}catch{}`;
// The first 'ensure' of the Avatar tab is never delivered to the engine worker (a lost request: its answer never comes).
const loseFirstAvatarEnsure=`(()=>{const post=Worker.prototype.postMessage;let lost=false;Worker.prototype.postMessage=function(msg,...rest){if(!lost&&msg&&msg.op==='ensure'&&msg.tab==='avatar'){lost=true;return;}return post.call(this,msg,...rest);};})();`;

test('an editor area that does not finish preparing is marked unavailable, start-up completes, other turns run, and it is prepared in the background',{skip,timeout:600000},async()=>{
 const profileDir=await mkdtemp(resolve(tmpdir(),'psys2-area-unavailable-'));
 const browser=await openBrowserReaderRoute({chrome,profileDir,timeoutMs:240000,initScripts:[limits,loseFirstAvatarEnsure]});
 try{
  const parts=await browser.evaluate('window.psys2.startup.whenReady()');
  assert.equal(parts.reader,'ready');
  assert.match(String(parts.areas),/^(unavailable: avatar|ready)$/,JSON.stringify(parts));
  const before=await browser.evaluate(`window.psys2.engineClient.call('observe').then(x=>JSON.stringify(x.state['art.draw']??null).length)`);
  const reply=await browser.evaluate(`window.psys2.send('draw a lake with a house').then(r=>r?.text??'')`);
  assert.match(reply,/Created a lake/,reply);
  assert.ok(await browser.evaluate(`window.psys2.engineClient.call('observe').then(x=>JSON.stringify(x.state['art.draw']??null).length)`)>before,'the drawing changed');
  // The Avatar recovers in the background (a fresh preparation after the pause).
  let recovered=false;
  for(let i=0;i<120&&!recovered;i++){await delay(500);recovered=await browser.evaluate(`window.psys2.startup.parts.areas==='ready'&&!document.querySelector('#p2-tab-avatar')?.dataset.unavailable&&window.psys2.tabLoading.list().some(t=>t.id==='avatar'&&t.status==='ready')`);}
  assert.ok(recovered,JSON.stringify(await browser.evaluate('window.psys2.startup.parts')));
 }finally{await browser.close();await rm(profileDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
