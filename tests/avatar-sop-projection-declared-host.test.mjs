// The avatar as a SOP world: a w.face instance driven by the library's generic acts, drawn from facts that
// worlds/art.draw/look-projection.sop (the people's look projection the Avatar shares) derives with k.faces geometry. No avatar-specific JavaScript decides
// what is drawn; docs/webchat/ui/sop-primitives.mjs only draws the derived primitives.
import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {World} from '../src/vendor/sopworld/sopworld.mjs';
import {renderPrimitives} from '../worlds/sop-primitives.mjs';

const K=PINNED_CATALOG;
const read=path=>readFileSync(new URL(path,K),'utf8');
const available=existsSync(new URL('w.face/schema.sop',K))&&read('w.face/schema.sop').includes('w.face.slot');
const TYPES={draw:'ui.avatar.draw',fill:'ui.avatar.fill',point:'ui.avatar.point',orient:'ui.avatar.orient'};
const str=v=>v?.startsWith('"')?JSON.parse(v):v;

function avatarWorld(){
 const library=Object.fromEntries(readdirSync(K).filter(d=>existsSync(new URL(d+'/schema.sop',K))).map(d=>[d,read(d+'/schema.sop')]));
 const world=new World({library});
 const must=(result,what)=>assert.equal(result.ok,true,what+' '+JSON.stringify(result.violations?.[0]));
 must(world.load('@acts core.use world=std.acts\n@face core.use world=w.face\n@faces core.use world=k.faces\n@parts core.use world=k.parts\n@objects core.use world=k.objects'),'schemas');
 for(const file of readdirSync(new URL('k.faces/shards/',K)).filter(f=>f.startsWith('plain-')||f.startsWith('figure-')||['slots.sop','colours.sop','presets.sop'].includes(f)))
  must(world.tell(read('k.faces/shards/'+file),{factsOnly:true}),file);
 must(world.load(readFileSync(new URL('../worlds/art.draw/look-projection.sop',import.meta.url),'utf8')),'projection');
 return {world,must};
}
function compose({world,must},preset){
 const p=world.ofType('k.faces.preset').find(x=>str(x.attrs.name[0])===preset&&str(x.attrs.style[0])==='plain');
 const colours=Object.fromEntries(['skin','hair_colour','eye_colour','clothes'].filter(k=>p.attrs[k]).map(k=>[k,str(p.attrs[k][0])]));
 must(world.act({action:'make',args:{kind:'w.face.face',name:'Avatar',style:'plain',preset,...colours}}),'face');
 const face='$'+world.ofType('w.face.face')[0].id;
 for(const s of world.ofType('w.face.slot')){
  const slot=s.attrs.slot[0];
  if(p.attrs[slot])must(world.act({action:'make',args:{kind:s.attrs.part[0],variant:str(p.attrs[slot][0]),face}}),slot);
 }
 return face;
}
const shown=world=>Object.fromEntries(world.ofType('ui.avatar.shown').map(s=>[s.attrs.slot[0],str(s.attrs.variant[0])]));

test('a preset composes through generic acts and every derived primitive has exactly one fill',{skip:available?false:'knowledge with w.face.slot unavailable'},()=>{
 const ctx=avatarWorld(),{world}=ctx;
 compose(ctx,'child');
 const draws=world.ofType(TYPES.draw),fills=world.ofType(TYPES.fill);
 const keys=new Set(fills.map(f=>f.attrs.source[0]+'|'+f.attrs.part[0]));
 assert.ok(draws.length>10);
 assert.equal(keys.size,fills.length,'one fill per shape and part');
 assert.ok(draws.every(d=>keys.has(d.attrs.source[0]+'|'+d.attrs.part[0])),'every primitive is filled');
 assert.ok(draws.some(d=>d.attrs.side[0]==='right'),'mirrored slots draw twice');
 const svg=renderPrimitives(world,TYPES);
 assert.equal((svg.match(/<g /g)??[]).length,draws.length);
 assert.match(svg,/#F3CFB3/,'the skin tint resolves through k.faces colours');
});

test('a face keeps one part of each kind, expressions replace variants and undo restores the derived drawing',{skip:available?false:'knowledge with w.face.slot unavailable'},()=>{
 const ctx=avatarWorld(),{world}=ctx,face=compose(ctx,'child');
 assert.equal(world.act({action:'make',args:{kind:'w.face.head',variant:'oval',face}}).ok,false);
 const calm=shown(world);
 ctx.must(world.act({action:'change',args:{thing:world.ofType('w.face.face')[0].id,attr:'expression',value:'happy'}}),'expression');
 assert.equal(shown(world).mouth,'big smile');
 assert.equal(shown(world).head,calm.head);
 ctx.must(world.act({action:'undo',args:{}}),'undo');
 assert.deepEqual(shown(world),calm);
 const mouth=world.ofType('w.face.mouth')[0].id;
 ctx.must(world.act({action:'change',args:{thing:mouth,attr:'size',value:1.5}}),'resize');
 assert.ok(world.ofType(TYPES.draw).filter(d=>d.attrs.part[0]==='$'+mouth).every(d=>d.attrs.scale[0]==='1.5'));
 ctx.must(world.act({action:'undo',args:{}}),'undo resize');
 assert.ok(world.ofType(TYPES.draw).filter(d=>d.attrs.part[0]==='$'+mouth).every(d=>d.attrs.scale[0]==='1'));
});
