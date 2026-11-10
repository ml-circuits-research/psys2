#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Audit of `// bounded:` comments (spec 06 "Compute budgets"): node scripts/audit-bounded.mjs [--list]
// A bounded comment is a claim the scanner cannot check. This lists the comments that still excuse a loop (strict scan: the loop has no tick)
// and the comments that excuse nothing (the loop is statically fine or gone: delete them).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, strip } from './lib/loop-scan.mjs';
import { targets } from './lib/loop-targets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let total = 0, excusing = 0;
const lines = [];
for (const f of targets()) {
  const src = readFileSync(f, 'utf8');
  const cs = strip(src).comments.filter((c) => /bounded:/.test(c.text));
  total += cs.length;
  const used = new Set(scan(src).filter((x) => x.comment).map((x) => x.comment));
  for (const c of cs) {
    const kind = used.has(c.line) ? 'EXCUSES' : 'UNUSED ';
    if (used.has(c.line)) excusing++;
    lines.push(`${kind} ${path.relative(ROOT, f)}:${c.line}  ${c.text.slice(0, 110)}`);
  }
}
if (process.argv.includes('--list')) console.log(lines.join('\n'));
console.log(`bounded comments: ${total} (excusing a loop: ${excusing}, excusing nothing: ${total - excusing})`);
