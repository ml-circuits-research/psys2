// People and parts on the Drawing tab, by declared rules and knowledge only (worlds/art.draw/person-rules.sop,
// look-projection.sop, look-rules.sop, act-rules.sop; k.faces styles plain and figure, k.people, k.wearables, k.parts):
// - a person is a face and a body with clothes, of its kind's age and sex, chosen by its seed (two people of one kind
//   differ, the same page draws the same);
// - its parts are the drawing's parts: dressing ("put a hat on him", "a red t-shirt"), undressing ("take off his
//   jacket"), "make her hair red / long", a different look;
// - every drawn thing is a group of editable parts: eyes and a smile put on the sun (the face layout on its disc), the
//   roof recoloured, the chimney removed and put back, the walls drawn irregular and wider, the door an oval.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogDir,peopleArea} from './fixtures/people-area.mjs';

const skip=catalogDir?false:'the pinned catalog (docs/webchat/catalog or .cache/catalog at the pin) is not available';
const changed=r=>assert.equal(r.status,'changed',r.reason??r.code);
const kinds=(t,id)=>t.parts(id).map(p=>p.kind);
const index=(t,id,kind)=>t.parts(id).filter(p=>p.kind===kind).map(p=>Number(p.id.split('.').pop()));
const variant=(t,id,kind)=>t.input(t.parts(id).find(p=>p.kind===kind),'variant');

test('a boy, a girl and a grandfather are people of their age and sex, with a face and clothes',{skip},async()=>{
 const t=await peopleArea('art.draw');
 for(const name of ['boy','girl','grandfather'])changed(await t.run('drawing.catalog.make',{name}));
 const [boy,girl,old]=['o1','o2','o3'].map(id=>t.objects().find(o=>o.id===id));
 assert.deepEqual([t.input(boy,'age'),t.input(boy,'sex')],['child','male']);
 assert.equal(t.input(girl,'sex'),'female');
 assert.deepEqual([t.input(old,'age'),t.input(old,'sex')],['old','male']);
 for(const id of ['o1','o2','o3']){
  const ks=kinds(t,id);
  for(const k of ['body','shirt','eyes','head'])assert.ok(ks.includes(k),id+': '+ks.join(' '));
  // the stick figure's own head, body and limbs are replaced by the look: not observed
  assert.ok(!t.parts(id).some(p=>['left_arm','left_leg'].includes(p.kind)),id);
 }
 // two looks per person (a face and a body), each a w.face face
 assert.equal(t.facts('w.face.face').length,6);
 const svg=await t.render();
 assert.match(svg,/k\.faces\.figure\.top|data-select="o1"/);
});

test('two people of one kind look different, and the same commands draw the same',{skip},async()=>{
 const a=await peopleArea('art.draw'),b=await peopleArea('art.draw');
 for(const t of [a,b])for(let n=0;n<3;n++)changed(await t.run('drawing.catalog.make',{name:'person'}));
 assert.equal(a.state.sop,b.state.sop,'the same seeds give the same looks');
 const looks=['o1','o2','o3'].map(id=>JSON.stringify(a.parts(id).map(p=>p.kind+'='+a.input(p,'variant'))));
 assert.ok(new Set(looks).size>1,'people of one kind differ');
 const before=JSON.stringify(a.parts('o2').map(p=>a.input(p,'variant')));
 changed(await a.run('drawing.person.vary',{id:'o2'}));
 assert.notEqual(JSON.stringify(a.parts('o2').map(p=>a.input(p,'variant'))),before,'a different look');
});

test('dressing and undressing a person, and changing her hair, edit only the parts named',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'woman'}));
 const others=()=>JSON.stringify(t.parts('o1').filter(p=>!['hat','jacket','hair','shirt'].includes(p.kind)).map(p=>p.kind+'='+t.input(p,'variant')));
 const rest=others();
 changed(await t.run('drawing.part.add',{id:'o1',kind:'hat'}));
 assert.ok(kinds(t,'o1').includes('hat'));
 changed(await t.run('drawing.part.add',{id:'o1',kind:'t-shirt',color:'red'}));
 assert.equal(variant(t,'o1','shirt'),'t-shirt');
 const body=t.facts('w.face.face').find(f=>/style=figure/.test(f));
 assert.match(body,/clothes=red/);
 changed(await t.run('drawing.part.add',{id:'o1',kind:'jacket'}));
 assert.ok(kinds(t,'o1').includes('jacket'));
 changed(await t.run('drawing.part.remove',{id:'o1',index:index(t,'o1','jacket')[0]}));
 assert.ok(!kinds(t,'o1').includes('jacket'),'took off her jacket');
 // the hair is tinted by the face's hair colour: recolouring one hair part recolours her hair
 changed(await t.run('drawing.part.change',{id:'o1',index:index(t,'o1','hair')[0],color:'red'}));
 assert.match(t.facts('w.face.face').find(f=>/style=plain/.test(f)),/hair_colour=red/);
 // her hair along the declared length scale: a hair part that is not short takes a short variant of its slot
 const hairBefore=JSON.stringify(t.parts('o1').filter(p=>p.kind==='hair').map(p=>t.input(p,'variant')));
 const results=[];for(const i of index(t,'o1','hair'))results.push((await t.run('drawing.part.change',{id:'o1',index:i,length:'short'})).status);
 assert.ok(results.includes('changed'),results.join());
 assert.notEqual(JSON.stringify(t.parts('o1').filter(p=>p.kind==='hair').map(p=>t.input(p,'variant'))),hairBefore);
 assert.equal(others(),rest,'the other parts are as they were');
 // a slot the body draws itself is not added to the face (no face shoulders under the figure's clothes)
 assert.ok(!t.facts('w.face.shoulders').length);
});

test('an old man with glasses: the age of the command, and a part added by its word',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'person',age:'old',sex:'male'}));
 assert.equal(t.input(t.objects().find(o=>o.id==='o1'),'age'),'old');
 changed(await t.run('drawing.part.add',{id:'o1',kind:'glasses'}));
 assert.ok(kinds(t,'o1').includes('glasses'));
 assert.equal((await t.run('drawing.part.add',{id:'o1',kind:'propeller'})).status,'refused');
});

test('the sun gets eyes and a smile on its disc; the house is a group of editable parts',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'sun'}));
 changed(await t.run('drawing.part.add',{id:'o1',kind:'eyes'}));
 changed(await t.run('drawing.part.add',{id:'o1',kind:'smile'}));
 assert.ok(['disc','eyes','smile'].every(k=>kinds(t,'o1').includes(k)),kinds(t,'o1').join(' '));
 // the face sits on the disc: the eyes are inside the disc's box
 const disc=t.parts('o1').find(p=>p.kind==='disc'),eyes=t.parts('o1').find(p=>p.kind==='eyes');
 const box=p=>['x','y','width','height'].map(k=>Number(t.input(p,k)));
 const [dx,dy,dw,dh]=box(disc),[ex,ey]=box(eyes);
 assert.ok(Math.abs(ex-dx)<dw/2&&Math.abs(ey-dy)<dh/2,JSON.stringify({disc:box(disc),eyes:box(eyes)}));
 changed(await t.run('drawing.object.make',{kind:'house'}));
 const roof=index(t,'o2','roof')[0],chimney=index(t,'o2','chimney')[0];
 changed(await t.run('drawing.part.change',{id:'o2',index:roof,color:'blue'}));
 assert.ok(t.facts('w.drawing.part').some(f=>/colour=blue/.test(f)));
 changed(await t.run('drawing.part.remove',{id:'o2',index:chimney}));
 assert.ok(!kinds(t,'o2').includes('chimney'));
 changed(await t.run('drawing.part.add',{id:'o2',kind:'chimney'}));
 assert.ok(kinds(t,'o2').includes('chimney'),'put back');
 // another outline for a part: the house's walls irregular (a k.layouts outline), its door an oval (a basic shape); the
 // walls wider; an outline the knowledge does not have is refused
 const walls=index(t,'o2','body')[0],door=index(t,'o2','door')[0];
 const polygons=(await t.render()).split('<polygon').length;
 changed(await t.run('drawing.part.change',{id:'o2',index:walls,shape:'irregular'}));
 assert.ok((await t.render()).split('<polygon').length>polygons,'the walls are drawn as an irregular polygon');
 changed(await t.run('drawing.part.change',{id:'o2',index:door,shape:'oval'}));
 changed(await t.run('drawing.part.change',{id:'o2',index:walls,width:200}));
 assert.equal((await t.run('drawing.part.change',{id:'o2',index:walls,shape:'no such outline'})).status,'refused');
 // removing a person removes its looks
 changed(await t.run('drawing.catalog.make',{name:'boy'}));
 const faces=t.facts('w.face.face').length;
 changed(await t.run('drawing.object.remove',{ids:'o3'}));
 assert.equal(t.facts('w.face.face').length,faces-2);
});

test('an expression on a drawn face: the sun smiles, a person looks surprised; an unknown one is refused',{skip},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'sun'}));
 changed(await t.run('drawing.person.expression',{id:'o1',expression:'happy'}));
 assert.ok(kinds(t,'o1').includes('smile')&&kinds(t,'o1').includes('eyes'),kinds(t,'o1').join(' '));
 assert.match(t.facts('w.face.face')[0],/expression=happy/);
 changed(await t.run('drawing.catalog.make',{name:'man'}));
 changed(await t.run('drawing.person.expression',{id:'o2',expression:'surprised'}));
 assert.ok(t.facts('w.face.face').some(f=>/style=plain/.test(f)&&/expression=surprised/.test(f)));
 assert.equal((await t.run('drawing.person.expression',{id:'o2',expression:'grumpy-ish'})).status,'refused');
});
