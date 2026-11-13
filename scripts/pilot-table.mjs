#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Pilot P1 (spec 21): the table of the owner logs, today's worlds against the pilots. Input: two `eval-owner-log.mjs --json` outputs.
//   node scripts/pilot-table.mjs <base.json> <pilot.json> [--rows]
import { readFileSync } from 'node:fs';
const [base, pilot] = process.argv.slice(2, 4).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const NOT = /did not understand|didn't understand|did not catch|I could not read|not sure how/i;
const stats = (rows) => ({ rows: rows.length, right: rows.filter((r) => r.outcome === 'right').length, wrong: rows.filter((r) => r.outcome === 'wrong').length, notUnderstood: rows.filter((r) => NOT.test(r.reply ?? '')).length });
const sel = { all: () => true, 'tab robot (avatar)': (r) => r.tab === 'robot', 'tab diagram': (r) => r.tab === 'diagram' };
const out = ['| log | rows | today: right/wrong | today: not understood | pilot: right/wrong | pilot: not understood |', '| --- | --- | --- | --- | --- | --- |'];
for (const log of ['a', 'b', 'c', 'all']) for (const [name, f] of Object.entries(sel)) {
  const pick = (d) => d.filter((r) => (log === 'all' || r.log === log) && f(r));
  const b = stats(pick(base)), p = stats(pick(pilot));
  if (!b.rows) continue;
  out.push(`| ${log} ${name === 'all' ? '' : name} | ${b.rows} | ${b.right}/${b.wrong} | ${b.notUnderstood} | ${p.right}/${p.wrong} | ${p.notUnderstood} |`);
}
console.log(out.join('\n'));
if (process.argv.includes('--rows')) {
  base.forEach((r, k) => { const p = pilot[k]; if (p && (r.reply !== p.reply)) console.log(`\n[${r.log}${r.i}] ${r.tab} ${JSON.stringify(r.text)}\n  today: ${r.outcome} ${JSON.stringify(r.reply)}\n  pilot: ${p.outcome} ${JSON.stringify(p.reply)}`); });
}
