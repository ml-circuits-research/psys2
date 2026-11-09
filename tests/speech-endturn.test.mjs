// SPDX-License-Identifier: AGPL-3.0-only
// Voice end-of-turn detector (VOICE, spec 06 "Spoken messages"): pure logic of docs/webchat/ui/speech.mjs with a fake SpeechRecognition and scaled timings.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const recs = [];
class FakeRec {
  constructor() { this.started = false; recs.push(this); }
  start() { this.started = true; }
  stop() { setTimeout(() => this.end(), 5); }
  abort() { setTimeout(() => this.end(), 0); }
  end() { if (this.started) { this.started = false; this.onend?.(); } }
  say(texts, { final = false, index = 0 } = {}) { this.onresult?.({ resultIndex: index, results: texts.map((t, i) => Object.assign([{ transcript: t }], { isFinal: final && i >= index })) }); }
}
globalThis.window = { SpeechRecognition: FakeRec };
const { createSpeech, endsOpen, splitCancel } = await import('../docs/webchat/ui/speech.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMING = { plausibleMs: 60, waitMs: 200, handsFreeMs: 300, micStopMs: 40, dryRunMs: 50 };

function make({ busy = false, plausible = async (t) => /^(draw a red house|desenează o casă roșie)$/i.test(t), lang = 'en-US' } = {}) {
  recs.length = 0;
  const log = { sent: [], held: [], cancelled: [], interim: [], busy };
  let curLang = lang;
  const sp = createSpeech({
    getLang: () => curLang, timing: TIMING, plausible, isBusy: () => log.busy,
    onSend: (m) => log.sent.push(m), onHold: (t) => log.held.push(t), onCancel: (t) => log.cancelled.push(t), onInterim: (t) => log.interim.push(t),
  });
  return { sp, log, rec: () => recs.at(-1), setLang: (l) => { curLang = l; } };
}

test('endsOpen: connectors and prepositions, English and Romanian', () => {
  for (const t of ['draw a red house and', 'make it bigger then', 'go to', 'a house with', 'desenează o casă și', 'apoi', 'du-te la', 'casa cu', 'așază pe', 'draw a house,']) assert.ok(endsOpen(t), t);
  for (const t of ['draw a red house', 'desenează o casă roșie', 'open the music tab']) assert.ok(!endsOpen(t), t);
  assert.deepEqual(splitCancel('draw a house cancel'), { rest: 'draw a house', word: 'cancel' });
  assert.equal(splitCancel('Anulează.').rest, '');
  assert.equal(splitCancel('cancel the music'), null);
});

test('English plausible sentence is sent after the short pause', async () => {
  const { sp, log, rec } = make();
  sp.listenOnce(); rec().say(['draw a']); await sleep(20); rec().say(['draw a red house']);
  await sleep(40); assert.equal(log.sent.length, 0);
  await sleep(120);
  assert.equal(log.sent.length, 1); assert.equal(log.sent[0].text, 'draw a red house'); assert.equal(log.sent[0].how, 'pause-plausible');
  assert.ok(log.sent[0].waitMs >= 55 && log.sent[0].waitMs < 150, String(log.sent[0].waitMs));
});

test('Romanian plausible sentence is sent after the short pause', async () => {
  const { sp, log, rec } = make({ lang: 'ro-RO' });
  sp.listenOnce(); assert.equal(rec().lang, 'ro-RO'); rec().say(['desenează o casă roșie']);
  await sleep(160); assert.deepEqual(log.sent.map((m) => [m.text, m.how]), [['desenează o casă roșie', 'pause-plausible']]);
});

test('"draw a red house and" waits for the rest', async () => {
  const { sp, log, rec } = make();
  sp.listenOnce(); rec().say(['draw a red house and']);
  await sleep(120); assert.equal(log.sent.length, 0, 'not sent after the short pause');
  rec().say(['draw a red house and a tree']); await sleep(120); assert.equal(log.sent.length, 0, 'the pause restarts when the text changes');
  await sleep(200); assert.equal(log.sent.length, 1); assert.equal(log.sent[0].how, 'pause-timeout'); assert.equal(log.sent[0].text, 'draw a red house and a tree');
});

test('a never-final stream is still sent (hands-free uses the longer wait)', async () => {
  const { sp, log, rec } = make();
  sp.setHandsFree(true); rec().say(['open the']); rec().say(['open the music']);
  await sleep(220); assert.equal(log.sent.length, 0, 'hands-free waits longer');
  await sleep(200); assert.deepEqual(log.sent.map((m) => m.how), ['pause-timeout']);
  await sleep(30); assert.ok(recs.length >= 2 && recs.at(-1).started, 'hands-free listens again at once');
  sp.destroy();
});

test('stopping the mic sends the interim text; a final within the window is not sent twice', async () => {
  const a = make();
  a.sp.listenOnce(); a.rec().say(['open the']); a.sp.stopListening();
  await sleep(100); assert.deepEqual(a.log.sent.map((m) => [m.text, m.how]), [['open the', 'mic-stop']]);
  const b = make();
  b.sp.listenOnce(); b.rec().say(['open the music']); b.sp.stopListening(); b.rec().say(['open the music'], { final: true });
  await sleep(120); assert.deepEqual(b.log.sent.map((m) => m.how), ['final']);
});

test('isFinal sends at once; no double send after a timer send', async () => {
  const { sp, log, rec } = make();
  sp.setHandsFree(true); const r0 = rec();
  r0.say(['draw a red house']); await sleep(120);
  assert.equal(log.sent.length, 1);
  r0.say(['draw a red house'], { final: true }); await sleep(30);
  assert.equal(log.sent.length, 1, 'the late final of the same utterance is dropped');
  await sleep(30);
  rec().say(['open music'], { final: true });
  assert.deepEqual(log.sent.map((m) => m.how), ['pause-plausible', 'final']);
  sp.destroy();
});

test('"cancel" keeps the text for editing; typing cancels too', async () => {
  const a = make();
  a.sp.listenOnce(); a.rec().say(['draw a red house cancel']); await sleep(150);
  assert.equal(a.log.sent.length, 0); assert.deepEqual(a.log.cancelled, ['draw a red house']);
  const c = make();
  c.sp.listenOnce(); c.rec().say(['draw a red house']); await sleep(20); c.sp.cancelPending('draw a red house!');
  await sleep(150); assert.equal(c.log.sent.length, 0); assert.deepEqual(c.log.cancelled, ['draw a red house!']);
});

test('while a turn runs the spoken text waits and is sent when the turn ends', async () => {
  const { sp, log, rec } = make({ busy: true });
  sp.listenOnce(); rec().say(['draw a red house']); await sleep(280);
  assert.equal(log.sent.length, 0); assert.deepEqual(log.held, ['draw a red house']);
  log.busy = false; assert.equal(sp.turnEnded(), true);
  assert.deepEqual(log.sent.map((m) => m.text), ['draw a red house']);
  assert.equal(sp.turnEnded(), false);
});

test('refreshLang restarts an idle hands-free recognizer with the new language', async () => {
  const { sp, rec, setLang } = make();
  sp.setHandsFree(true); const r0 = rec(); assert.equal(r0.lang, 'en-US');
  setLang('ro-RO'); assert.equal(sp.refreshLang(), true);
  await sleep(30); assert.notEqual(rec(), r0); assert.equal(rec().lang, 'ro-RO'); assert.ok(rec().started);
  sp.destroy();
});
