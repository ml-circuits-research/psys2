// LEGEND-MEMO and SPELL-MEMO (spec 06 "Compute budgets"): a repeated lookup in a fixed structure is answered from a memo, not by walking or scanning it again.
//   Legends: the type chain and the resolution of a key on a type are fixed until the registry is rebuilt (`index.chain` was a tenth of the real set's ticks: every ctx.val
//   of every operation resolved its key again, the drawing board read the facts of common.sense again for every candidate reading).
//   Spelling: the neighbours of a word in a vocabulary are kept per vocabulary (`spell.edit` was a sixth: every reading stage asked again for the same unknown word in every world).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { spellCorrect, spellCandidates, spellAlternates, spellVocabulary } from '../src/formalizer/spell.mjs';
import { createBudget, installBudget, releaseBudget } from '../src/dialog/budget.mjs';

const withBudget = (limits, fn) => { const b = createBudget(limits); const t = installBudget(b, { force: true }); try { fn(b); } finally { releaseBudget(t); } return b; };

test('legends: chain and key resolution cost one tick per call after the first; copies; rebuilt after add', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const L = engine.set.legends ?? engine.legends ?? engine.set.list()[0]?.legends;
  assert.ok(L?.chain, 'a legends registry');
  const type = [...L.types.keys()].find((t) => L.chain(t).length >= 3) ?? [...L.types.keys()][0];
  const first = L.chain(type);
  const b = withBudget({ sites: { 'index.chain': 1100 } }, () => { for (let i = 0; i < 1000; i++) { L.chain(type); L.tryResolveKey(type, 'core.source'); } });
  assert.ok(b.bySite['index.chain'] <= 1100, `index.chain ${b.bySite['index.chain']}`);
  const c = L.chain(type); c.push('junk');
  assert.deepEqual(L.chain(type), first, 'a copy is handed out');
  const r = L.tryResolveKey(type, 'core.source'); r.key = 'junk';
  assert.notEqual(L.tryResolveKey(type, 'core.source').key, 'junk', 'a copy is handed out');
  L.add([{ id: 'zz.thing', type: 'core.type', entries: [{ key: 'extends', value: { kind: 'ref', v: type } }] }], { worldId: 'zz' });
  assert.deepEqual(L.chain('zz.thing').slice(1), first, 'a type added later is seen (the memo is rebuilt)');
});

test('spelling: the neighbours of a word are scanned once per vocabulary; the answers are the ones of a fresh scan; a grown vocabulary is scanned again', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const vocab = spellVocabulary(engine.set);
  const text = 'drwa a hosue next to the tre';
  const fresh = () => { const v = new Set(vocab); v.freq = vocab.freq; v.nouns = vocab.nouns; v.global = vocab.global; v.world = vocab.world; return v; };
  const want = { c: spellCorrect(text, { vocab: fresh() }), k: spellCandidates(text, { vocab: fresh() }), a: spellAlternates('draw a house next to the tree', { vocab: fresh() }) };
  const one = withBudget({}, () => { spellCorrect(text, { vocab }); spellCandidates(text, { vocab }); spellAlternates('draw a house next to the tree', { vocab }); }).bySite['spell.edit'];
  // injected budget: 50 more rounds cost a tick per word looked up, not another scan of the vocabulary (a scan is thousands of edit distances)
  const b = withBudget({ sites: { 'spell.edit': 400 } }, () => {
    for (let i = 0; i < 50; i++) {
      assert.deepEqual(spellCorrect(text, { vocab }), want.c);
      assert.deepEqual(spellCandidates(text, { vocab }), want.k);
      assert.deepEqual(spellAlternates('draw a house next to the tree', { vocab }), want.a);
    }
  });
  assert.ok(one > 1000, `the first round scans (${one})`);
  assert.ok(b.bySite['spell.edit'] <= 400, `spell.edit ${b.bySite['spell.edit']}`);
  const v2 = fresh(); v2.add('drwab');
  const grown = withBudget({}, () => spellCorrect('drwab', { vocab: v2 }));
  v2.add('hosuey');
  const again = withBudget({}, () => assert.equal(spellCorrect('hosue', { vocab: v2 }).text, spellCorrect('hosue', { vocab: fresh() }).text)).bySite['spell.edit'];
  assert.ok(again > 100, `a grown vocabulary is scanned again (${again}, ${grown.bySite['spell.edit'] ?? 0})`);
});
