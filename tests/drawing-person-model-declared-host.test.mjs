// The drawn person as a controllable vector model (worlds/art.draw/figure-rules.sop; k.faces skeleton, poses,
// expressions, traits; k.feelings; k.wearables): commands that pose a person, give it an expression, a trait or a thing
// to wear, and put a thing in its hand, on the declared Drawing host over the pinned catalog. Each result is observed
// (pose, expression, parts) and drawn (the limbs turned about their joints).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogDir,peopleArea} from './fixtures/people-area.mjs';

const skip=catalogDir?false:'the pinned catalog is not available';
const changed=r=>assert.equal(r.status,'changed',r.reason??r.code);
const person=t=>t.objects().find(o=>o.id==='o1');
const partKinds=t=>t.parts('o1').map(p=>p.kind);
// The rotations drawn for the parts of an object (ui.draw.pose of its limbs): rotate(<deg>) inside its groups.
const turns=svg=>[...svg.matchAll(/rotate\((-?[\d.]+)\)/g)].map(m=>Number(m[1]));

test('a person made sitting, smiling, ginger and in a jacket takes each on its look',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'girl',pose:'sat down',expression:'a big smile',trait:'ginger',wear:'jacket'}));
 const o=person(t);
 assert.equal(t.input(o,'pose'),'sitting','a word for the pose names it');
 assert.equal(t.input(o,'expression'),'happy','"a big smile" is a word of the expression happy');
 assert.ok(t.facts('w.face.face').some(f=>/hair_colour=red/.test(f)),'ginger: red hair');
 assert.ok(t.facts('w.face.coat').some(f=>/variant=jacket/.test(f)),'the jacket on the figure');
 const svg=await t.render();
 assert.ok(turns(String(svg)).some(r=>Math.abs(r+84)<0.01),'the thighs turned forward (sitting on the ground)');
});

test('poses change: arms up, waving, standing; a thing with no body refuses a pose',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'boy'}));
 assert.equal(t.input(person(t),'pose'),'standing');
 changed(await t.run('drawing.person.pose',{id:'o1',pose:'arms up'}));
 assert.equal(t.input(person(t),'pose'),'arms up');
 changed(await t.run('drawing.object.change',{ids:'o1',pose:'wave'}));
 assert.equal(t.input(person(t),'pose'),'waving');
 changed(await t.run('drawing.object.make',{kind:'house'}));
 assert.equal((await t.run('drawing.person.pose',{id:'o2',pose:'sitting'})).reason,'pose-needs-a-body');
 assert.equal((await t.run('drawing.person.pose',{id:'o1',pose:'levitating'})).reason,'pose-not-known');
});

test('expressions by word or feeling; traits add and take away parts',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'man'}));
 changed(await t.run('drawing.object.change',{ids:'o1',expression:'crying'}));
 assert.equal(t.input(person(t),'expression'),'crying');
 changed(await t.run('drawing.object.change',{ids:'o1',expression:'frightened'}));
 assert.equal(t.input(person(t),'expression'),'scared','frightened is a word of scared');
 changed(await t.run('drawing.person.expression',{id:'o1',expression:'shocked face'}));
 assert.equal(t.input(person(t),'expression'),'shocked');
 changed(await t.run('drawing.object.change',{ids:'o1',trait:'beard'}));
 assert.ok(partKinds(t).includes('beard'),'a beard is added');
 changed(await t.run('drawing.object.change',{ids:'o1',trait:'bald'}));
 assert.ok(!partKinds(t).includes('hair'),'bald: no hair');
 assert.equal((await t.run('drawing.object.change',{ids:'o1',trait:'purple-nosed'})).reason,'trait-not-known');
});

test('a person holds a thing in its hand: a new kite at the hand of the holding pose',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'girl',x:300,y:400,size:200}));
 changed(await t.run('drawing.person.hold',{id:'o1',kind:'kite'}));
 assert.equal(t.input(person(t),'pose'),'holding');
 const kite=t.objects().find(o=>o.kind==='kite'||t.input(o,'drawing')==='kite');
 assert.ok(kite,'a kite is made');
 const x=t.input(kite,'x'),y=t.input(kite,'y');
 assert.ok(x>300&&x<400&&y<400&&y>300,`the kite is in the right hand, up and to the right of the middle (${x}, ${y})`);
});

test('garments: a cape is drawn behind the body, a scarf round the neck, gloves on the hands',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'boy'}));
 for(const kind of ['cape','scarf','gloves'])changed(await t.run('drawing.part.add',{id:'o1',kind}));
 assert.ok(t.facts('w.face.back').some(f=>/variant=cape/.test(f)));
 assert.ok(t.facts('w.face.neckwear').some(f=>/variant=scarf/.test(f)));
 assert.ok(t.facts('w.face.hands').some(f=>/variant=gloves/.test(f)));
});

test('the Avatar is a view of the same model: it takes a pose by word and draws the arms turned',{skip},async()=>{
 const t=await peopleArea('ui.avatar');
 changed(await t.run('avatar.face.preset',{preset:'girl'}));
 changed(await t.run('avatar.face.pose',{pose:'hands up'}));
 assert.ok(t.facts('w.face.face').some(f=>/pose="arms up"/.test(f)),'"hands up" is a word of the pose arms up');
 const svg=await t.render();
 assert.ok(turns(svg).some(r=>Math.abs(r-135)<0.01)&&turns(svg).some(r=>Math.abs(r+135)<0.01),'both upper arms raised in the view');
 assert.equal((await t.run('avatar.face.pose',{pose:'levitating'})).reason,'pose-not-known');
});

test('occlusion by the page edge: a thing touching an edge or partly cut off by it, on make and on change',{skip},async()=>{
 const t=await peopleArea('art.draw');
 const at=id=>{const o=t.objects().find(o=>o.id===id);return [t.input(o,'x'),t.input(o,'y')];};
 changed(await t.run('drawing.object.make',{kind:'cat',edge:'left',cut:0.5,size:100}));
 assert.equal(at('o1')[0],0,'half the cat is beyond the left edge');
 changed(await t.run('drawing.object.make',{kind:'house',edge:'right',size:200}));
 assert.equal(at('o2')[0],900,'the house touches the right edge');
 changed(await t.run('drawing.object.change',{ids:'o1',edge:'top'}));
 assert.equal(at('o1')[1],50,'the cat moved up to touch the top edge');
 assert.equal((await t.run('drawing.object.make',{kind:'cat',edge:'middle'})).status,'refused','edge is a closed list');
});

test('a person sitting on the ground is lowered onto the ground line; a long coat follows the thighs',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'man',x:300,y:350,size:200,pose:'sitting',wear:'coat'}));
 const svg=await t.render();
 assert.match(svg,/translate\(0 45\.8\)/,'sitting on the ground lowers the person 22.9 of its 100 frame (200 page units tall): 45.8');
 assert.ok(turns(svg).filter(r=>Math.abs(r+84)<0.01).length>=4,'the thighs and the coat tails turn forward');
});

test('the robot keeps its own mouth when it laughs; a person laughs with a white band of teeth',{skip},async()=>{
 const t=await peopleArea('ui.avatar');
 await t.run('avatar.face.preset',{preset:'robot'});
 changed(await t.run('avatar.face.expression',{expression:'laughing'}));
 const svg=await t.render();
 assert.doesNotMatch(svg,/#6E1F24/i,'no open mouth on the robot: its grille stays');
 changed(await t.run('avatar.face.preset',{preset:'girl'}));
 assert.match(await t.render(),/#6E1F24/i,'the girl (still laughing) laughs with an open mouth');
});

test('a person made holding a thing; a thing behind another; measured gaps; variants; materials; a cause',{skip},async()=>{
 const t=await peopleArea('art.draw');
 const o=id=>t.objects().find(x=>x.id===id),at=id=>[t.input(o(id),'x'),t.input(o(id),'y')];
 changed(await t.run('drawing.catalog.make',{name:'girl',holds:'kite',x:300,y:400,size:200}));
 assert.equal(t.input(o('o1'),'pose'),'holding');
 const [kx,ky]=at('o2');assert.ok(kx>330&&kx<400&&ky<400,`the kite in her right hand (${kx}, ${ky})`);
 changed(await t.run('drawing.object.make',{kind:'house',x:700,y:450,size:200}));
 changed(await t.run('drawing.object.make',{kind:'cat',size:100,behind:'o3',hidden:0.5}));
 const z=code=>Number(t.facts('w.drawing.object').find(f=>f.includes(' code='+code+' ')).match(/ z=(\d+)/)[1]);
 assert.ok(z('o4')<z('o3'),'the cat is drawn under the house');
 changed(await t.run('drawing.object.make',{kind:'tree',size:100,edge:'left',offset:2,unit:'hand-widths'}));
 const tree=t.objects().find(x=>x.kind==='tree'&&!x.in);
 assert.equal(Math.round(t.input(tree,'x')),Math.round(2*0.1016*1575+50),'two hand-widths from the left edge');
 changed(await t.run('drawing.catalog.make',{name:'storm cloud'}));
 const cloud=t.objects().find(x=>!x.in&&(x.kind==='storm cloud'||t.input(x,'name')==='storm cloud'));
 assert.ok(cloud,'a storm cloud has its own drawing');
 assert.ok(t.parts(cloud.id).some(p=>p.kind==='lightning'||/lightning/.test(t.input(p,'name')??'')),'with lightning');
 changed(await t.run('drawing.object.change',{ids:'o3',material:'brick'}));
 assert.equal(t.input(o('o3'),'material'),'brick');
 changed(await t.run('drawing.object.change',{ids:'o1',expression:'happy',cause:'o3'}));
 assert.equal(t.input(o('o1'),'cause'),'o3','happy because of the house');
});

test('sitting with no seat sits on the ground; on a bench it sits on the seat; a held thing moves with the holder',{skip},async()=>{
 const t=await peopleArea('art.draw');
 const o=id=>t.objects().find(x=>x.id===id),at=id=>[t.input(o(id),'x'),t.input(o(id),'y')];
 changed(await t.run('drawing.catalog.make',{name:'boy',pose:'seated',x:200,y:400,size:200}));
 assert.equal(t.input(o('o1'),'pose'),'sitting','seated with nothing to sit on: on the ground');
 changed(await t.run('drawing.catalog.make',{name:'bench',x:600,y:450,size:200}));
 changed(await t.run('drawing.catalog.make',{name:'girl',seat:'o2',size:200}));
 assert.equal(t.input(o('o3'),'pose'),'seated');
 const [gx,gy]=at('o3');assert.ok(Math.abs(gx-600)<40&&gy<450,`on the bench (${gx}, ${gy})`);
 changed(await t.run('drawing.catalog.make',{name:'man',holds:'balloon',x:300,y:400,size:200}));
 const balloon=t.objects().find(x=>!x.in&&x.kind==='balloon');const before=[t.input(balloon,'x'),t.input(balloon,'y')];
 assert.equal(t.input(balloon,'holder'),'o4');
 changed(await t.run('drawing.object.place',{ids:'o4',x:350,y:420}));
 const b2=t.objects().find(x=>x.id===balloon.id);
 assert.deepEqual([t.input(b2,'x'),t.input(b2,'y')].map(Math.round),[before[0]+50,before[1]+20].map(Math.round),'the balloon moved with the man');
 changed(await t.run('drawing.person.pose',{id:'o4',pose:'arms up'}));
 assert.ok(t.input(t.objects().find(x=>x.id===balloon.id),'y')<before[1],'the balloon went up with the raised hand');
});

test('behind: the cat is covered by the tree\'s trunk, the tree drawn over it; no other object is renumbered',{skip},async()=>{
 const t=await peopleArea('art.draw');
 const fact=code=>t.facts('w.drawing.object').find(f=>f.includes(' code='+code+' '));
 const num=(code,k)=>Number(fact(code).match(new RegExp(' '+k+'=([\\d.]+)'))[1]);
 changed(await t.run('drawing.object.make',{kind:'tree',x:500,y:400,size:300}));
 changed(await t.run('drawing.object.make',{kind:'cat',size:100,behind:'o1',hidden:0.5}));
 // trunk: x 42..58 of 100 -> page 476..524; half the cat (50) behind its right edge: centre 524 + 50 - 50 = 524
 assert.equal(Math.round(num('o2','x')),524);
 assert.ok(num('o2','z')<num('o1','z'),'the tree is drawn over the cat');
 changed(await t.run('drawing.object.make',{kind:'house'}));
 assert.ok(fact('o3'),'the next object takes the next code');
});
