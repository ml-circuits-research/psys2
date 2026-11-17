#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Real browser carrier/worker proof. Requires the current built webchat and PUPPETEER_CORE.
import assert from 'node:assert/strict';
import {openChat} from './test-webchat-turns.mjs';

const ready=pg=>pg.waitForFunction(()=>window.psys2?.instanceStore&&document.querySelector('[data-ready="true"]'),{timeout:120000});
const idle=pg=>pg.waitForFunction(()=>window.psys2&&!window.psys2.isBusy(),{timeout:30000});
const reload=async pg=>{await pg.reload({waitUntil:'domcontentloaded'});await ready(pg);await idle(pg);};
const documentState=pg=>pg.evaluate(()=>{const state=window.psys2.session.state()['docs.editor'];return {title:state.title,textId:state.textId,blocks:state.blocks};});
const flush=pg=>pg.evaluate(()=>window.psys2.flushInstances());
async function title(pg,value){
 await idle(pg);await pg.waitForSelector('.nd-title',{visible:true});
 await pg.$eval('.nd-title',(input,value)=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},value);
 await pg.waitForFunction(value=>window.psys2.session.state()['docs.editor']?.title===value,{timeout:30000},value);
 await idle(pg);
}
async function run(){
 const c=await openChat({throttle:1,hash:'#editor',query:'?psys2nosw=1',viewport:{width:1440,height:900}}),{pg}=c;
 try{
  await ready(pg);await idle(pg);await pg.evaluate(()=>window.psys2.showTab('editor'));
  await title(pg,'SOP persistence proof');
  await pg.evaluate(()=>[...document.querySelectorAll('.nd-toolbar button')].find(button=>button.textContent==='+ Paragraph').click());
  await pg.waitForSelector('textarea.nd-edit',{visible:true});
  await pg.type('textarea.nd-edit','A document survives a real browser reload.');
  await pg.keyboard.down('Control');await pg.keyboard.press('Enter');await pg.keyboard.up('Control');
  await pg.waitForFunction(()=>window.psys2.session.state()['docs.editor']?.blocks?.some(block=>block.text==='A document survives a real browser reload.'),{timeout:30000});
  await idle(pg);await flush(pg);
  const before=await documentState(pg);
  assert.ok(before.textId&&before.blocks.length&&before.blocks.every(block=>block.id));
  const records=await pg.evaluate(()=>window.psys2.instanceStore.all());
  const record=records.find(row=>row.world==='docs.editor');
  assert.ok(record?.wires);assert.deepEqual(Object.keys(record).sort(),['instanceId','revision','wires','world']);
  assert.equal(await pg.evaluate(()=>localStorage.getItem('psys2.demo.worlds.v1')),null);
  await reload(pg);assert.deepEqual(await documentState(pg),before);
  const reloaded=await pg.evaluate(()=>window.psys2.instanceStore.all());
  assert.equal(reloaded.find(row=>row.world==='docs.editor').instanceId,record.instanceId);
  console.log('PASS  editor UI writes SOP; reload preserves document and stable IDs');

  await pg.evaluate(async()=>{await window.psys2.flushInstances();const state=window.psys2.session.state()['docs.editor'];await window.psys2.instanceStore.clear();localStorage.setItem('psys2.demo.worlds.v1',JSON.stringify({'docs.editor':state}));});
  await reload(pg);assert.deepEqual(await documentState(pg),before);
  assert.equal(await pg.evaluate(()=>localStorage.getItem('psys2.demo.worlds.v1')),null);
  assert.ok((await pg.evaluate(()=>window.psys2.instanceStore.all())).find(row=>row.world==='docs.editor')?.wires);
  console.log('PASS  legacy native JSON migrates through SOP readback and restores the same IDs');

  const damaged=await pg.evaluate(async()=>{await window.psys2.flushInstances();const records=await window.psys2.instanceStore.all();const row=records.find(row=>row.world==='docs.editor');row.wires='this is not a valid SOP instance archive';await window.psys2.instanceStore.saveMany([row]);localStorage.setItem('psys2.demo.worlds.v1','preserve-this-legacy-value');return window.psys2.instanceStore.all();});
  await reload(pg);
  await pg.waitForFunction(()=>document.body.innerText.includes('further saving is paused'),{timeout:30000});
  assert.deepEqual(await pg.evaluate(()=>window.psys2.instanceStore.all()),damaged);
  assert.equal(await pg.evaluate(()=>localStorage.getItem('psys2.demo.worlds.v1')),'preserve-this-legacy-value');
  await pg.evaluate(()=>window.psys2.showTab('editor'));await title(pg,'Unsaved after corrupt archive');
  assert.equal(await pg.evaluate(async()=>{try{await window.psys2.flushInstances();return false;}catch{return true;}}),true);
  assert.deepEqual(await pg.evaluate(()=>window.psys2.instanceStore.all()),damaged);
  assert.equal(await pg.evaluate(()=>[...document.querySelectorAll('.is-note')].filter(node=>node.innerText.includes('further saving is paused')).length),1);
  assert.deepEqual(c.errors,[]);
  console.log('PASS  corrupt SOP and legacy data survive failed boot and further edits; one notice; autosave blocked');
 }finally{await c.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
