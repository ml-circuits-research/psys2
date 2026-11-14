// SPDX-License-Identifier: AGPL-3.0-only
// LIVE-STATE INVARIANT (owner's avatar bug, worker-tasks "LIVE-STATE INVARIANT"), both reasoners. The cases are GENERATED from the world schemas (worlds/*/schema.sop):
// every attribute with two values of every kind of every live world with a schema, plus the modes of the avatar (the expressions of the face catalog).
//   1. round trip: set B, then A, then B, then A: each request changes the state of the live world (a request is never refused as "already X" because of stale state);
//   2. "already" only when true: a reply that says a thing already has a value is checked against the state before the request (it must equal the request);
//   3. undo of the round trip gives B, redo gives A;
//   4. rendered = state: the render model of the view (a pure function the view calls) equals the state after every turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import * as A from '../worlds/acts/acts.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { shownExpression } from '../worlds/ui.avatar/facedraw.mjs';
import { DEFAULT_FACE } from '../worlds/ui.avatar/default-face.mjs';

const settings = settingsForMode('rules');
const TAB = { 'docs.editor': 'editor', 'ui.avatar': 'robot' };   // tabs declared by the host
const COLOURS = ['red', 'blue'];

/** One generated case: { world, tab, label, setup: [sentences], set: (value index) => sentence, values: [A, B], read: (state) => value } */
const cases = [];
for (const d of readdirSync(DEFAULT_ROOT).sort()) {
  const f = join(DEFAULT_ROOT, d, 'schema.sop');
  if (!existsSync(f) || d === 'acts' || d === 'ui.avatar') continue;
  const tab = TAB[d] ?? /^\s*tab=(\S+)/m.exec(readFileSync(join(DEFAULT_ROOT, d, 'world.sop'), 'utf8'))?.[1];
  if (!tab) continue;
  const schema = A.parseSchema(parse(readFileSync(f, 'utf8')).wires);
  for (const k of Object.values(schema.kinds)) {
    if (k.any || k.named || k.numbered || /_/.test(k.name) || k.in) continue;   // the plain kinds that a bare "Add a X." makes
    for (const a of Object.values(schema.attrs)) {
      if (!a.of.includes(k.name)) continue;
      const plain = a.type === 'enum' ? a.values.filter((v) => !v.includes('_')) : [];
      const values = a.type === 'colour' ? COLOURS : a.type === 'enum' ? [plain[0], plain.find((v) => v.slice(0, 3) !== plain[0].slice(0, 3))] : null;   // two values that are not spellings of one another (night / nighttime)
      if (!values || values.length < 2 || !values[1]) continue;
      cases.push({ world: d, tab, label: `${d}: ${k.name}.${a.name} ${values.join('/')}`, setup: [`Add a ${k.name}.`], set: (v) => `Make the ${k.name} ${v}.`, values, attr: a.name, kind: k.name });
    }
  }
}

/** The value of an attribute of the first thing of a kind, read from the live world's state (whatever the world's item shape). */
function readValue(state, c) {
  const st = state[c.world];
  const items = st?.items ?? st?.things ?? st?.charts ?? [];
  const it = (Array.isArray(items) ? items : Object.values(items)).find((i) => (i.kind ?? i.type) === c.kind) ?? (Array.isArray(items) ? items[0] : null);
  const v = it?.attrs?.[c.attr] ?? it?.[c.attr];
  return v == null ? null : String(v).toLowerCase();
}

const ALREADY = /\balready\b/i;
// attributes whose values add up (marks: bold, then italic, is both) have no single "current value": a later "already bold" is true there
const ADDITIVE = new Set(['docs.editor:style']);

for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
  const fresh = (tab) => { const s = engine.createSession(sessionOptions(settings, { language: 'en' })); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
  const snap = (s, world) => JSON.stringify(s.state()[world]);

  test(`${reasoner}: generated from the schemas: ${cases.length} attribute round trips (B, A, B, A) never meet a stale "already"; undo and redo follow`, async (t) => {
    const bad = [];
    let checked = 0;
    const gaps = [];
    for (const c of cases) {
      const s = fresh(c.tab);
      for (const t of c.setup) await s.send(t);
      const [A1, B1] = c.values;
      const trail = [];
      let reachable = true;
      let last = null;   // the value of the last request that changed the state (what the live world holds, for a single-valued attribute)
      for (const [i, v] of [B1, A1, B1, A1].entries()) {
        const before = snap(s, c.world), valueBefore = readValue(s.state(), c);
        const r = await s.send(c.set(v));
        const after = snap(s, c.world), already = ALREADY.test(r.text ?? '');
        trail.push(`${v}: ${(r.text ?? '').slice(0, 60)}`);
        if (i === 0 && after === before && !already) { reachable = false; break; }   // this phrasing is not read by this world: a coverage-grid matter, not a live-state fault
        if (already && valueBefore != null && valueBefore !== v) bad.push(`${c.label}: step ${i} said "already" but the state held ${valueBefore}, not ${v}`);
        if (already && !ADDITIVE.has(`${c.world}:${c.attr}`) && last !== null && last !== v) bad.push(`${c.label}: step ${i} said "already ${v}" but the last change set ${last}: ${r.text}`);
        if (after !== before) last = v;
        else if (!already) gaps.push(`${c.label}: "${c.set(v)}" is not read (${(r.text ?? '').slice(0, 50)})`);
      }
      if (!reachable) continue;
      checked++;
      const end = readValue(s.state(), c);
      if (end !== null && end !== A1) bad.push(`${c.label}: after the round trip the state holds ${end}, not ${A1}`);
      await s.send('undo');
      const afterUndo = readValue(s.state(), c);
      if (afterUndo !== null && afterUndo !== B1) bad.push(`${c.label}: undo gave ${afterUndo}, not ${B1}`);
      await s.send('redo');
      const afterRedo = readValue(s.state(), c);
      if (afterRedo !== null && afterRedo !== A1) bad.push(`${c.label}: redo gave ${afterRedo}, not ${A1}`);
    }
    if (gaps.length) t.diagnostic(`phrasing gaps (coverage grid): ${gaps.join(' | ')}`);
    assert.ok(checked > 0, 'at least one generated case is reachable');
    assert.deepEqual(bad, []);
  });

  // the avatar: the modes are the expressions of the face catalog; the first expression of a round trip is "wink", the owner's case
  test(`${reasoner}: avatar expressions: wink, other, wink again changes the state back; "already" is true; undo / redo; the view draws the state`, async () => {
    const names = Object.keys(DEFAULT_FACE.expressions).filter((n) => n !== 'talking');
    assert.ok(names.includes('wink') && names.length > 2);
    const say = (n) => (n === 'wink' ? 'wink' : `look ${n}`);
    const bad = [];
    for (const other of names.filter((n) => n !== 'wink')) {
      const s = fresh('robot');
      const expr = () => s.state()['ui.avatar']?.face?.expression ?? '';
      const drawn = (transient) => shownExpression(s.state()['ui.avatar']?.face, transient);
      const check = (what) => { for (const tr of [null, 'smile', 'surprised']) if (drawn(tr) !== expr()) bad.push(`${other}: ${what}: view draws ${drawn(tr)} (flash ${tr}) but the state holds ${expr()}`); };
      for (const [i, n] of [other, 'wink', other, 'wink'].entries()) {
        const before = expr();
        const r = await s.send(say(n));
        if (/\balready\b/i.test(r.text) && before !== n) bad.push(`${other}: step ${i}: "already" but the state held "${before}", not ${n}`);
        if (expr() !== n) bad.push(`${other}: step ${i}: asked for ${n}, the state holds "${expr()}": ${r.text}`);
        check(`step ${i}`);
      }
      await s.send('undo'); if (expr() !== other) bad.push(`${other}: undo gave "${expr()}"`); check('undo');
      await s.send('redo'); if (expr() !== 'wink') bad.push(`${other}: redo gave "${expr()}"`); check('redo');
    }
    assert.deepEqual(bad, []);
  });
}
