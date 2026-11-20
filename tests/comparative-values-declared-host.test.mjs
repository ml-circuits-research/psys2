// Comparatives ("make the house bigger", "make it smaller") as the reader writes them (operator=delta step=more|less,
// no number) reach the capability compiler through the declared comparative projection
// (worlds/app.project/comparative-projection.sop): the step becomes a factor of the value the target has now, with
// the factor of one step of the catalog's scale (k.expect.scale).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
import {comparativeSteps} from '../src/dialog/comparative-projection.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import SOURCE from '../src/dialog/new-engine-source.mjs';
import {World} from '../src/vendor/sopworld/sopworld.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindingsText=readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');

/** One raw reader request, in the shape the SOP-BERT reader and official-dataset labels use. */
function raw(text,{area='drawing',act='change',target,constraints}){
 return {format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area,model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},
  requestCount:1,requests:[{span:text,trigger:text.split(' ')[0],act,mood:'do',target,constraints}],ranges:[],coverage:{complete:true,truncated:false}};
}
const house={type:'drawn',mode:'existing',determiner:'definite',fill:'written',kind:'house',kind_span:'house'};
const comparative=(step,value,value_span,key='drawn.size')=>({key,operator:'delta',step,value,value_span,phase:'result',polarity:'positive',character:'requirement'});
const bridge=(prediction,comparatives=comparativeSteps())=>bridgeRawStructure(prediction,{bindings,bindingSha256,comparatives});
const factorOf=step=>comparativeSteps().find(row=>row.concept==='size'&&row.step===step).factor;

function session() {
 let read;
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 const sizes=()=>parse(s.isession.state['art.draw'].sop).filter(w=>w.type==='w.drawing.object').map(w=>Number(w.attrs.size[0]));
 return {s,sizes,draw:args=>performGesture(s,{view:'draw',operation:'drawing.object.make',args}),
  // The actual bridge output is what the reader proposes; nothing is hand-written downstream of the raw labels.
  say:async(prediction)=>{const out=bridge(prediction);assert.deepEqual(out.diagnostics,[]);read=out.decoded.candidates[0];return routeNewEngine(s,prediction.source.text,{view:'draw'});}};
}
const supported=reply=>assert.equal(reply.statuses[0],'supported',reply.trace?.error??reply.trace?.reason??reply.text);

test('the comparative factors are one step of the catalog scale, read from knowledge',()=>{
 const knowledge=World.fromJSON(SOURCE.snapshot,{library:SOURCE.schemaModules});
 const scale=Object.fromEntries(knowledge.ofType('k.expect.scale').map(w=>[w.attrs.step[0],{order:Number(w.attrs.order[0]),factor:Number(w.attrs.size_factor[0])}]));
 const at=order=>Object.values(scale).find(row=>row.order===order).factor;
 assert.equal(factorOf('more'),at(scale.default.order+1)/scale.default.factor);
 assert.equal(factorOf('less'),at(scale.default.order-1)/scale.default.factor);
 // Other knowledge, other factors: nothing in code fixes the numbers.
 const rows=parse(['@d k.expect.scale step=default order=3 count_factor=1 size_factor=2 extent=0.5 about="d"',
  '@u k.expect.scale step=big order=4 count_factor=1 size_factor=2.5 extent=0.7 about="u"',
  '@l k.expect.scale step=small order=2 count_factor=1 size_factor=1.6 extent=0.3 about="l"'].join('\n'));
 const other=comparativeSteps({knowledge:{ofType:type=>type==='k.expect.scale'?rows:[]}});
 assert.deepEqual(other.map(({step,factor})=>[step,factor]).sort(),[['less',0.8],['more',1.25]]);
});

test('the bridge projects a comparative step onto a factor of the value the target has now',()=>{
 const out=bridge(raw('make the house bigger',{target:house,constraints:[comparative('more','big','bigger')]}));
 assert.deepEqual(out.diagnostics,[]);
 const [constraint]=parse(out.decoded.candidates[0].wires).filter(w=>w.type==='std.request.constraint');
 assert.deepEqual([constraint.attrs.operator[0],constraint.attrs.baseline[0],constraint.attrs.anchor[0],Number(constraint.attrs.value[0])],['factor','before','size',factorOf('more')]);
 const evidence=out.decoded.candidates[0].evidence.requests[0].fields.find(f=>f.path.join('.')==='constraints.c0_0.value');
 assert.equal(evidence.origin,'declaration');
 // Without the declared projection the step stays an unresolved decision, as before.
 const bare=bridge(raw('make the house bigger',{target:house,constraints:[comparative('more','big','bigger')]}),[]);
 assert.ok(bare.diagnostics.some(d=>d.reason==='requires-declared-step-projection'));
});

test('a step on a concept without a declared scale, or with a measured amount, is not a scale comparative',()=>{
 const colour=bridge(raw('make the house a darker blue',{target:house,constraints:[comparative('less','blue','darker blue','drawn.colour')]}));
 assert.ok(colour.diagnostics.some(d=>d.reason==='requires-declared-step-projection'),JSON.stringify(colour.diagnostics));
 const measured=bridge(raw('make the house 20 percent bigger',{target:house,constraints:[{...comparative('more','20','20 percent bigger'),measure:'20',measure_span:'20',unit:'percent'}]}));
 assert.ok(measured.diagnostics.some(d=>d.reason==='requires-declared-step-projection'),JSON.stringify(measured.diagnostics));
});

test('"make the house bigger" then "make the house smaller" scale the drawn house as it is',async()=>{
 const {s,draw,say,sizes}=session();
 await draw({kind:'house',x:600,y:500,size:100});
 const [before]=sizes();
 const bigger=await say(raw('make the house bigger',{target:house,constraints:[comparative('more','big','bigger')]}));
 supported(bigger);
 assert.doesNotMatch(bigger.text,/could not apply/,bigger.text);
 const [grown]=sizes();
 assert.equal(grown,Math.round(before*factorOf('more')),`${before} -> ${grown}`);
 const result=parse(bigger.trace.compiledSop)[0];
 assert.deepEqual(result.attrs.covered.map(str),['c0_0']);
 const smaller=await say(raw('make the house smaller',{target:house,constraints:[comparative('less','small','smaller')]}));
 supported(smaller);
 const [shrunk]=sizes();
 assert.ok(shrunk<grown,`${grown} -> ${shrunk}`);
 assert.equal(shrunk,Math.round(grown*factorOf('less')));
 assert.ok(s.isession.state['art.draw'].sop.includes('size='+shrunk));
});
