// SPDX-License-Identifier: AGPL-3.0-only
// The files the loop guard scans (tests/loop-guard.test.mjs, scripts/loop-violations.mjs, scripts/audit-bounded.mjs).
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith('.mjs')) out.push(full);
  }
  return out;
}

export function targets() {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'docs/webchat/ui'))];
  // every module of every world except generated test data (datagen), vendored code and the converted diagram engine (its loops get ticks from
  // scripts/convert-diagram-engine.mjs; the last test below checks they are there)
  for (const f of walk(path.join(ROOT, 'worlds'))) {
    const rel = path.relative(path.join(ROOT, 'worlds'), f).split(path.sep);
    if (rel.at(-1) === 'datagen.mjs' || rel.includes('vendor') || rel.includes('engine')) continue;
    files.push(f);
  }
  return files;
}

