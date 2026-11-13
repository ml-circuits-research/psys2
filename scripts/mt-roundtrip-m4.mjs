#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * M4 round trip (spec 06 "Translation chosen by understanding"): the quality number of a language with the input path the app really has.
 * The English operational sample (every 6th case of training/eval/operational.jsonl) is translated English -> X by the on-device model; the foreign text is then
 *   old  read as the old round trip did: the model's X -> English alone, the English read by the engine (what quality.json held), and
 *   m4   SENT to a session in language X: the candidates (on-device model, rules of the language pack where one exists, one repaired) are chosen by understanding.
 * No browser Translator exists in Node, so this is the situation of Firefox / Safari / Chrome on Android. One JSON line per case and language
 * (the case, the foreign text, both readings), and a summary per language on stdout.
 *
 *   node scripts/mt-roundtrip-m4.mjs --cache <dir> --lang fr,de [--every 6] [--shard i/n] [--out file.jsonl] [--summary file.json]
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createNodeMt, loadRegistry } from './lib/mt-node.mjs';
import { keepListOf } from '../src/translate/keep-list.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const registry = loadRegistry();
let langs = arg('lang') ? arg('lang').split(',') : Object.keys(registry.langs);
if (arg('shard')) { const [i, n] = arg('shard').split('/').map(Number); langs = langs.filter((_, k) => k % n === i); }
const sample = loadCases(join(REPO, 'training/eval/operational.jsonl')).filter((_, k) => k % Number(arg('every', 6)) === 0);
const settings = settingsForMode('rules');
let mt = null;   // created after the engine: the keep-list (app words the model must not change: currency, names, tab names) comes from the loaded worlds, as in the engine worker
const backend = {
  translatorKind: () => 'mt', nativeKind: () => null, detectorKind: () => null, supports: () => true,
  sources: async () => ['model'],
  translate: (t, f, to) => mt.translate(t, f, to),
  detect: async () => { throw new Error('none'); },
};
const translator = createSwitchTranslator({ rules: createTranslator(), getStrategy: () => 'auto', backend });
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
mt = await createNodeMt({ cacheDir: arg('cache'), keep: () => ({ keep: keepListOf(engine.set) }) });
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const tally = (rows) => ({ n: rows.length, right: pct(rows.filter((o) => o === 'right').length, rows.length), wrong: pct(rows.filter((o) => o === 'wrong').length, rows.length), notUnderstood: pct(rows.filter((o) => o === 'not_understood').length, rows.length) });

const baseline = [];
for (const c of sample) baseline.push((await runCase(engine, settings, c)).outcome);
const summary = { reasoner, sample: sample.length, englishRight: tally(baseline).right, languages: {} };
const outFile = arg('out');
if (outFile) writeFileSync(outFile, '');
for (const lang of langs) {
  try {
    await mt.ensure(lang);
    const oldRows = [], newRows = [];
    for (const c of sample) {
      const foreign = await mt.translate(c.message, 'en', lang);
      const back = await mt.translate(foreign, lang, 'en');
      const o = await runCase(engine, settings, { ...c, message: back });
      const n = await runCase(engine, settings, { ...c, message: foreign, sendLanguage: lang });
      oldRows.push(o.outcome); newRows.push(n.outcome);
      if (outFile) appendFileSync(outFile, JSON.stringify({ id: c.id, world: c.world, lang, original: c.message, foreign, back_translation: back,
        old: { verdict: o.outcome, reply: o.reply, failing: o.failing }, m4: { verdict: n.outcome, reply: n.reply, failing: n.failing, via: n.via, english: n.english, error: n.error }, original_verdict: baseline[sample.indexOf(c)], expect: c.expect,
        ...(c.setup?.length ? { setup: c.setup } : {}), ...(c.tab ? { tab: c.tab } : {}), ...(c.init ? { init: c.init } : {}) }) + '\n');
    }
    summary.languages[lang] = { old: tally(oldRows), m4: tally(newRows) };
    console.error(`${lang}: old ${summary.languages[lang].old.right} % -> m4 ${summary.languages[lang].m4.right} %`);
  } catch (e) { summary.languages[lang] = { error: String(e?.message ?? e) }; console.error(`${lang}: ERROR ${e?.message ?? e}`); }
  mt.reset();
}
if (arg('summary')) writeFileSync(arg('summary'), JSON.stringify(summary, null, 1));
else console.log(JSON.stringify(summary));
process.exit(0);
