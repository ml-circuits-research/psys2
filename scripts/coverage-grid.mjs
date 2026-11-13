#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// A5 (spec 21): the coverage grid. For every schema world (a directory with schema.sop under tests/fixtures/worlds and worlds-pilot) the sentences of `sentences(schema)`
// (one per act x kind, built from the forms) are said in the world's tab, in BOTH reasoners; a cell is `read` when the world answered with an act reply (not the engine's
// "did not understand", not the graded fallback's question), `asked` when the graded fallback answered, `missed` otherwise. The holes are the feature list.
//   node scripts/coverage-grid.mjs [--json docs/webchat/coverage-grid.json] [--md]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as A from '../worlds/acts/acts.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const roots = [path.join(REPO, 'worlds-pilot'), path.join(REPO, 'tests/fixtures/worlds')].filter(existsSync);
const worlds = roots.flatMap((r) => readdirSync(r).filter((d) => existsSync(path.join(r, d, 'schema.sop'))).map((d) => ({ id: d, dir: path.join(r, d) })));
const tabOf = { 'ui.avatar': 'robot', 'diagram.sketch': 'diagram' };
const classify = (text) => (/did not understand|I did not catch|Where should it go|Your picture is empty/i.test(text) ? 'missed' : /\?\s*$|Shall I|Which one|What should/i.test(text) ? 'asked' : 'read');

const out = { generated: new Date().toISOString(), worlds: [] };
for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [...roots, DEFAULT_ROOT] }), options: { reasoner } });
  for (const w of worlds) {
    const schema = A.parseSchema(parse(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8')).wires);
    let rec = out.worlds.find((x) => x.id === w.id);
    if (!rec) out.worlds.push(rec = { id: w.id, forms: A.formsFor(schema).length, cells: [] });
    const s = engine.createSession({ language: 'en' });
    if (tabOf[w.id]) s.setWorldState('ui.shell', { activeTab: tabOf[w.id] });
    for (const c of A.sentences(schema)) {
      const r = await s.send(c.text);
      const cell = rec.cells.find((x) => x.text === c.text) ?? (rec.cells.push({ act: c.act, kind: c.kind, text: c.text }), rec.cells.at(-1));
      cell[reasoner] = classify(r.text);
      cell[`${reasoner}Reply`] = r.text.slice(0, 120);
    }
  }
}
for (const w of out.worlds) { w.holes = w.cells.filter((c) => c.ops !== 'read' || c.matrix !== 'read').length; w.total = w.cells.length; }
if (arg('json')) writeFileSync(path.resolve(REPO, arg('json')), `${JSON.stringify(out)}\n`);
const lines = ['| world | act | kind | sentence | ops | matrix |', '| --- | --- | --- | --- | --- | --- |'];
for (const w of out.worlds) for (const c of w.cells) lines.push(`| ${w.id} | ${c.act} | ${c.kind} | ${c.text} | ${c.ops} | ${c.matrix} |`);
console.log(lines.join('\n'));
console.log(out.worlds.map((w) => `${w.id}: ${w.total - w.holes}/${w.total} read in both reasoners, ${w.holes} holes`).join('\n'));
