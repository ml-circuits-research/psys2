#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Converts the diagram-vss-demo engine (imports/diagram-vss-demo/engine/, CommonJS / UMD, commit 9900d34, AGPL-3.0) into browser-safe ES modules in
// worlds/diagram.sketch/engine/. A mechanical wrap, no logic change: each file keeps its original text and gets a provenance header; the three
// files the engine used to find through require() / globals (auto-layout, templates, and the help answers, which we leave out) are imported.
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

async function wrapUmd(file, out) {
  const text = await readFile(path.join(SRC, file), 'utf8');
  await writeFile(path.join(OUT, out), `${HEADER(file)}const module = { exports: {} };\n${text}\nexport default module.exports;\n`);
}

await mkdir(OUT, { recursive: true });
await wrapUmd('auto-layout.js', 'auto-layout.mjs');
await wrapUmd('templates.js', 'templates.mjs');

let logic = await readFile(path.join(SRC, 'logic.js'), 'utf8');
const rep = (a, b) => { if (!logic.includes(a)) throw new Error(`logic.js: pattern not found: ${a.slice(0, 60)}`); logic = logic.replace(a, b); };
rep("const autoLayout = () => (typeof AutoLayout !== 'undefined' ? AutoLayout : null) || optRequire('./auto-layout.js');", 'const autoLayout = () => AutoLayoutModule;');
rep("const templateKit = () => (typeof TemplateKit !== 'undefined' ? TemplateKit : null) || optRequire('./templates.js');", 'const templateKit = () => TemplateKitModule;');
rep("const helpAnswers = () => (typeof HelpAnswers !== 'undefined' ? HelpAnswers : null) || optRequire('./help-answers.js');", 'const helpAnswers = () => null;   // the help answers are not part of this world (ui.help answers help questions)');
rep("if (typeof module !== 'undefined') module.exports = SOPKit;", '');
await writeFile(path.join(OUT, 'logic.mjs'), `${HEADER('logic.js')}import AutoLayoutModule from './auto-layout.mjs';\nimport TemplateKitModule from './templates.mjs';\n${logic}\nexport default SOPKit;\n`);
console.log('diagram engine converted to', path.relative(REPO, OUT));
