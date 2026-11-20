import test from 'node:test';import assert from 'node:assert/strict';
import {createAppReaderContext} from '../src/dialog/app-reader-context.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
test('application reader uses current native state and actual previous message across state replacement',async()=>{
 let state={'ui.shell':{activeTab:'draw'},'art.draw':emptyDrawingState()},previous=null,last;
 const get=createAppReaderContext({getState:()=>state,getPrevious:()=>previous,onObservation:o=>last=o});
 assert.deepEqual(await get(),{area:'drawing',context:{existing:[],previous:null}});assert.equal(last.observation.complete,true);
 const first=last.observation.instanceId;state={'ui.shell':{activeTab:'editor'},'docs.editor':initialDocumentState()};previous='Actual previous message';
 assert.equal((await get()).area,'document');assert.equal((await get()).context.previous,previous);
 state={'ui.shell':{activeTab:'draw'},'art.draw':emptyDrawingState()};await get();assert.notEqual(last.observation.instanceId,first);
 state={'ui.shell':{activeTab:'calendar'}};await assert.rejects(get(),/unavailable/);
});
const malformed=state=>createAppReaderContext({getState:()=>({'ui.shell':{activeTab:'draw'},'art.draw':state})});
test('application reader rejects malformed observed state rather than substituting empty context',async()=>{
 // Drawing states are {sop, runtime:{view}}; an unparseable carrier or an ill-typed w.drawing fact is refused.
 for(const state of [{sop:'@@ not sop ((',runtime:{view:{}}},{sop:42,runtime:{view:{}}},
  {sop:'@w_drawing_object1 w.drawing.object kind=w.drawing.object world=w.drawing code=o1 drawing=circle x=oops',runtime:{view:{}}}])
  await assert.rejects(malformed(state)(),undefined,JSON.stringify(state));
});
// Gap: the Drawing SOP area (worlds/sop-area-adapter.mjs create) initializes any state whose sop is falsy, so a state
// with no sop carrier is filled in place and read as an empty drawing; a fact of a foreign type is also read as empty.
test('application reader rejects a Drawing state without a SOP carrier or with foreign facts',
 async()=>{
 for(const state of [{objects:'invalid'},{sop:'@x foreign.type a=1',runtime:{view:{}}}])
  await assert.rejects(malformed(state)(),undefined,JSON.stringify(state));
});
test('authored SOP commands are excluded from natural-language context',async()=>{
 const previous='@r std.request act=make mood=do source=$s @s std.request.source text="Create an object"';
 const get=createAppReaderContext({getState:()=>({'ui.shell':{activeTab:'draw'},'art.draw':emptyDrawingState()}),getPrevious:()=>previous});
 assert.equal((await get('Create another object')).context.previous,null);
});
