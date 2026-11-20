import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat)));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat)));
const kind=lemma=>bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma).canonical;
const request=[
  '@s std.request.source text="Add a fish near the house."',
  '@r std.request act=make mood=do source=$s',
  '@fish std.request.target request=$r mode=new kind='+kind('fish'),
  '@house std.request.target request=$r mode=existing kind='+kind('house'),
  '@near std.request.constraint request=$r target=$fish concept=place operator=relation relation=near goal=$house polarity=positive character=requirement',
];
test('a pasted request executes and undoes through Drawing without a reader',async()=>{
  const session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':emptyDrawingState()}},engine:{nativeBindings:bindings}};
  const seed=await performGesture(session,{view:'draw',operation:'drawing.object.make',args:{kind:'house',x:350,y:300}});
  assert.ok(seed.ok);
  const before=structuredClone(session.isession.state['art.draw']);
  for (const separator of ['\n',' ']) {
    const reply=await routeNewEngine(session,request.join(separator),{view:'draw',language:'ro'});
    assert.deepEqual(reply.statuses,['supported'],JSON.stringify(reply.trace));
    assert.equal(reply.trace.authored,true);
    assert.equal(reply.trace.geometryVerified,true);
    assert.equal(reply.trace.readerRouting,undefined);
    assert.notDeepEqual(session.isession.state['art.draw'],before);
    const undone=await routeNewEngine(session,'@s std.request.source text="undo" @r std.request act=undo mood=do source=$s',{view:'draw'});
    assert.deepEqual(undone.statuses,['supported']);
    assert.deepEqual(session.isession.state['art.draw'],before);
  }
  for (const extra of ['@rogue core.type of=rogue','@r2 std.request act=redo mood=do source=$s']){
    const rejected=await routeNewEngine(session,[...request,extra].join('\n'),{view:'draw'});
    assert.deepEqual(rejected.statuses,['unsupported']);
    assert.deepEqual(session.isession.state['art.draw'],before);
  }
});
