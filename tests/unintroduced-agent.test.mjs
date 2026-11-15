// SPDX-License-Identifier: AGPL-3.0-only
// Q23 (reviewer 2026-11-15 04:00, dlg.kidsB#037): a question about someone nobody introduced, then the introduction. The reply is "I do not know <name> yet", never an id
// ("e.ben") or the library's check ("Must refer to a core.agent wire"), and the introduction that follows works in both reasoners.
//   - src/formalizer/rules/session.mjs forgetUnheld: an agent is known to the reader only while the session holds its core.agent wire (a lost trial reading registered Ben)
//   - src/reasoner/index.mjs refuseFacts: a statement about an agent without a wire says "I do not know <name> yet." (general, every world of the matrix reasoner)
//   - src/interpreter/render.mjs entityName: an agent id without its wire is rendered as the name, never the id
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { entityName } from '../src/interpreter/render.mjs';

const engines = { matrix: await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } }), ops: await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'ops' } }) };
const NEVER = /\be\.[a-z]|core\.agent|Must refer/i;

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a question about someone nobody introduced, then the introduction (dlg.kidsB#037)`, async () => {
    const s = engine.createSession({ language: 'en' });
    const said = [];
    for (const t of ['how many apples does Ben have?', 'Ben has 4 apples', 'Ben gives Ana 1 apple', 'how many apples does he have now?']) said.push((await s.send(t)).text);
    for (const r of said) assert.doesNotMatch(r, NEVER, r);
    assert.match(said[0], /I do not know Ben yet\./);
    assert.match(said[1], /Ben has 4 apples/);
    assert.match(said[3], /\b3\b/);
  });
}

test('matrix: a statement about an agent the session holds no wire for says "I do not know <name> yet." (the general rule)', async () => {
  const s = engines.matrix.createSession({ language: 'en' });
  // the reader believes Zed was introduced (as a lost trial reading once made it believe Ben was) and the reconciliation is switched off: the library's check fires
  s.isession.form.forgetUnheld = () => {};
  s.isession.form.commit({ id: 'e.zed', name: 'Zed', gender: 'm', isNew: true });
  const r = await s.send('Zed has 4 apples');
  assert.doesNotMatch(r.text, NEVER, r.text);
  assert.match(r.text, /I do not know Zed yet\./);
});

test('entityName: an agent id is the name as written, other ids their words', () => {
  assert.equal(entityName('e.ben'), 'Ben');
  assert.equal(entityName('e.big_tom'), 'Big tom');
  assert.equal(entityName('t1_w3'), 't1 w3');
});
