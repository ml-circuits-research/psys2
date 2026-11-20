// Landscapes drawn from knowledge (owner, 2026-11-20: "you put a house in the middle of the river"; "the lake, the
// landscapes should be dynamic, vector, with internal constraints"; "a bit of perspective, not just 2D"):
// - what holds things up (k.scenes.support, k.scenes.surface): every kind that stands on the ground keeps out of the
//   water and the roads on the page, things that drive go onto the road, things that float into the water, compiled
//   into the placement problem as hard constraints (src/dialog/default-placement.mjs) and into the library's relation
//   placement (std.placement.kind avoids);
// - terrain features drawn from their handles (k.layouts.terrain, worlds/art.draw/landscape-rules.sop): a river whose
//   banks run side by side however it is widened or bent, a lake whose shore follows its water, a view whose ground
//   stays below its horizon when the horizon is raised or lowered;
// - depth (worlds/art.draw/perspective-rules.sop): occlusion by the foot of what stands, shadows and side faces that
//   fade with distance, and a thing moved farther drawn smaller.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {createDrawingArea,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {peekAreaBase} from '../worlds/sop-area.mjs';
import {worldOf} from '../worlds/sop-world-host.mjs';
import {buildScene,review,knowledge} from '../scripts/review-drawing-placement.mjs';

const k=knowledge();
const val=(w,key)=>{const raw=w.attrs[key]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
const facts=(state,type)=>worldOf(peekAreaBase('art.draw').base,state).ofType(type);
const inBox=(x,y,r)=>x>=r.min_x-1e-9&&x<=r.max_x+1e-9&&y>=r.min_y-1e-9&&y<=r.max_y+1e-9;
const meets=(a,r)=>a.x0<r.max_x&&r.min_x<a.x1&&a.y0<r.max_y&&r.min_y<a.y1;
const square=o=>({x0:o.x-o.size/2,y0:o.y-o.size/2,x1:o.x+o.size/2,y1:o.y+o.size/2});
async function act(state,sop){
 const host=await createDrawingArea({state});
 const result=host.invoke(sop,toolInvocationContext('t'+Math.random(),host.observe().version));
 assert.equal(result.status,'changed',sop+' '+(result.reason??''));
 return result;
}
const object=(state,kind)=>parse(state.sop).find(w=>w.type==='w.drawing.object'&&val(w,'drawing')===kind);
const band=(state,id)=>facts(state,'ui.draw.bandpt').filter(f=>val(f,'object')===id)
 .map(f=>({k:+val(f,'k'),x:+val(f,'x'),y:+val(f,'y'),lx:+val(f,'lx'),rx:+val(f,'rx')})).sort((a,b)=>a.k-b.k);
const points=(state,source)=>facts(state,'ui.draw.point').filter(f=>val(f,'source')===source)
 .map(f=>({n:+val(f,'n'),x:+val(f,'x'),y:+val(f,'y')})).sort((a,b)=>a.n-b.n);

test('what stands on the ground keeps out of the water and the road; vehicles take the road, boats the water',async()=>{
 const kinds=['landscape','river','road','lake','house','tree','person','dog','cat','flower','bench',
  'car','truck','bicycle','boat','fish','swan','house','tree','bird','rabbit'];
 const {objects,surfaces,statuses}=await buildScene(kinds);
 const made=statuses.filter(([,s])=>s==='changed').map(([kind])=>kind);
 assert.ok(made.length>=18,'most kinds are drawn: '+JSON.stringify(statuses.filter(([,s])=>s!=='changed')));
 const water=surfaces.filter(r=>r.kind==='water'),road=surfaces.filter(r=>r.kind==='road');
 assert.ok(water.length>=8&&road.length>=8,'the river, the lake and the road are observed as their surfaces');
 for(const o of objects){
  if(k.terrain.has(o.kind)&&k.terrain.get(o.kind)!=='horizon'||o.kind==='landscape')continue;
  const on=k.on.get(o.kind)??[],place=k.place.get(o.kind);
  if(place==='ground'){
   for(const r of [...water,...road].filter(r=>!on.includes(r.kind)))assert.ok(!meets(square(o),r),`${o.kind} ${o.id} keeps out of the ${r.kind} of ${r.entity}`);
   if(on.includes('road'))assert.ok(road.some(r=>inBox(o.x,o.y,r)),`${o.kind} ${o.id} drives on the road`);
  }
  if(place==='water')assert.ok(water.some(r=>inBox(o.x,o.y,r)),`${o.kind} ${o.id} is in the water`);
 }
 const failures=review(objects,k,surfaces).failures.filter(f=>/stands in|not in the water/.test(f));
 assert.deepEqual(failures,[]);
});

test('a house drawn before the river is not covered by it: the river keeps clear of what stands',async()=>{
 const {objects,surfaces}=await buildScene(['house','tree','person','river']);
 const river=objects.find(o=>o.kind==='river');
 assert.ok(Math.abs(river.y-river.size/2-350)<=1,'the river comes from the horizon');
 for(const o of objects.filter(o=>o!==river))for(const r of surfaces.filter(r=>r.kind==='water'))
  assert.ok(!meets(square(o),r),`${o.kind} stays dry`);
});

test('the river\'s banks run side by side when it is widened and bent; its water moves with it',async()=>{
 const {state}=await buildScene(['landscape','river']);
 const river=object(state,'river'),id=val(river,'code'),size=+val(river,'size');
 const widths=b=>b.map(p=>p.rx-p.lx),check=(b)=>{
  for(const p of b)assert.ok(Math.abs((p.lx+p.rx)/2-p.x)<1e-6,'the course runs down the middle');
  const w=widths(b);for(let i=1;i<w.length;i++)assert.ok(w[i]>=w[i-1]-1e-6,'the river widens evenly towards the front (perspective)');
 };
 const before=band(state,id);check(before);
 assert.equal(before.length,9);
 assert.ok(Math.abs(before[0].y-350)<1e-6,'it starts at the horizon');
 // "make the river wider": the reader's comparative changes its width.
 await act(state,`@c drawing.object.change ids="${id}" width=${size*1.25}`);
 const wider=band(state,id);check(wider);
 widths(wider).forEach((w,i)=>assert.ok(Math.abs(w-widths(before)[i]*1.25)<1e-6,'every stretch is a quarter wider'));
 // "bend the river to the left": its bend handle (part 1) moves left.
 const bend=facts(state,'app.observe.input').find(f=>val(f,'id')===id+'.1'&&val(f,'key')==='x'),bx=+val(bend,'value');
 const name=facts(state,'app.observe.object').find(f=>val(f,'id')===id+'.1');
 assert.equal(val(name,'name'),'bend','the bend is a part people can name');
 await act(state,`@c drawing.part.place id="${id}" index=1 x=${bx-80} y=${+val(facts(state,'app.observe.input').find(f=>val(f,'id')===id+'.1'&&val(f,'key')==='y'),'value')}`);
 const bent=band(state,id);check(bent);
 assert.ok(Math.abs(bent[4].x-(wider[4].x-80))<1e-6,'the middle of the course passes through the moved bend');
 widths(bent).forEach((w,i)=>assert.ok(Math.abs(w-widths(wider)[i])<1e-6,'bending keeps the widths'));
 const left=points(state,id+'.left_bank'),right=points(state,id+'.right_bank');
 assert.equal(left.length,9);
 left.forEach((p,i)=>{assert.ok(Math.abs(p.x-bent[i].lx)<1e-6&&Math.abs(right[i].x-bent[i].rx)<1e-6,'the banks are the edges of the water');});
 const host=await createDrawingArea({state}),water=host.observeSpatial().regions.filter(r=>r.entity===id&&r.kind==='water');
 assert.ok(water.some(r=>inBox(bent[4].x,bent[4].y,r)),'the water region follows the bend');
});

test('the lake\'s shore follows its water when the lake is made bigger; two lakes take different outlines',async()=>{
 const {state}=await buildScene(['landscape','lake']);
 const lake=object(state,'lake'),id=val(lake,'code');
 const shoreFollows=()=>{
  const o=object(state,'lake'),cx=+val(o,'x'),cy=+val(o,'y'),water=points(state,id+'.water'),shore=points(state,id+'.shore');
  assert.equal(water.length,16,'eight handles rounded once');
  water.forEach((p,i)=>{assert.ok(Math.abs(shore[i].x-cx-(p.x-cx)*1.08)<1e-6&&Math.abs(shore[i].y-cy-(p.y-cy)*1.08)<1e-6,'the shore is the water grown by 8 per cent');});
  return water;
 };
 const before=shoreFollows();
 await act(state,`@c drawing.object.change ids="${id}" size=${+val(lake,'size')*1.25}`);
 const after=shoreFollows();
 assert.ok(Math.max(...after.map(p=>p.x))-Math.min(...after.map(p=>p.x))>1.2*(Math.max(...before.map(p=>p.x))-Math.min(...before.map(p=>p.x))),'the water is bigger');
 const {state:two}=await buildScene(['landscape','lake','lake']);
 const [a,b]=parse(two.sop).filter(w=>w.type==='w.drawing.object'&&val(w,'drawing')==='lake').map(w=>val(w,'code'));
 const shape=id=>{const o=parse(two.sop).find(w=>val(w,'code')===id),s=+val(o,'size'),x=+val(o,'x'),y=+val(o,'y');return points(two,id+'.water').map(p=>[Math.round((p.x-x)/s*100),Math.round((p.y-y)/s*100)].join());};
 assert.notDeepEqual(shape(a),shape(b),'two lakes have different outlines');
});

test('raising and lowering the horizon keeps the ground below it, and new ground things stand below it',async()=>{
 const {state}=await buildScene(['landscape']);
 const id=val(object(state,'landscape'),'code');
 const horizon=()=>+val(facts(state,'ui.draw.horizon')[0],'y');
 const bands=()=>facts(state,'ui.draw.tbox').filter(f=>val(f,'object')===id).map(f=>({part:val(f,'form'),y0:+val(f,'y0'),y1:+val(f,'y1')}));
 const check=()=>{const h=horizon();for(const b of bands()){if(b.part.startsWith('sky'))assert.ok(b.y1<=h+1e-6,b.part+' above the horizon');else assert.ok(b.y0>=h-1e-6,b.part+' below the horizon');}
  assert.ok(bands().some(b=>Math.abs(b.y1-h)<1e-6)&&bands().some(b=>Math.abs(b.y0-h)<1e-6),'sky and ground meet at the horizon');};
 assert.equal(horizon(),350);check();
 // "raise the horizon": its handle (part 0) moves up.
 await act(state,`@c drawing.part.place id="${id}" index=0 x=500 y=280`);
 assert.equal(horizon(),280);check();
 // Lowered, a new house stands on the ground below it.
 await act(state,`@c drawing.part.place id="${id}" index=0 x=500 y=430`);
 assert.equal(horizon(),430);check();
 const {objects}=await buildScene(['house','tree'],{state});
 for(const o of objects.filter(o=>o.kind!=='landscape'))assert.ok(square(o).y0>=430-1e-6,o.kind+' stands below the lowered horizon');
});

test('depth: nearer things in front, shadows and side faces that fade with distance, smaller when moved farther',async()=>{
 const {state}=await buildScene(['landscape','hill','house','tree']);
 const svg=projectDrawingArea(state).svg,order=[...svg.matchAll(/data-select="([^"]+)"/g)].map(m=>m[1]);
 const code=kind=>val(object(state,kind),'code'),first=id=>order.indexOf(id);
 assert.ok(first(code('landscape'))<first(code('hill'))&&first(code('hill'))<first(code('house')),'the view, then the horizon, then what stands');
 const foot=kind=>{const o=object(state,kind);return +val(o,'y')+ +val(o,'size')/2;};
 const drawn=()=>[...new Set([...projectDrawingArea(state).svg.matchAll(/data-select="([^"]+)"/g)].map(m=>m[1]))];
 // The tree (drawn after the house) moved behind it, then in front of it: occlusion follows the foot, not the order drawn.
 const tree=object(state,'tree');
 await act(state,`@c drawing.object.place ids="${code('tree')}" x=${+val(tree,'x')} y=${+val(tree,'y')-60}`);
 assert.ok(foot('tree')<foot('house')&&drawn().indexOf(code('tree'))<drawn().indexOf(code('house')),'the farther tree is behind the house');
 await act(state,`@c drawing.object.place ids="${code('tree')}" x=${+val(tree,'x')} y=${+val(tree,'y')+60}`);
 assert.ok(foot('tree')>foot('house')&&drawn().indexOf(code('tree'))>drawn().indexOf(code('house')),'the nearer tree is in front of the house');
 const [near,far]=['tree','house'];
 for(const kind of ['house','tree']){
  const id=code(kind);
  assert.ok(new RegExp(`<g [^>]*data-select="${id}"><ellipse[^>]*opacity=`).test(svg),kind+' casts a shadow');
  assert.ok(facts(state,'ui.draw.draw').some(f=>val(f,'part')===id+'~side'),kind+' shows a side face');
 }
 const strength=kind=>+val(facts(state,'ui.draw.ground').find(f=>val(f,'object')===code(kind)),'k');
 assert.ok(strength(near)>=strength(far),'depth is fainter farther away');
 // Moved up towards the horizon, the house is drawn smaller by the depth scale.
 const house=object(state,'house'),size=+val(house,'size'),y=+val(house,'y');
 await act(state,`@c drawing.object.place ids="${code('house')}" x=${+val(house,'x')} y=${y-80}`);
 const moved=object(state,'house'),scale=y2=>0.4+0.6*Math.min(1,(y2-350)/350);
 assert.ok(Math.abs(+val(moved,'size')-Math.round(size*scale(y-80)/scale(y)*10)/10)<1e-6,'smaller by the depth scale');
});

test('people and animals stand side by side on the ground, a child smaller than an adult, each with its shadow',async()=>{
 const {state,objects}=await buildScene(['girl','sun','house','boy','man','cat','dog']);
 const standing=objects.filter(o=>!['sun'].includes(o.kind));
 for(const a of standing)for(const b of standing){
  if(a===b)continue;const p=square(a),q=square(b),across=Math.min(p.x1,q.x1)-Math.max(p.x0,q.x0);
  assert.ok(!(across>0&&p.y1<=q.y0),`${a.kind} does not float over ${b.kind}`);
 }
 const by=kind=>objects.find(o=>o.kind===kind);
 assert.ok(by('girl').size<by('man').size&&by('boy').size<by('man').size,'children are drawn smaller than the man (k.people height_about)');
 assert.ok(by('cat').size<by('dog').size,'a cat is drawn smaller than a dog');
 const svg=projectDrawingArea(state).svg;
 for(const o of standing)assert.ok(new RegExp(`<g [^>]*data-select="${o.id}"><ellipse[^>]*opacity=`).test(svg),o.kind+' casts a shadow');
 assert.deepEqual(review(objects,k,[]).failures,[]);
});
