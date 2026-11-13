#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Measures the failure-ledger classes place, relation, amount, distribute, default-place (and the owner-log class `space`) by replaying the logs they come from
// in context, and prints per ledger row the English reply, so that before / after a mechanism can be compared per class.
//   node scripts/measure-ledger-space.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay } from './eval-owner-log.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSES = /^(place|relation|amount|distribute|default-place|space|relation\+no-partial|kind-of\+relation|distribute\+typo)$/;
const LEDGER = join(REPO, 'training', 'eval', 'failures.jsonl');
const ledger = readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => CLASSES.test(r.class) && /owner-log-2026-11-13[bc]?#\d+/.test(r.source));
const out = [];
for (const sfx of ['', 'b', 'c']) {
  const rows = await replay({ log: join(REPO, 'training', 'eval', `owner-log-2026-11-13${sfx}.jsonl`), checks: '/nonexistent' });
  for (const l of ledger) {
    const m = /owner-log-2026-11-13([bc]?)#(\d+)/.exec(l.source);
    if (m[1] !== sfx) continue;
    const r = rows[Number(m[2])];
    out.push({ class: l.class, log: sfx || 'a', i: r.i, text: r.text, reply: r.reply, worlds: r.worlds, expected: l.expected });
  }
}
const by = {};
for (const r of out) (by[r.class] ??= []).push(r);
for (const [c, rs] of Object.entries(by)) {
  console.log(`\n== ${c} (${rs.length})`);
  for (const r of rs) console.log(`  ${r.log}#${r.i} ${JSON.stringify(r.text)}\n     reply: ${r.reply}\n     expected: ${r.expected}`);
}
const jf = process.argv.indexOf('--json');
if (jf > 0) writeFileSync(process.argv[jf + 1], JSON.stringify(out, null, 1));
