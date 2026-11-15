// The one avatar over the catalog data (local fixture, no network): every slot can be taken off or put on, the renderer draws every slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import * as L from '../worlds/ui.avatar/facelogic.mjs';
import { presetAliases } from '../src/knowledge/faces.mjs';
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

// CHARACTER REQUESTS (spec 07 "Drawn face"; real rows r0511, r0513, r0514, r0516, r0517, r0519, r0520, r0524): "make the avatar X" is about the avatar itself; no part is invented.
const withAliases = { ...data, presetAliases: { person: ['child', 'girl', 'boy', 'woman', 'man'], kid: ['child'] } };

test('a character request names a preset, a kind of preset, or is refused honestly; it never changes a random part', () => {
  const robot = fresh(), r = L.faceRestyle(robot, { words: 'a robot', self: true }, withAliases);   // "robot" is also a mouth kind: the avatar itself means the preset
  assert.equal(r.status, 'supported'); assert.match(r.value, /robot/); assert.equal(robot.state.face.base, 'robot');
  const emoji = fresh(), before = JSON.stringify(L.faceOf(emoji, withAliases).slots), e = L.faceRestyle(emoji, { words: 'an emoji', self: true }, withAliases);
  assert.equal(e.status, 'unsupported'); assert.match(e.note, /I cannot be an emoji\. I can be .*a robot/); assert.equal(JSON.stringify(emoji.state.face.slots), before);
  const person = fresh(), p = L.faceRestyle(person, { words: 'a person', self: true }, withAliases);   // already a girl (the default preset): said, nothing redrawn
  assert.equal(p.status, 'supported'); assert.match(p.value, /I am already a person: a girl/);
  const man = fresh(); L.facePreset(man, 'man', withAliases); assert.match(L.faceRestyle(man, { words: 'a person', self: true }, withAliases).value, /already a person: a man/);
  const kid = fresh(); assert.equal(L.faceRestyle(kid, { words: 'a kid', self: true }, withAliases).status, 'supported'); assert.equal(kid.state.face.base, 'child');
  const smile = fresh(); L.faceRestyle(smile, { words: 'to geta big smile', self: true }, withAliases); assert.equal(smile.state.face.slots.mouth, 'big smile');   // a named part is put on, not cycled
  const green = fresh(); assert.equal(L.faceRestyle(green, { words: 'green', self: true }, withAliases).status, 'supported');   // "paint yourself green": the colour of the face
});

test('a part every face has is not taken off by naming the variant it shows; a modifier the variant lacks is said', () => {
  const ctx = fresh(); L.faceAdd(ctx, { words: 'big smile' }, data);
  const r = L.faceBare(ctx, { words: 'big smile' }, data);
  assert.equal(r.status, 'supported'); assert.match(r.value, /already have a big smile/); assert.equal(ctx.state.face.slots.mouth, 'big smile');
  assert.match(L.faceAdd(fresh(), { words: 'small smile' }, data).value, /I have no small smile/);
});

test('preset aliases come from the word senses: first-sense synonyms and kinds shared by two presets, up to the supersense head', async () => {
  const S = { girl: { supersense: 'noun.person', synonym: ['miss'], kind_of: ['woman', 'female', 'person', 'organism'] }, man: { supersense: 'noun.person', kind_of: ['male', 'person', 'organism'] },
    queen: { supersense: 'noun.animal', kind_of: ['insect', 'animal', 'organism'] }, robot: { supersense: 'noun.artifact', synonym: ['automaton'], kind_of: ['mechanism', 'device'] } };
  const fake = { wires: async (type, { key }) => (S[key] ? [{ f: { word: [key], pos: ['noun'], n: ['1'], supersense: [S[key].supersense], synonym: S[key].synonym ?? [], kind_of: S[key].kind_of } }] : []) };
  const a = await presetAliases(fake, ['girl', 'man', 'queen', 'robot', 'old woman']);
  assert.deepEqual(a.person, ['girl', 'man']); assert.deepEqual(a.miss, ['girl']); assert.deepEqual(a.automaton, ['robot']);
  for (const w of ['organism', 'animal', 'insect', 'mechanism', 'woman', 'female']) assert.equal(a[w], undefined, w);   // past the head, or one preset's kind only
});
