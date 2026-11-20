// Transforms, writing and effects on the Drawing tab, each won by declared pieces: w.drawing slots (rotation, mirror,
// skew, opacity, effect, fill, gradient, outline, stroke, text, font, weight, slant, align, frame; group and part poses;
// w.drawing.page filter), k.styles names (effects, fills, typefaces, frames, filters, turns), the act rules that compile
// the native arguments (worlds/art.draw/style-rules.sop), the projection that poses and styles what is drawn
// (style-projection.sop) and the primitive renderer (worlds/sop-primitives.mjs). Every command goes through the same
// declared gesture route as the Drawing tab's controls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyDrawingState,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';

function board(){
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{}};
 const run=async(operation,args)=>performGesture(s,{view:'draw',operation,args});
 const facts=type=>parse(s.isession.state['art.draw'].sop).filter(w=>w.type===type);
 const object=code=>Object.fromEntries(Object.entries(facts('w.drawing.object').find(w=>w.attrs.code[0]===code).attrs).map(([k,v])=>[k,v[0]?.startsWith('"')?JSON.parse(v[0]):v[0]]));
 const view=()=>projectDrawingArea(s.isession.state['art.draw']);
 const all=code=>[...view().svg.matchAll(/<g transform="([^"]*)" data-select="([^"]*)"([^>]*)>(<[^>]*>)/g)].filter(m=>m[2]===code).map(([,transform,,rest,el])=>({transform,rest,el}));
 // The ground shadow (drawn in page units under the object, an oval) stays on the ground; the other draws are posed.
 const shadow=g=>/^<ellipse/.test(g.el)&&/translate\(0 0\) scale\(1\) translate\(0 0\)$/.test(g.transform);
 const groupsOf=code=>all(code).filter(g=>!shadow(g)),shadowsOf=code=>all(code).filter(shadow);
 return {s,run,facts,object,view,groupsOf,shadowsOf};
}
const ok=result=>{assert.equal(result.ok,true,result.reason??result.message??JSON.stringify(result).slice(0,300));return result;};

test('a turn by name or degrees, back upright, and a turn to an angle pose every part about the object centre',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'house'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'upside_down'}));
 assert.equal(Number(t.object('o1').rotation),180);
 const {x,y}=t.object('o1');
 assert.ok(t.groupsOf('o1').every(g=>g.transform.startsWith(`translate(${x} ${y}) rotate(180) translate(-${x} -${y})`)),'every part of the house is turned about its centre');
 assert.ok(t.shadowsOf('o1').length===1&&t.shadowsOf('o1').every(g=>!g.transform.includes('rotate(')),'its ground shadow stays on the ground');
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'upright'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'tilt'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'tilt'}));
 assert.equal(Number(t.object('o1').rotation),30,'"a bit clockwise" twice');
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'-45'}));
 assert.equal(Number(t.object('o1').rotation),345,'a turn is kept between 0 and 360');
 ok(await t.run('drawing.object.change',{ids:['o1'],rotation:90}));
 assert.equal(Number(t.object('o1').rotation),90);
 const refused=await t.run('drawing.object.change',{ids:['o1'],turn:'sideways'});
 assert.equal(refused.ok,false);assert.match(JSON.stringify(refused),/turn-not-declared/);
});

test('a mirror flips one way and back, combines with the other way, and leans and fades as stated',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'car'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],mirror:'horizontal'}));
 assert.equal(t.object('o1').mirror,'horizontal');
 assert.ok(t.groupsOf('o1').every(g=>g.transform.includes('scale(-1 1)')));
 ok(await t.run('drawing.object.change',{ids:['o1'],mirror:'vertical'}));
 assert.equal(t.object('o1').mirror,'both');
 assert.ok(t.groupsOf('o1').every(g=>g.transform.includes('scale(-1 -1)')));
 ok(await t.run('drawing.object.change',{ids:['o1'],mirror:'horizontal'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],mirror:'vertical'}));
 assert.equal(t.object('o1').mirror,'none');
 assert.ok(t.groupsOf('o1').every(g=>!g.transform.includes('scale(-1')));
 ok(await t.run('drawing.object.change',{ids:['o1'],skew:20,opacity:0.5}));
 assert.ok(t.groupsOf('o1').every(g=>g.transform.includes('skewX(20)')&&/opacity="0.5"/.test(g.rest)));
});

test('a group turns and mirrors as a whole about the middle of its members box',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'tree',x:300,y:400,size:100}));
 ok(await t.run('drawing.object.make',{kind:'sun',x:500,y:400,size:100}));
 const group=ok(await t.run('drawing.object.group',{ids:['o1','o2'],name:'Group'}));
 const code=t.facts('w.drawing.group')[0].attrs.code[0];
 ok(await t.run('drawing.object.change',{ids:[code],turn:'rotate_right'}));
 assert.equal(Number(t.facts('w.drawing.group')[0].attrs.rotation[0]),90);
 for(const member of ['o1','o2'])assert.ok(t.groupsOf(member).every(g=>g.transform.startsWith('translate(400 400) rotate(90) translate(-400 -400)')),'member '+member+' turns about the group centre');
 ok(await t.run('drawing.object.change',{ids:[code],mirror:'vertical'}));
 assert.ok(t.groupsOf('o1').every(g=>g.transform.includes('scale(1 -1)')));
 void group;
});

test('a part turns, mirrors and fades about its own centre; effects of k.styles only',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'house'}));
 ok(await t.run('drawing.part.change',{id:'o1',index:1,rotation:30}));
 ok(await t.run('drawing.part.change',{id:'o1',index:1,mirror:'horizontal'}));
 ok(await t.run('drawing.part.change',{id:'o1',index:1,opacity:0.4}));
 ok(await t.run('drawing.part.change',{id:'o1',index:1,effect:'glow'}));
 const part=t.facts('w.drawing.part')[0].attrs;
 assert.deepEqual([part.rotation[0],part.mirror[0],part.opacity[0],part.effect[0]],['30','horizontal','0.4','glow']);
 const turned=t.groupsOf('o1').filter(g=>/rotate\(30\)/.test(g.transform));
 assert.equal(turned.length,1,'only that part is turned');
 assert.match(turned[0].transform,/scale\(-1 1\)/);assert.match(turned[0].rest,/opacity="0.4"/);assert.match(turned[0].rest,/data-effect="glow"/);
 assert.equal(t.view().inputs['o1.1'].rotation,30,'the part turn is observed');
 const refused=await t.run('drawing.part.change',{id:'o1',index:1,effect:'sparkles'});
 assert.equal(refused.ok,false);
});

test('effects, fills, gradients and outlines are k.styles looks drawn as stated',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'circle',color:'red'}));
 ok(await t.run('drawing.object.change',{ids:['o1'],effect:'shadow'}));
 let [g]=t.groupsOf('o1');
 assert.match(g.rest,/filter:drop-shadow\(6px 7px 5px rgba\(0,0,0,0.4\)\)/);assert.match(g.rest,/data-effect="shadow"/);
 ok(await t.run('drawing.object.change',{ids:['o1'],effect:'glow'}));
 [g]=t.groupsOf('o1');assert.match(g.rest,/drop-shadow\(0 0 10px/);
 ok(await t.run('drawing.object.change',{ids:['o1'],effect:'blur'}));
 [g]=t.groupsOf('o1');assert.match(g.rest,/filter:blur\(3px\)/);
 ok(await t.run('drawing.object.change',{ids:['o1'],effect:'none'}));
 [g]=t.groupsOf('o1');assert.doesNotMatch(g.rest,/filter:/);
 ok(await t.run('drawing.object.change',{ids:['o1'],fill:'dotted'}));
 assert.match(t.view().svg,/<defs><pattern id="pdots[^"]*"[^>]*>.*<circle/);
 [g]=t.groupsOf('o1');assert.match(g.el,/fill="url\(#pdots/);assert.match(g.rest,/data-pattern="dots"/);
 ok(await t.run('drawing.object.change',{ids:['o1'],fill:'gradient',gradient:'yellow'}));
 assert.match(t.view().svg,/<linearGradient id="g[0-9a-f]{12}"/i);
 ok(await t.run('drawing.object.change',{ids:['o1'],outline:'#0000ff',stroke:6}));
 [g]=t.groupsOf('o1');assert.match(g.el,/stroke="#0000ff" stroke-width="6"/);
 assert.equal((await t.run('drawing.object.change',{ids:['o1'],fill:'plaid'})).ok,false);
 const inputs=t.view().inputs.o1;assert.equal(inputs.pattern,'gradient');assert.equal(inputs.outline,'#0000ff');
 assert.ok(t.view().options.effect.includes('neon')&&t.view().options.pattern.includes('striped'),'the editor is offered the k.styles names');
});

test('writing: words in a typeface with a frame, edited later (bigger, another font, bold) and turned like any object',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'text',text:'Happy birthday',at:'top',font:'serif'}));
 const made=t.object('o1');
 assert.equal(made.text,'Happy birthday');assert.equal(made.font,'serif');
 assert.ok(Number(made.y)<350,'at the top of the page');
 assert.ok(Math.abs(Number(made.width)-44*0.56*14)<1,'its box is as wide as its characters at a letter height of 44');
 assert.equal(Number(made.size),Number(made.width),'its size is its larger extent');assert.ok(Math.abs(Number(made.height)-44*1.3)<0.5,'and 1.3 letter heights tall');
 let [g]=t.groupsOf('o1');
 assert.match(g.el,/<text [^>]*font-family="&quot;Georgia&quot;,serif"[^>]*>Happy birthday<\/text>|<text [^>]*font-family="&quot;Georgia&quot;,serif"/);
 ok(await t.run('drawing.object.change',{ids:['o1'],size:Number(made.size)*1.5}));
 assert.equal(Number(t.object('o1').width).toFixed(2),(Number(made.width)*1.5).toFixed(2),'"make the title bigger" keeps its proportions');
 ok(await t.run('drawing.object.change',{ids:['o1'],font:'handwritten',weight:'bold',slant:'italic'}));
 [g]=t.groupsOf('o1');
 assert.match(g.el,/font-weight="600"/);assert.match(g.el,/font-style="italic"/);assert.match(g.el,/,cursive"/);
 ok(await t.run('drawing.object.change',{ids:['o1'],text:'Happy birthday, Ana!'}));
 assert.equal(Number(t.object('o1').width).toFixed(2),(Number(t.object('o1').height)/1.3*0.56*20).toFixed(2),'new words, a new width');
 ok(await t.run('drawing.object.change',{ids:['o1'],frame:'speech'}));
 const parts=t.groupsOf('o1');
 assert.ok(parts.some(p=>/<rect [^>]*rx=/.test(p.el))&&parts.some(p=>/<polygon/.test(p.el)),'a speech bubble with a tail behind the words');
 ok(await t.run('drawing.object.change',{ids:['o1'],turn:'tilt_left',color:'purple'}));
 assert.ok(t.groupsOf('o1').every(p=>/rotate\(345\)/.test(p.transform)));
 assert.equal((await t.run('drawing.object.change',{ids:['o1'],font:'klingon'})).ok,false);
 assert.ok(t.view().options.font.includes('comic'));
});

test('the whole picture through a filter of k.styles: sepia, a night tint, back to none; undo restores it',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'house'}));
 ok(await t.run('drawing.page.change',{filter:'sepia'}));
 assert.match(t.view().svg,/^<svg [^>]*style="filter:sepia\(1\) contrast\(1.05\)"/);
 ok(await t.run('drawing.page.change',{filter:'night'}));
 assert.match(t.view().svg,/style="filter:brightness\(0.55\) saturate\(0.7\)"/);
 assert.match(t.view().svg,/<rect data-tint="true" [^>]*fill="#0b1a4a" opacity="0.35"\/>/);
 assert.equal(t.view().inputs.page.filter,'night');
 ok(await t.run('drawing.undo',{}));
 assert.match(t.view().svg,/filter:sepia/);
 ok(await t.run('drawing.page.change',{filter:'none'}));
 assert.doesNotMatch(t.view().svg,/^<svg [^>]*filter:/);
 assert.equal((await t.run('drawing.page.change',{filter:'psychedelic'})).ok,false);
});

test('a new object may be made turned, faded and styled at once',async()=>{
 const t=board();
 ok(await t.run('drawing.object.make',{kind:'star',rotation:20,opacity:0.7,effect:'neon',fill:'striped'}));
 const star=t.object('o1');
 assert.deepEqual([star.rotation,star.opacity,star.effect,star.fill],['20','0.7','neon','striped']);
});
