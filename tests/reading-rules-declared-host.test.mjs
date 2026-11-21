// Declared reading rules of 2026-11-21: number agreement under the indefinite article and one value span filling one
// key (raw-reading-policy.sop), the editor words of the area registry (area-registry.sop app.area.word), and the
// Drawing's move by a direction (art.draw native interface + act rules, execution-policy.sop drawn.direction).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readsBySingular,declaredSpanRoles} from '../src/dialog/raw-reading-policy.mjs';
import {NATIVE_AREAS} from '../src/dialog/app-reader-context.mjs';
import {createDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

const make=(determiner,kind_span)=>({requests:[{act:'make',target:{mode:'new',determiner,kind_span}}]});

test('a plural kind phrase under the indefinite article is read by its singular, nothing else is',()=>{
 assert.equal(readsBySingular(make('indefinite','women')),true);
 assert.equal(readsBySingular(make('indefinite','big cats')),true);
 assert.equal(readsBySingular(make('indefinite','woman')),false);
 assert.equal(readsBySingular(make('definite','women')),false);
});

test('one value span read for two keys keeps the key whose concept word the request says',()=>{
 const bindings={properties:[{area:'drawing',key:'drawn.rotation',rawDescriptor:{concept:'rotation'}},{area:'drawing',key:'drawn.skew',rawDescriptor:{concept:'skew'}}]};
 const raw=text=>({area:'drawing',source:{text},requests:[{act:'change',constraints:[{key:'drawn.rotation',value:'20',value_span:'20'},{key:'drawn.skew',value:'20',value_span:'20'}]}],
  ranges:[{path:['requests','0','constraints','0','value_span'],range:[17,19]},{path:['requests','0','constraints','1','value_span'],range:[17,19]}]});
 const skewed=declaredSpanRoles(raw('that moon skewed 20 degrees'),bindings);
 assert.deepEqual(skewed.requests[0].constraints.map(c=>c.key),['drawn.skew']);
 assert.deepEqual(skewed.ranges.map(r=>r.path.join('.')),['requests.0.constraints.0.value_span']);
 // Neither word said ("tilt"): both readings stay (no evidence decides).
 assert.equal(declaredSpanRoles(raw('tilt this one by 20 degrees'),bindings).requests[0].constraints.length,2);
});

test('a declared concept word keeps the stroke width of a "4 pixels outline", not the size',()=>{
 const bindings={properties:[{area:'drawing',key:'drawn.size',rawDescriptor:{concept:'size'}},{area:'drawing',key:'drawn.stroke',rawDescriptor:{concept:'stroke'}}]};
 const raw={area:'drawing',source:{text:'use a 4 pixels yellow outline to the boy'},requests:[{act:'change',constraints:[{key:'drawn.size',value:'4',value_span:'4'},{key:'drawn.stroke',value:'4',value_span:'4'}]}],
  ranges:[{path:['requests','0','constraints','0','value_span'],range:[6,7]},{path:['requests','0','constraints','1','value_span'],range:[6,7]}]};
 assert.deepEqual(declaredSpanRoles(raw,bindings).requests[0].constraints.map(c=>c.key),['drawn.stroke']);
});

test('every editor view declares the words that name it in a request',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(NATIVE_AREAS).map(([view,area])=>[view,area.words])),
  {avatar:['avatar'],draw:['drawing'],diagram:['diagram'],editor:['document'],calendar:['calendar']});
});

test('a drawn object moves one step by a direction, as a place of the new point',async()=>{
 const state={sop:'',runtime:{view:{}}},host=await createDrawingArea({state});let n=0;
 const run=command=>host.invoke(command,toolInvocationContext('move-'+(n++),host.observe().version));
 assert.equal(run('@c drawing.object.make kind="house"').status,'changed');
 const at=()=>{const line=state.sop.split('\n').find(l=>/ w\.drawing\.object /.test(l)&&/ code=o1\b/.test(l));return [Number(line.match(/ x=(\S+)/)[1]),Number(line.match(/ y=(\S+)/)[1])];};
 const [x,y]=at();
 assert.equal(run('@c drawing.object.move ids="o1" direction="left"').status,'changed');assert.deepEqual(at(),[x-80,y]);
 assert.equal(run('@c drawing.object.move ids="o1" direction="up" distance=20').status,'changed');assert.deepEqual(at(),[x-80,y-20]);
 assert.equal(run('@c drawing.object.move ids="o1" direction="right"').status,'changed');assert.deepEqual(at(),[x,y-20]);
 assert.equal(run('@c drawing.object.move ids="o1" direction="down" distance=20').status,'changed');assert.deepEqual(at(),[x,y]);
});
