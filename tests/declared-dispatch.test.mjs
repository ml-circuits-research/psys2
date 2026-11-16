import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {dispatchDeclaredBatch} from '../src/dialog/declared-dispatch.mjs';
const wires='@s std.request.source text="create a circle"\n@r std.request act=make mood=do source=$s\n@t std.request.target request=$r mode=new kind=circle';
const entry=(id,after=[])=>({id,after,request:'r',wires});
const witness=entry=>parse(entry.wires).flatMap(w=>Object.keys(w.attrs).map(k=>JSON.stringify([w.id,k])));
test('all graphs validate before resolution and effects',async()=>{
 let calls=0;const r=await dispatchDeclaredBatch({entries:[entry('a'),{...entry('b'),wires:'@r std.request act=make'}]},{invocation:'i',resolve(){calls++;}});
 assert.equal(r.ok,false);assert.equal(calls,0);
});
test('unverified native effects block dependent entries but allow independent entries',async()=>{
 const called=[];
 const r=await dispatchDeclaredBatch({entries:[entry('a'),entry('b',['a']),entry('c')]},{invocation:'i',resolve(e){return {ok:true,declaration:'declared.make',consumed:witness(e),expectedVersion:'0',operation:'make',args:{},host:{invoke(p){called.push(p.invocation);return {status:'changed',verification:'unverified'};}}};}});
 assert.equal(r.ok,true);assert.deepEqual(r.outcomes.map(o=>[o.id,o.status]),[['a','unverified'],['c','unverified']]);assert.deepEqual(r.frontier.blocked,[{id:'b',dependencies:['a']}]);assert.equal(called.length,2);
});
test('missing semantic field consumption refuses before native invocation',async()=>{
 let called=0;const r=await dispatchDeclaredBatch({entries:[entry('a')]},{invocation:'i',resolve(e){return {ok:true,declaration:'d',consumed:witness(e).slice(1),expectedVersion:'0',operation:'make',host:{invoke(){called++;}}};}});
 assert.equal(called,0);assert.equal(r.records[0].reason,'incomplete-projection-witness');
});
test('historical native receipt cannot become a fresh confirmed outcome',async()=>{
 const r=await dispatchDeclaredBatch({entries:[entry('a')]},{invocation:'i',resolve(e){return {ok:true,declaration:'d',consumed:witness(e),expectedVersion:'0',operation:'make',args:{},host:{invoke(){return {status:'changed',replayed:true};}}};}});
 assert.equal(r.outcomes[0].status,'unverified');assert.equal(r.records[0].receipt.replayed,true);
});

test('flat admission keeps rootless result conjunction separate from selector',async()=>{
 const {flatRequestProjection}=await import('../src/dialog/request-projection.mjs');
 const graph=wires.replace('mode=new kind=circle','mode=existing kind=circle selector=$selected')+'\n@selected std.request.constraint request=$r target=$t concept=colour operator=eq value=red character=assumption polarity=positive\n@colour std.request.constraint request=$r target=$t concept=colour operator=eq value=blue character=requirement polarity=positive\n@size std.request.constraint request=$r target=$t concept=size operator=eq value=large character=requirement polarity=positive';
 const view=flatRequestProjection({...entry('x'),wires:graph});
 assert.equal(view.ok,true);assert.deepEqual(view.results.map(c=>c.id),['colour','size']);assert.deepEqual(view.targets[0].selector.map(c=>c.id),['selected']);
 const empty=flatRequestProjection(entry('x'));assert.equal(empty.ok,true);assert.deepEqual(empty.results,[]);
 const unknown=flatRequestProjection({...entry('x'),wires:graph.replace('kind=circle','kind=circle quantifier=all')});assert.equal(unknown.ok,false);assert.equal(unknown.reason,'unsupported-semantic-fields');
});
