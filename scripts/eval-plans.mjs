#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// PLANS FROM KNOWLEDGE: the 60 multi-step requests (scripts/plans-set.mjs) judged by the state of the live worlds, on a given checkout of this repository ("hand" = a checkout before the plan wiring,
// "plan" = this one), with the live catalog (PSYS2_KNOWLEDGE: the docs/worlds folder of sop-knowledge-worlds).
//   node scripts/eval-plans.mjs [--root <repo checkout>] [--reasoner ops|matrix] [--json out.json] [--verbose]
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.resolve(import.meta.dirname, '..');
const root = path.resolve(arg('--root', here));
const verbose = process.argv.includes('--verbose');
const reasoner = arg('--reasoner', 'ops');
const known = process.env.PSYS2_KNOWLEDGE;
if (!known) { console.error('PSYS2_KNOWLEDGE (the catalog docs/worlds folder) is not set'); process.exit(2); }
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { createFsLoader, DEFAULT_ROOT } = await imp('src/loaders/fs-loader.mjs');
const { createEngine } = await imp('src/dialog/index.mjs');
const { createFacts } = await imp('src/knowledge/facts.mjs');
const { createKnowledgeSource } = await imp('src/loaders/knowledge-source.mjs');
const { bbox } = await imp('worlds/art.draw/scene.mjs');
const { CASES } = await import(pathToFileURL(path.join(here, 'scripts/plans-set.mjs')).href);

const mk = async () => {
  const eng = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), ...(reasoner === 'matrix' ? { options: { reasoner: 'matrix' } } : {}) });
  eng.setKnowledge(createFacts({ source: createKnowledgeSource(known) }));
  return eng;
};
const eng = await mk();
const rows = [];
for (const c of CASES) {
  const s = eng.createSession({ language: 'en' });
  const said = [];
  let reply = '', before = [], after = [], t = 0;
  try {
    await s.send('open the drawing tab');
    s.setWorldState('ui.shell', { activeTab: 'draw' });   // the drawing tab is the open one, as in the app
    for (const l of c.say ?? []) said.push((await s.send(l)).text);
    before = structuredClone(s.state('art.draw')?.objects ?? []);
    t = performance.now();
    reply = (await s.send(c.ask)).text;
    t = Math.round(performance.now() - t);
    after = structuredClone(s.state('art.draw')?.objects ?? []);
  } catch (e) { reply = `ERROR ${e?.message ?? e}`; }
  const ids = new Set(before.map((o) => o.id));
  const r = { reply, before, after, drawn: after.filter((o) => !ids.has(o.id)), said };
  let ok = false;
  try { ok = !!c.ok(r, bbox); } catch (e) { ok = false; }
  rows.push({ id: c.id, group: c.group, ok, ms: t, reply: reply.slice(0, 200), added: r.drawn.length });
  if (verbose) console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(24)} ${String(t).padStart(5)} ms  +${r.drawn.length}  ${reply.slice(0, 140)}`);
}
const by = {};
for (const r of rows) { (by[r.group] ??= { n: 0, ok: 0 }); by[r.group].n++; if (r.ok) by[r.group].ok++; }
console.log(`${path.basename(root)} (${reasoner}): ${rows.filter((r) => r.ok).length}/${rows.length} right; ${Object.entries(by).map(([g, v]) => `${g} ${v.ok}/${v.n}`).join(', ')}`);
const out = arg('--json', null);
if (out) writeFileSync(out, JSON.stringify({ root, reasoner, rows }, null, 1));
