import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFacts} from '../src/knowledge/facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {readCompositionRegions} from '../src/dialog/composition-knowledge.mjs';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';

test('placement knowledge retains actual catalog facts and requires a visible support kind',async()=>{
 const base=new URL('../docs/webchat/catalog/'+CATALOG_PIN.commit+'/',import.meta.url);
 const reads=[];
 const catalog=createFacts({source:{text:path=>{reads.push(path);return readFile(new URL(path,base),'utf8');}}});
 const regions=async anchors=>parse(await readCompositionRegions(catalog,{subjects:['boat','sun'],anchors,layout:'landscape'}));
 const dry=await regions([]);
 assert.ok(dry.some(row=>row.type==='k.composition2d.slot'&&row.attrs.subject[0]==='sun'&&row.attrs.place[0]==='sky'));
 assert.ok(!dry.some(row=>row.type==='k.composition2d.anchor'));
 const lake=await regions(['lake']);
 const supported=lake.find(row=>row.type==='k.composition2d.anchor'&&row.attrs.subject[0]==='boat'&&row.attrs.basis[0]==='medium');
 assert.deepEqual(supported.attrs.evidence,['$k.scenes.thing.boat','$k.layouts.anchor.lake.water']);
 for(const reference of supported.attrs.evidence)assert.ok(lake.some(row=>'$'+row.id===reference));
 assert.deepEqual(['x','y','w','h'].map(k=>Number(supported.attrs[k][0])),[3,22,94,56]);
 assert.equal(reads.filter(path=>path==='k.composition2d/schema.sop').length,1);
});
