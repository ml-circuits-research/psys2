// SPDX-License-Identifier: AGPL-3.0-only
// INVARIANTS of the demo (worker-tasks "NO POINT FIXES" and "WORLDS-AS-MODULES", Invariants), both reasoners. They hold for every message, in every language,
// so each test sweeps the real messages of the failure ledger's sources (the three owner logs) instead of listing phrases:
//   1. every turn gets a reply (rows 11 and 51 of owner-log-2026-11-13b got none: the rules translation of a negated sentence was empty and the empty English was read);
//   2. a sentence that is only partly understood runs nothing destructive: the reply names the understood part;
//   3. no reading changes the tab unless the message names that tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { SUITE } from './helpers.mjs';

const settings = settingsForMode('rules');
const logs = ['', 'b', 'c'].flatMap((sfx) => readFileSync(new URL(`../training/eval/owner-log-2026-11-13${sfx}.jsonl`, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.text && r.tab);
// smoke / fast: a deterministic third of the messages (the full suite sweeps all)
const swept = SUITE === 'full' ? logs : logs.filter((_, i) => i % 3 === 0);
const tabIds = [];
for (const d of readdirSync(DEFAULT_ROOT)) { try { const src = readFileSync(join(DEFAULT_ROOT, d, 'world.sop'), 'utf8'); const id = /^\s+tab=(\S+)\s*$/m.exec(src)?.[1]; const t = /^\s+tabTitle="?([^"\n]+)"?\s*$/m.exec(src)?.[1]; if (id) tabIds.push(id, ...(t ? [t.toLowerCase()] : [])); } catch { /* not a world */ } }
const namesATab = (text) => { const w = ` ${text.toLowerCase().match(/[a-z0-9]+/g)?.join(' ') ?? ''} `; return tabIds.some((n) => w.includes(` ${n.toLowerCase()} `)); };

for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
  const fresh = (tab, language = 'en') => { const s = engine.createSession(sessionOptions(settings, { language })); s.setWorldState('ui.shell', { activeTab: tab }); return s; };

  test(`${reasoner}: every turn gets a reply (all messages of the three owner logs, and bare punctuation)`, async () => {
    const silent = [];
    for (const r of swept) {
      const s = fresh(r.tab, r.lang === 'ro' ? 'ro' : 'en');
      const reply = await s.send(r.text, r.lang === 'ro' ? { language: 'ro' } : undefined);
      if (!reply.text?.trim()) silent.push(r.text);
    }
    for (const t of ['?', '...', '!!', 'nu inlocui lacul, deasupra, ai loc', 'muta vaca mai jos, sa nu mai zboare']) {
      const reply = await fresh('draw').send(t, /[a-z]{3}/.test(t) ? { language: 'ro' } : undefined);
      if (!reply.text?.trim()) silent.push(t);
    }
    assert.deepEqual(silent, [], 'turns without a reply');
  });

  test(`${reasoner}: a destructive clause next to a clause that is not understood does not run`, async () => {
    for (const destroy of ['clear everything', 'erase everything', 'wipe the canvas']) {
      const s = fresh('draw');
      await s.send('draw a red house'); await s.send('draw a tree');
      const before = JSON.stringify(s.state()['art.draw']);
      const r = await s.send(`${destroy} and zork the plimp`);
      assert.equal(JSON.stringify(s.state()['art.draw']), before, `${destroy}: nothing changed`);
      assert.match(r.text, new RegExp(`(understood|act on) "${destroy}"`), 'the understood part is named');
      assert.match(r.text, /zork the plimp/, 'the part that was not understood is named');
    }
  });

  test(`${reasoner}: no message changes the tab unless it names a tab (owner-log messages, and a loose why-question)`, async () => {
    const moved = [];
    for (const r of swept) {
      if (namesATab(r.text) || namesATab(r.english ?? '')) continue;
      const s = fresh(r.tab, r.lang === 'ro' ? 'ro' : 'en');
      const reply = await s.send(r.text, r.lang === 'ro' ? { language: 'ro' } : undefined);
      const after = s.state()['ui.shell']?.activeTab;
      // a clean reading of the whole sentence by a world with a tab ("draw a house" on another tab) brings that tab forward; a loose one (ignored words, a spelling guess, a clause not read) never does
      const loose = reply.segments.some((x) => x.unparsed || x.ignored?.length || x.partial || x.bestEffort || x.corrections?.length);
      if (after !== r.tab && loose) moved.push(`${r.tab}->${after}: ${r.text}`);
    }
    const s = fresh('draw'); await s.send('draw a sun'); await s.send('why is it so low');
    if (s.state()['ui.shell']?.activeTab !== 'draw') moved.push(`draw->${s.state()['ui.shell']?.activeTab}: why is it so low`);
    assert.deepEqual(moved, [], 'tab changes without a named tab');
  });
}
