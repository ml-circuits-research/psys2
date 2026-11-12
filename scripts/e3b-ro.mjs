#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3b: Romanian from descriptions (a measured proposal; spec 03 section 2c, "Language pack"). The Romanian operational cases of kids.shop, geo.map and docs.editor
 * (training/eval/operational-ro.jsonl) run through four routes, the same cases and the same checker:
 *   T  the rules translator (what the CLI and the tests use; Romanian is translated to English, then read)
 *   F  the webchat's switch translator with the fake on-device Translator behind it (an ORACLE: it returns the English source of the case, a perfect translator)
 *   P  generated Romanian patterns only (lang/ro/, PSYS_GEN_LANG=ro), reading the Romanian text directly; slot values (places, items, kinds) are canonicalized by the
 *      pack's entity words (core.word ... of=<lexicon>), nothing else is translated
 *   C  pack first, translator second: P when every segment of the message was read (no 'unparsed' status), else T
 * Gate: no new wrong answers (a case that is right or not understood on T must not be wrong on C or P). Also: the E1 f-cases (class f in e1-audit, Romanian wrong or not
 * understood while the English source is right), and the English cases of the three worlds with the pack loaded (the pack must not change English).
 *
 *   node scripts/e3b-ro.mjs [--reasoner ops|matrix] [--json out.json] [--limit N]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { createFakeTranslation } from './lib/fake-browser-apis.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
import { entityReader } from '../src/worlds/describe.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const WORLDS = new Set(['kids.shop', 'geo.map', 'docs.editor']);
const settings = settingsForMode('rules');

const roAll = loadCases(join(REPO, 'training/eval/operational-ro.jsonl'));
const enAll = loadCases(join(REPO, 'training/eval/operational.jsonl'));
const english = new Map(enAll.map((c) => [c.id, c.message]));
const oracle = new Map(roAll.filter((c) => english.has(c.source_id)).map((c) => [c.message, english.get(c.source_id)]));
let cases = roAll.filter((c) => WORLDS.has(c.world));
if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
const audit = JSON.parse(readFileSync(join(REPO, 'training/results/e1-audit-2026-11-12.json'), 'utf8'));
const fIds = new Set(audit.modes.rules.cases.filter((x) => x.cls === 'f' && WORLDS.has(x.world) && x.set === 'operational-ro').map((x) => x.id));

const fake = createFakeTranslation({ extra: oracle });
const backend = { translatorKind: () => 'translator', detectorKind: () => null, translate: async (t, f, to) => fake.translate(t, f, to), detect: async () => [], prepare: async () => {}, state: () => 'ready' };
const engT = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const engF = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createSwitchTranslator({ rules: createTranslator(), backend, getStrategy: () => 'auto' }) });
globalThis.PSYS_GEN_LANG = 'ro';
globalThis.PSYS_GEN_LANG_ONLY = '1';   // the pack alone reads the Romanian text: no English hand-written pattern may read it
const engP = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
delete globalThis.PSYS_GEN_LANG;
delete globalThis.PSYS_GEN_LANG_ONLY;
globalThis.PSYS_GEN_LANG = 'ro';   // the pack added to everything else (nothing isolated): the English cases must not change
const engPA = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
delete globalThis.PSYS_GEN_LANG;
const packWorlds = engP.set.list().filter((w) => w.langWords?.ro);
// an entity word that is also a word of a role (verb, noun, ...) of some Romanian description is left alone: the pre-pass would rewrite the role word the patterns expect
const fold = (x) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const roleTokens = new Set(engP.set.list().flatMap((w) => [...(w.descReader?.words.values() ?? [])].filter((x) => x.lang === 'ro' && !x.of).flatMap((x) => fold(String(x.text)).split(/\s+/))));
const allEntities = engP.set.list().flatMap((w) => w.langWords?.ro ?? []);
const entities = allEntities.filter((e) => !roleTokens.has(fold(e.text)));
const clashing = [...new Set(allEntities.filter((e) => roleTokens.has(fold(e.text))).map((e) => e.text))];
const canon = entityReader(entities);
const packErrors = engP.set.list().flatMap((w) => w.errors.filter((e) => /lang\/ro|describe/.test(e.file ?? '')).map((e) => `${w.id}: ${e.message}`));
const roPatterns = engP.set.list().flatMap((w) => w.patterns.filter((p) => p.lang === 'ro').map(() => w.id));
const partialReply = (r) => /I understood only part of that/.test(r ?? '');   // the engine's own sign that a leading word was dropped

const rows = [];
for (const c of cases) {
  const t = await runCase(engT, settings, c);
  const f = await runCase(engF, settings, c);
  const text = canon(c.message);
  const p = await runCase(engP, settings, { ...c, lang: 'en', message: text });
  const pUnderstood = p.outcome !== 'not_understood' && !(p.statuses ?? []).includes('unparsed') && !partialReply(p.reply);
  rows.push({
    id: c.id, world: c.world, message: c.message, canon: text, source: english.get(c.source_id) ?? null, f: fIds.has(c.id),
    T: t.outcome, F: f.outcome, P: p.outcome, C: pUnderstood ? p.outcome : t.outcome, cRoute: pUnderstood ? 'pack' : 'translator',
    replyP: p.reply?.slice(0, 120), statusesP: p.statuses, failingP: p.failing?.slice(0, 2), strategyP: p.strategy,
  });
}

// the English cases of the three worlds with the pack loaded must not change
const enCases = enAll.filter((c) => WORLDS.has(c.world));
const enChanged = [];
for (const c of enCases) {
  const a = await runCase(engT, settings, c);
  const b = await runCase(engPA, settings, c);
  if (a.outcome !== b.outcome) enChanged.push({ id: c.id, world: c.world, message: c.message, base: a.outcome, withPack: b.outcome });
}

// lenient view: the pack keeps the user's own free text in Romanian ("Cumparaturi"), while the cases expect the English text of the source ("Shopping"). A case whose only failing items
// compare the text of a block is counted right in the lenient view (strict is the gate).
const textOnly = (r) => r.P === 'wrong' && (r.failingP ?? []).length > 0 && r.failingP.every((x) => /^state:blocks\.\d+\.text==?/.test(x));
const bucket = (o) => (o === 'right' ? 'right' : o === 'not_understood' ? 'not_understood' : 'wrong');   // partly counts as wrong
const tally = (list, k) => { const t = { n: list.length, right: 0, wrong: 0, not_understood: 0 }; for (const r of list) t[bucket(r[k])]++; return t; };
for (const r of rows) { r.textOnly = textOnly(r); r.PL = r.textOnly ? 'right' : r.P; r.CL = r.cRoute === 'pack' && r.textOnly ? 'right' : r.C; }
// the pack cannot segment on Romanian joiners (the clause splitter knows English ones): CJ sends every message that has a joiner to the translator, the rest follows C
const JOINER = /(?<![\p{L}])(si|apoi|iar|dupa aceea|dupa care|pe urma|dupa)(?![\p{L}])/u;
for (const r of rows) { r.joiner = JOINER.test(fold(r.message)); r.CJ = r.joiner ? r.T : r.C; r.CJL = r.joiner ? r.T : r.CL; }
const by = (list) => Object.fromEntries(['T', 'F', 'P', 'C', 'PL', 'CL', 'CJ', 'CJL'].map((k) => [k, tally(list, k)]));
const newlyWrong = (k) => rows.filter((r) => bucket(r[k]) === 'wrong' && bucket(r.T) !== 'wrong').map((r) => ({ id: r.id, world: r.world, message: r.message, T: r.T, [k]: r[k], reply: r.replyP }));
const out = {
  reasoner, date: new Date().toISOString(), cases: cases.length, fCases: rows.filter((r) => r.f).length,
  pack: { worlds: packWorlds.map((w) => w.id), roPatterns: roPatterns.length, perWorld: Object.fromEntries(packWorlds.map((w) => [w.id, w.patterns.filter((p) => p.lang === 'ro').length])), errors: packErrors, entityWords: allEntities.length, entityWordsUsed: entities.length, clashingWithRoleWords: clashing },
  all: by(rows), perWorld: Object.fromEntries([...WORLDS].map((w) => [w, by(rows.filter((r) => r.world === w))])),
  fCasesTally: by(rows.filter((r) => r.f)), fCasesPerWorld: Object.fromEntries([...WORLDS].map((w) => [w, by(rows.filter((r) => r.f && r.world === w))])),
  newlyWrong: { P: newlyWrong('P'), C: newlyWrong('C'), F: newlyWrong('F'), CL: newlyWrong('CL'), CJ: newlyWrong('CJ'), CJL: newlyWrong('CJL') },
  gained: rows.filter((r) => r.f && r.CL === 'right' && r.T !== 'right').map((r) => r.id),
  gainedGuard: rows.filter((r) => r.f && r.CJL === 'right' && r.T !== 'right').map((r) => r.id),
  gainedAll: rows.filter((r) => r.C === 'right' && r.T !== 'right').map((r) => r.id),
  lostRight: rows.filter((r) => r.T === 'right' && r.C !== 'right').map((r) => r.id),
  english: { cases: enCases.length, changed: enChanged },
  rows,
};
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
const f = (t) => `right ${t.right}  wrong ${t.wrong}  not understood ${t.not_understood}  (of ${t.n})`;
console.log(`[${reasoner}] pack: ${out.pack.roPatterns} Romanian patterns ${JSON.stringify(out.pack.perWorld)}, ${out.pack.entityWords} entity words (${out.pack.entityWordsUsed} used; clashing with role words: ${clashing.join(', ') || 'none'}), errors ${out.pack.errors.length}`);
console.log(`f-cases (${out.fCases})`);
for (const k of ['T', 'F', 'P', 'C', 'PL', 'CL', 'CJ', 'CJL']) console.log(`  ${k}  ${f(out.fCasesTally[k])}`);
console.log(`all Romanian cases of the three worlds (${out.cases})`);
for (const k of ['T', 'F', 'P', 'C', 'PL', 'CL', 'CJ', 'CJL']) console.log(`  ${k}  ${f(out.all[k])}`);
console.log(`newly wrong vs T: P ${out.newlyWrong.P.length}, C ${out.newlyWrong.C.length} (lenient ${out.newlyWrong.CL.length}), with the joiner guard ${out.newlyWrong.CJ.length} (lenient ${out.newlyWrong.CJL.length}), F ${out.newlyWrong.F.length}; right on T but not on C: ${out.lostRight.length}; English cases changed by the pack: ${enChanged.length} of ${enCases.length}`);
for (const r of out.newlyWrong.CL.slice(0, 20)) console.log(`  C wrong: [${r.world}] ${r.message}  (T ${r.T})  ${r.reply ?? ''}`);
