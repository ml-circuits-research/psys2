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
const namesATab =(text) => { const w = ` ${text.toLowerCase().match(/[a-z0-9]+/g)?.join(' ') ?? ''} `; return tabIds.some((n) => w.includes(` ${n.toLowerCase()} `)); };

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
      assert.match(r.text, /(zork|fork) the plimp/, 'the part that was not understood is named (as typed, or as the suspect-word leniency spelled it: nothing was executed either way)');
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

  // 5. undo and redo count only the requests that change something: a question between a change and its undo is not a step (reviewer 2026-11-13 20:55, cause 4)
  test(`${reasoner}: a question is not a step of undo and redo`, async () => {
    for (const [tab, change, question] of [['robot', 'put on earrings', 'what hats are there?'], ['draw', 'draw a house', 'what is the sky color?']]) {
      const s = fresh(tab);
      await s.send(change);
      const q = await s.send(question);
      assert.ok(q.text?.trim());
      await s.send('undo');
      const redo = (await s.send('redo')).text;
      assert.doesNotMatch(redo, new RegExp(question.replace(/[?]/g, '').split(' ').slice(0, 3).join(' '), 'i'), `${tab}: redo must not quote the question (${redo})`);
      assert.match(redo, /did it again|redo|again/i, `${tab}: redo answers (${redo})`);
    }
  });

  // 4. the replying world is the active world unless the message names a world, or the thing it names is found elsewhere (worker-tasks 2026-11-13 20:55, cause 2):
  //    a refusal ("I can't find the hat in the picture") from a world that the message does not name, while the world of the open tab has the same ACT (remove, add,
  //    change ...), is a wrong-world answer: the act belongs to the world on the screen, which answers ("I have no X"). The tab did not change, which is why the
  //    invariant above (no tab change) never saw it: (c) looked at the tab, not at the world that replied.
  test(`${reasoner}: the world that answers is the world of the open tab unless the message names a world (no refusal of another world for an act the tab has)`, async () => {
    const actOf = (a) => String(a ?? '').split('.').pop();
    const actsOf = (w) => new Set((engine.set.get(w)?.patterns ?? []).map((p) => /action=([\w.]+)/.exec(p.emit ?? '')?.[1]).filter(Boolean).map(actOf));
    const FREE = new Set(['ui.shell', 'ui.help', 'kids.common', 'lang.common', 'core']);
    const wrong = [];
    const probes = ['robot', 'draw', 'editor', 'diagram'].flatMap((tab) => ['remove the hat', 'remove the unicorn', 'delete eyeglasses'].map((text) => ({ tab, text })));
    // generic nouns of a schema kind and a named thing, the sentences the coverage grid generates (a capture seen by the grid, 2026-11-14: a world without the tab answered "take apart the thing" in the draw tab)
    probes.push(...[['draw', 'take apart the thing'], ['draw', 'remove the thing from the thing 1'], ['charts', 'change the point Zed the same size as the red'], ['charts', 'remove the point Zed'], ['robot', 'take apart the thing'], ['diagram', 'remove the thing from the thing 1']].map(([tab, text]) => ({ tab, text })));
    for (const r of [...swept.filter((x) => x.lang !== 'ro'), ...probes]) {
      const s = fresh(r.tab), T = s.context().tabWorld;
      if (!T) continue;
      const reply = await s.send(r.text);
      if (s.state()['ui.shell']?.activeTab !== r.tab) continue;   // the tab changed: that is the other invariant
      const mine = actsOf(T), words = new Set(r.text.toLowerCase().match(/[a-z0-9]+/g));
      (reply.wires ?? []).forEach((w, i) => {
        const W = w.entries?.find((e) => e.key === 'core.in')?.value?.v, action = w.entries?.find((e) => e.key === 'core.request.action')?.value?.v;
        if (!W || W === T || FREE.has(W) || !['unsupported', 'missing'].includes(reply.statuses?.[i]) || !action || !mine.has(actOf(action))) return;
        if ([...words].some((x) => W.split('.').includes(x))) return;   // the message names the world
        wrong.push(`${r.tab}: ${r.text} -> ${W}`);
      });
    }
    assert.deepEqual(wrong, [], 'refusals of a world that is not the open tab, for an act the open tab has');
  });
}
