// Real UI: editor / utility separation, inline settings and live graph with editor context retained.
import assert from'node:assert/strict';import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
const b=await openBrowserReaderRoute();
const wait=async expression=>{const end=Date.now()+45000;while(!await b.evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,80));}};
try{
 await b.viewport(1600,1000);await b.evaluate(`window.psys2.showTab('draw');true`);await wait(`!window.psys2.isBusy()&&document.querySelector('.dr-toolbar')`);
 const tabs=await b.evaluate(`([...document.querySelectorAll('.p2-pane>.p2-tabs>.p2-tab')].map(t=>({id:t.id,label:t.querySelector('.p2-tab-label')?.textContent,icon:!!t.querySelector('svg'),separator:t.classList.contains('p2-tab-architecture')})))`);
 assert.deepEqual(tabs.map(t=>t.label),['Drawing','Diagram','Calendar','Documents','Avatar','Settings','Worlds']);assert.ok(tabs.every(t=>t.icon));assert.equal(tabs.find(t=>t.label==='Settings').separator,true);
 await b.evaluate(`document.querySelector('#p2-tab-settings').click();true`);await wait(`document.querySelector('#p2-panel-settings .p2-settings-inline:not([hidden])')`);
 const settings=await b.evaluate(`({role:document.querySelector('.p2-settings-inline').getAttribute('role'),modal:document.querySelector('.p2-settings-inline').getAttribute('aria-modal'),chatInert:document.querySelector('.p2-chat').inert,paneInert:document.querySelector('.p2-pane').inert,world:window.psys2.session.state('ui.shell').activeTab})`);
 assert.equal(settings.role,'region');assert.equal(settings.modal,null);assert.equal(settings.chatInert,false);assert.equal(settings.paneInert,false);assert.equal(settings.world,'draw');
 for(const topic of ['reading','languages','models','privacy','developer','about']){await b.evaluate(`document.querySelector('#p2-st-${topic}').click();true`);await wait(`document.querySelector('#p2-st-${topic}').getAttribute('aria-selected')==='true'`);}
 await b.evaluate(`document.querySelector('#p2-st-about').click();true`);await wait(`document.querySelector('#p2-st-about').getAttribute('aria-selected')==='true'`);
 await b.screenshot('../.session-control/settings-tab-preview.png');
 await b.evaluate(`document.querySelector('#p2-tab-worlds').click();true`);await wait(`document.querySelector('[data-world-node="interpreter:art.draw"]')`);
 const result=await b.evaluate(`(async()=>{const r=await window.psys2.session.tool('drawing.ids.show',{mode:'always'},{view:'draw'});window.psys2.applyState(r.state);return {ok:r.ok,view:document.querySelector('#p2-tab-worlds').getAttribute('aria-selected'),activeEditor:window.psys2.session.state('ui.shell').activeTab};})()`);
 assert.equal(result.ok,true);assert.equal(result.view,'true');assert.equal(result.activeEditor,'draw');
 await wait(`document.querySelector('[data-world-node="interpreter:art.draw"]').classList.contains('active')`);
 assert.equal(await b.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);assert.deepEqual(b.logs.console.filter(e=>e.type==='exception'),[]);
 console.log(JSON.stringify({complete:true,tabs:tabs.map(t=>t.label),icons:true,separator:true,settingsInline:true,utilityTabsKeepEditorContext:true,nativeActivationVisibleWhileWorldsOpen:true}));
}finally{await b.close();}
