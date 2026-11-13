#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// M4 probe: sends foreign-language messages in a tab and prints the candidate Englishes and the choice.
//   node scripts/m4-try.mjs [--tab draw] [--lang ro] [--bergamot <cacheDir>] "text" ...
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
const args = process.argv.slice(2), opt = {}, texts = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else texts.push(args[i]); }
const lang = opt.lang ?? 'ro';
const rules = createTranslator();
let mt = null;
if (opt.bergamot) { const { createNodeMt } = await import('./lib/mt-node.mjs'); mt = await createNodeMt({ cacheDir: opt.bergamot }); await mt.ensure(lang); }
const backend = mt
  ? { translatorKind: () => 'mt', detectorKind: () => null, supports: () => true, sources: async () => ['model'], translate: (t, f, to) => mt.translate(t, f, to), detect: async () => { throw new Error('none'); } }
  : { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); } };
const translator = createSwitchTranslator({ rules, getStrategy: () => 'auto', backend });
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
s.setWorldState('ui.shell', { activeTab: opt.tab ?? 'draw' });
for (const t of texts) {
  const r = await s.send(t, { language: lang });
  console.log(`${t} => ${r.trace.english} | ${r.trace.via} | ${r.text.slice(0, 80)}`);
  console.log('   ', JSON.stringify(r.trace.candidates));
}
mt?.reset?.();
