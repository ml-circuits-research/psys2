// A cold first turn pays for compute, not for the network (specs/06 "Load wait"): the catalog loads a turn triggers (the avatar's faces for "put on a hat") run under guard.untimed,
// so the turn's deadline moves by the time they took; and the shards of one read are fetched together. Evidence of the bug: live, "put on a hat" as the first message ended with
// "Stopped a runaway computation in stage end after 8.0 s" because 81 face shards were fetched one after another inside the turn clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { guard, TurnAborted, LOAD_WAIT_CAP_MS } from '../src/formalizer/guard.mjs';

const CATALOG = path.join(import.meta.dirname, 'fixtures/catalog');
const OPTS = { language: 'en', formalizer: 'rules', spell: true, partial: true, bestEffort: true };

/** A catalog source on a fake clock: every file read costs `cost` fake milliseconds (and no real time); `inflight` is the most reads open at once. */
function slowSource(cost) {
  const inner = createKnowledgeSource(CATALOG), clk = { t: 0 }, st = { reads: 0, open: 0, inflight: 0 };
  return { clk, st, source: { ...inner, text: async (p) => { st.reads++; st.open++; st.inflight = Math.max(st.inflight, st.open); await new Promise((r) => setTimeout(r, 1)); clk.t += cost; st.open--; return inner.text(p); } } };
}
const run = async (cost, hardMs) => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const { clk, st, source } = slowSource(cost);
  engine.setKnowledge(createFacts({ source }));
  const s = engine.createSession(OPTS);
  s.setWorldState('ui.shell', { activeTab: 'chat' });
  const r = await s.send('put on a hat', { signal: new AbortController().signal, hardMs, clock: () => clk.t });
  return { r, st };
};

test('a cold first turn whose catalog reads cost more than the limit is not stopped', async () => {
  const { r, st } = await run(150, 1000);   // many reads of 150 fake ms each: far above the 1000 ms limit, none of it compute
  assert.ok(st.reads > 7, `the turn read the catalog (${st.reads} reads)`);
  assert.doesNotMatch(r.text, /took too long|runaway/i);
  assert.ok(!r.budgetExceeded);
});

test('the shards of one read are fetched together, not one round trip after another', async () => {
  const { st } = await run(1, 100000);
  assert.ok(st.inflight > 3, `at most ${st.inflight} reads were open at once`);
});

test('guard.untimed gives the waiting time back, up to the cap, and stays silent outside a turn', async () => {
  assert.equal(await guard.untimed(async () => 5), 5);
  const clk = { t: 0 }, events = [];
  guard.setWaitListener((op, total) => events.push([op, total]));
  const g = guard.install({ hardMs: 100, clock: () => clk.t, force: true });
  try {
    await guard.untimed(async () => { clk.t += 90; });
    clk.t += 90;   // 90 of waiting plus 90 of compute: inside 100 + 90
    assert.doesNotThrow(() => guard.check('x'));
    await guard.untimed(async () => { clk.t += LOAD_WAIT_CAP_MS * 2; });   // a hung network: only the cap is given back
    assert.throws(() => guard.check('y'), (e) => e instanceof TurnAborted && e.reason === 'timeout');
  } finally { guard.release(g); guard.setWaitListener(null); }
  assert.deepEqual(events.map((e) => e[0]), ['start', 'end', 'start', 'end']);
});
