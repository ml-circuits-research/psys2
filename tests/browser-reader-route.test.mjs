import test from 'node:test';import assert from 'node:assert/strict';import {checkClosedBrowserReply,CDP,mergeLoadedTurnBaseline} from '../scripts/lib/browser-reader-route.mjs';
test('browser route evidence requires actual diagnostics, closed admission and unchanged state',()=>{const x={before:{a:1},state:{a:1},reply:{effects:[],trace:{readerHost:{state:'ready',diagnosticCount:2},readerRouting:{selected:null,model:{eligible:false}}}}};assert.ok(Object.values(checkClosedBrowserReply(x)).every(Boolean));x.reply.trace.readerHost.diagnosticCount=0;assert.equal(checkClosedBrowserReply(x).neuralDiagnostics,false);x.state.a=2;assert.equal(checkClosedBrowserReply(x).stateUnchanged,false);x.reply.effects.push({});assert.equal(checkClosedBrowserReply(x).noEffects,false);});
test('CDP transport matches request identities and surfaces browser errors',async()=>{let listener,sent;const socket={addEventListener:(name,fn)=>{listener=fn;},send:x=>{sent=JSON.parse(x);},close(){}};const c=new CDP(socket),p=c.call('Runtime.enable');listener({data:JSON.stringify({id:sent.id,result:{ok:true}})});assert.deepEqual(await p,{ok:true});const q=c.call('bad');listener({data:JSON.stringify({id:sent.id,error:{message:'browser failure'}})});await assert.rejects(q,/browser failure/);c.close();});

test('worker pre-command loaded worlds fill only absent baseline keys and cannot hide effects',()=>{const observed={drawing:{color:'red'}},loaded={drawing:{color:'blue'},document:{blocks:[]}};const before=mergeLoadedTurnBaseline(observed,loaded);assert.deepEqual(before,{drawing:{color:'red'},document:{blocks:[]}});assert.equal(checkClosedBrowserReply({before,state:{drawing:{color:'red'},document:{blocks:[]}}}).stateUnchanged,true);assert.equal(checkClosedBrowserReply({before,state:{drawing:{color:'blue'},document:{blocks:[]}}}).stateUnchanged,false);assert.equal(checkClosedBrowserReply({before,state:{drawing:{color:'red'},document:{blocks:['new']}}}).stateUnchanged,false);assert.deepEqual(observed,{drawing:{color:'red'}});});

import { access } from 'node:fs/promises';
import { openBrowserReaderRoute } from '../scripts/lib/browser-reader-route.mjs';
import { createBrowserStateInput } from '../src/dialog/browser-state-input.mjs';

test('a browser state packet validates atomically before any declared write', () => {
  const apply = createBrowserStateInput({ registries: { 'enabled-tab': new Set(['draw', 'chart']) } }), writes = [];
  const session = { setWorldState: (...args) => writes.push(args) };
  const tab = '@tab app.browser.state.observe.tab value=draw';
  assert.throws(() => apply(session, tab + '\n@bad app.browser.state.observe.listening value=maybe'));
  assert.throws(() => apply(session, tab + '\n@edit art.draw.patch objects=empty'));
  assert.throws(() => apply(session, '@tab app.browser.state.observe.tab value=unavailable'));
  assert.throws(() => apply(session, tab + '\n@other app.browser.state.observe.tab value=chart'));
  assert.throws(() => apply(session, '@forget app.browser.state.forget-person person=somebody'));
  assert.deepEqual(writes, []);
  assert.deepEqual(apply(session, tab + '\n@popup app.browser.state.observe.popup-open\n@mic app.browser.state.observe.listening value=true\n@forget app.browser.state.forget-person'),
    { 'ui.shell': { activeTab: 'draw', activePopup: 'avatar', listening: true }, 'session.things': { person: null } });
  assert.deepEqual(writes.map(([world]) => world), ['ui.shell','session.things']);
});

const chrome = process.env.CHROME ?? '/usr/bin/chromium';
const hasChrome = await access(chrome).then(() => true, () => false);
test('built browser worker uses declared shell SOP and keeps committed state through restart and work files', { skip: !hasChrome, timeout: 90000 }, async () => {
  const browser = await openBrowserReaderRoute({ chrome, timeoutMs: 25000 });
  try {
    const outcome = await browser.evaluate(`(async()=>{
      const {engineClient: client, session, workFiles} = window.psys2;
      const wait = async predicate => { for(let i=0;i<150;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Browser state observation timeout'); };
      const current = async ()=>(await client.call('observe')).state;
      window.psys2.showTab('draw');
      await wait(async ()=>(await current())['ui.shell'].activeTab==='draw');
      await client.call('ensure',{worlds:['art.draw']});
      await session.stateInput('@popup app.browser.state.observe.popup-open\\n@hands app.browser.state.observe.hands-free value=true\\n@mic app.browser.state.observe.listening value=true');
      const refusals=[];
      for(const [op, payload] of [
        ['setWorldState',{worldId:'art.draw',patch:{objects:[]}}],
        ['setStates',{state:{'ui.shell':{activeTab:'chart'}}}],
        ['option',{key:'isession',value:{state:{}}}],
        ['stateInput',{sop:{worldId:'art.draw',patch:{objects:[]}}}],
        ['stateInput',{sop:'@tab app.browser.state.observe.tab value=chart\\n@invalid editor.patch value=hack'}],
      ]) try { await client.call(op,payload); } catch(error){ refusals.push(error.message); }
      try { await session.stateInput('@bad app.browser.state.observe.tab value=unavailable'); }
      catch(error) { refusals.push(error.message); }
      const rawRestore = await client.call('restore',{state:{'ui.shell':{activeTab:'chart'}}});
      const graph = await client.call('worldsInspection');
      const inputNodes = graph.nodes.filter(node=>['browser:state-input-tool','execution:browser-state-bindings','execution:browser-state-schema'].includes(node.id));
      const inputEdges = graph.edges.filter(edge=>edge.from==='browser:state-input-tool');
      const made = await session.tool('@make drawing.object.make kind="square" x=150 y=125');
      if(!made.ok) throw Error(made.message);
      const work = JSON.stringify(await workFiles.snapshot());
      const second = await session.tool('@make drawing.object.make kind="circle" x=210 y=170');
      if(!second.ok) throw Error(second.message);
      const state = await current();
      await session.stateInput('@popup app.browser.state.observe.popup-close');
      await client.restart();
      const restored = await current();
      await workFiles.open(work);
      const archive = await client.call('instanceFacts',{world:'art.draw'});
      const saved = session.snapshot(), priorStarts=client.stats.starts;
      await session.stateInput('@language app.browser.state.observe.language value=ro');
      session.restore(saved);
      await wait(()=>client.stats.starts>priorStarts);
      await client.ready();
      const recovered=(await current())['ui.shell'];
      return {refusals, rawRestore, inputNodes, inputEdges, state:state['ui.shell'], restored:restored['ui.shell'], shape:archive?.wires, recovered, made:made.receipt.changed.length, hasSetter:'setWorldState' in session};
    })()`);
    assert.equal(outcome.hasSetter, false);
    assert.equal(outcome.refusals.length, 6);
    assert.equal(outcome.inputNodes.length, 3);
    assert.match(outcome.inputNodes.find(node => node.id === 'execution:browser-state-schema').wires, /kind=boolean/);
    assert.match(outcome.inputNodes.find(node => node.id === 'execution:browser-state-bindings').wires, /registry=enabled-tab/);
    assert.equal(outcome.inputEdges.length, 2);
    assert.deepEqual(outcome.rawRestore, { restored: false });
    assert.equal(outcome.state.activeTab, 'draw');
    assert.equal(outcome.state.activePopup, 'avatar');
    assert.equal(outcome.restored.activeTab, 'draw');
    assert.equal(outcome.restored.activePopup, null);
    assert.equal(outcome.restored.handsFree, true);
    assert.equal(outcome.restored.listening, true);
    assert.equal(outcome.made, 1);
    assert.match(outcome.shape, /square/);
    assert.doesNotMatch(outcome.shape, /kind="?circle/);
    assert.equal(outcome.recovered.language, outcome.state.language);
    const settingsPerson = {things:[],views:{},learned:[],n:0,person:{me:{name:'Ada'},lines:[]}};
    await browser.seed({state:{'session.things':settingsPerson}});
    const forgotten = await browser.evaluate(`(async()=>{
      const {engineClient, applyState, session}=window.psys2;
      const current=async()=>(await engineClient.call('observe')).state;
      applyState(await current());
      document.querySelector('[aria-label="Settings"]').click();
      document.querySelector('#p2-st-privacy').click();
      const section=document.querySelector('[data-section="person"]');
      const saw=section.textContent.includes('Ada');
      const button=section.querySelector('button');
      if(button.disabled)throw Error('No person on the Settings surface');
      button.click();
      for(let i=0;i<120;i++){
        if(session.state('session.things').person===null)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      return {saw, person:(await current())['session.things'].person, shown:document.querySelector('[data-section="person"]').textContent};
    })()`);
    assert.equal(forgotten.saw, true);
    assert.equal(forgotten.person, null);
    assert.match(forgotten.shown, /Nothing yet/);
  } finally {
    await browser.close();
  }
});
