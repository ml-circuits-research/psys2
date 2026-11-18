import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {World} from '../src/vendor/sopworld/sopworld.mjs';
import {inspectReferencePolicy,readReferenceTurn,resolveObservedReference} from '../src/dialog/reference-policy.mjs';

const objects = ['square','circle'].map((kind,i) => ({id:'o'+i,kind,sourceType:'fixture.shape'}));
const mappings = objects.map(object => ({lemma:object.kind,canonical:'fixture.'+object.kind,nativeFamilyBinding:{sourceType:'fixture.shape'}}));
const request = target => ({act:'change',mood:'do',target,turn:{fragment:'replaces'}});

test('context references use a declared preference and an exclusion against the same two live objects', async () => {
  const {schema,policy} = inspectReferencePolicy();
  for(const [name,source] of [['reference-schema',schema],['reference-policy',policy]]) {
    assert.equal(await readFile(new URL('../worlds/app.project/'+name+'.sop',import.meta.url),'utf8'),source);
  }
  const choose = (target,world) => resolveObservedReference(readReferenceTurn(request(target),world),objects,mappings,'o0');
  const focused = choose({mode:'existing',fill:'context'});
  assert.equal(focused.selected.object.id,'o0');
  const other = choose({quantifier:'other'});
  assert.equal(other.selected.object.id,'o1');
  assert.match(other.choice.sop,/status=denied criterion=other/);
  const changed = new World({library:{'app.reference':schema}});
  changed.load(policy.replace('name=focus measure=focused dir=max','name=focus measure=focused dir=min'));
  assert.equal(choose({mode:'existing',fill:'context'},changed).selected.object.id,'o1');
  assert.equal(resolveObservedReference(readReferenceTurn(request({quantifier:'other'})),objects.slice(0,1),mappings,'o0'),null);
});
