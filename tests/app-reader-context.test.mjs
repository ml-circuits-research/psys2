import test from 'node:test';import assert from 'node:assert/strict';
import {createAppReaderContext} from '../src/dialog/app-reader-context.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
test('application reader uses current native state and actual previous message across state replacement',async()=>{
 let state={'ui.shell':{activeTab:'draw'},'art.draw':initialDrawingState()},previous=null,last;
 const get=createAppReaderContext({getState:()=>state,getPrevious:()=>previous,onObservation:o=>last=o});
 assert.deepEqual(await get(),{area:'drawing',context:{existing:[],previous:null}});assert.equal(last.observation.complete,true);
 const first=last.observation.instanceId;state={'ui.shell':{activeTab:'editor'},'docs.editor':initialDocumentState()};previous='Actual previous message';
 assert.equal((await get()).area,'document');assert.equal((await get()).context.previous,previous);
 state={'ui.shell':{activeTab:'draw'},'art.draw':initialDrawingState()};await get();assert.notEqual(last.observation.instanceId,first);
 state={'ui.shell':{activeTab:'calendar'}};await assert.rejects(get(),/unavailable/);
});
test('application reader rejects malformed observed state rather than substituting empty context',async()=>{
 const get=createAppReaderContext({getState:()=>({'ui.shell':{activeTab:'draw'},'art.draw':{objects:'invalid'}})});await assert.rejects(get());
});
