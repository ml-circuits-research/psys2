import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator, normalizePrediction, toProb, DEFAULT_POLICY } from '../src/dialog/dispatch-validate.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const validator = createDispatchValidator({ engine });
const W = (...pairs) => pairs.map(([world, score]) => ({ world, score }));
const piece = (text, worlds, extra = {}, start = 0) => ({ start, end: start + text.length, text, worlds, ...extra });
const msg = (text, segmentations, context = {}) => ({ id: 't', text, context: { tab: null, recent_worlds: [], session: [], ...context }, segmentations });
const winnerWorlds = (r) => r.produced.map((p) => p.world);

test('valid top-1 is accepted as is', async () => {
  const t = 'What is 20 divided by 4';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9], ['kids.shapes', 0.05]))] }]));
  assert.equal(r.status, 'understood');
  assert.deepEqual(winnerWorlds(r), ['kids.arith']);
  assert.match(r.produced[0].sop, /core.question/);
  assert.equal(r.trace.segmentations[0].pieces[0].chosen.rank, 1);
});

test('wrong top-1 is rejected and candidate 2 recovers', async () => {
  const t = 'What is 20 divided by 4';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['games.chess', 0.6], ['kids.arith', 0.3], ['kids.shapes', 0.1]))] }]));
  assert.equal(r.status, 'understood');
  assert.deepEqual(winnerWorlds(r), ['kids.arith']);
  const att = r.trace.segmentations[0].pieces[0].attempts;
  assert.equal(att.find((a) => a.world === 'games.chess').valid, false);
  assert.equal(att.find((a) => a.world === 'kids.arith').rank, 2);
  assert.match(r.why, /candidate world 2 \(kids.arith\) recovered/);
});

test('a segmentation alternative wins when the top one cannot be read', async () => {
  const t = 'What is 20 divided by 4. How many legs does a spider have?';
  const a = 'What is 20 divided by 4.', b = 'How many legs does a spider have?';
  const r = await validator.validate(msg(t, [
    { score: -0.1, segments: [piece(t, W(['kids.arith', 0.9]))] },
    { score: -0.8, segments: [piece(a, W(['kids.arith', 0.9])), piece(b, W(['kids.animals', 0.8]), {}, t.indexOf(b))] },
  ]));
  assert.equal(r.status, 'understood');
  assert.equal(r.winner.index, 1);
  assert.deepEqual(winnerWorlds(r), ['kids.arith', 'kids.animals']);
  assert.equal(r.trace.segmentations[0].valid, false);
  assert.match(r.why, /beats the dispatcher's top segmentation/);
});

test('nothing validates: not understood, with the candidate worlds', async () => {
  const t = 'blorp frazzle wibble';
  const r = await validator.validate(msg(t, [{ score: -0.2, segments: [piece(t, W(['kids.arith', 0.5], ['kids.shapes', 0.3], ['media.music', 0.1]))] }]));
  assert.equal(r.status, 'not_understood');
  assert.deepEqual(r.produced, []);
  assert.deepEqual(r.notUnderstood.candidateWorlds, ['kids.arith', 'kids.shapes', 'media.music']);
  assert.equal(r.notUnderstood.pieces[0].text, t);
  assert.ok(r.trace.segmentations[0].pieces[0].attempts.every((a) => !a.valid));
});

test('simplified text validates when the original does not', async () => {
  const orig = 'what is 20 divided by 4 lol haha hmm yeah well um so like';
  const simple = 'what is 20 divided by 4';
  const pred = msg(orig, [{ score: -0.1, segments: [piece(orig, W(['kids.arith', 0.9]), { simplified: simple })] }]);
  const withSimp = await validator.validate(pred);
  assert.equal(withSimp.status, 'understood');
  assert.equal(withSimp.produced[0].textUsed, 'simplified');
  assert.equal(withSimp.produced[0].usedText, simple);
  assert.match(withSimp.why, /only the simplified text validates/);
  const without = await validator.validate(pred, { trySimplified: false });
  assert.equal(without.status, 'not_understood');
});

test('a tie between worlds is broken by the routing policy tiers (active tab)', async () => {
  const t = 'Play B3';
  const run = (tab) => validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['games.tictactoe', 0.5], ['media.music', 0.5]))] }], { tab }), { tabTier: false });   // this test is about the tie-break; tier T would settle it before
  const onMusic = await run('music'), onGame = await run('tictactoe');
  assert.deepEqual(winnerWorlds(onMusic), ['media.music']);
  assert.deepEqual(winnerWorlds(onGame), ['games.tictactoe']);
  const tie = onMusic.trace.segmentations[0].pieces[0].tie;
  assert.deepEqual(tie.worlds.sort(), ['games.tictactoe', 'media.music']);
  assert.equal(tie.decision.tierName, 'active-tab');
  assert.match(onMusic.why, /broken by routing policy/);
});

test('a piece the rules parse but the interpreter refuses is accepted by default and invalid with acceptRefused:false', async () => {
  const t = 'Move the pawn on d two to a3.';   // parsed by games.chess, refused as an illegal move
  const pred = msg(t, [{ score: -0.1, segments: [piece(t, W(['games.chess', 0.9]))] }]);
  assert.equal(DEFAULT_POLICY.acceptRefused, true);
  const lenient = await validator.validate(pred);
  assert.equal(lenient.status, 'understood');
  assert.equal(lenient.produced[0].world, 'games.chess');
  const strict = await validator.validate(pred, { acceptRefused: false });
  assert.equal(strict.status, 'not_understood');
  assert.equal(strict.trace.segmentations[0].pieces[0].attempts[0].refused, true);
});

test('candidate order per world: original, then spell-corrected; simplified only when none of them validates (S1 lexicographic preference)', async () => {
  const t = 'whats seven times six sweetie';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9]), { simplified: 'what is seven times six' })] }]));
  const att = r.trace.segmentations[0].pieces[0].attempts.map((a) => a.variant);
  assert.deepEqual(att, ['original', 'spell', 'simplified']);   // nothing else validated, so the simplified text is tried last
  assert.equal(r.produced[0].textUsed, 'simplified');
});

test('S1: a valid original in the rank-2 world beats a valid simplified text in the rank-1 world', async () => {
  const t = 'What is 20 divided by 4';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['games.chess', 0.6], ['kids.arith', 0.3]), { simplified: 'Show me the board' })] }]));
  assert.equal(r.produced[0].world, 'kids.arith');
  assert.equal(r.produced[0].textUsed, 'original');
  assert.ok(!r.trace.segmentations[0].pieces[0].attempts.some((a) => a.variant === 'simplified'));
});

test('S1: a simplified text that changes a number is rejected by the value checker', async () => {
  const orig = 'what is 20 divided by 4 lol haha hmm yeah well um so like';
  const r = await validator.validate(msg(orig, [{ score: -0.1, segments: [piece(orig, W(['kids.arith', 0.9]), { simplified: 'what is 20 divided by 5' })] }]));
  assert.equal(r.status, 'not_understood');
  assert.match(r.trace.segmentations[0].pieces[0].attempts.find((a) => a.variant === 'simplified').reason, /value check: numbers differ/);
});

test('a spell-corrected text is accepted only when the rules parse it', async () => {
  const good = 'what is seven tims six';
  const r = await validator.validate(msg(good, [{ score: -0.1, segments: [piece(good, W(['kids.arith', 0.9]))] }]));
  assert.equal(r.status, 'understood');
  const c = r.produced[0];
  // the engine's own typo retry (spec 03 section 1.9) now parses "tims" in the original text, so the dispatcher spell variant is not needed
  assert.ok(['original', 'spell'].includes(c.textUsed));
  const bad = 'blorp frazzle wibble';
  const r2 = await validator.validate(msg(bad, [{ score: -0.1, segments: [piece(bad, W(['kids.arith', 0.9]))] }]));
  assert.equal(r2.status, 'not_understood');
});

test('the original text wins when it already parses (no spell candidate is needed)', async () => {
  const t = 'What is 20 divided by 4';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9]))] }]));
  assert.equal(r.produced[0].textUsed, 'original');
  assert.deepEqual(r.produced[0].corrections, []);
});

test('partial understanding: off by default, on accepts the readable run and reports what was ignored', async () => {
  const t = 'hey could you tell me what is seven times six sweetie';
  const pred = msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9]))] }]);
  const off = await validator.validate(pred);
  assert.equal(off.status, 'not_understood');
  const on = await validator.validate(pred, { acceptPartial: true });
  assert.equal(on.status, 'understood');
  assert.equal(on.partial, true);
  const p = on.produced[0];
  assert.equal(p.textUsed, 'partial');
  assert.match(p.usedText, /seven times six/);
  assert.ok(p.partial.ignored.length >= 1);
  assert.match(on.why, /partial understanding/);
});

test('partial understanding never ignores a negation and never beats a full parse', async () => {
  const t = 'hey do not tell me what is seven times six';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9]))] }]), { acceptPartial: true });
  const used = r.produced[0]?.usedText ?? '';
  assert.ok(!r.produced.length || /not/.test(used), used);
  const full = 'What is 20 divided by 4';
  const r2 = await validator.validate(msg(full, [{ score: -0.1, segments: [piece(full, W(['games.chess', 0.6], ['kids.arith', 0.1]))] }]), { acceptPartial: true });
  assert.equal(r2.produced[0].world, 'kids.arith');
  assert.equal(r2.produced[0].partial, null);
});

test('multi-command: the pieces that validate are produced, the others are reported', async () => {
  const a = 'What is 20 divided by 4.', b = 'blorp frazzle wibble';
  const t = `${a} ${b}`;
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(a, W(['kids.arith', 0.9])), piece(b, W(['kids.arith', 0.5]), {}, a.length + 1)] }]), { acceptPartial: true });
  assert.equal(r.status, 'not_understood');
  assert.deepEqual(winnerWorlds(r), ['kids.arith']);
  assert.equal(r.notUnderstood.pieces[0].text, b);
});

test('scores follow the documented formula and the trace lists every candidate', async () => {
  const t = 'What is 20 divided by 4';
  const r = await validator.validate(msg(t, [{ score: -0.5, segments: [piece(t, W(['games.chess', 0.4], ['kids.arith', 0.2]))] }]));
  const p = DEFAULT_POLICY;
  const expected = p.segWeight * -0.5 + p.worldWeight * Math.log(0.2);
  assert.ok(Math.abs(r.winner.score - expected) < 1e-9);
  const att = r.trace.segmentations[0].pieces[0].attempts;
  assert.equal(att.length, 2);
  assert.ok(Math.abs(att[0].score - (Math.log(0.4) - p.unparsedPenalty)) < 1e-9);
});

test('prediction parsing is tolerant', () => {
  assert.equal(toProb(-0.6931471805599453).toFixed(3), '0.500');
  const n = normalizePrediction({ id: 'x', text: 'hello there', segmentations: [[{ start: 0, end: 5, worlds: [['kids.common', 0.9], 'ui.shell'] }]] });
  assert.equal(n.segmentations[0].segments[0].text, 'hello');
  assert.deepEqual(n.segmentations[0].segments[0].worlds.map((w) => w.world), ['kids.common', 'ui.shell']);
  const bare = normalizePrediction({ id: 'y', text: 'hi', worlds: [{ world: 'kids.common', score: 1 }] });
  assert.equal(bare.segmentations[0].segments[0].text, 'hi');
});

test('the validation layer is browser-safe (no node: imports)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/dialog/dispatch-validate.mjs', import.meta.url), 'utf8');
  assert.equal(/from\s+['"]node:/.test(src), false);
});

// ADR-004 tier T: the active tab's world wins whenever its rules read the whole message completely, whatever the dispatcher proposes
const exampleOf = (w) => w.patterns.flatMap((p) => (p.wire?.entries ?? []).filter((e) => e.key === 'example').map((e) => e.value.v)).filter((t) => typeof t === 'string');
for (const w of engine.set.list().filter((x) => x.tab)) {
  test(`tab tier: ${w.id} wins its own readings against a hostile dispatcher (tab ${w.tab.id})`, async () => {
    const wrong = w.id === 'kids.arith' ? 'kids.shapes' : 'kids.arith';
    let fired = 0;
    for (const t of exampleOf(w).slice(0, 40)) {
      const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W([wrong, 0.9], ['games.chess', 0.05]))] }], { tab: w.tab.id }));
      if (r.trace.segmentations[0]?.tabTier) { fired++; assert.equal(r.status, 'understood'); assert.deepEqual(winnerWorlds(r), [w.id], t); }
    }
    assert.ok(fired >= 1, `no example of ${w.id} used the tab tier`);
  });
}
test('tab tier: the avatar tab (a built-in tab world) keeps its own reading against a hostile dispatcher', async () => {
  const t = 'make the avatar blue';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['kids.arith', 0.9], ['kids.shapes', 0.05]))] }], { tab: 'avatar' }));
  assert.equal(r.status, 'understood');
  assert.deepEqual(winnerWorlds(r), ['ui.avatar']);
  assert.equal(r.trace.segmentations[0].tabTier, true);
});
test('tab tier: a message naming another world is not claimed by the tab', async () => {
  const t = 'make the avatar blue';
  const r = await validator.validate(msg(t, [{ score: -0.1, segments: [piece(t, W(['ui.avatar', 0.9]))] }], { tab: 'diagram' }));
  assert.equal(r.trace.segmentations[0].tabTier, undefined);
  assert.deepEqual(winnerWorlds(r), ['ui.avatar']);
});

test('a running game takes bare coordinates even when another world spoke last', async () => {
  const s = engine.createSession({ language: 'en' });
  for (const m of ['lets play tic tac toe', 'make the avatar a girl', 'make the avatar blue']) await s.send(m);
  assert.equal(s.context().gameWorld, 'games.tictactoe');
  const r = await s.send('B1');
  assert.doesNotMatch(String(r.reply ?? r.answer ?? r.text ?? JSON.stringify(Object.keys(r))), /looks like a game move/);
  assert.match(String(r.reply ?? r.answer ?? r.text ?? JSON.stringify(Object.keys(r))), /took/i);
  // no game was played: the offer stays
  const f = engine.createSession({ language: 'en' });
  assert.match(String(((x) => x.reply ?? x.answer ?? x.text)(await f.send('B1'))), /looks like a game move/);
});
