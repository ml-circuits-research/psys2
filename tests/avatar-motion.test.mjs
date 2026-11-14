// SPDX-License-Identifier: AGPL-3.0-only
// The avatar's motion by rules (worlds/ui.avatar/motion.mjs: a thin call of the library's std.motion over the knowledge world k.motion; the bundled subset worlds/ui.avatar/default-motion.mjs is
// the catalog's own text): deterministic under a seed, the mouth follows the reply text, outcome expressions that ease back, blinks at random intervals, reduced motion, and the render model
// (the state's expression is never contradicted). Nothing of the rules is in the code under test: the tests read them from the facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createMotion as create, parseMotion, motionNeeds } from '../worlds/ui.avatar/motion.mjs';
import { DEFAULT_MOTION } from '../worlds/ui.avatar/default-motion.mjs';
import { shownOver } from '../worlds/ui.avatar/facedraw.mjs';
import { DEFAULT_FACE } from '../worlds/ui.avatar/default-face.mjs';

const motion = parseMotion(lib, DEFAULT_MOTION);
const has = (slot, name) => DEFAULT_FACE.slots.find((s) => s.name === slot)?.variants.some((v) => v.name === name && v.parts.length);
const features = (slot, name) => DEFAULT_FACE.slots.find((s) => s.name === slot)?.variants.find((v) => v.name === name)?.features ?? {};
const createMotion = (o = {}) => create({ lib, motion, has, features, ...o });
const trace = (seed, events, to = 12000, step = 40, opts = {}) => {
  const m = createMotion({ seed, ...opts }), out = [];
  const at = new Map(events.map(([t, ...e]) => [t, e]));
  for (let t = 0; t <= to; t += step) { for (const [k, e] of at) if (k <= t && k > t - step) m.emit(...e.slice(0, 2), t); out.push(JSON.stringify(m.frame(t))); }
  return out;
};
const rule = (name) => motion.rules.find((r) => r.name === name);

test('the bundled subset is the catalog text of k.motion: 17 rules, 4 layers, the text -> mouth splitter, the mouth classes', () => {
  assert.equal(motion.rules.length, 17);
  assert.deepEqual([...motion.layers.keys()].sort(), ['blink', 'expression', 'glance', 'talk']);
  assert.ok(motion.splitters.has('latin letters') && motion.visemes.size >= 7);
  assert.match(DEFAULT_MOTION, /k\.motion\.rule/);
});

test('deterministic: the same seed and events give the same frames; another seed blinks elsewhere', () => {
  const ev = [[200, 'thinking', { on: true }], [1500, 'reply', { text: 'I drew a blue lake.', outcome: 'done' }]];
  assert.deepEqual(trace(5, ev), trace(5, ev));
  assert.notDeepEqual(trace(5, ev), trace(6, ev));
});

test('blinks come at natural random intervals (the rule says 1.5 to 5.5 s apart at rest)', () => {
  const [lo, hi] = rule('blink at rest').repeat;
  const f = trace(3, [], 90000, 20), starts = [];
  f.forEach((x, i) => { const closed = JSON.parse(x).over?.eyes === 'closed'; if (closed && !(i && JSON.parse(f[i - 1]).over?.eyes === 'closed')) starts.push(i * 20); });
  assert.ok(starts.length >= 12, `blinks: ${starts.length}`);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g >= lo * 0.8), `no blink faster than the rule: ${Math.min(...gaps)}`);
  assert.ok(gaps.filter((g) => g <= hi + 800).length >= gaps.length * 0.8);
  assert.ok(new Set(gaps).size > 3, 'the intervals are not one fixed number');
});

test('the mouth follows the reply text while it is said, then rests; an outcome expression follows and eases back to the base face', () => {
  const m = createMotion({ seed: 1 }); m.emit('reply', { text: 'a lake', outcome: 'done' }, 1000);
  const seen = new Set(); let lastTalk = 0;
  for (let t = 1000; t < 3000; t += 10) { const f = m.frame(t); if (f.talking) { lastTalk = t; if (f.over?.mouth) seen.add(f.over.mouth); } }
  assert.ok(seen.size >= 2, `mouth shapes while talking: ${[...seen]}`);
  assert.ok(lastTalk > 1200 && lastTalk < 1700, `six letters take 0.3 to 0.5 s of talking: ${lastTalk - 1000}`);
  let smiled = false; for (let t = lastTalk; t < lastTalk + 2500; t += 20) if (m.frame(t).over?.mouth === 'smile') smiled = true;
  assert.ok(smiled, 'done: the face smiles once it has said it');
  assert.equal(m.frame(lastTalk + 6000).over?.mouth, undefined, 'the base face again');
});

test('outcomes: not understood raises the brows, refused has sad brows then a sad mouth, answer flashes the brows, question back raises them', () => {
  const run = (outcome, text = 'ok') => { const m = createMotion({ seed: 2 }); m.emit('reply', { text, outcome }, 0); const seen = {}; for (let t = 0; t < 4000; t += 10) for (const [k, v] of Object.entries(m.frame(t).over ?? {})) (seen[k] ??= new Set()).add(v); return seen; };
  assert.ok(run('not-understood').eyebrows?.has('raised') && run('not-understood').mouth?.has('small'));
  const refused = run('refused');
  assert.ok(refused.eyebrows?.has('sad') && refused.mouth?.has('sad'));
  assert.ok(run('answer').eyebrows?.has('raised'));
  assert.ok(run('question-back').eyebrows?.has('raised'));
});

test('thinking is a reply with the outcome thinking: the eyes look up until the next reply, which ends it', () => {
  const m = createMotion({ seed: 4 }); m.emit('thinking', { on: true }, 0);
  assert.equal(m.frame(1500).over?.eyes, 'looking up');
  assert.equal(m.frame(9000).over?.eyes, 'looking up', 'held');
  m.emit('reply', { text: '', outcome: 'answer' }, 9500);
  assert.notEqual(m.frame(10200).over?.eyes, 'looking up');
  const off = createMotion({ seed: 4 }); off.emit('thinking', { on: true }, 0); off.emit('thinking', { on: false }, 400);
  assert.notEqual(off.frame(1500).over?.eyes, 'looking up', 'a turn that ends with no reply clears the thinking');
});

test('a host event with no rule changes nothing (typing, mood)', () => {
  const a = trace(3, [[100, 'typing', {}], [900, 'mood', { mood: 'surprised' }]]), b = trace(3, []);
  assert.deepEqual(a, b);
});

test('reduced motion: no blinking, glancing or moving mouth; the expression is still there', () => {
  const f = trace(3, [[0, 'reply', { text: 'hello there world', outcome: 'done' }]], 30000, 20, { reduced: true }).map((x) => JSON.parse(x));
  assert.ok(f.every((x) => !x.talking && x.over?.eyes !== 'closed' && x.over?.eyes !== 'looking out'));
  assert.ok(f.some((x) => x.over?.mouth === 'smile'), 'done: still smiles');
});

test('render model: while the state holds an expression only the talking mouth is laid over it', () => {
  const wink = { expression: 'wink' };
  assert.equal(shownOver(wink, { over: { eyes: 'closed', eyebrows: 'raised' }, talking: false }), null);
  assert.deepEqual(shownOver(wink, { over: { mouth: 'open', eyes: 'closed' }, talking: true }), { mouth: 'open' });
  assert.deepEqual(shownOver({}, { over: { eyes: 'closed' }, talking: false }), { eyes: 'closed' });
});

test('the fallback face has the drawings the motion asks for (every value the rules set, drawn)', () => {
  for (const [slot, names] of Object.entries(motionNeeds(motion))) {
    const s = DEFAULT_FACE.slots.find((x) => x.name === slot);
    for (const n of names) assert.ok(s.variants.some((v) => v.name === n && v.parts.length), `${slot}: "${n}" is not drawn in the fallback face`);
  }
});

test('a value the face lacks keeps the face\'s own', () => {
  const none = createMotion({ seed: 1, has: () => false }); none.emit('reply', { text: 'a lake', outcome: 'done' }, 0);
  for (let t = 0; t < 8000; t += 50) assert.equal(none.frame(t).over, null);
});

test('a new reply cancels the rest of the earlier one: no smile left over a refusal', () => {
  const m = createMotion({ seed: 9 });
  m.emit('reply', { text: 'a lake of oo', outcome: 'done' }, 0);
  m.emit('reply', { text: '', outcome: 'refused' }, 300);
  let sad = false; for (let t = 320; t < 3500; t += 10) { const f = m.frame(t).over ?? {}; assert.notEqual(f.mouth, 'smile'); if (f.mouth === 'sad') sad = true; }
  assert.ok(sad);
});

test('the voice: the mouth goes on for the length of the text it says; stopping it early ends the talk and the outcome shows', () => {
  const text = 'a lake with a house and a tree and a river and a bridge and a boat and a bird and a cloud and a sun and a hill and a path and a gate'.repeat(3);
  const m = createMotion({ seed: 2 });
  m.emit('reply', { text, outcome: 'done' }, 0);
  const early = (() => { let last = 0; for (let t = 0; t < 12000; t += 20) if (m.frame(t).talking) last = t; return last; })();
  assert.ok(early < 9000, `the mouth stops after the capped text: ${early}`);
  const v = createMotion({ seed: 2 });
  v.emit('reply', { text, outcome: 'done' }, 0); v.emit('speaking', { on: true, text }, 10);
  let late = 0; for (let t = 0; t < 30000; t += 20) if (v.frame(t).talking) late = t;
  assert.ok(late > early + 2000, `the voice keeps the mouth going: ${late} vs ${early}`);
  v.emit('speaking', { on: false }, 3000);
  assert.equal(v.frame(3200).talking, false);
  let smile = false; for (let t = 3000; t < 6500; t += 20) if (v.frame(t).over?.mouth === 'smile') smile = true;
  assert.ok(smile, 'the outcome that waited shows');
});

test('a long session stays bounded: the plan is rebased and the frames still follow the rules', () => {
  const m = createMotion({ seed: 3 }); let blinks = 0, last = false;
  for (let t = 0; t < 600000; t += 20) { const c = m.frame(t).over?.eyes === 'closed'; if (c && !last) blinks++; last = c; }
  assert.ok(blinks > 80, `blinks over ten minutes: ${blinks}`);
  m.emit('reply', { text: 'hi', outcome: 'done' }, 600000);
  assert.ok(m.frame(600100).over?.mouth, 'a reply after ten minutes still moves the face');
});

test('nothing is scheduled when reduced and quiet: only an event changes the frame', () => {
  const m = createMotion({ seed: 1, reduced: true });
  assert.equal(m.nextChange(0), Infinity);
  m.frame(25000);
  assert.equal(m.nextChange(30000), Infinity);
});

test('no scheduler and no rule of ours: motion.mjs holds no rule table and the avatar reads the world from the catalog', () => {
  const src = readFileSync(new URL('../worlds/ui.avatar/motion.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /MOTION_RULES_TEMPORARY|rulesToFacts|graphemes|blink:|visemeMs/);
  const av = readFileSync(new URL('../docs/webchat/ui/avatar.mjs', import.meta.url), 'utf8');
  assert.match(av, /worldText\('k\.motion'\)/);
  assert.match(av, /default-motion\.mjs/);
});
