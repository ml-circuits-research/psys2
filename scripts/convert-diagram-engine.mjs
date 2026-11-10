#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Converts the diagram-vss-demo engine (imports/diagram-vss-demo/engine/, CommonJS / UMD, commit 9900d34, AGPL-3.0) into browser-safe ES modules in
// worlds/diagram.sketch/engine/. A mechanical wrap, no logic change: each file keeps its original text and gets a provenance header; the three
// files the engine used to find through require() / globals (auto-layout, templates, and the help answers, which we leave out) are imported.
// One addition, so that the engine cannot run away (spec 06 "Compute budgets"): BUDGET_PATCHES inserts `budget.tick(site, n)` calls into the layout,
// solver, path-search and name-search loops. They are no-ops outside a turn; nothing else changes. tests/loop-guard.test.mjs checks the ticks are there.
//   node scripts/convert-diagram-engine.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(REPO, 'imports/diagram-vss-demo/engine');
const OUT = path.join(REPO, 'worlds/diagram.sketch/engine');
const HEADER = (f) => `// SPDX-License-Identifier: AGPL-3.0-only
// Source: https://github.com/ml-circuits-research/diagram-vss-demo, commit 9900d34836bf3fc913a6549f3da4c444bfa11304, docs/js/${f} (AGPL-3.0).
// Converted to an ES module by scripts/convert-diagram-engine.mjs (mechanical wrap; see imports/diagram-vss-demo/PROVENANCE.md). Do not edit by hand.
`;

const SHIM = "const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (no-op outside a turn)\n";
/** [old, new] pairs per source file; each `old` must occur exactly once. */
const BUDGET_PATCHES = {
  'auto-layout.js': [
    ['  for (; pass < 120; pass++) {\n', "  for (; pass < 120; pass++) {\n    budget.tick('diagram.layout', 1 + ns.length * ns.length);\n"],
    ['  for (let it = 0; it < iters; it++) {\n', "  for (let it = 0; it < iters; it++) {\n    budget.tick('diagram.layout', 1 + n * n);\n"],
    ['  for (let pass = 0; pass < passes; pass++) {\n    let improved = false;', "  for (let pass = 0; pass < passes; pass++) {\n    budget.tick('diagram.layout', 1 + list.length * K);\n    let improved = false;"],
    ['function rawLayout(ctx, k, dir, o) {\n', "function rawLayout(ctx, k, dir, o) {\n  budget.tick('diagram.layout', 1 + ctx.work.length);\n"],
    ['while (ready.length) { const v = ready.shift();', "while (ready.length) { budget.tick('diagram.layout'); const v = ready.shift();"],
    ['while (q.length) { const v = q.shift(); for (const w of G.und[v]) if (!seen.has(w)) { seen.add(w); parent[w] = v;', "while (q.length) { budget.tick('diagram.layout'); const v = q.shift(); for (const w of G.und[v]) if (!seen.has(w)) { seen.add(w); parent[w] = v;"],
    ['while (q.length) { const v = q.shift(); const nb =', "while (q.length) { budget.tick('diagram.layout'); const v = q.shift(); const nb ="],
    ['    while (stack.length) {\n', "    while (stack.length) {\n      budget.tick('diagram.layout');\n"],
  ],
  'templates.js': [
    ['      while (i < count) {\n', "      while (i < count) {\n        budget.tick('diagram.layout');\n"],
    ['    const c = new Build(T, P, k); T.build(c, c.heading(box));', "    budget.tick('diagram.layout'); const c = new Build(T, P, k); T.build(c, c.heading(box));"],
  ],
  'logic.js': [
    ['  function* solve(body, i, bind) {\n', "  function* solve(body, i, bind) {\n    budget.tick('diagram.solve');\n"],
    ['  while (changed && iter++ < 500) {\n', "  while (changed && iter++ < 500) {\n    budget.tick('diagram.solve', 1 + db.size);\n"],
    ['    const n = q.shift(); if (n === to) break;', "    const n = q.shift(); budget.tick('diagram.path', 1 + W.state.edges.length); if (n === to) break;"],
    ['nextName(shape) { let n; do { this.state.seq', "nextName(shape) { let n; do { budget.tick('diagram.name'); this.state.seq"],
    ['while (W.find(n) || W.findGroup(n)) n = base.replace(', "while ((budget.tick('diagram.name'), W.find(n) || W.findGroup(n))) n = base.replace("],
    ['while (W.find(nm) || W.findGroup(nm)) nm = base + (++i);', "while ((budget.tick('diagram.name'), W.find(nm) || W.findGroup(nm))) nm = base + (++i);"],
    ['    for (;;) {\n      const rest = left.map(', "    for (;;) {\n      budget.tick('diagram.words');\n      const rest = left.map("],
    ['      while ((m = cue.exec(t))) {', '      for (const m of t.matchAll(cue)) {   // matchAll: a regex loop with exec() can spin on an empty match (loop guard)'],
  ],
};
function budgeted(file, text) {
  for (const [a, b] of BUDGET_PATCHES[file] ?? []) {
    if (text.split(a).length !== 2) throw new Error(`${file}: budget patch anchor must occur once: ${a.slice(0, 60)}`);
    text = text.replace(a, () => b);
  }
  return text;
}

async function wrapUmd(file, out) {
  const text = budgeted(file, await readFile(path.join(SRC, file), 'utf8'));
  await writeFile(path.join(OUT, out), `${HEADER(file)}const module = { exports: {} };\n${SHIM}${text}\nexport default module.exports;\n`);
}

await mkdir(OUT, { recursive: true });
await wrapUmd('auto-layout.js', 'auto-layout.mjs');
await wrapUmd('templates.js', 'templates.mjs');

let logic = budgeted('logic.js', await readFile(path.join(SRC, 'logic.js'), 'utf8'));
const rep = (a, b) => { if (!logic.includes(a)) throw new Error(`logic.js: pattern not found: ${a.slice(0, 60)}`); logic = logic.replace(a, b); };
rep("const autoLayout = () => (typeof AutoLayout !== 'undefined' ? AutoLayout : null) || optRequire('./auto-layout.js');", 'const autoLayout = () => AutoLayoutModule;');
rep("const templateKit = () => (typeof TemplateKit !== 'undefined' ? TemplateKit : null) || optRequire('./templates.js');", 'const templateKit = () => TemplateKitModule;');
rep("const helpAnswers = () => (typeof HelpAnswers !== 'undefined' ? HelpAnswers : null) || optRequire('./help-answers.js');", 'const helpAnswers = () => null;   // the help answers are not part of this world (ui.help answers help questions)');
rep("if (typeof module !== 'undefined') module.exports = SOPKit;", '');
await writeFile(path.join(OUT, 'logic.mjs'), `${HEADER('logic.js')}import AutoLayoutModule from './auto-layout.mjs';\nimport TemplateKitModule from './templates.mjs';\n${SHIM}${logic}\nexport default SOPKit;\n`);
console.log('diagram engine converted to', path.relative(REPO, OUT));
