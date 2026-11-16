import test from 'node:test';import assert from 'node:assert/strict';
import {World} from '../src/vendor/sopworld/sopworld.mjs';
import {checkRequest} from '../src/dialog/request-check.mjs';
const make=(body='@c std.request.constraint request=$r target=$t concept=tint operator=eq value=blue character=requirement polarity=positive',root='',target='')=>{const w=new World();w.load('@u core.use world=std.request');w.load(`@s std.request.source text="Provided check"
@r std.request act=inspect mood=check source=$s ${root}
@t std.request.target request=$r mode=existing kind=toy.item ${target}
${body}`);return w;};
const setup=(value='"blue"')=>({observations:[{instanceId:'native',scope:'all',version:'1',complete:true,objects:[{id:'i',kind:'item',source:'incarnation',sourceType:'toy.item',version:'1',inputs:[{binding:'toy.tint',key:'color',source:'incarnation',sourceType:'toy.item',version:'1',values:[value]}]}]}],targetPlans:{t:{semanticKind:'toy.item',instanceId:'native',version:'1',selection:{scope:'all',kind:{native:{kind:'item',sourceType:'toy.item'},witness:'declared kind'},predicates:[]}}},predicateBindings:{c:{concept:'tint',wireValues:['blue'],binding:{id:'toy.tint',key:'color',sourceType:'toy.item'},expected:{values:['"blue"'],witness:'declared mapping'}}}});
test('native check uses exact token equality and preserves immutable observations',()=>{const w=make(),input=setup(),before=JSON.stringify(input);assert.equal(checkRequest(w,'r',input).truth,'true');assert.equal(checkRequest(w,'r',setup('"red"')).truth,'false');assert.equal(checkRequest(w,'r',setup('blue')).truth,'false');assert.equal(JSON.stringify(input),before);assert.equal(checkRequest(w,'r',input).executable,false);});
test('logical root and polarity are evaluated by the shared graph mechanism',()=>{
 const w=make('@c std.request.constraint request=$r target=$t concept=tint operator=eq value=blue character=requirement polarity=negative\n@n std.request.not request=$r of=$c','root=$n');assert.equal(checkRequest(w,'r',setup()).truth,'true');
 const missing=setup();delete missing.predicateBindings.c;assert.equal(checkRequest(w,'r',missing).truth,'unknown');
});
test('missing, stale, unsupported and dimensional evidence is unknown, never a false match',()=>{
 for(const mutate of [x=>x.observations[0].objects[0].inputs=[],x=>x.observations[0].objects[0].inputs[0].version='0',x=>x.predicateBindings.c.binding.unit='pixel',x=>x.targetPlans.t.version='0',x=>x.targetPlans.t.selection.scope='view',x=>x.predicateBindings.c.wireValues=['other']]){const x=setup();mutate(x);assert.equal(checkRequest(make(),'r',x).truth,'unknown');}
 const w=make(undefined,'','name="Unresolved"');assert.equal(checkRequest(w,'r',setup()).truth,'unknown');
 assert.equal(checkRequest(make(),'r',{...setup(),budget:1}).truth,'unknown');
});
test('rootless conjunction evaluates all required predicates and quantifiers retain population coverage',()=>{
 const w=make('@c std.request.constraint request=$r target=$t concept=tint operator=eq value=blue character=requirement polarity=positive\n@d std.request.constraint request=$r target=$t concept=size operator=eq value=large character=requirement polarity=positive');assert.equal(checkRequest(w,'r',setup()).truth,'unknown');
 const q=make('@b std.request.target request=$r mode=bound kind=toy.item\n@c std.request.constraint request=$r target=$b concept=tint operator=eq value=blue character=requirement polarity=positive\n@q std.request.quant request=$r kind=all target=$t bind=$b body=$c','root=$q');assert.equal(checkRequest(q,'r',setup()).truth,'true');const x=setup();x.observations[0].complete=false;assert.equal(checkRequest(q,'r',x).truth,'unknown');
});

test('reservation ledger bounds repeated leaves and invalidates the entire exhausted check',()=>{
 const body=Array.from({length:8},(_,i)=>`@c${i} std.request.constraint request=$r target=$t concept=tint operator=eq value=blue character=requirement polarity=positive`).join('\n');
 const w=make(body),input=setup();input.predicateBindings=Object.fromEntries(Array.from({length:8},(_,i)=>['c'+i,setup().predicateBindings.c]));
 const low=checkRequest(w,'r',{...input,budget:16000});assert.equal(low.truth,'unknown');assert.equal(low.reason,'check-budget');assert.ok(low.work.charged<=16000);
 assert.equal(checkRequest(w,'r',{...input,budget:200000}).truth,'true');
 const or=make(body.split('\n').slice(0,2).join('\n')+'\n@g std.request.group request=$r operator=or member=$c0 member=$c1','root=$g');
 const exhausted=checkRequest(or,'r',{...input,subBudget:1});assert.equal(exhausted.truth,'unknown');assert.equal(exhausted.reason,'check-budget');
});
test('many observed objects cannot reuse a small subordinate traversal budget',()=>{
 const input=setup(),base=input.observations[0].objects[0];input.observations[0].objects=Array.from({length:1500},(_,i)=>({...base,id:'i'+i,source:'s'+i,inputs:[]}));
 const result=checkRequest(make(),'r',{...input,budget:20000,subBudget:128});assert.equal(result.truth,'unknown');assert.equal(result.reason,'check-budget');assert.ok(result.work.charged<=20000);
 assert.equal(checkRequest(make(),'r',{...setup(),maxBytes:10}).truth,'unknown');
});
