// Actual app controls/worker archives. Only the clipboard API is replaced to inspect copied bytes.
import{openBrowserReaderRoute}from'./lib/browser-reader-route.mjs';import assert from'node:assert/strict';
const b=await openBrowserReaderRoute(),checks=[];
const wait=async(expression)=>{const until=Date.now()+40000;while(!await b.evaluate(expression)){if(Date.now()>until)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,70));}};
try{
 await b.viewport(1440,1000);await b.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=String(text);}}});window.psys2.showTab('draw');true`);
 await wait(`[...document.querySelectorAll('.dr-toolbar button')].some(button=>button.textContent.trim()==='Add'&&!button.disabled)&&!window.psys2.isBusy()`);
 await b.evaluate(`[...document.querySelectorAll('.dr-toolbar button')].find(b=>b.textContent.trim()==='Add').click();true`);
 await wait(`document.querySelector('.dr-add-chooser')&&!document.querySelector('.dr-add-chooser').hidden`);
 await b.evaluate(`[...document.querySelectorAll('.dr-add-chooser button')].find(b=>b.textContent.trim()==='house').click();true`);
 await wait(`window.psys2.session.state('art.draw')?.objects.length===1&&!window.psys2.isBusy()&&document.querySelector('.dr-inspector .p2-object-code pre')`);
 const capture=await b.evaluate(`(()=>{const row=[...document.querySelectorAll('.p2-msg.is-user')].at(-1),detail=row.querySelector('.p2-intent');return {text:row.querySelector('.p2-bubble').firstChild.textContent,wires:detail.querySelector('pre').textContent,closed:!detail.open};})()`);
 assert.equal(capture.closed,true);assert.equal(capture.wires.split('\n').length,1);assert.match(capture.wires,/drawing.object.make/);assert.doesNotMatch(capture.wires,/app.control.source|observed.source|source.start/);
 await b.evaluate(`(()=>{const row=[...document.querySelectorAll('.p2-msg.is-user')].at(-1);row.querySelector('.p2-meta [aria-label="Copy text"]').click();return true;})()`);await wait(`window.__copied===${JSON.stringify(capture.text)}`);
 await b.evaluate(`(()=>{const row=[...document.querySelectorAll('.p2-msg.is-user')].at(-1);row.querySelector('.p2-intent summary').click();row.querySelector('.p2-intent>[aria-label="Copy SOP Lang"]').click();return true;})()`);await wait(`window.__copied===${JSON.stringify(capture.wires)}`);
 const selected=await b.evaluate(`(async()=>{const data=await window.psys2.engineClient.call('instanceInspection',{world:'art.draw'}),id=window.psys2.session.state('art.draw').selected,object=data.objects.find(o=>o.id===id);return {id,wires:object.wires,shown:document.querySelector('.dr-inspector .p2-object-code pre').textContent};})()`);assert.equal(selected.shown,selected.wires);checks.push({compactOneWire:true,chatStartsCollapsed:true,copiedTextExact:true,copiedCommandExact:true,selectedObjectSopExact:selected.id});
 for(const[area,world]of Object.entries({draw:'art.draw',diagram:'diagram.sketch',calendar:'time.calendar',editor:'docs.editor',avatar:'ui.avatar'})){
  await b.evaluate(`window.psys2.showTab(${JSON.stringify(area)});true`);await wait(`!window.psys2.isBusy()&&document.querySelector('#p2-panel-${area} .p2-active-world')`);
  await b.evaluate(`window.psys2.showTab('worlds');true`);
  await wait(`document.querySelector('[data-world-node="instance:${world}"]')&&!document.querySelector('.p2-worlds-status[role="alert"]')`);
  await b.evaluate(`document.querySelector('[data-world-node="instance:${world}"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));true`);
  await b.evaluate(`document.querySelector('[data-detail-tab="sop"]').click();true`);
  const data=await b.evaluate(`(async()=>{const record=await window.psys2.engineClient.call('instanceInspection',{world:${JSON.stringify(world)}});return {actual:record.wires,shown:document.querySelector('.p2-worlds-wires').textContent,width:document.documentElement.scrollWidth,instance:record.instanceId,revision:record.revision};})()`);assert.equal(data.shown,data.actual);assert.ok(data.width<=1440);
  await b.evaluate(`[...document.querySelectorAll('.p2-worlds-dialog button')].find(b=>b.textContent==='Copy SOP Lang').click();true`);await wait(`window.__copied===${JSON.stringify(data.actual)}`);
  await b.evaluate(`document.querySelector('[aria-label="Back to architecture map"]').click();true`);
  checks.push({area,archiveExact:true,copyExact:true,instance:data.instance,revision:data.revision});
 }
 assert.deepEqual(b.logs.console.filter(x=>x.type==='exception'),[]);console.log(JSON.stringify({complete:true,checks}));
}finally{await b.close();}
