// SPDX-License-Identifier: AGPL-3.0-only
// SETTINGS-COHERENT: one reading choice, the options catalogue, the voice words of every language, the routing in the export, the wrong-world analysis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateSettings, loadSettings, DEFAULT_SETTINGS, SETTINGS_VERSION, SETTINGS_KEY, applyReading } from '../docs/webchat/ui/settings.mjs';
import { OPTIONS, GROUPS, INTERNAL_WORDS, EXPERIMENTS, defaultsTable } from '../docs/webchat/ui/settings-catalog.mjs';
import { buildLexicon, setLexicon, addressWords, addressWordsText, SOURCE, APP_NAMES } from '../docs/webchat/ui/voice-words.mjs';
import { isAddressed, ADDRESS_WORDS } from '../docs/webchat/ui/voice-noise.mjs';
import { routingOf, exportRecord } from '../docs/webchat/ui/phrase-log.mjs';
import { analyze, parseExport, normalizeRecord, classify } from '../scripts/analyze-phrase-log.mjs';
import { installLexicon } from './fixtures/voice-lexicon.mjs';

const store = (obj = {}) => ({ data: { ...obj }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } });

test('reading: the rules read, one helper-model switch decides the engine keys; no who-reads-first choice', () => {
  assert.equal(DEFAULT_SETTINGS.helperModel, true);
  assert.equal('reading' in DEFAULT_SETTINGS, false);
  assert.deepEqual([DEFAULT_SETTINGS.formalizer, DEFAULT_SETTINGS.nxStrategy, DEFAULT_SETTINGS.normalizer], ['encoder', 'rules', false]);
  assert.deepEqual([applyReading({ helperModel: true }).formalizer, applyReading({ helperModel: true }).nxStrategy], ['encoder', 'rules']);
  assert.deepEqual([applyReading({ helperModel: false }).formalizer, applyReading({ helperModel: false }).nxStrategy], ['rules', 'rules']);
  assert.equal(applyReading({ reading: 'model' }).nxStrategy, 'rules', 'an old reading value cannot bring the model-first reader back');
});

test('reading: every older saved profile follows the new defaults once (rules read, no normalizer, router A becomes C); a later explicit choice is respected', () => {
  for (const saved of [{ formalizer: 'rules' }, { nxStrategy: 'neural', reading: 'model' }, { normalizer: true, routing: 'dispatcher', editHead: true }, { formalizer: 'encoder', nxStrategy: 'hybrid' }]) {
    const st = store({ [SETTINGS_KEY]: JSON.stringify({ ...saved, settingsVersion: 5 }) });
    const s = loadSettings(true, st);
    assert.deepEqual([s.helperModel, s.nxStrategy, s.normalizer, s.editHead, 'reading' in s], [true, 'rules', false, false, false], JSON.stringify(saved));
    assert.notEqual(s.routing, 'dispatcher');
    assert.equal(JSON.parse(st.data[SETTINGS_KEY]).settingsVersion, SETTINGS_VERSION);
  }
  const chosen = store({ [SETTINGS_KEY]: JSON.stringify({ helperModel: false, normalizer: true, settingsVersion: SETTINGS_VERSION }) });
  const s = loadSettings(true, chosen);
  assert.deepEqual([s.helperModel, s.formalizer, s.normalizer], [false, 'rules', true]);
});

test('catalogue: every option has a group, what, when, no internal name in the label; failed experiments are in Developer with numbers', () => {
  const groups = new Set(GROUPS.map(([g]) => g));
  assert.deepEqual(GROUPS.map(([, n]) => n), ['Reading', 'Languages and voice', 'Models', 'Privacy and history', 'Developer']);
  assert.ok(OPTIONS.length <= 20, `fewer options (was 26): ${OPTIONS.length}`);
  for (const x of EXPERIMENTS) { assert.match(x.date, /^\d{4}-\d{2}-\d{2}$|^not measured$/, x.id); assert.ok(x.last.length > 20 && x.values.length >= 2, x.id); }
  const ids = new Set();
  for (const o of OPTIONS) {
    assert.ok(!ids.has(o.id), `duplicate ${o.id}`); ids.add(o.id);
    assert.ok(groups.has(o.group), o.id);
    for (const f of ['label', 'what', 'when', 'reason']) assert.ok(typeof o[f] === 'string' && o[f].length >= 5, `${o.id}.${f}`);
    for (const w of INTERNAL_WORDS) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(o.label), `label of ${o.id} names "${w}"`);
    assert.ok(!/[ăâîșț]|romanian|robotule/i.test(`${o.label} ${o.what} ${o.when}`), `${o.id} is language-neutral`);
    if (o.key && o.key in DEFAULT_SETTINGS && o.key !== 'timeLimits') assert.equal(DEFAULT_SETTINGS[o.key], o.default, `default of ${o.id}`);
  }
  for (const gone of ['editHead', 'reading', 'fastPath', 'bestEffort', 'routing', 'worldAware', 'reasoner']) assert.ok(!OPTIONS.some((o) => o.id === gone), `${gone} is no option any more`);
  assert.equal(OPTIONS.find((o) => o.id === 'normalizer').default, false);
  assert.match(OPTIONS.find((o) => o.id === 'normalizer').label, /garbled sentences/);
  assert.deepEqual(EXPERIMENTS.map((x) => x.id), ['routing', 'worldAware', 'reasoner', 'lazyWorlds', 'acceptRefused']);
  assert.ok(!EXPERIMENTS.find((x) => x.id === 'routing').values.some(([v]) => v === 'dispatcher'), 'router A is removed');
  assert.match(defaultsTable(), /\| Reading \| Use the helper model for typos and long sentences \| `true` \|/);
});

test('voice words: English only by default, another language from the translation layer (translated once, cached), address words generic', async () => {
  setLexicon('en', null);
  assert.deepEqual([...ADDRESS_WORDS], [...APP_NAMES, ...SOURCE.address]);
  assert.ok(isAddressed('robot open the music') && isAddressed('PSys2 hello') && isAddressed('hey computer'));
  assert.ok(!isAddressed('asistentule deschide muzica') && !isAddressed('calculatorule'), 'no word of another language is built in');
  assert.deepEqual(addressWordsText('en'), ['PSys2', 'robot', 'assistant', 'computer']);
  // a second language: translated once, cached, then read from the cache without calling the translator
  let calls = 0;
  const st = store();
  const tr = async (t) => { calls++; return ({ robot: 'robot', assistant: 'asistent', computer: 'calculator' })[t] ?? t; };
  const first = await buildLexicon({ lang: 'xx', translate: tr, storage: st, yieldFn: async () => {} });
  assert.ok(calls > 100 && first.translated > 0);
  const n = calls;
  const second = await buildLexicon({ lang: 'xx', translate: tr, storage: st, yieldFn: async () => {} });
  assert.equal(calls, n, 'the cache is used'); assert.equal(second.fromCache, true);
  setLexicon('xx', second.lists);
  assert.ok(addressWords().includes('asistent') && addressWords().includes('calculator'));
  assert.deepEqual(addressWordsText('xx'), ['PSys2', 'robot', 'assistant', 'computer', 'asistent', 'calculator']);
  assert.ok(isAddressed('asistentule ce faci'), 'a short ending still addresses');
  // a failing translator gives nothing and nothing is cached
  const bad = store();
  const r = await buildLexicon({ lang: 'yy', translate: async () => { throw new Error('no translator'); }, storage: bad, yieldFn: async () => {} });
  assert.equal(r.translated, 0); assert.equal(bad.getItem('psys2.voicewords.v1.yy'), null);
  await installLexicon(null);
});

test('export: each record carries the open tab, the candidate worlds with their scores and the final choice', () => {
  const rec = { text: 'make it happy', tab: 'robot', tabWorld: 'ui.avatar', mode: 'typed', lang: 'en', time: '2026-11-13T10:00:00Z', segments: [{ text: 'make it happy', world: 'diagram.sketch', pattern: 'p.x', status: 'supported' }],
    detail: { readings: [{ text: 'make it happy', world: 'diagram.sketch', pattern: 'p.x', candidates: [{ world: 'diagram.sketch', score: 0.61, valid: true }, { world: 'ui.avatar', score: 0.3, valid: false }] }] } };
  const rt = routingOf(rec);
  assert.equal(rt.activeTab, 'robot'); assert.equal(rt.activeWorld, 'ui.avatar'); assert.deepEqual(rt.chosen, ['diagram.sketch']);
  assert.deepEqual(rt.pieces[0].candidates.map((c) => [c.world, c.score]), [['diagram.sketch', 0.61], ['ui.avatar', 0.3]]);
  assert.deepEqual(exportRecord(rec).routing.chosen, ['diagram.sketch']);
  assert.deepEqual(routingOf({ text: 'x', tab: 'draw', segments: [{ world: 'art.draw' }] }).chosen, ['art.draw']);   // a record without detail still routes
});

test('analyze-phrase-log: groups wrong-world and not-understood messages from an export and from the owner log', () => {
  const exp = JSON.stringify({ format: 'psys2-phrase-log/2', records: [
    { text: 'crocodiles', tab: 'draw', tabWorld: 'art.draw', status: 'supported', segments: [{ text: 'crocodiles', world: 'games.hangman', pattern: 'pat.hangman.guess.word', status: 'supported' }] },
    { text: 'draw a house', tab: 'draw', segments: [{ text: 'draw a house', world: 'art.draw', pattern: 'pat.art.draw.add', status: 'supported' }], status: 'supported' },
    { text: 'show me the weather', tab: 'draw', segments: [], status: 'unparsed' },
    { text: 'hello', tab: 'draw', segments: [{ world: 'ui.shell', pattern: 'p', status: 'supported' }], status: 'supported' },
  ] });
  const recs = parseExport(exp);
  const out = analyze(recs);
  assert.equal(out.total, 4); assert.equal(out.flagged, 2);
  const g = out.groups.find((x) => x.kind === 'wrong-world');
  assert.deepEqual([g.tab, g.chosen, g.pattern], ['draw', 'games.hangman', 'pat.hangman.guess.word']);
  assert.deepEqual(g.messages.map((m) => m.text), ['crocodiles']);
  assert.equal(classify(normalizeRecord(recs[1])).kind, 'ok');
  assert.equal(classify(normalizeRecord(recs[3])).kind, 'shared');
  assert.equal(analyze(recs, { all: true }).flagged, 4);
  // JSON lines of the owner log
  const owner = readFileSync(new URL('../training/eval/owner-log-2026-11-13.jsonl', import.meta.url), 'utf8');
  const ow = analyze(parseExport(owner));
  assert.ok(ow.total >= 60 && ow.flagged > 10 && ow.groups.length > 3);
});
