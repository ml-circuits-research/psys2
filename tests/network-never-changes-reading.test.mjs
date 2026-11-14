// Rule A (worker-tasks 2026-11-13, spec 17 section 6): a blocked or slow network never changes a reading. The name repair and the knowledge lookup turns run with no
// catalog, with every fetch rejected, and with every fetch hanging forever; the readings and the replies are identical, and the turn settles (no wall-clock assertion:
// the hanging fetch never settles, so a turn that waited for it would not return at all). Rule B: the suite preload (scripts/lib/no-network.mjs) makes any real fetch throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';

const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

const calls = [];
const MODES = {
  none: null,
  rejected: (url) => { calls.push(String(url)); return Promise.reject(new TypeError('fetch failed')); },
  hanging: (url) => { calls.push(String(url)); return new Promise(() => {}); },
};

async function run(mode) {
  const engine = await createEngine({ loader, options: { reasoner: 'matrix' } });
  if (MODES[mode]) {
    globalThis.fetch = MODES[mode];
    engine.knowledgeDeadlineMs = 5;
    engine.setKnowledge(createFacts({ source: createKnowledgeSource('https://catalog.invalid/worlds') }));
  } else globalThis.fetch = realFetch;
  const out = [];
  for (const [tab, said] of [['map', 'show Pariss'], ['map', 'show New Youk'], ['draw', 'draw a comet'], [null, 'what is a comet'], [null, 'how many legs does a spider have'], ['draw', 'show Pariss on the map']]) {
    const s = engine.createSession({ language: 'en', spell: true, bestEffort: true });
    s.setWorldState('ui.shell', { activeTab: tab ?? 'chat' });   // no tab: chat only (the shell's first tab, Talk, has its own wording for an unreachable catalog)
    const r = await s.send(said);
    out.push({ said, text: r.text, segments: r.segments.map((x) => ({ world: x.match?.worldId ?? null, unparsed: !!x.unparsed, corrections: x.corrections ?? [], wires: x.wires ?? null })) });
  }
  return { out, engine };
}

const baseline = await run('none');

for (const mode of ['rejected', 'hanging']) {
  test(`a catalog whose every fetch is ${mode}: readings and replies are those of no catalog`, async () => {
    calls.length = 0;
    const { out, engine } = await run(mode);
    const OFFLINE = /I can't reach the picture catalog right now, so I can only draw the basic things\./;   // the one intended addition of an unreachable catalog (spec 17): said after the reading, which is unchanged
    for (let i = 0; i < out.length; i++) {
      assert.deepEqual(out[i].segments, baseline.out[i].segments, `"${out[i].said}" read differently with fetch ${mode}`);
      if (!OFFLINE.test(out[i].text)) assert.equal(out[i].text, baseline.out[i].text, `"${out[i].said}" answered differently with fetch ${mode}`);
    }
    assert.ok(out[0].segments.every((x) => !x.unparsed) && /Paris/.test(out[0].text), out[0].text);   // the map reads Paris from the bundled k.geo subset, generated from the catalog
    assert.ok(calls.length > 0, 'the catalog was asked (the test exercises the lookup path)');
    const st = engine.knowledgeStats ?? {};
    assert.ok((st.timeouts ?? 0) + (st.failures ?? 0) > 0, 'the failed lookups are counted');
  });
}

test('the test setup forbids the real network (rule B)', { skip: !realFetch.__noNetwork && 'run through scripts/run-tests.mjs or node --import scripts/lib/no-network.mjs' }, async () => {
  await assert.rejects(() => realFetch('https://example.com/?psys2-self-test'), /must not touch the network/);
  assert.equal(typeof realFetch, 'function');
});
