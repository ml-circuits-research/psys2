// SPDX-License-Identifier: AGPL-3.0-only
// The source rules reader of diagram-vss-demo (imports/diagram-vss-demo/engine/logic.js, createSystem().formalize), loaded untouched from its CommonJS text.
// Used by the parity measurement of scripts/eval-diagram.mjs (DIAG3 item 6): the same rows are read by the source and by the world diagram.sketch.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../imports/diagram-vss-demo/engine');
const cache = new Map();
function load(name) {
  const f = join(DIR, String(name).replace(/^\.\//, ''));
  if (cache.has(f)) return cache.get(f).exports;
  const module = { exports: {} };
  cache.set(f, module);
  new Function('module', 'exports', 'require', readFileSync(f, 'utf8'))(module, module.exports, (n) => load(n));
  return module.exports;
}
/** A fresh source system: { formalize(text, ctx), world, engine }. */
export const createSourceSystem = () => load('logic.js').createSystem();
