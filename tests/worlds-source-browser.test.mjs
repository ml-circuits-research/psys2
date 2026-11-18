// Normal built application and real worker RPC; no stubbed model, source loader or tool host.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
const chrome=process.env.CHROME??'/usr/bin/chromium';let available=true;try{await access(chrome);}catch{available=false;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('built Worlds RPC and explicit SOP inspection preserve state across catalog sources and mobile navigation',{skip:available?false:'Chromium unavailable',timeout:90000},async()=>{
 const b=await openBrowserReaderRoute({chrome,timeoutMs:30000});
 const wait=async expression=>{for(let i=0;i<400;i++){if(await b.evaluate(expression))return;const error=await b.evaluate(`document.querySelector('.p2-worlds-status[role=alert]')?.textContent`);if(error)throw Error(error);await pause(50);}throw Error('Worlds browser timeout: '+expression);};
 try{
  await b.viewport(390,844);await wait(`document.querySelector('.p2').classList.contains('is-phone')`);await b.evaluate(`document.querySelector('.p2-burger').click();document.querySelector('.p2-menu-item[data-page=worlds]').click();true`);
  await wait(`document.querySelectorAll('[data-world-node]').length>0`);
  if(await b.evaluate(`document.querySelector('.p2').classList.contains('p2-on-chat')`))await b.evaluate(`document.querySelector('.p2-burger').click();document.querySelector('.p2-menu-item[data-page=worlds]').click();true`);
  await wait(`document.querySelector('.p2-worlds').getBoundingClientRect().width>0`);
  const nodes=await b.evaluate(`(async()=>{const graph=await window.psys2.engineClient.call('worldsInspection');return graph.nodes.map(node=>({id:node.id,representation:node.representation,usage:node.usage,why:node.why}));})()`);
  const initialIds=await b.evaluate(`([...document.querySelectorAll('[data-world-node]')].map(node=>node.getAttribute('data-world-node'))) `),inspectedSourceIds=new Set();
  assert(nodes.some(node=>node.representation==='model'));assert(nodes.some(node=>node.representation==='javascript'));assert(nodes.some(node=>node.representation==='sop'));
  const colors=await b.evaluate(`([...document.querySelectorAll('[data-world-node]')].map(node=>({representation:node.getAttribute('data-representation'),stroke:node.querySelector('circle').getAttribute('stroke')})))`);
  const palette={sop:'#65d7b4',model:'#72a8ff',javascript:'#efa66e',catalog:'#b2a7d9'};
  for(const node of colors)assert.equal(node.stroke,palette[node.representation]);
  const before=await b.evaluate(`(async()=>({state:JSON.stringify((await window.psys2.engineClient.call('observe')).state),loaded:(await window.psys2.engineClient.call('loaded')).loaded,sends:window.psys2.engineClient.stats.sends}))()`);
  for(const world of ['k.interest','k.animals']){
   const node=nodes.find(node=>node.id==='knowledge-world:'+world);assert(node,'Actual catalog world '+world);
   await b.evaluate(`document.querySelector('[data-world-node='+JSON.stringify(${JSON.stringify(node.id)})+']').dispatchEvent(new MouseEvent('click',{bubbles:true}));true`);
   assert.equal(await b.evaluate(`document.querySelector('[data-detail-tab=overview]').getAttribute('aria-selected')`),'true');
   assert.equal(await b.evaluate(`document.querySelector('[data-breadcrumb-map]').tagName`),'A');
   assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-breadcrumb-map]')).borderTopWidth`),'0px');
   const why=await b.evaluate(`document.querySelector('.p2-worlds-why').textContent`);assert.equal(why,node.why);
   await b.evaluate(`document.querySelector('[data-detail-tab=sop]').click();true`);await wait(`document.querySelector('[data-source-path]')`);
   let pages=1;
   while(await b.evaluate(`!!document.querySelector('[data-load-more-sop]')`)){
    assert(pages<100,'Source pagination stays bounded');const prior=await b.evaluate(`document.querySelectorAll('[data-source-file]').length`);
    await b.evaluate(`document.querySelector('[data-load-more-sop]').click();true`);
    await wait(`document.querySelectorAll('[data-source-file]').length>${prior}||!document.querySelector('[data-load-more-sop]')`);pages++;
   }
   const paths=await b.evaluate(`([...document.querySelectorAll('[data-source-file]')].map(link=>link.getAttribute('data-source-file'))) `),actual=[];let offset=0,total;
   do{
    const response=await b.evaluate(`window.psys2.engineClient.call('worldSources',{nodeId:${JSON.stringify(node.id)},offset:${offset}})`);
    assert.equal(response.inspectionOnly,true);assert.equal(response.runtimeUseStatus,'unchanged');assert.equal(response.truncated,false);actual.push(...response.sources);for(const source of response.sources){assert(source.nodeId?.startsWith('knowledge-file:'),'Source response declares its exact file node');inspectedSourceIds.add(source.nodeId);}total=response.totalFiles;offset=response.nextOffset;
   }while(offset!==null&&offset!==undefined);
   assert.equal(paths.length,total);assert.equal(paths.length,actual.length);
   for(const path of paths){await b.evaluate(`document.querySelector('[data-source-file='+JSON.stringify(${JSON.stringify(path)})+']').click();true`);await wait(`document.querySelector('[data-source-path]')?.getAttribute('data-source-path')===${JSON.stringify(path)}`);assert.equal(await b.evaluate(`document.querySelectorAll('.p2-worlds-wires').length`),1,'one full code pane');const text=await b.evaluate(`document.querySelector('[data-source-path]').textContent`);assert.ok(text===actual.find(file=>file.path===path)?.text,'Exact complete SOP file '+path);}
   if(world==='k.animals')assert(pages>1,'A second catalog world exercises actual pagination');
   await b.evaluate(`document.querySelector('[data-detail-tab=overview]').click();true`);
   if(node.usage==='available'){assert.equal(await b.evaluate(`document.querySelector('[data-world-node='+JSON.stringify(${JSON.stringify(node.id)})+']').getAttribute('data-usage')`),'inspection-only');assert.match(await b.evaluate(`document.querySelector('.p2-worlds-usage').textContent`),/Inspected only/);}
  }
  const after=await b.evaluate(`(async()=>({state:JSON.stringify((await window.psys2.engineClient.call('observe')).state),loaded:(await window.psys2.engineClient.call('loaded')).loaded,sends:window.psys2.engineClient.stats.sends}))()`);assert.deepEqual(after,before,'Source inspection neither executes a request nor initializes another world');
  for(const node of nodes.filter(node=>['javascript','model','catalog'].includes(node.representation)).slice(0,8)){
   await b.evaluate(`document.querySelector('[data-world-node='+JSON.stringify(${JSON.stringify(node.id)})+']').dispatchEvent(new MouseEvent('click',{bubbles:true}));true`);assert.equal(await b.evaluate(`!!document.querySelector('[data-detail-tab=sop]')`),false,'Native/model/catalog record has no fabricated SOP tab');
  }
  for(const [width,height]of [[390,844],[1600,1000]]){await b.viewport(width,height);await wait(`document.querySelector('.p2').classList.contains('is-phone')===${width<=760}`);if(await b.evaluate(`document.querySelector('.p2').classList.contains('p2-on-chat')`))await b.evaluate(`document.querySelector('.p2-burger').click();document.querySelector('.p2-menu-item[data-page=worlds]').click();true`);await wait(`document.querySelector('.p2-worlds').getBoundingClientRect().width>0`);await b.evaluate(`document.querySelector('[data-world-node=\"knowledge-world:k.interest\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));true`);const metric=await b.evaluate(`({scroll:document.documentElement.scrollWidth,panel:document.querySelector('.p2-worlds-dialog').getBoundingClientRect().width,height:document.querySelector('.p2-worlds-dialog').getBoundingClientRect().height,ids:[...document.querySelectorAll('[data-world-node]')].map(node=>node.getAttribute('data-world-node'))})`);assert(metric.scroll<=width);assert(metric.panel>0&&metric.panel<=width&&metric.height>0,'Worlds detail is visibly within the viewport');for(const id of initialIds)assert(metric.ids.includes(id),'Every original graph node is retained: '+id);for(const id of metric.ids)if(!initialIds.includes(id))assert(inspectedSourceIds.has(id),'New graph node is an actual inspected source file: '+id);if(process.env.WORLDS_SOURCE_SCREENSHOTS)await b.screenshot('../.session-control/worlds-final-why-'+width+'.png');}
  assert.deepEqual(b.logs.console.filter(event=>event.type==='exception'),[]);assert.deepEqual(b.logs.network.filter(event=>event.status>=400),[]);
 }finally{await b.close();}
});
