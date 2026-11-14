#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// RANDOM as a world, measurement (specs/25): presses the dice (the sampler of sopworld std.sample) the way a person would, in one session per tab world, and judges each press BY STATE:
// a changing act must change the world's state, a question must be answered with something that is not a refusal, the others must be supported. Writes the rows to --out (jsonl).
//   node scripts/measure-dice.mjs [--per 20] [--seed 1] [--world <id>] [--out training/eval/dice-samples.jsonl]
import { writeFileSync } from 'node:fs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { engineSampler } from '../src/dialog/sampler.mjs';
/** True when every segment of the reply was understood and answered with a supported status (the reading the phrase log makes of a reply). */
function replySupported(reply) {
  const segments = reply?.segments ?? [], answers = reply?.answers ?? [];
  if (!segments.length || !reply.text) return false;
  return segments.every((s) => {
    if (s.unparsed) return false;
    const wires = new Set((s.wires ?? []).map((w) => w.id));
    const mine = answers.filter((a) => wires.has(a.to));
    const status = mine.find((a) => a.status && a.status !== 'supported')?.status ?? mine[0]?.status ?? (s.match ? 'supported' : 'unparsed');
    return status === 'supported';
  });
}

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const per = Number(arg('per', 25)), seed0 = Number(arg('seed', 1)), only = arg('world', null), outFile = arg('out', null);
const REFUSAL = /did not understand|did not catch|I can't find|I can not find|I cannot|There is no|Where should it go|is empty|not sure how|I do not know|Something went wrong|nothing to|not possible|can't do/i;
// The state a change is judged by: every world's state except the conversation's own bookkeeping (the turn log, the dialogue focus, the shell, the speech settings), which changes on every turn whatever was said.
const META = new Set(['session.conversation', 'session.dialogue', 'ui.shell', 'talk', 'ui.help', 'user.profile', 'meta.worlds', 'session.things']);
const stateOf = (s) => JSON.stringify(Object.fromEntries(Object.entries(s.state() ?? {}).filter(([k]) => !META.has(k))));
const CHANGES = new Set(['make', 'remove', 'change', 'copy', 'undo']);

const engine = await createEngine({ loader: createFsLoader() });
const worlds = engine.set.list().filter((w) => w.ops?.executor?.schema && w.id !== 'ui.avatar' && (!only || w.id === only));   // the avatar is a popup with no things of its own: its dice falls back to a world used lately
const tabWorldIds = new Set(engine.set.list().filter((w) => w.manifest?.entries?.some((e) => e.key === 'tab') || w.id === 'docs.editor').map((w) => w.id));
const rows = [], noSample = [];
for (const w of worlds) {
  const s = engine.createSession({ language: 'en' });
  const sampler = engineSampler(lib, engine, () => s);
  if (!sampler.available) { console.error('sopworld has no sample'); process.exit(2); }
  const tab = ({ 'docs.editor': 'editor', 'ui.avatar': null })[w.id] ?? w.manifest.entries.find((e) => e.key === 'tab')?.value.v;
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  if (![0, 1, 2, 3, 4].some((i) => sampler.dice({ worldId: w.id, seed: seed0 * 1000 + i }))) { noSample.push(w.id); continue; }   // nothing sampleable in this world: its dice falls back to another world
  for (let i = 0; i < per; i++) {
    const sample = sampler.dice({ worldId: w.id, seed: seed0 * 1000 + i });
    if (!sample) { rows.push({ world: w.id, i, text: null, judged: 'no-sample' }); continue; }
    const before = stateOf(s);
    let reply;
    try { reply = await s.send(sample.text, { language: 'en', formalizer: 'rules', tab: w.id }); } catch (e) { rows.push({ world: w.id, i, text: sample.text, judged: 'error', error: String(e.message) }); continue; }
    const after = stateOf(s);
    const act = sample.frame.action;
    // a reply of ANOTHER tab world is a capture ("Add a chapter." on the Documents tab was done by the editor): the command was not executed where it was drawn
    const answered = [...new Set((reply.segments ?? []).map((x) => x.match?.worldId ?? x.world).filter(Boolean))];
    const capture = answered.find((id) => id !== w.id && tabWorldIds.has(id)) ?? null;
    let ok;
    if (capture) ok = false;
    else if (CHANGES.has(act)) ok = before !== after && !/did not understand|did not catch/i.test(reply.text ?? '') && !/\?\s*$/.test((reply.text ?? '').trim());   // a counter-question ("Which shape should I label?") is not an executed act
    else ok = !REFUSAL.test(reply.text ?? '') && replySupported(reply);
    rows.push({ world: w.id, i, text: sample.text, act, kind: sample.frame.args?.kind ?? null, attr: sample.frame.args?.attr ?? null, judged: ok ? 'ok' : 'fail', ...(capture ? { capture } : {}), reply: String(reply.text ?? '').slice(0, 160) });
  }
}
if (noSample.length) console.log(`no sampleable kind (dice falls back to another world): ${noSample.join(', ')}`);
const by = {};
for (const r of rows) { const b = (by[r.world] ??= { n: 0, ok: 0, nosample: 0 }); b.n++; if (r.judged === 'ok') b.ok++; if (r.judged === 'no-sample') b.nosample++; }
for (const [id, b] of Object.entries(by)) console.log(`${id.padEnd(16)} ${b.ok}/${b.n} ok${b.nosample ? ` (${b.nosample} without a sample)` : ''}`);
const tot = rows.length, ok = rows.filter((r) => r.judged === 'ok').length;
const div = (f) => new Set(rows.filter((r) => r.judged !== 'no-sample').map(f).filter(Boolean)).size;
console.log(`TOTAL ${ok}/${tot} = ${(100 * ok / tot).toFixed(1)}%  distinct acts ${div((r) => r.act)} kinds ${div((r) => r.kind)} attrs ${div((r) => r.attr)}`);
for (const r of rows.filter((r) => r.judged !== 'ok').slice(0, +arg('show', 15))) console.log('  FAIL', r.world, JSON.stringify(r.text), '->', r.judged, JSON.stringify(r.reply ?? r.error ?? ''));
if (outFile) writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
