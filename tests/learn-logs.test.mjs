// D5 learning loop: self-label decision, queue rows, correction signals, sessions and fake logs on small fixtures (no models).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  summarizeReply, decideSelfLabel, correctionSignals, sessionsOf, recordsFromGold, recordsFromEval, labelledRows, queueRow, candidateWorlds,
  buildPatternIndex, nearestExample, isCorrectionText, loadLogRecords,
} from '../scripts/lib/learn-logs.mjs';

/** A reply shaped like session.send() with trace.dispatch (one or two pieces). Overrides patch piece 0 / the whole reply. */
function reply({ pieces = [{ text: 'what is 3 plus 4', world: 'kids.arith' }], tier = 0, others = [], piece = {}, statuses = null, answers = [{ value: 7 }], status = 'understood', partial = false, formalizer = 'encoder' } = {}) {
  const ps = pieces.map((p, k) => ({
    start: k * 20, end: k * 20 + p.text.length, text: p.text, valid: true, tie: null,
    chosen: { world: p.world, rank: 1, variant: 'original', score: -0.001, corrections: [], partial: null },
    attempts: [{ world: p.world, rank: 1, worldScore: 0.99, variant: 'original', valid: true, score: -0.001 }, { world: 'kids.shapes', rank: 2, worldScore: 0.005, variant: 'original', valid: false, score: -13 }, ...(k === 0 ? (piece.rivals ?? []) : [])],
  }));
  const win = { index: 0, score: -0.002, tier, valid: true, pieces: ps };
  return {
    answers, statuses: statuses ?? pieces.map(() => 'supported'), effects: [],
    segments: pieces.map((p, k) => ({ text: p.text, unparsed: false, strategy: formalizer, match: { worldId: p.world, patternId: `${p.world}.p${k}` }, dispatch: { world: p.world, rank: piece.rank ?? 1, variant: piece.variant ?? 'original', corrections: piece.corrections ?? [], partial: piece.partial ?? null, worldScore: piece.worldScore ?? 0.99 }, ...(k === 0 && piece.bestEffort ? { bestEffort: { took: 'x' } } : {}) })),
    trace: { english: pieces.map((p) => p.text).join(' and '), discourse: {}, dispatch: { status, partial, winnerIndex: 0, segmentations: [win, ...others] } },
  };
}

test('self-label: a clear class-0 reading with an effect is labelled', () => {
  const d = decideSelfLabel(summarizeReply(reply()));
  assert.deepEqual(d, { ok: true, reasons: [] });
});

test('self-label: never best-effort, normalizer, simplified, spelling, partial or generated readings', () => {
  const bad = (r, reason) => { const d = decideSelfLabel(summarizeReply(r)); assert.equal(d.ok, false); assert.ok(d.reasons.includes(reason), `${reason} in ${d.reasons}`); };
  bad(reply({ piece: { bestEffort: true } }), 'best_effort');
  bad(reply({ piece: { variant: 'normalized' } }), 'normalizer_reading');
  bad(reply({ piece: { variant: 'simplified' } }), 'simplified_reading');
  bad(reply({ piece: { variant: 'original', corrections: [{ from: 'plus', to: 'plus' }] } }), 'spelling_correction');
  bad(reply({ tier: 2, partial: true, piece: { partial: { coverage: 0.5 } } }), 'partial_reading');
  bad(reply({ tier: 1 }), 'generated_or_invalid_reading');
  bad(reply({ status: 'not_understood', tier: 3 }), 'not_understood');
  bad(reply({ formalizer: 'rules' }), 'not_dispatcher_reading');
  // spelling is allowed only when asked for
  assert.equal(decideSelfLabel(summarizeReply(reply({ piece: { variant: 'spell', corrections: [{ from: 'a', to: 'b' }] } })), {}, { allowSpell: true }).ok, true);
});

test('self-label: margins (world score, rank, rival world, segmentation gap)', () => {
  assert.ok(decideSelfLabel(summarizeReply(reply({ piece: { worldScore: 0.6 } }))).reasons.includes('low_world_score'));
  assert.ok(decideSelfLabel(summarizeReply(reply({ piece: { rank: 2 } }))).reasons.includes('not_top_world'));
  // another world reads the piece almost as well
  const rival = reply({ piece: { rivals: [{ world: 'kids.shop', rank: 3, worldScore: 0.2, variant: 'original', valid: true, score: -0.5 }] } });
  assert.ok(decideSelfLabel(summarizeReply(rival)).reasons.includes('small_world_margin'));
  // ... but a rival far below is fine
  const far = reply({ piece: { rivals: [{ world: 'kids.shop', rank: 3, worldScore: 0.001, variant: 'original', valid: true, score: -9 }] } });
  assert.equal(decideSelfLabel(summarizeReply(far)).ok, true);
  // another segmentation with other cuts is valid and close
  const alt = { index: 1, score: -0.4, tier: 0, valid: true, pieces: [{ start: 0, end: 5 }, { start: 5, end: 16 }] };
  assert.ok(decideSelfLabel(summarizeReply(reply({ others: [alt] }))).reasons.includes('small_segmentation_gap'));
  // an invalid or same-cut alternative is no ambiguity
  const same = { index: 1, score: -0.3, tier: 0, valid: true, pieces: [{ start: 0, end: 16 }] };
  assert.equal(decideSelfLabel(summarizeReply(reply({ others: [same, { ...alt, valid: false }] }))).ok, true);
});

test('self-label: needs supported statuses, an observable effect, a dispatcher trace and no user correction', () => {
  assert.ok(decideSelfLabel(summarizeReply(reply({ statuses: ['unsupported'] }))).reasons.includes('status_not_supported'));
  assert.ok(decideSelfLabel(summarizeReply(reply({ statuses: ['missing'] }))).reasons.includes('status_not_supported'));
  assert.ok(decideSelfLabel(summarizeReply(reply({ answers: [] }))).reasons.includes('no_observable_effect'));
  assert.equal(decideSelfLabel(summarizeReply(reply({ answers: [] }), { stateChanged: true })).ok, true);
  assert.ok(decideSelfLabel(summarizeReply({ answers: [], statuses: ['supported'], segments: [], effects: [], trace: {} })).reasons.includes('no_dispatcher_trace'));
  assert.ok(decideSelfLabel(summarizeReply(reply()), { corrected: true }).reasons.includes('user_corrected'));
  assert.ok(decideSelfLabel(summarizeReply(reply()), { feedback: true }).reasons.includes('is_feedback'));
});

test('self-label: a Romanian message is stored only when its English reading is fully English', () => {
  const ro = (extra) => ({ ...reply(), lang: 'ro', ...extra });
  assert.equal(decideSelfLabel(summarizeReply(ro({ translation: { unknown: [] } }))).ok, true);
  assert.ok(decideSelfLabel(summarizeReply(ro({ translation: { unknown: [{ word: 'aceea' }] } }))).reasons.includes('untranslated_text'));
  const left = ro({}); left.segments[0].text = 'the cat s-a asezat \u0219';
  assert.ok(decideSelfLabel(summarizeReply(left)).reasons.includes('untranslated_text'));
});

test('multi-piece message: every piece must pass', () => {
  const two = reply({ pieces: [{ text: 'what is 3 plus 4', world: 'kids.arith' }, { text: 'make the eyes blue', world: 'ui.avatar' }] });
  const sum = summarizeReply(two);
  assert.equal(sum.pieces.length, 2);
  assert.equal(decideSelfLabel(sum).ok, true);
  sum.pieces[1].margin = 0.2;
  assert.ok(decideSelfLabel(sum).reasons.includes('small_world_margin'));
});

test('corrections: negative feedback or a correction phrase within two turns blocks the earlier message, the restatement is kept', () => {
  assert.ok(isCorrectionText('no, I meant the blue one') && isCorrectionText("That's wrong") && !isCorrectionText('nine plus one'));
  const mk = (text, extra = {}) => ({ text, ...extra });
  const s = [mk('what is 3 plus 4'), mk('show the map'), mk('wrong', { feedback: 'negative' }), mk('what is 3 plus 5')];
  const sig = correctionSignals(s);
  assert.equal(sig[1].correctedBy, 2);       // the answer right before the feedback
  assert.equal(sig[0].correctedBy, 2);       // within two turns
  assert.equal(sig[2].feedback, true);
  assert.equal(sig[3].corrects, 1);          // the message after the correction restates what the person meant
  assert.equal(correctionSignals([mk('a'), mk('b'), mk('c'), mk('no')])[0].correctedBy, -1);   // three turns away: not blamed
  const replayed = correctionSignals([{ text: 'setup', replayOnly: true }, mk('x'), mk('no')]);
  assert.equal(replayed[1].correctedBy, 2);
});

test('sessions: explicit ids, and a gap of more than 30 minutes splits a log file; chips are not loaded', () => {
  const r = (t, extra = {}) => ({ text: 'm' + t, time: t, _file: 'a.jsonl', ...extra });
  const ss = sessionsOf([r('2026-01-01T10:00:00Z'), r('2026-01-01T10:05:00Z'), r('2026-01-01T11:30:00Z'), { text: 'g', session: 'g1', _file: 'x' }, { text: 'h', session: 'g1', _file: 'x' }]);
  assert.deepEqual(ss.map((s) => s.length).sort(), [1, 2, 2]);
  const dir = mkdtempSync(join(tmpdir(), 'learn-'));
  writeFileSync(join(dir, 'p.jsonl'), [{ text: 'hello', time: 't1', source: 'human' }, { text: 'chip', time: 't2', source: 'chip' }, { text: 'tap', time: 't3', mode: 'chip' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
  assert.deepEqual(loadLogRecords(join(dir, 'p.jsonl')).map((x) => x.text), ['hello']);
});

test('fake logs: held-out records keep their setup as replayed turns and carry the gold; eval failures keep world and outcome', () => {
  const recs = recordsFromGold([{ example_id: 'e1', text: 'Add 5 stars.', world: 'art.draw', tab: 'draw', setup: ['add a house'], expected_circuit: '@w1 core.request', language: 'en' }, { example_id: 'e2', text: 'x', needs_review: true }]);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].replayOnly, true);
  assert.equal(recs[1].gold.world, 'art.draw');
  assert.equal(sessionsOf(recs).length, 1);
  const ev = recordsFromEval({ cases: [{ id: 'c1', outcome: 'wrong' }, { id: 'c2', outcome: 'right' }, { id: 'c3', outcome: 'not_understood' }] },
    [{ id: 'c1', world: 'kids.arith', message: 'one', lang: 'ro' }, { id: 'c2', world: 'kids.arith', message: 'two' }, { id: 'c3', world: 'kids.shop', message: 'three', families: ['multi'], init: { a: 1 } }]);
  assert.deepEqual(ev.map((x) => [x.text, x.eval.outcome, x.gold.world, x.lang]), [['one', 'wrong', 'kids.arith', 'ro'], ['three', 'not_understood', 'kids.shop', 'en']]);
  assert.equal(ev[1].gold.multi, true);
});

test('labelled rows are dataset records (one per segment) and queue rows group by world candidate and nearest example', () => {
  const rec = { _id: 'abc', _file: 'training/phrase-logs/x.jsonl', time: 't', tab: 'math', lang: 'en' };
  const sum = summarizeReply(reply({ pieces: [{ text: 'what is 3 plus 4', world: 'kids.arith' }, { text: 'make the eyes blue', world: 'ui.avatar' }] }));
  const rows = labelledRows({ rec, sum, sops: ['@w1 a', '@w1 b'], context: ['hi'], correctsId: 'zzz' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.world, r.label_status, r.lineage.kind, r.expected_circuit, r.corrects]), [['kids.arith', 'self-validated', 'self-validated', '@w1 a', 'zzz'], ['ui.avatar', 'self-validated', 'self-validated', '@w1 b', 'zzz']]);
  assert.ok(rows[0].example_id.startsWith('sv') && rows[0].group.startsWith('kids.arith/') && rows[0].context[0] === 'hi' && rows[0].needs_review === false);
  assert.equal(rows[0].source_ref.id, 'abc');

  const index = buildPatternIndex([
    { id: 'kids.arith', patterns: [{ id: 'arith.add', examples: ['What is 3 plus 4?', 'Add 5 and 6.'], canonical: ['What is 3 plus 4?'] }] },
    { id: 'kids.shop', patterns: [{ id: 'shop.cost', examples: ['How much do 3 balls cost?'], canonical: [] }] },
  ]);
  const n = nearestExample('whats 8 plus 2', index, ['kids.arith']);
  assert.equal(n.pattern, 'arith.add');
  assert.equal(n.canonical, true);
  assert.equal(nearestExample('zzz qqq', index), null);
  assert.equal(nearestExample('how much for 4 balls', index).world, 'kids.shop');
  const bad = reply({ status: 'not_understood', tier: 3 });
  const s2 = summarizeReply(bad);
  const cands = candidateWorlds(bad, s2);
  assert.equal(cands[0].world, 'kids.arith');
  const q = queueRow({ rec, text: 'whats 8 plus 2', reasons: ['not_understood'], sum: s2, candidates: cands, nearest: n });
  assert.equal(q.group, 'kids.arith::arith.add');
  assert.equal(q.world_candidate, 'kids.arith');
  assert.equal(q.lang, 'en');
});

test('CLI: --retrain --dry-run prints the R3 commands (labelled rows reach build-dataset) and runs nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-'));
  mkdirSync(join(dir, 'logs'));
  const r = spawnSync(process.execPath, ['scripts/learn-from-logs.mjs', '--logs', join(dir, 'logs'), '--out-root', dir, '--retrain', '--dry-run', '--version', 'vtest'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const frag of ['scripts/relabel-training.mjs --in-place', 'scripts/build-dataset.mjs', 'psys2_train.multicmd', 'psys2_train.check_splits',
    'psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --epochs 6 --no-select --keep-ckpts 3 --out runs/dispatcher-distilbert-vtest', 'psys2_train.export_onnx --ckpt runs/dispatcher-distilbert-vtest']) {
    assert.ok(r.stdout.includes(frag), `missing: ${frag}\n${r.stdout}`);
  }
  assert.equal([...r.stdout.matchAll(/\[dry-run\]/g)].length, 6);
});
