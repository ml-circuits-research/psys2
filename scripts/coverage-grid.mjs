#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// A5 (spec 21), version 3 (2026-11-14, RANDOM as a world, spec 25). The cells of the grid are no longer produced by a generator of our own (forms x verbs x kinds, with placeholders and
// nonsense combinations): they are WALKS of sopworld std.sample, the sampler of the dice. For every schema world a session with its tab open takes `--per` random commands, each legal in
// the state it was drawn in (the library's dry run) and read back; the cell's setup is the walk before it.
// Each command is said in BOTH reasoners. A cell is judged by what happened: a changing act must change the state of the world (`state`), a question must be answered with something that
// is not a refusal (`answer`), the others must not be refused (`reply`); otherwise it is a hole (`miss`). Holes are counted when the setup was confirmed; a reply of ANOTHER tab world is
// a cross-world capture, counted apart.
//   node scripts/coverage-grid.mjs [--json docs/webchat/coverage-grid.json] [--per 40] [--world <id>]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as A from '../worlds/acts/acts.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { engineSampler } from '../src/dialog/sampler.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const per = Number(arg('per', 40));
const only = arg('world', null);

const roots = [path.join(REPO, 'worlds-pilot')].filter(existsSync);   // the engine loads the real worlds (DEFAULT_ROOT) and the pilots; NOT the test fixtures: a fixture world (test.seating) has no tab and answered the sentences of the other tabs
// every schema world: the pilots and the real worlds with a schema.sop (the fixture seating world is left out: the real plan.seating reads the same sentences)
const scan = [path.join(REPO, 'worlds-pilot'), path.join(REPO, 'worlds')].filter(existsSync);
// declaration-only schemas (declare=yes) are in the grid when the sampler serves them and a reply can be judged: not user.profile (its questions are about stored data: on an empty profile the honest answer is "I do not know yet", which the refusal test reads as a miss)
const NOT_JUDGEABLE = new Set(['user.profile']);
const worlds = scan.flatMap((r) => readdirSync(r).filter((d) => existsSync(path.join(r, d, 'schema.sop')) && d !== 'test.seating' && d !== 'acts' && !NOT_JUDGEABLE.has(d) && (!only || d === only)).map((d) => ({ id: d, dir: path.join(r, d) })));
const TAB_OVERRIDE = { 'docs.editor': 'editor', 'ui.avatar': 'robot' };   // worlds whose tab is declared by the host, not by world.sop
const tabWorlds = new Set();   // every world that owns a tab: a reply of one of them to the sentence of another is a cross-world capture
for (const r of [path.join(REPO, 'worlds'), path.join(REPO, 'worlds-pilot')].filter(existsSync)) for (const d of readdirSync(r)) { const f = path.join(r, d, 'world.sop'); if (existsSync(f) && (/^\s*tab=\S+/m.test(readFileSync(f, 'utf8')) || TAB_OVERRIDE[d])) tabWorlds.add(d); }
const tabOf = Object.fromEntries(worlds.map((w) => [w.id, TAB_OVERRIDE[w.id] ?? /^\s*tab=(\S+)/m.exec(readFileSync(path.join(w.dir, 'world.sop'), 'utf8'))?.[1]]).filter(([, t]) => t));
const CHANGES = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'copy', 'load']);
const REFUSAL = /did not understand|did not catch|I can't find|I can not find|I cannot|There is no|Where should it go|Your picture is empty|not sure how|I do not know|Something went wrong|nothing to/i;
const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const NAMES = ['Zed', 'Yan', 'Xia'];

// ---- the cells: sopworld std.sample, the same sampler as the dice (spec 25) --------------------------------------------------------------------------------
// The old generator (forms x verbs x kinds, with its own placeholders and nonsense combinations) is gone. A world's cells are a WALK of the sampler: press the dice `--per` times in a
// session of the world with its tab open; every cell is a command the library found legal in the state it was in, rendered and judged like the rest. The setup of a cell is the walk
// before it (replayed in each reasoner), so a cell is only judged in the state it was drawn in.
async function walkCells(engineW, w, per) {
  const s = engineW.createSession({ language: 'en' });
  if (tabOf[w.id]) s.setWorldState('ui.shell', { activeTab: tabOf[w.id] });
  const sm = engineSampler(lib, engineW, () => s);
  const declared = /^\s*declare=yes/m.test(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8'));   // a declaration-only schema (declare=yes): the sentences are whole requests of the world's own reader, judged by a non-refusal reply (a question stores nothing)
  const cells = [], done = [];
  for (let i = 0; i < per; i++) {
    const x = sm.dice({ worldId: w.id, seed: 7000 + i });
    if (!x) continue;
    const before = hash(s.state(w.id));
    const r = await s.send(x.text);
    const changed = hash(s.state(w.id)) !== before;
    cells.push({ act: x.frame.action, mode: null, form: 'sample', verb: null, kind: x.frame.args?.kind ?? null, noun: x.frame.args?.kind ?? x.frame.args?.thing ?? null, text: x.text, judge: declared ? 'reply' : null, setup: done.map((t) => ({ text: t, best: true })) });
    if (changed || !REFUSAL.test(r.text)) done.push(x.text);
  }
  return cells;
}
const walker = await createEngine({ loader: createFsLoader({ roots: [...roots, DEFAULT_ROOT] }), options: { reasoner: 'ops' } });

// ---- run -----------------------------------------------------------------------------------------------------------------------------------------------------
const previous = (() => {
  const f = path.join(REPO, 'docs/webchat/coverage-grid.json');
  if (!existsSync(f)) return null;
  const g = JSON.parse(readFileSync(f, 'utf8'));
  if (g.version >= 2) return g.previous ?? null;
  return { generated: g.generated, worlds: g.worlds.map((w) => ({ id: w.id, total: w.cells.length, holes: w.cells.filter((c) => c.ops === 'miss' || c.matrix === 'miss').length })) };
})();
const out = { version: 3, generated: new Date().toISOString(), judged: 'by the state difference of the world (changing acts), by a non-refusal answer (questions); cells are walks of sopworld std.sample (spec 25), holes counted when the setup was confirmed', previous, worlds: [] };
const worldsOf = (r) => [...new Set((r.segments ?? []).map((x) => x.match?.worldId ?? x.world).filter(Boolean))];
for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [...roots, DEFAULT_ROOT] }), options: { reasoner } });
  for (const w of worlds) {
    const schema = A.parseSchema(parse(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8')).wires);
    let rec = out.worlds.find((x) => x.id === w.id);
    if (!rec) {
      const cells = await walkCells(walker, w, per);
      out.worlds.push(rec = { id: w.id, tab: tabOf[w.id] ?? null, cells, generatorErrors: [], skipped: {} });
    }
    for (const c of rec.cells) {
      const s = engine.createSession({ language: 'en' });
      if (tabOf[w.id]) s.setWorldState('ui.shell', { activeTab: tabOf[w.id] });
      let confirmed = true;
      for (const st of c.setup) {   // a refused setup that changed nothing leaves the cell unconfirmed (a container that is simply there does not count)
        const b = hash(s.state(w.id));
        const r = await s.send(st.text);
        // confirmed: the state changed, or the reply is a plain statement (the thing is there already); a refusal or a question ("What should I add?") that changed nothing leaves the cell unconfirmed
        const ok = hash(s.state(w.id)) !== b || (!REFUSAL.test(r.text) && !/\?/.test(r.text));
        if (!ok && !st.best) confirmed = false;
      }
      const before = hash(s.state(w.id));
      const r = await s.send(c.text);
      const changed = hash(s.state(w.id)) !== before;
      const NOT_READ = /did not understand|did not catch|cannot talk about that|Something went wrong/i;   // a declared world's request is judged by being read: "There is no U" is a true answer of hangman, not a refusal
      const refused = c.judge === 'reply' ? NOT_READ.test(r.text) : REFUSAL.test(r.text);
      const verdict = c.judge === 'reply' ? (!refused ? 'reply' : 'miss')
        : CHANGES.has(c.act) ? (changed ? 'state' : 'miss') : c.act === 'ask' ? (r.text.trim() && !refused ? 'answer' : 'miss') : (!refused ? 'reply' : 'miss');
      c[reasoner] = verdict; c[`${reasoner}Reply`] = r.text.slice(0, 100); c[`${reasoner}Setup`] = confirmed;
      const wo = worldsOf(r).filter((x) => x !== w.id && tabWorlds.has(x));
      if (wo.length) c[`${reasoner}Capture`] = wo[0];
    }
  }
}
for (const w of out.worlds) {
  w.total = w.cells.length;
  const miss = (c) => c.ops === 'miss' || c.matrix === 'miss';
  const conf = (c) => c.opsSetup !== false && c.matrixSetup !== false;
  w.holes = w.cells.filter((c) => miss(c) && conf(c)).length;
  w.unconfirmed = w.cells.filter((c) => miss(c) && !conf(c)).length;
  w.captures = w.cells.filter((c) => c.opsCapture || c.matrixCapture).length;
  w.generatorErrorCount = w.generatorErrors.length;
}
if (arg('json')) writeFileSync(path.resolve(REPO, arg('json')), `${JSON.stringify(out)}\n`);
const byAct = {};
for (const w of out.worlds) for (const c of w.cells) { const k = `${w.id} ${c.act}`; (byAct[k] ??= { n: 0, miss: 0 }); byAct[k].n++; if ((c.ops === 'miss' || c.matrix === 'miss') && c.opsSetup !== false && c.matrixSetup !== false) byAct[k].miss++; }
console.log('| world act | sentences | holes |\n| --- | --- | --- |');
for (const [k, v] of Object.entries(byAct)) console.log(`| ${k} | ${v.n} | ${v.miss} |`);
console.log(out.worlds.map((w) => `${w.id}: ${w.total - w.holes - w.unconfirmed}/${w.total} judged by state or answer, ${w.holes} holes, ${w.unconfirmed} holes with setup unconfirmed, ${w.captures} captures, ${w.generatorErrorCount} generator errors, ${Object.values(w.skipped).reduce((a, n) => a + n, 0)} forms skipped`).join('\n'));
if (previous) console.log(`\nbefore (grid v1, ${previous.generated?.slice(0, 10)}): ${previous.worlds.map((w) => `${w.id} ${w.holes}/${w.total}`).join(', ')}`);
