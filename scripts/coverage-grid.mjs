#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// A5 (spec 21): the coverage grid. For every schema world (a directory with schema.sop under tests/fixtures/worlds and worlds-pilot) sentences are GENERATED from the verbs of k.actions
// (the act phrases) x the kinds and attributes of the schema x the values of the schema (colour words), by expanding every form the world has; each sentence is said in the world's tab
// in BOTH reasoners, after the world has been given a few things to act on. A cell is judged by what happened, not by "read": a changing act must change the state of the world
// (`state`), a question must be answered with something that is not a refusal (`answer`), the others must not be refused (`reply`); otherwise it is a hole (`miss`).
//   node scripts/coverage-grid.mjs [--json docs/webchat/coverage-grid.json] [--per-act 4]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as A from '../worlds/acts/acts.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const perAct = Number(arg('per-act', 4));
const roots = [path.join(REPO, 'worlds-pilot'), path.join(REPO, 'tests/fixtures/worlds')].filter(existsSync);
const worlds = roots.flatMap((r) => readdirSync(r).filter((d) => existsSync(path.join(r, d, 'schema.sop'))).map((d) => ({ id: d, dir: path.join(r, d) })));
const tabOf = { 'ui.avatar': 'robot', 'diagram.sketch': 'diagram' };
const CHANGES = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'copy', 'load']);
const REFUSAL = /did not understand|did not catch|I can't find|I cannot|There is no|Where should it go|Your picture is empty|not sure how|I do not know|Something went wrong|nothing to/i;
const SAMPLE = { make: 'make', remove: 'remove', set: 'change', place: 'place', connect: 'connect', group: 'group', apart: 'group', pick: 'pick', copy: 'copy', send: 'send', save: 'save', load: 'load' };
const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);

/** One sentence from a form's match template: verb groups from k.actions, determiners "the", things from the schema, values from the schema. */
function expand(f, schema, verb, kind, attr, value) {
  const lab = kind.numbered ? `${kind.name} 1` : kind.named ? `${kind.name} Zed` : kind.name;
  let t = f.match;
  t = t.replace(/\bL\b/g, '').replace(/\bD\b/g, 'the').replace(/\bV\.\w+/g, verb.replace(/_/g, ' '))
    .replace(/\{thing:\w+\}/g, lab).replace(/\{(?:attribute):ATTR\}/g, attr?.name ?? 'colour').replace(/\{value:(?:VALUE|MORE|LESS|words|rest)\}/g, value)
    .replace(/\{amount:number\}/g, '2').replace(/\{rel:lex\.acts\.rel\}/g, 'at').replace(/\{rel:lex\.acts\.dir\}/g, 'apart').replace(/\{rel:lex\.acts\.layout\}/g, 'horizontally')
    .replace(/\{place:\w+\}/g, `${schema.kinds[kind.in]?.name ?? kind.name} 1`).replace(/\{rest:\w+\}/g, `${lab} blue`);
  t = t.replace(/\[([^\]]*)\]\?/g, '').replace(/\[([^\]|]*)(?:\|[^\]]*)?\]/g, '$1').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : null;
}

const out = { generated: new Date().toISOString(), judged: 'by the state difference of the world (changing acts), by a non-refusal answer (questions)', worlds: [] };
for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [...roots, DEFAULT_ROOT] }), options: { reasoner } });
  for (const w of worlds) {
    const schema = A.parseSchema(parse(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8')).wires);
    let rec = out.worlds.find((x) => x.id === w.id);
    const kinds = Object.values(schema.kinds), colours = Object.values(schema.attrs).find((a) => a.type === 'colour');
    if (!rec) {
      out.worlds.push(rec = { id: w.id, cells: [] });
      const seen = new Set();
      for (const f of A.formsFor(schema)) {
        const act = f.act, spec = A.ACTS[act];
        if (!spec || ['undo', 'redo', 'save', 'load', 'send'].includes(act)) continue;
        const verbKey = /\bV\.(\w+)/.exec(f.match)?.[1];
        const verbs = verbKey ? (A.ACT_VERBS[verbKey] ?? []).filter((v) => !v.includes('_') || v.split('_').length < 3).slice(0, perAct) : [null];
        for (const kind of kinds.filter((k) => !k.any || true).slice(0, 3)) for (const verb of verbs) {
          const attr = Object.values(schema.attrs).find((a) => a.of.includes(kind.name));
          const text = expand(f, schema, verb ?? '', kind, attr, colours ? 'red' : 'ok');
          if (!text || seen.has(text)) continue;
          seen.add(text);
          rec.cells.push({ act, mode: f.mode ?? null, form: f.id, verb, kind: kind.name, text });
        }
      }
    }
    for (const c of rec.cells) {
      const s = engine.createSession({ language: 'en' });
      if (tabOf[w.id]) s.setWorldState('ui.shell', { activeTab: tabOf[w.id] });
      // something to act on
      const kind = kinds[0];
      for (const set of [`Add a ${kind.name}.`, `Add a ${kind.name}.`]) await s.send(set);
      const before = hash(s.state(w.id));
      const r = await s.send(c.text);
      const changed = hash(s.state(w.id)) !== before;
      const refused = REFUSAL.test(r.text);
      const verdict = CHANGES.has(c.act) ? (changed ? 'state' : 'miss') : c.act === 'ask' ? (r.text.trim() && !refused ? 'answer' : 'miss') : (!refused ? 'reply' : 'miss');
      c[reasoner] = verdict; c[`${reasoner}Reply`] = r.text.slice(0, 100);
    }
  }
}
for (const w of out.worlds) { w.total = w.cells.length; w.holes = w.cells.filter((c) => c.ops === 'miss' || c.matrix === 'miss').length; }
if (arg('json')) writeFileSync(path.resolve(REPO, arg('json')), `${JSON.stringify(out)}\n`);
const byAct = {};
for (const w of out.worlds) for (const c of w.cells) { const k = `${w.id} ${c.act}`; (byAct[k] ??= { n: 0, miss: 0 }); byAct[k].n++; if (c.ops === 'miss' || c.matrix === 'miss') byAct[k].miss++; }
console.log('| world act | sentences | holes |\n| --- | --- | --- |');
for (const [k, v] of Object.entries(byAct)) console.log(`| ${k} | ${v.n} | ${v.miss} |`);
console.log(out.worlds.map((w) => `${w.id}: ${w.total - w.holes}/${w.total} judged by state or answer, ${w.holes} holes`).join('\n'));
