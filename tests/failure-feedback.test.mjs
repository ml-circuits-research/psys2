// LEARN FROM USE (specs/06 "Learn from use"): which turns are failures, "Download failures only" (failures + two turns around each, nothing else), the optional sending
// (OFF by default: with the setting off no request is made, by any path), and the receiving side (scripts/ingest-failures.mjs: freeze first, ledger and cases for what is already seen).
// The buttons on every reply, the failure filter in the history and the off-means-no-request check in a real browser are in scripts/test-webchat-ui.mjs --only failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { failureReasons, filterFailures, failuresWithContext, toFailuresJSON, buildBatch, createFailureSender, validEndpoint, BATCH_FORMAT } from '../docs/webchat/ui/failures.mjs';
import { DEFAULT_SETTINGS } from '../docs/webchat/ui/settings.mjs';

const T0 = Date.parse('2026-11-14T10:00:00Z');
let n = 0;
const rec = (text, extra = {}) => ({ id: `r${++n}`, time: new Date(T0 + n * 20000).toISOString(), text, mode: 'typed', source: 'human', lang: 'en', tab: 'draw', segments: [{ text, status: 'supported', world: 'art.draw' }], unparsed: false, replyOutcome: 'done', ...extra });
const nu = { replyOutcome: 'not-understood', unparsed: true, segments: [{ text: 'x', status: 'unparsed', world: null }] };
const down = (wanted) => ({ feedback: { vote: 'down', reasons: ['wrong-value'], wanted, correction: null } });

test('a turn is a failure when disliked, not understood then rephrased, undone at once, or corrected next', () => {
  const list = [
    rec('draw a cat'), rec('draw a dog', down('a dog with a hat')),                 // disliked
    rec('make it glow like a fox', nu), rec('make it shine'),                         // not understood, rephrased
    rec('draw a house'), rec('draw a tree', { feedback: { vote: null, undone: true } }),   // undone (record flag)
    rec('put the cat on the roof'), rec('no, on the tree', { correction: true }),     // corrected by a flagged edit
    rec('make a circle'), rec('that is wrong', { feedback: 'negative', turnKind: 'complaint' }),   // corrected by a spoken complaint
    rec('draw a boat'),
  ];
  const m = failureReasons(list, []);
  const of = (t) => m.get(list.find((r) => r.text === t).id);
  assert.deepEqual(of('draw a dog'), ['disliked']);
  assert.deepEqual(of('make it glow like a fox'), ['not-understood-rephrased']);
  assert.deepEqual(of('draw a tree'), ['undone']);
  assert.ok(of('put the cat on the roof').includes('corrected'));
  assert.ok(of('make a circle').includes('corrected'));
  for (const ok of ['draw a cat', 'draw a house', 'draw a boat', 'make it shine']) assert.equal(of(ok), undefined, `${ok} is not a failure`);
  assert.equal(filterFailures(list, []).length, m.size);
});

test('undone at once is also read from the user-action log (an Undo tap right after the turn)', () => {
  const a = rec('draw a cat'), b = rec('draw a dog');
  const ev = [{ id: 'e1', kind: 'undo', target: 'Undo', time: new Date(Date.parse(a.time) + 5000).toISOString() }];
  assert.deepEqual([...failureReasons([a, b], ev).keys()], [a.id]);
  assert.equal(failureReasons([a, b], []).size, 0);
});

test('Download failures only: only the failures and two turns before and after each, flagged, with just their events; format 3', () => {
  n = 100;
  const list = Array.from({ length: 12 }, (_, i) => rec(`message ${i}`, i === 5 ? down('something else') : {}));
  const ev = list.map((r, i) => ({ id: `ev${i}`, kind: 'message', target: r.text, time: r.time, recId: r.id }));
  const out = JSON.parse(toFailuresJSON(list, { events: ev }));
  assert.equal(out.format, 'psys2-phrase-log/3');
  assert.equal(out.failureCount, 1);
  assert.deepEqual(out.records.map((r) => r.text), ['message 3', 'message 4', 'message 5', 'message 6', 'message 7']);
  assert.equal(out.records.filter((r) => r.context).length, 4);
  assert.deepEqual(out.records.find((r) => !r.context).failure.reasons, ['disliked']);
  assert.deepEqual(out.events.map((e) => e.target), out.records.map((r) => r.text), 'only the events of the included turns');
  assert.ok(!JSON.stringify(out).includes('message 0') && !JSON.stringify(out).includes('message 11'));
  assert.equal(failuresWithContext(list.map((r) => ({ ...r, feedback: null })), []).length, 0, 'no failure, nothing to download');
});

test('the batch holds failure records only: no identity unless typed, no other history, nothing sent twice', () => {
  n = 200;
  const list = [rec('draw a cat'), rec('draw a dog', { ...down('a dog with a hat'), detail: { answer: 'Drawn a dog.', readings: [{ text: 'draw a dog', world: 'art.draw', pattern: 'p1', wires: 'x' }] } }), rec('draw a tree')];
  const b = buildBatch(list, { events: [] });
  assert.equal(b.format, BATCH_FORMAT);
  assert.equal(b.count, 1);
  assert.equal(b.failures[0].expected, 'a dog with a hat');
  assert.equal(b.failures[0].reply, 'Drawn a dog.');
  assert.ok(!('sender' in b), 'no identity unless the person adds one');
  assert.ok(!JSON.stringify(b).includes('draw a cat') && !JSON.stringify(b).includes('draw a tree'), 'no other history');
  assert.equal(buildBatch(list, { identity: 'Ada' }).sender, 'Ada');
  assert.equal(buildBatch(list, { sentIds: new Set([list[1].id]) }).count, 0);
});

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test('sending is OFF by default and nothing is requested while it is off (manual, periodic, bad address)', async () => {
  assert.equal(DEFAULT_SETTINGS.sendFailures, false);
  assert.equal(DEFAULT_SETTINGS.sendFailuresUrl, '');
  n = 300;
  const list = [rec('draw a dog', down('a cat'))];
  const calls = [];
  const fetchFn = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200 }; };
  const settings = { ...DEFAULT_SETTINGS, sendFailuresUrl: 'https://example.org/in' };
  const s = createFailureSender({ settings: () => settings, records: () => list, fetchFn, storage: store() });
  assert.equal((await s.sendNow()).reason, 'off');
  const stop = s.start(5);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.length, 0, 'periodic ticks send nothing while off');
  settings.sendFailures = true; settings.sendFailuresUrl = 'http://example.org/in';
  assert.equal((await s.sendNow()).reason, 'bad-endpoint');
  assert.equal(validEndpoint('http://localhost:8080/in'), true);
  assert.equal(validEndpoint('javascript:alert(1)'), false);
  settings.sendFailuresUrl = 'https://example.org/in';
  settings.sendFailures = false;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 0, 'turning it off again stops the periodic batches at once');
  settings.sendFailures = true;
  await new Promise((r) => setTimeout(r, 40));
  stop();
  assert.equal(calls.length, 1, 'on: one batch goes out, the same failure is not sent again');
  assert.equal(calls[0][0], 'https://example.org/in');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(JSON.parse(calls[0][1].body).format, BATCH_FORMAT);
  assert.equal((await s.sendNow()).reason, 'nothing');
});

test('no code path of the page can send failures except the sender (the only use of the endpoint is behind the setting)', () => {
  const app = readFileSync(new URL('../docs/webchat/app.mjs', import.meta.url), 'utf8'), f = readFileSync(new URL('../docs/webchat/ui/failures.mjs', import.meta.url), 'utf8');
  assert.ok(!/fetch\([^)]*sendFailuresUrl/.test(app), 'app.mjs never fetches the endpoint itself');
  assert.equal((f.match(/fetchFn\(/g) ?? []).length, 1, 'one request site');
  assert.match(f, /if \(settings\(\)\.sendFailures !== true\) return \{ sent: 0, reason: 'off' \}/);
  assert.match(f, /if \(enabled\(\)\) sendNow\(\)/);
});

// ---- the receiving side ----
const scratch = mkdtempSync(join(tmpdir(), 'ingest-'));
const held = join(scratch, 'heldout-real');
mkdirSync(held, { recursive: true });
writeFileSync(join(scratch, 'known.jsonl'), `${JSON.stringify({ text: 'Draw a purple cow.' })}\n`);
const ledger = join(scratch, 'failures.jsonl'), corpus = join(scratch, 'cases.jsonl'), runs = join(scratch, 'cases-runs.jsonl');
writeFileSync(ledger, '');
const batch = {
  format: BATCH_FORMAT, sent: '2026-11-14T10:00:00Z', app: { build: 'x' }, count: 4,
  failures: [
    { id: 'a', text: 'put a hat on the zebra please', tab: 'draw', lang: 'en', reasons: ['disliked'], reply: 'Drawn a zebra.', expected: 'a hat on the zebra' },
    { id: 'b', text: 'Draw a purple cow.', tab: 'draw', lang: 'en', reasons: ['undone'], reply: 'Done.', expected: 'a purple cow' },
    { id: 'c', text: 'make the moon sing', tab: 'draw', lang: 'en', reasons: ['not-understood-rephrased'], reply: "I don't understand.", next: 'make the moon big' },
    { id: 'd', text: 'put a hat on the zebra please', tab: 'draw', lang: 'en', reasons: ['corrected'] },
  ],
};
test('ingest: new messages are frozen first (not copied anywhere else), seen ones go to the ledger and the case corpus as user-feedback with the expectation', async () => {
  process.env.PSYS2_HELDOUT_DIR = held; process.env.PSYS2_EVAL_DIR = scratch;
  const { readBatch, ingest } = await import('../scripts/ingest-failures.mjs');
  const entries = readBatch(JSON.stringify(batch));
  assert.equal(entries.length, 4);
  const r = ingest(entries, { ledger, arrived: '2026-11-14' });
  assert.deepEqual([r.frozen, r.ledger], [2, 1]);
  const frozen = readFileSync(join(held, 'rows.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => !x._header);
  assert.deepEqual(frozen.map((x) => [x.text, x.source]), [['put a hat on the zebra please', 'user-feedback'], ['make the moon sing', 'user-feedback']]);
  const ledgerRows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(ledgerRows.length, 1);
  assert.equal(ledgerRows[0].source, 'user-feedback');
  assert.equal(ledgerRows[0].text, 'Draw a purple cow.');
  assert.equal(ledgerRows[0].expected, 'a purple cow');
  assert.ok(!readFileSync(ledger, 'utf8').includes('zebra') && !readFileSync(ledger, 'utf8').includes('moon'), 'a frozen message is not in the ledger');
  const fb = readFileSync(join(held, 'feedback.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(fb.find((x) => x.expected === 'a hat on the zebra')?.reasons[0], 'disliked');
  const again = ingest(readBatch(JSON.stringify(batch)), { ledger, arrived: '2026-11-14' });
  assert.deepEqual([again.frozen, again.ledger], [0, 0], 'the same batch again changes nothing');
  // the export of "Download failures only" is read too: context records are never ingested
  const exp = JSON.stringify({ format: 'psys2-phrase-log/3', records: [{ id: 'z', text: 'context turn', context: true }, { id: 'y', text: 'turn the sun green', lang: 'en', tab: 'draw', failure: { reasons: ['disliked'] }, feedback: { vote: 'down', wanted: 'a green sun' } }] });
  assert.deepEqual(readBatch(exp).map((e) => [e.text, e.expected]), [['turn the sun green', 'a green sun']]);
  // the case corpus takes the ledger row (update-cases, ledger source only)
  const c = spawnSync(process.execPath, ['scripts/update-cases.mjs', '--sources', 'ledger', '--ledger', ledger, '--corpus', corpus, '--runs', runs], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr + c.stdout);
  const cases = readFileSync(corpus, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(cases.length, 1);
  assert.deepEqual([cases[0].source, cases[0].expected, cases[0].outcome], ['user-feedback', 'a purple cow', 'wrong']);
  rmSync(scratch, { recursive: true, force: true });
});
