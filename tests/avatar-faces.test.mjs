// The one avatar over the catalog data (local fixture, no network): every slot can be taken off or put on, the renderer draws every slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import * as L from '../worlds/ui.avatar/facelogic.mjs';
import { renderFace, variantSvg } from '../worlds/ui.avatar/facedraw.mjs';

const facts = createFacts({ source: createKnowledgeSource(path.join(import.meta.dirname, 'fixtures/catalog')) });
const data = await facts.faces();
const fresh = () => ({ state: {}, request() {} });
const say = (s) => s.name.replace(/_/g, ' ');

test('the data is the catalog faces: 16 slots, presets, expressions', () => {
  assert.equal(data.slots.length, 16);
  assert.ok(Object.keys(data.presets).length >= 13);
  assert.ok(data.expressions.happy && data.expressions.talking);
});

test('remove X works for every slot of the catalog: optional ones are emptied, the others refused', () => {
  for (const s of data.slots) {
    const ctx = fresh(), f = L.faceOf(ctx, data);
    f.slots[s.name] = s.variants[0].name;
    const r = L.faceRemove(ctx, { words: say(s) }, data);
    if (s.optional) { assert.equal(r.status, 'supported', s.name); assert.equal(ctx.state.face.slots[s.name], 'none', s.name); } else assert.equal(r.status, 'unsupported', s.name);
  }
});

test('every variant draws; each optional part added then removed leaves the face as it was', () => {
  const ctx = fresh(), f = L.faceOf(ctx, data);
  for (const s of data.slots) for (const v of s.variants) assert.match(variantSvg(data, f, s.name, v.name), /<svg/);
  assert.match(renderFace(data, f), /<svg/);
  for (const s of data.slots.filter((x) => x.optional)) {
    const c = fresh(), g = L.faceOf(c, data);
    g.slots[s.name] = 'none';
    const before = JSON.stringify(g.slots);
    assert.equal(L.faceAdd(c, { words: say(s) }, data).status, 'supported', s.name);
    assert.notEqual(c.state.face.slots[s.name], 'none', s.name);
    L.faceRemove(c, { words: say(s) }, data);
    assert.equal(JSON.stringify(c.state.face.slots), before, s.name);
  }
});

test('catalog synonyms reach slots: eyeglasses is the glasses slot', () => {
  const ctx = fresh();
  L.faceOf(ctx, data).slots.glasses = 'none';
  L.faceAdd(ctx, { words: 'eyeglasses' }, data);
  assert.notEqual(ctx.state.face.slots.glasses, 'none');
});
