// SPDX-License-Identifier: AGPL-3.0-only
// Q2 item 2 / J2 (spec 16 section 8): `core.describe.arg slot=<type>.<key>` is the one declaration of what an argument of a host-run action fills. From it the host derives
// a parameter type named like the action, and the library (sopworld 0.14.0) judges the reading by the fallback: the value must fit the slot's kind and range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { readDescriptionWires, slotDeclarations } from '../src/worlds/describe.mjs';
import { parse } from '../src/soplang/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const session = () => engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
const request = (action, args) => ({ id: 'r1', type: 'core.request', entries: [{ key: 'core.request.action', value: { t: 'atom', v: action } }, ...Object.entries(args).map(([k, v]) => ({ key: `core.request.arg.${k}`, value: { t: 'number', v } }))] });
const judge = (s, action, args) => s.isession.rs.score([{ wires: [request(action, args)] }]).results[0];

test('slot= of core.describe.arg is read; only the declarations of a describe.sop are loaded (no wording, nothing generated, no error)', () => {
  const { wires } = parse('@describe.x core.describe\n    op=x.go\n    intent=command\n\n@describe.x.n core.describe.arg\n    of=$describe.x\n    name=n\n    slot=a.b.c\n');
  const read = readDescriptionWires(wires);
  assert.equal(read.descriptions.get('describe.x').args[0].slot, 'a.b.c');
  const chess = engine.set.get('games.chess');
  assert.equal(chess.argSlots.get('chess.level').get('n'), 'chess.game.level');
  assert.deepEqual(chess.errors, []);
  assert.ok(chess.descriptions.length === 1 && chess.descriptions.every((d) => d.words.size === 0), 'only the description that has a slot is loaded, without its wording');
  const cut = slotDeclarations('@describe.a core.describe\n    op=a\n\n@describe.a.x core.describe.arg\n    of=$describe.a\n    name=x\n    slot=t.k\n\n@describe.a.en core.describe.words\n    of=$describe.a\n    lang=en\n\n@describe.b core.describe\n    op=b\n\n@describe.b.y core.describe.arg\n    of=$describe.b\n    name=y\n    class=number\n');
  assert.match(cut, /describe\.a core\.describe/);
  assert.match(cut, /slot=t\.k/);
  assert.doesNotMatch(cut, /words|describe\.b/);
  assert.equal(slotDeclarations('@x core.describe\n    op=x\n'), '');
  // a described world with wording keeps the old rule: not read unless the generator or the reader asks
  assert.equal(engine.set.get('kids.shop').descriptions.length, 0);
});

test('a host-run action is judged by the library through the type derived from its declaration', () => {
  const s = session();
  const ok = judge(s, 'chess.level', { n: 3 });
  assert.equal(ok.judged, true);
  assert.equal(ok.judgedBy, 'fallback');
  assert.equal(ok.ok, true);
  const bad = judge(s, 'chess.level', { n: 12 });
  assert.equal(bad.judged, true);
  assert.equal(bad.ok, false, 'a value outside the range of the slot is not a reading the world can take');
  // an action with no declaration stays unjudged, as before
  assert.equal(judge(s, 'music.volume', { v: 50 }).judged, false);
});
