#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E2 (FORMALIZE-FROM-WORLDS): measurement of world-aware reading (spec 16). Two steps.
 *
 *   1. Collect, per mode and per option value (the collect phase of E1, with the option):
 *        node scripts/e1-collect.mjs --mode rules --world-aware veto --out <dir>/f-rules-veto.json        (off: no --world-aware)
 *        node scripts/e1-collect.mjs --mode encoder+n1 --ort <onnxruntime-node entry> --world-aware choose --out <dir>/f-enc-choose.json
 *      File names: f-<rules|enc>-<off|veto|veto-strict|choose|choose-strict>.json.
 *   2. Report:  node scripts/e2-world-aware.mjs --dir <dir> [--out training/results/e2-world-aware-2026-11-12]
 *      Reads the files, compares every option value against `off` case by case (right / partly / wrong / not understood), runs the reviewer's named cases
 *      through the pipeline in every option value, lists every disagreement between the library's order and the host's, and writes <out>.json and <out>.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const DIR = arg('dir', '.');
const OUT = arg('out', 'training/results/e2-world-aware-2026-11-12');
const MODES = ['off', 'veto', 'veto-strict', 'choose', 'choose-strict'];
const RUNS = [['rules', 'rules'], ['enc', 'encoder+n1']];
const JUDGED = ['right', 'partly', 'wrong', 'not_understood'];
const cap = (s, n = 140) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return new Map(d.rows.map((r) => [`${r.set}|${r.id}|${r.message}`, r])); };
const tally = (rows) => { const t = {}; for (const r of rows) { const b = (t[r.set] ??= { n: 0 }); b.n++; b[r.outcome] = (b[r.outcome] ?? 0) + 1; } return t; };

// ---- step 2a: case by case comparison ------------------------------------------------------------------------------------------------------
const report = { date: new Date().toISOString(), sets: {}, comparisons: {}, changes: {}, disagreements: [], named: [] };
for (const [tag, mode] of RUNS) {
  const base = join(DIR, `f-${tag}-off.json`);
  if (!existsSync(base)) continue;
  const A = load(base);
  report.sets[`${mode}|off`] = tally([...A.values()]);
  for (const m of MODES.slice(1)) {
    const f = join(DIR, `f-${tag}-${m}.json`);
    if (!existsSync(f)) continue;
    const B = load(f);
    report.sets[`${mode}|${m}`] = tally([...B.values()]);
    const key = `${mode}|${m}`;
    const trans = {}, perSet = {}, list = [];
    for (const [k, a] of A) {
      const b = B.get(k);
      if (!b || a.outcome === b.outcome) continue;
      const t = `${a.outcome}->${b.outcome}`;
      trans[t] = (trans[t] ?? 0) + 1;
      ((perSet[a.set] ??= {})[t] = ((perSet[a.set] ??= {})[t] ?? 0) + 1);
      const veto = (b.segments ?? []).map((s) => s.veto?.kind).filter(Boolean)[0] ?? null;
      list.push({ set: a.set, world: a.world ?? null, tab: a.tab ?? null, message: a.message, transition: t, veto, off: cap(a.reply), now: cap(b.reply) });
    }
    report.comparisons[key] = { transitions: trans, perSet };
    report.changes[key] = list;
    if (m.startsWith('choose')) {
      for (const [k, b] of B) for (const s of b.segments ?? []) {
        const p = s.pick;
        if (!p || (!p.disagree && p.libraryDefault === p.host)) continue;
        report.disagreements.push({ mode: key, set: b.set, message: b.message, source: p.source, host: p.host, libraryDefault: p.libraryDefault ?? null, hostCriteria: p.library, applied: p.applied, outcomeOff: A.get(k)?.outcome ?? null, outcomeNow: b.outcome, why: p.readings?.map((r) => `${r.place} ${r.reading}: ${cap(r.why, 110)}`) });
      }
    }
  }
}

// ---- step 2b: the reviewer's named cases through the pipeline ------------------------------------------------------------------------------
const NAMED = [
  { id: 'ro-hair-red', note: 'WRONG in the shipped mode: "fă părul roșu" read as "make it red" (the body turns red, "părul" dropped)', tab: 'robot', msg: 'fă părul roșu', lang: 'ro' },
  { id: 'connect-missing', note: 'connect Start to End when End does not exist (should offer to add it)', tab: 'diagram', setup: ['add a rectangle called Start'], msg: 'connect Start to End' },
  { id: 'delete-dragon', note: 'delete the dragon (should list what IS in the picture)', tab: 'draw', setup: ['draw a house', 'draw a tree'], msg: 'delete the dragon' },
  { id: 'klingon', note: 'switch to klingon (should list the languages we have)', tab: 'robot', msg: 'switch to klingon' },
  { id: 'hat-cheese', note: 'give it a hat made of cheese (should say what a hat can be)', tab: 'robot', msg: 'give it a hat made of cheese' },
  { id: 'ttt-in-draw', note: 'put it in the top right corner (Drawing tab: played as a tic-tac-toe move)', tab: 'draw', setup: ['draw a house'], msg: 'put it in the top right corner' },
  { id: 'instrument-flute', note: 'change the instrument to flute (goes to the document)', tab: 'music', msg: 'change the instrument to flute' },
  { id: 'colour-spain', note: 'colour Spain in (goes to draw)', tab: 'map', msg: 'colour Spain in' },
  { id: 'center-and-calc', note: 'center and what is 3 times 3 (goes to the document)', tab: 'editor', msg: 'center and what is 3 times 3' },
  { id: 'milk-penguins', note: 'add milk ... and also can penguins fly (creates a "fly" list)', tab: 'tasks', msg: 'add milk to my shopping list and also can penguins fly' },
  { id: 'ro-map-can', note: 'ce poți face pe hartă? (answered in English)', tab: 'map', msg: 'ce poți face pe hartă?', lang: 'ro' },
  { id: 'ro-back', note: 'înapoi (garbled reply)', tab: 'robot', msg: 'înapoi', lang: 'ro' },
  { id: 'chess-board', note: 'whats on the board on the Chess tab (answered by tic-tac-toe)', tab: 'chess', msg: 'whats on the board' },
  { id: 'heart-undo', note: 'give yourself a heart on your chest and then undo that (E1: wrong)', tab: 'robot', msg: 'give yourself a heart on your chest and then undo that' },
  { id: 'hair-en', note: 'make the hair red (the English case that is right today)', tab: 'robot', msg: 'make the hair red' },
];
{
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const st = settingsForMode('rules');
  for (const c of NAMED) {
    const row = { id: c.id, note: c.note, tab: c.tab, message: c.msg, modes: {} };
    for (const m of MODES) {
      try {
        const s = engine.createSession(sessionOptions(st, { language: 'en', worldAware: m }));
        s.setWorldState('ui.shell', { activeTab: c.tab });
        for (const x of c.setup ?? []) await s.send(x);
        const r = await s.send(c.msg, c.lang === 'ro' ? { language: 'auto' } : undefined);
        const veto = r.segments.map((x) => x.veto?.kind).filter(Boolean)[0] ?? null;
        row.modes[m] = { reply: cap(r.trace?.replyEnglish ?? r.text, 260), statuses: r.statuses, world: r.segments.find((x) => !x.unparsed)?.match?.worldId ?? null, veto };
      } catch (e) { row.modes[m] = { error: String(e?.message ?? e).slice(0, 120) }; }
    }
    report.named.push(row);
  }
}
writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 1));

// ---- markdown ------------------------------------------------------------------------------------------------------------------------------
const L = [];
const sets = (k) => Object.keys(report.sets[k] ?? {});
L.push('# E2: world-aware reading, measured (2026-11-12)', '', 'Generated by `scripts/e2-world-aware.mjs` from `scripts/e1-collect.mjs` runs. Spec: `specs/16-world-aware-reading.md`. The option is **off by default**; nothing here changes a default. Every row is the pipeline as the webchat runs it (rules: the rule formalizer with the shipped leniency; encoder+n1: the shipped default, onnxruntime-node). Operational-ro, gold pilot-300 (gold-rules, gold-para, gold-real), loose-words, typos, real phrases and mobile are the E1 sets; dialogues are multi-turn, so a vetoed turn can change the later turns of the same dialogue.', '');
for (const [, mode] of RUNS) {
  if (!report.sets[`${mode}|off`]) continue;
  L.push(`## ${mode}: right / wrong / not understood per set`, '', '| set | n | off | veto | veto-strict | choose | choose-strict |', '| --- | ---: | --- | --- | --- | --- | --- |');
  const cell = (k, s) => { const b = report.sets[k]?.[s]; return b ? `${b.right ?? 0} / ${b.wrong ?? 0} / ${b.not_understood ?? 0}${b.partly ? ` (+${b.partly} partly)` : ''}` : '-'; };
  for (const s of sets(`${mode}|off`)) L.push(`| ${s} | ${report.sets[`${mode}|off`][s].n} | ${['off', ...MODES.slice(1)].map((m) => cell(`${mode}|${m}`, s)).join(' | ')} |`);
  L.push('', `### ${mode}: what changed against off (case counts)`, '', '| option | wrong to not understood | wrong to right | not understood to right | right to not understood | right to partly | partly to not understood | NEW WRONG (right, partly or not understood to wrong) |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const m of MODES.slice(1)) {
    const t = report.comparisons[`${mode}|${m}`]?.transitions; if (!t) continue;
    const g = (x) => t[x] ?? 0;
    L.push(`| ${m} | ${g('wrong->not_understood')} | ${g('wrong->right')} | ${g('not_understood->right')} | ${g('right->not_understood')} | ${g('right->partly')} | ${g('partly->not_understood')} | ${g('right->wrong') + g('partly->wrong') + g('not_understood->wrong')} |`);
  }
  L.push('');
  for (const m of MODES.slice(1)) {
    const ps = report.comparisons[`${mode}|${m}`]?.perSet; if (!ps) continue;
    L.push(`#### ${mode} ${m}: per set`, '', '| set | changes |', '| --- | --- |');
    for (const [s, t] of Object.entries(ps)) L.push(`| ${s} | ${Object.entries(t).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')} |`);
    L.push('');
  }
}
L.push('## The reviewer\'s named cases (rules mode, one case per row)', '');
for (const r of report.named) {
  L.push(`### ${r.id}: ${r.message}`, '', `${r.note}. Tab: ${r.tab}.`, '', '| option | world | status | reply |', '| --- | --- | --- | --- |');
  for (const m of MODES) { const x = r.modes[m]; L.push(`| ${m} | ${x.world ?? '-'} | ${(x.statuses ?? []).join(',') || x.error || '-'}${x.veto ? ` (veto ${x.veto})` : ''} | ${cap(x.reply, 230).replace(/\|/g, '/')} |`); }
  L.push('');
}
L.push('## Where the library\'s order and the host\'s disagree', '', `${report.disagreements.length} rows (choose and choose-strict runs; \`libraryDefault\` is the library's own first reading with its default RANKING, \`hostCriteria\` the order used: the library's with the two host changes of spec 16 section 4; \`host\` is what the router or the best-effort scorer chose first).`, '');
if (report.disagreements.length) {
  L.push('| mode | set | message | source | host (router) | library default | order used | applied | off | now |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const d of report.disagreements) L.push(`| ${d.mode} | ${d.set} | ${cap(d.message, 60).replace(/\|/g, '/')} | ${d.source} | ${d.host} | ${d.libraryDefault} | ${d.hostCriteria} | ${d.applied} | ${d.outcomeOff} | ${d.outcomeNow} |`);
}
L.push('', '## Every case that changed', '');
for (const [key, list] of Object.entries(report.changes)) {
  L.push(`### ${key} (${list.length})`, '');
  if (!list.length) { L.push('none', ''); continue; }
  L.push('| set | world | transition | veto | message | off | now |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const c of list) L.push(`| ${c.set} | ${c.world ?? ''} | ${c.transition.replace(/_/g, ' ')} | ${c.veto ?? ''} | ${cap(c.message, 70).replace(/\|/g, '/')} | ${cap(c.off, 80).replace(/\|/g, '/')} | ${cap(c.now, 80).replace(/\|/g, '/')} |`);
  L.push('');
}
writeFileSync(`${OUT}.md`, L.join('\n') + '\n');
console.log('wrote', `${OUT}.json`, `${OUT}.md`);
