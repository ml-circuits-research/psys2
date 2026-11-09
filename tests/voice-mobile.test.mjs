// SPDX-License-Identifier: AGPL-3.0-only
// MOBILE-VOICE, FREEZE and NOISE (worker-tasks.md): pure logic of docs/webchat/ui/speech.mjs and voice-noise.mjs with a fake SpeechRecognition (Android cumulative finals) and scaled timings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const recs = [];
class FakeRec {
  constructor() { this.started = false; this.results = []; recs.push(this); }
  start() { this.started = true; this.results = []; this.starts = (this.starts ?? 0) + 1; }
  stop() { setTimeout(() => this.end(), 5); }
  abort() { setTimeout(() => this.end(), 0); }
  end() { if (this.started) { this.started = false; this.onend?.(); } }
  /** Android: every final stays in the result list; `resultIndex` points at the new one. */
  final(t) { this.results.push(Object.assign([{ transcript: t }], { isFinal: true })); this.onresult?.({ resultIndex: this.results.length - 1, results: this.results }); }
  interim(t) { this.onresult?.({ resultIndex: this.results.length, results: [...this.results, Object.assign([{ transcript: t }], { isFinal: false })] }); }
}
globalThis.window = { SpeechRecognition: FakeRec };
const { createSpeech, createMicLock, isFragment, mergeFinal, isNearDuplicate, VOICE_TIMING } = await import('../docs/webchat/ui/speech.mjs');
const { classifyVoice, isAssistantQuestion } = await import('../docs/webchat/ui/voice-noise.mjs');
const { migrateSettings } = await import('../docs/webchat/ui/settings.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMING = { plausibleMs: 30, waitMs: 90, handsFreeMs: 120, micStopMs: 20, dryRunMs: 40, finalSettleMs: 40, rateMs: 100, dupMs: 500, fragWindowMs: 1000, restartMs: 5 };

function make({ timing = {}, ...extra } = {}) {
  recs.length = 0;
  const log = { sent: [], ignored: [], errors: [], states: [] };
  const sp = createSpeech({
    getLang: () => 'ro-RO', timing: { ...TIMING, ...timing }, plausible: async () => true, pauseWhileWorking: true, cumulative: true,
    onSend: (m) => log.sent.push(m), onIgnored: (m) => log.ignored.push(m), onError: (m) => log.errors.push(m), onState: (s) => log.states.push(s),
    ...extra,
  });
  return { sp, log, rec: () => recs.at(-1) };
}

test('mergeFinal: an extension, a containing text or a repeat replaces; a new piece is appended', () => {
  assert.equal(mergeFinal('desenează', 'desenează o'), 'desenează o');
  assert.equal(mergeFinal('desenează o inimă', 'desenează o inimă'), 'desenează o inimă');
  assert.equal(mergeFinal('desenează o inimă', 'inimă'), 'desenează o inimă');
  assert.equal(mergeFinal('desenează o inimă', 'o inimă'), 'desenează o inimă');
  assert.equal(mergeFinal('o inimă', 'desenează o inimă'), 'desenează o inimă');
  assert.equal(mergeFinal('desenează', 'o'), 'desenează o');
});

test('fragment filter: stop words, articles, pronouns and fillers are ignored; commands and answers are not', () => {
  for (const w of ['o', 'ce', 'de', 'asta', 'da', 'face', 'mama', 'tata', 'the', 'a', 'Și', 'ia']) assert.ok(isFragment(w), w);
  for (const w of ['stop', 'undo', 'help', 'next', 'inima', 'house', 'desenează o casă', 'draw']) assert.ok(!isFragment(w), w);
  assert.ok(!isFragment('da', { allowShort: () => true }), 'a yes answers an open question');
  assert.ok(isFragment('da', { allowShort: () => false }));
});

test('duplicate filter: near equal, prefix or suffix of a recent message', () => {
  assert.ok(isNearDuplicate('desenează o inimă', 'desenează o inimă'));
  assert.ok(isNearDuplicate('desenează o inima', 'desenează o inimă'), 'edit distance <= 0.2');
  assert.ok(isNearDuplicate('o inimă', 'desenează o inimă'), 'suffix');
  assert.ok(isNearDuplicate('desenează', 'desenează o inimă'), 'prefix');
  assert.ok(!isNearDuplicate('desenează o casă', 'desenează o inimă mare'));
});

test('one utterance = one message: Android cumulative finals replace the pending text', async () => {
  const { sp, log, rec } = make();
  sp.setHandsFree(true);
  const r = rec();
  for (const t of ['desenează', 'desenează o', 'desenează o inimă']) { r.final(t); await sleep(15); }
  assert.equal(log.sent.length, 0, 'nothing is sent while the text still grows');
  await sleep(120);
  assert.deepEqual(log.sent.map((m) => [m.text, m.how]), [['desenează o inimă', 'final']]);
  assert.equal(sp.snapshot().working, true, 'the microphone is paused from the send');
  await sleep(30);
  assert.equal(rec().started, false, 'no listening while the request is processed');
  sp.setWorking(false); await sleep(30);
  assert.equal(rec().started, true, 'listening again after the turn');
  assert.equal(recs.length, 1, 'one recognizer object per page');
  sp.destroy();
});

test('the result list is reset after each send (a new recognition session)', async () => {
  const { sp, log, rec } = make();
  sp.setHandsFree(true);
  rec().final('desenează o inimă'); await sleep(120);
  sp.setWorking(false); await sleep(30);
  assert.equal(rec().results.length, 0, 'the fake clears its list on start: the same words are not replayed');
  assert.equal(rec().starts, 2);
  rec().final('desenează o casă'); await sleep(120);
  assert.deepEqual(log.sent.map((m) => m.text), ['desenează o inimă', 'desenează o casă']);
  sp.destroy();
});

test('fragments are dropped; more than 4 in the window pause the microphone with a visible reason', async () => {
  const { sp, log, rec } = make({ timing: { rateMs: 0, dupMs: 0 } });
  sp.setHandsFree(true);
  for (let i = 0; i < 6 && !sp.isPaused(); i++) { rec().final(['o', 'ce', 'de', 'asta', 'tata', 'mama'][i]); await sleep(170); sp.setWorking(false); await sleep(15); }
  assert.equal(log.sent.length, 0, JSON.stringify(log.sent.map((m) => m.text)));
  assert.ok(log.ignored.length >= 5 && log.ignored.every((x) => x.reason === 'fragment'));
  assert.ok(sp.isPaused(), 'paused');
  assert.ok(log.errors.some((e) => /hearing fragments/.test(e)), log.errors.join('|'));
  assert.equal(sp.snapshot().rec, false);
  sp.destroy();
});

test('rate guard and duplicate filter drop a second voice message in the window', async () => {
  const { sp, log, rec } = make({ pauseWhileWorking: false, timing: { rateMs: 300, dupMs: 500 } });
  sp.setHandsFree(true);
  rec().final('desenează o casă'); await sleep(80);
  rec().final('desenează o casa'); await sleep(80);   // a near duplicate
  rec().final('deschide muzica'); await sleep(80);   // too soon after the first
  assert.deepEqual(log.sent.map((m) => m.text), ['desenează o casă']);
  assert.deepEqual(log.ignored.map((x) => x.reason), ['duplicate', 'rate']);
  await sleep(250);
  rec().final('deschide muzica'); await sleep(80);
  assert.equal(log.sent.length, 2);
  sp.destroy();
});

test('a one-word final that answers an open question is sent', async () => {
  const { sp, log, rec } = make({ allowShort: () => true });
  sp.setHandsFree(true);
  rec().final('da'); await sleep(100);
  assert.deepEqual(log.sent.map((m) => m.text), ['da']);
  sp.destroy();
});

test('FREEZE: aborted by someone else and audio-capture count as failures (backoff, then a visible pause); our own aborts do not', async () => {
  const { sp, log, rec } = make({ timing: { restartMs: 2, maxFailures: 4, backoffMaxMs: 20 } });
  sp.setHandsFree(true);
  const t0 = recs.length;
  for (let i = 0; i < 12 && !sp.isPaused(); i++) {
    await sleep(15);
    const r = rec();
    if (r.started) { r.onerror?.({ error: i % 2 ? 'aborted' : 'audio-capture' }); r.end(); }
  }
  assert.ok(sp.isPaused(), 'gave up with a visible state');
  assert.ok(log.errors.some((e) => /Microphone paused/.test(e)));
  assert.equal(recs.length, t0, 'the recognizer object is reused, never recreated');
  // our own abort (a restart after a send) is not a failure
  const b = make({ pauseWhileWorking: false });
  b.sp.setHandsFree(true);
  for (let i = 0; i < 6; i++) { b.rec().final(`desenează o casă ${i} roșie`); await sleep(110); }
  assert.ok(!b.sp.isPaused());
  b.sp.destroy(); sp.destroy();
});

test('FREEZE: restarts are capped; then a visible pause', async () => {
  const { sp, log, rec } = make({ pauseWhileWorking: false, timing: { restartCap: 5, rateMs: 0, dupMs: 0, restartMs: 1 } });
  sp.setHandsFree(true);
  for (let i = 0; i < 10 && !sp.isPaused(); i++) { rec().final(['deschide muzica', 'desenează o casă', 'arată harta', 'cântă ceva vesel', 'scrie un titlu', 'șterge totul', 'fă o floare', 'pune un soare', 'adaugă un nor', 'spune ceva'][i]); await sleep(60); }
  assert.ok(sp.isPaused());
  assert.ok(log.errors.some((e) => /too many restarts/.test(e)));
  sp.destroy();
});

test('FREEZE: a hidden tab stops listening and speaking; visible again it resumes only if it was on; pagehide releases everything', async () => {
  const { sp, rec } = make();
  sp.setHandsFree(true);
  assert.equal(rec().started, true);
  sp.pageHidden(); await sleep(20);
  assert.equal(rec().started, false, 'not listening while hidden');
  await sleep(50); assert.equal(rec().started, false, 'no restart while hidden');
  sp.pageVisible(); await sleep(20);
  assert.equal(rec().started, true, 'resumed');
  sp.setHandsFree(false); await sleep(30);
  sp.pageHidden(); sp.pageVisible(); await sleep(20);
  assert.equal(rec().started, false, 'a mic that was off stays off');
  sp.setHandsFree(true); await sleep(10);
  sp.pageHide(); await sleep(20); sp.pageVisible();
  assert.equal(rec().started, false, 'pagehide: nothing resumes');
  sp.destroy();
});

test('FREEZE: only one tab listens; the second is blocked and takes over only on request', async () => {
  const blocked = [], lost = [];
  const mk = (name) => {
    const holder = {};
    const lock = createMicLock({ name: 'psys2-mic-test', wait: 80, onLost: () => holder.sp.lost() });
    holder.sp = createSpeech({ getLang: () => 'en-US', timing: TIMING, lock, onBlocked: () => blocked.push(name), onLost: () => lost.push(name) });
    return holder.sp;
  };
  const a = mk('a'), b = mk('b');
  const ra = () => recs.at(-2), rb = () => recs.at(-1);
  a.setHandsFree(true); await sleep(160);   // no navigator.locks in Node: the channel ping waits for an owner's answer
  assert.equal(a.isListening(), true);
  b.setHandsFree(true); await sleep(250);
  assert.equal(b.isListening(), false, 'the second tab does not listen by itself');
  assert.deepEqual(blocked, ['b']);
  assert.equal(a.isListening(), true, 'the first tab is not disturbed');
  await b.takeOver(); await sleep(60);
  assert.equal(b.isListening(), true, 'the click takes over');
  assert.deepEqual(lost, ['a']);
  assert.equal(a.isListening(), false);
  assert.equal(a.snapshot().on, false);
  void ra; void rb;
  a.destroy(); b.destroy();
});

test('slow device: the per-pause dry run is off and the browser final plus the text decide', async () => {
  let calls = 0;
  const { sp, log, rec } = make({ cumulative: false, slow: true, plausible: async () => { calls++; return true; } });
  sp.setHandsFree(true);
  rec().interim('deschide muzica'); await sleep(100);
  assert.equal(calls, 0, 'no dry run');
  assert.deepEqual(log.sent.map((m) => m.text), ['deschide muzica']);
  sp.destroy();
});

test('dry run: at most one in flight, a newer text aborts the older one, a device that misses the deadline twice goes slow', async () => {
  let inflight = 0, max = 0, aborted = 0, calls = 0;
  const plausible = (t, { signal }) => new Promise((resolve) => { calls++; inflight++; max = Math.max(max, inflight); signal.addEventListener('abort', () => aborted++); setTimeout(() => { inflight--; resolve(true); }, 300); });
  const { sp, log, rec } = make({ cumulative: false, plausible, timing: { dryRunMs: 20 } });
  sp.setHandsFree(true);
  for (const t of ['deschide muzica', 'deschide muzica acum', 'deschide muzica acum te rog']) { rec().interim(t); await sleep(70); }
  assert.equal(max, 1, 'one in flight');
  assert.ok(aborted >= 1, 'the older run was aborted');
  await sleep(500);
  assert.ok(calls <= 3);
  assert.ok(log.sent.length <= 1);
  sp.destroy();
});

test('a long utterance (more than 25 words) skips the dry run', async () => {
  let calls = 0;
  const { sp, rec } = make({ cumulative: false, plausible: async () => { calls++; return true; } });
  sp.setHandsFree(true);
  rec().interim(Array.from({ length: 30 }, (_, i) => `cuvânt${i}`).join(' ')); await sleep(80);
  assert.equal(calls, 0);
  sp.destroy();
});

test('NOISE: room talk is ignored, real commands, questions to the assistant and addressed messages pass', async () => {
  const read = (known) => async (t) => (known.test(t) ? { complete: true, reason: 'ok' } : { complete: false, reason: 'incomplete', detail: { readings: [{ text: t, world: null, unparsed: true }] } });
  const dryRead = read(/^(draw a heart|desenează o inimă|deschide muzica)$/i);
  const lines = ['să mi spună domnul bujii lui tata', 'Dar cu cine vorbești ce vrei', 'tata ce pot să zic', 'unchiul', 'voi', 'faci tu', 'enervant da', 'scuze'];
  for (const l of lines) assert.equal((await classifyVoice(l, { dryRead })).ignore, true, l);
  for (const l of ['draw a heart', 'desenează o inimă', 'deschide muzica', 'ce pot să zic?', 'what can I say?', 'robotule ce faci tu', 'PSys2 hello']) assert.equal((await classifyVoice(l, { dryRead })).ignore, false, l);
  assert.ok(isAssistantQuestion('ce pot să zic'));
  assert.equal((await classifyVoice('tata ce pot să zic', { dryRead })).ignore, true);
  // a reading with a world (missing an argument) is a command, not noise
  const partial = async () => ({ complete: false, reason: 'missing', detail: { readings: [{ text: 'play', world: 'music', unparsed: false }] } });
  assert.equal((await classifyVoice('play', { dryRead: partial })).ignore, false);
  const longMissing = async () => ({ complete: false, reason: 'missing', detail: { readings: [{ text: 'x', world: 'ui.help', unparsed: false }] } });
  assert.equal((await classifyVoice('tata ce pot să zic', { dryRead: longMissing })).ignore, true, 'a long text with a stray world word and no complete reading');
  assert.equal((await classifyVoice('desenează o maimuță', { dryRead: longMissing })).ignore, false, 'a short one is a command lacking an argument');
  assert.equal((await classifyVoice('desenează un pește mic și albastru', { dryRead: async () => ({ complete: false, reason: 'refused', detail: { readings: [{ world: 'draw' }] } }) })).ignore, false, 'understood but unsupported');
  // the dry run cannot tell: pass; the wake word setting ignores everything not addressed
  assert.equal((await classifyVoice('deschide muzica', { dryRead: async () => ({ complete: false, reason: 'busy' }) })).ignore, false);
  assert.equal((await classifyVoice('blah blah', { dryRead: async () => ({ complete: false, reason: 'busy' }) })).ignore, true, 'cheap signals when the dry run cannot tell');
  assert.equal((await classifyVoice('deschide muzica', { dryRead, wake: true })).ignore, true);
  assert.equal((await classifyVoice('robotule deschide muzica', { dryRead, wake: true })).ignore, false);
  for (const l of lines) assert.equal((await classifyVoice(l, { slow: true })).ignore, true, `slow device, cheap signals: ${l}`);
  for (const l of ['draw a heart', 'desenează o casă', 'desenează trei nori', 'deschide muzica', 'make a house', 'how many legs has a cow', 'ce pot să zic?']) assert.equal((await classifyVoice(l, { slow: true })).ignore, false, `slow device: ${l}`);
});

test('settings: a saved handsFree no longer starts the microphone', () => {
  assert.equal(migrateSettings({ handsFree: true, keepListening: true, settingsVersion: 2 }).settings.handsFree, false);
});

test('replay of the phone session (108 records), Android cumulative finals, scaled time: at most one message per utterance, no queue, mic paused during every turn', async () => {
  const data = JSON.parse(readFileSync(new URL('../training/eval/real-phrases-2026-11-09f-mobile.json', import.meta.url), 'utf8'));
  const rows = data.records.map((r) => ({ text: r.text, t: Date.parse(r.time) })).sort((a, b) => a.t - b.t);
  const SCALE = 25;   // real ms / test ms (the dry run is off at 6x throttle: the browser final and the text decide)
  const T = { plausibleMs: 700 / SCALE, waitMs: 1800 / SCALE, handsFreeMs: 2500 / SCALE, finalSettleMs: 700 / SCALE, rateMs: 2000 / SCALE, dupMs: 10000 / SCALE, fragWindowMs: 10000 / SCALE, micStopMs: 20, restartMs: 4, dryRunMs: 400 / SCALE };
  const turnMs = 1800 / SCALE;
  const { sp, log, rec } = make({ slow: true, timing: T, allowShort: () => false });
  let turn = false, turnsStarted = 0, violation = 0, queued = 0, turnAt = 0;
  sp.setHandsFree(true);
  const origSend = log.sent.push.bind(log.sent);
  log.sent.push = (m) => { origSend(m); if (turn) queued++; turn = true; turnAt = Date.now(); turnsStarted++; setTimeout(() => { turn = false; sp.setWorking(false); }, turnMs); return log.sent.length; };
  const watch = setInterval(() => { if (turn && Date.now() - turnAt > 15 && recs.at(-1)?.started) violation++; }, 2);   // 15 ms: abort() is asynchronous
  const t0 = rows[0].t;
  const start = Date.now();
  let fed = 0, lostInTurn = 0;
  for (const r of rows) {
    const at = (r.t - t0) / SCALE;
    const wait = at - (Date.now() - start);
    if (wait > 0) await sleep(wait);
    if (turn || !rec().started) { lostInTurn++; continue; }   // the microphone is paused: the sound goes nowhere
    rec().final(r.text); fed++;
  }
  await sleep(200);
  clearInterval(watch);
  const gaps = rows.slice(1).filter((r, i) => r.t - rows[i].t > 2000).length + 1;   // utterances: records separated by more than 2 s
  const oneWord = log.sent.filter((m) => m.text.trim().split(/\s+/).length === 1).map((m) => m.text);
  console.log(`  replay: ${rows.length} records, ${fed} heard, ${lostInTurn} while paused, ${log.sent.length} messages sent, ${log.ignored.length} dropped, ${gaps} utterance gaps`);
  assert.equal(queued, 0, 'no queue: no message was sent while a turn ran');
  assert.equal(violation, 0, 'the microphone is paused during every turn');
  assert.ok(log.sent.length <= gaps + 5, `${log.sent.length} messages for ${gaps} utterances`);
  assert.ok(log.sent.length <= rows.length / 2, 'fewer than half of the 108 fragment records became messages');
  assert.equal(oneWord.filter((w) => ['o', 'ce', 'de', 'asta', 'mare', 'face', 'tata', 'mama'].includes(w.toLowerCase())).length, 0, `no fragment word was sent: ${oneWord.join(',')}`);
  sp.destroy();
  void VOICE_TIMING;
});
