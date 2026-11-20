// Real browser: global architecture, the Drawing tab's SOP area instance, exact archives and actual activity bus.
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';
import assert from'node:assert/strict';
const b=await openBrowserReaderRoute();
const wait=async expression=>{const until=Date.now()+45000;while(!await b.evaluate(expression)){if(Date.now()>until)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,100));}};
try{
 await b.viewport(1600,1000);
 await b.evaluate(`window.psys2.showTab('draw');true`);
 await wait(`!window.psys2.isBusy()&&document.querySelector('.p2-area-stage')`);
 const made=await b.evaluate(`(async()=>{const r=await window.psys2.session.tool('@create drawing.object.make kind="rectangle" x=80 y=70 size=62 color="#FFFFFF"');await window.psys2.refreshState();return r;})()`);assert.equal(made.ok,true,JSON.stringify(made));
 await b.evaluate(`window.psys2.showTab('worlds');true`);
 await wait(`document.querySelector('.p2-worlds [data-world-node="instance:art.draw"]')`);
 const actual=await b.evaluate(`(async()=>{const data=await window.psys2.engineClient.call('worldsInspection');return {ids:data.nodes.map(n=>n.id),instance:data.nodes.find(n=>n.id==='instance:art.draw'),edges:data.edges,events:window.psys2.worldActivity.list(),tabs:[...document.querySelectorAll('.p2-pane>.p2-tabs .p2-tab')].map(n=>n.querySelector('.p2-tab-label')?.textContent??n.textContent),subtabs:document.querySelectorAll('.p2-world-subtabs').length,width:document.documentElement.scrollWidth};})()`);
 assert.ok(actual.ids.includes('runtime:registry'));assert.ok(actual.ids.includes('interpreter:art.draw'));assert.ok(!actual.ids.includes('structure:art.draw:history'));assert.ok(actual.ids.includes('interpreter:app.history'));assert.match(actual.instance.wires,/^@\S+ w\.drawing\.object .*code=o1 drawing=rectangle/m);assert.ok(!actual.instance.wires.includes('std.instance.snapshot'));assert.ok(!actual.instance.wires.includes('std.instance.object'));assert.ok(actual.instance.details.instanceId);assert.equal(actual.subtabs,0);assert.deepEqual(actual.tabs.slice(-3),['Avatar','Settings','Worlds']);assert.ok(actual.width<=1600);
 const mapPosition=await b.evaluate(`document.querySelector('.p2-worlds-graph').getAttribute('viewBox')`);
 await b.evaluate(`document.querySelector('[data-world-node="instance:art.draw"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));true`);
 const inline=await b.evaluate(`(()=>{const page=document.querySelector('.p2-worlds-dialog'),input=document.querySelector('.p2-text');input.focus();return {tag:page.tagName,role:page.getAttribute('role'),modal:page.getAttribute('aria-modal'),chatInert:document.querySelector('.p2-chat').inert,tabsInert:document.querySelector('.p2-pane').inert,chatFocused:document.activeElement===input,breadcrumb:!!document.querySelector('.p2-worlds [data-breadcrumb-map]')};})()`);assert.equal(inline.tag,'SECTION');assert.equal(inline.role,'region');assert.equal(inline.modal,null);assert.equal(inline.chatInert,false);assert.equal(inline.tabsInert,false);assert.equal(inline.chatFocused,true);assert.equal(inline.breadcrumb,true);
 await b.evaluate(`document.querySelector('[data-detail-tab="sop"]').click();true`);
 assert.equal(await b.evaluate(`document.querySelector('.p2-worlds-wires')?.textContent`),actual.instance.wires);
 await b.screenshot('../.session-control/worlds-detail-preview.png');
 await b.evaluate(`document.querySelector('[data-breadcrumb-map]').click();true`);assert.equal(await b.evaluate(`document.querySelector('.p2-worlds-graph').getAttribute('viewBox')`),mapPosition);
 await b.evaluate(`(async()=>{window.psys2.showTab('draw');const r=await window.psys2.session.tool('@create drawing.object.make kind="circle" x=140 y=100 size=40 color="#0000FF"',{view:'draw'});await window.psys2.refreshState();window.psys2.showTab('worlds');return r.ok;})()`);
 await wait(`window.psys2.worldActivity.list().some(e=>e.nodeIds?.includes('interpreter:art.draw')&&e.phase==='end')`);
 await b.evaluate(`document.querySelector('[aria-label="Open activity log"]').click();true`);
 await wait(`document.querySelectorAll('.p2-worlds-event:not(.empty)').length>0`);
 await b.evaluate(`document.querySelector('[data-breadcrumb-map]').click();true`);
 const layout=await b.evaluate(`({icons:document.querySelectorAll('[data-world-node]').length,edges:document.querySelectorAll('[data-edge-from]').length,inspector:!!document.querySelector('.p2-worlds-inspector'),groups:document.querySelectorAll('[data-layout-group]').length})`);assert.ok(layout.icons>0&&layout.icons<=actual.ids.length);assert.ok(layout.edges>0);assert.equal(layout.inspector,false);
 await b.screenshot('../.session-control/worlds-preview.png');
 const errors=b.logs.console.filter(x=>x.type==='exception');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({complete:true,nodes:actual.ids.length,links:actual.edges.length,inlineDetails:true,chatAndTabsUsable:true,breadcrumbs:true,preservedMapPosition:true,exactArchive:true,historyInterpreter:true,liveAreaEvents:true,noInnerCodeTabs:true,desktopFits:true,screenshot:'.session-control/worlds-preview.png'}));
}finally{await b.close();}
