// SPDX-License-Identifier: AGPL-3.0-only
// The avatar's motion by rules (worlds/ui.avatar/motion.mjs: a thin call of the library's std.motion; the rules are TEMPORARY until k.motion exists): deterministic under a seed, visemes of the reply text, outcome expressions that ease
// back, blinks at random intervals, reduced motion, and the render model (the state's expression is never contradicted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createMotion as create, visemesOf, mouthUnits, motionNeeds, rulesToFacts, MOTION_RULES_TEMPORARY as R } from '../worlds/ui.avatar/motion.mjs';
import { shownOver } from '../worlds/ui.avatar/facedraw.mjs';
import { DEFAULT_FACE } from '../worlds/ui.avatar/default-face.mjs';

const createMotion = (o = {}) => create({ lib, ...o });
const has = (slot, name) => DEFAULT_FACE.slots.find((s) => s.name === slot)?.variants.some((v) => v.name === name && v.parts.length);
const trace = (seed, events, to = 12000, step = 40, opts = {}) => {
  const m = createMotion({ seed, has, ...opts }), out = [];
  const at = new Map(events.map(([t, ...e]) => [t, e]));
  for (let t = 0; t <= to; t += step) { for (const [k, e] of at) if (k <= t && k > t - step) m.emit(...e.slice(0, 2), t); out.push(JSON.stringify(m.frame(t))); }
  return out;
};

test('deterministic: the same seed and events give the same frames; another seed blinks elsewhere', () => {
  const ev = [[200, 'typing', {}], [1500, 'thinking', { on: true }], [2600, 'reply', { text: 'I drew a blue lake.', outcome: 'done' }]];
  assert.deepEqual(trace(5, ev), trace(5, ev));
  assert.notDeepEqual(trace(5, ev), trace(6, ev));
});

test('blinks come at natural random intervals (2.4 to 6.5 s apart, 130 ms closed)', () => {
  const f = trace(3, [], 60000, 20), starts = [];
  f.forEach((x, i) => { const closed = JSON.parse(x).over?.eyes === 'closed'; if (closed && !(i && JSON.parse(f[i - 1]).over?.eyes === 'closed')) starts.push(i * 20); });
  assert.ok(starts.length >= 8, `blinks: ${starts.length}`);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g >= 200), `no blink faster than a double blink: ${Math.min(...gaps)}`);
  assert.ok(new Set(gaps).size > 3, 'the intervals are not one fixed number');
  assert.ok(gaps.filter((g) => g >= 2400).length >= gaps.length / 2);
});

test('visemes: open vowels, rounded, closed, f/v, rest; timed', () => {
  const v = visemesOf('Moo, fa!');
  assert.deepEqual(v.map((x) => x.cls), ['closed', 'round', 'round', 'rest', 'fv', 'open', 'rest']);
  assert.ok(v.every((x) => x.ms > 0));
  assert.equal(visemesOf('').length, 0);
});

test('the mouth follows the reply text while it is shown, then rests; an outcome expression follows and eases back to the base face', () => {
  const m = createMotion({ seed: 1, has }); m.emit('reply', { text: 'a lake', outcome: 'done' }, 1000);
  const seen = new Set();
  for (let t = 1000; t < 1000 + 800; t += 10) { const f = m.frame(t); if (f.talking && f.over?.mouth) seen.add(f.over.mouth); }
  assert.ok(seen.size >= 2, `mouth shapes while talking: ${[...seen]}`);
  const end = 1000 + mouthUnits('a lake').length * R.talkUnitMs;
  assert.equal(m.frame(end + 50).talking, false);
  assert.equal(m.frame(end + 50).over?.mouth, 'big smile');          // done: smile
  assert.equal(m.frame(end + 1500).over?.mouth, 'smile');            // easing back
  assert.equal(m.frame(end + 4000).over?.eyebrows, undefined);       // the base face again
});

test('outcomes: not understood raises the brows, refused frowns, answer stays neutral, question back looks up', () => {
  const after = (outcome) => { const m = createMotion({ seed: 2, has }); m.emit('reply', { text: '', outcome }, 0); return m.frame(10).over ?? {}; };
  assert.equal(after('not-understood').eyebrows, 'raised');
  assert.ok(['sad', 'frown'].includes(after('refused').mouth) && has('mouth', after('refused').mouth));
  assert.equal(after('answer').mouth, undefined);
  assert.equal(after('question-back').eyes, 'looking up');
});

test('thinking shows after 300 ms, typing shows, idle comes after a long quiet and an event clears it', () => {
  const m = createMotion({ seed: 4, has }); m.emit('thinking', { on: true }, 0);
  assert.equal(m.frame(100).over?.eyes === 'looking up', false);
  assert.equal(m.frame(400).over.eyes, 'looking up');
  m.emit('reply', { text: '', outcome: 'answer' }, 500);
  m.emit('typing', {}, 5000); assert.equal(m.frame(5100).over?.eyes === 'downcast' || m.frame(5100).over?.eyes === 'closed', true);
  const q = createMotion({ seed: 4, has });
  assert.equal(q.frame(R.idleAfterMs + 10).over?.eyes === 'sleepy' || q.frame(R.idleAfterMs + 10).over?.eyes === 'closed', true);
});

test('reduced motion: no blinking, no moving mouth', () => {
  const f = trace(3, [[0, 'reply', { text: 'hello there world', outcome: 'done' }]], 30000, 20, { reduced: true }).map((x) => JSON.parse(x));
  assert.ok(f.every((x) => !x.talking && x.over?.eyes !== 'closed'));
});

test('render model: while the state holds an expression only the talking mouth is laid over it', () => {
  const wink = { expression: 'wink' };
  assert.equal(shownOver(wink, { over: { eyes: 'closed', eyebrows: 'raised' }, talking: false }), null);
  assert.deepEqual(shownOver(wink, { over: { mouth: 'open', eyes: 'closed' }, talking: true }), { mouth: 'open' });
  assert.deepEqual(shownOver({}, { over: { eyes: 'closed' }, talking: false }), { eyes: 'closed' });
});

test('the fallback face has the drawings the motion asks for', () => {
  for (const [slot, names] of Object.entries(motionNeeds())) {
    const s = DEFAULT_FACE.slots.find((x) => x.name === slot);
    const present = names.filter((n) => s.variants.some((v) => v.name === n && v.parts.length));
    assert.ok(present.length >= 1, `${slot}: none of ${names} drawn in the fallback`);
  }
});

test('thin call of std.motion: the rules are mo.* facts, the plan is the library\'s, the mouth of a talk holds over an outcome and a new reply cancels the rest of the earlier', () => {
  const facts = rulesToFacts();
  assert.match(facts, /mo\.rule name="talk" on=talk priority=8 split=visemes/);
  assert.match(facts, /mo\.rule name="blink" repeat=2400-6500/);
  assert.doesNotMatch(rulesToFacts(R, { reduced: true }), /name="(blink|talk)"/);
  const m = createMotion({ seed: 9, has });
  m.emit('reply', { text: 'a lake of oo', outcome: 'done' }, 0);
  m.emit('reply', { text: '', outcome: 'refused' }, 300);
  const f = m.frame(350).over;
  assert.ok(['sad', 'frown'].includes(f.mouth) && f.eyebrows === 'sad', 'the second reply replaced the first: no smile left');
});

test('priorities and per-unit streams: the voice loops the talk until it stops, then the outcome that waited shows', () => {
  const m = createMotion({ seed: 2, has });
  m.emit('speaking', { on: true, text: 'a lake' }, 0);
  m.emit('reply', { text: 'a lake', outcome: 'done' }, 10);
  let talkingLate = false; for (let t = 5000; t < 9000; t += 50) if (m.frame(t).talking) talkingLate = true;
  assert.ok(talkingLate, 'the mouth goes on while the voice speaks');
  m.emit('speaking', { on: false }, 10000);
  assert.equal(m.frame(10100).talking, false);
  assert.equal(m.frame(10100).over?.mouth, 'big smile');
});

test('a long session stays bounded: the plan is rebased and the frames still follow the rules', () => {
  const m = createMotion({ seed: 3, has }); let blinks = 0, last = false;
  for (let t = 0; t < 600000; t += 100) { const c = m.frame(t).over?.eyes === 'closed'; if (c && !last) blinks++; last = c; }
  assert.ok(blinks > 80, `blinks over ten minutes: ${blinks}`);
  m.emit('reply', { text: 'hi', outcome: 'done' }, 600000);
  assert.ok(m.frame(600400).over?.mouth, 'a reply after ten minutes still moves the face');
});

test('nothing is scheduled when reduced and quiet: only an event changes the frame', () => {
  const m = createMotion({ seed: 1, has, reduced: true });
  assert.ok(m.nextChange(0) >= 16);
  m.frame(25000);
  assert.equal(m.nextChange(30000), Infinity);
});
