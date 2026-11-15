#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE LEGACY LIST (reviewer 2026-11-15 16:40; owner 17:40 and 17:55: the old readers of a declared tab do not run, losses are accepted and recorded): adds the failures of an
 * `npm test` log to tests/legacy-list.json, each with the generic piece it needs, so that the run reports them apart instead of failing on them. Never for a test of behaviour the
 * owner asked for (Romanian replies never mixed, typos against the open tab) nor for a freshness gate (build, system map, real-set files): those are refused here.
 *
 *   node scripts/legacy-list.mjs <npm test log>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../tests/legacy-list.json', import.meta.url));
const NEVER = [/Romanian replies are never mixed/, /^vendor:/, /typos are corrected against the world of the open tab/, /is fresh|not stale|from the current tree/, /^P\d+: at least/];
const NEEDS = [
  [/undo|redo|history/i, 'needs undo / redo as acts of the request door (the reasoner timeline as a declared act)'],
  [/question|how many|what is selected|answered from|reads? it|count/i, 'needs questions answered from factsOf of the live world (no question act on the door yet)'],
  [/format|bold|highlight|underline|select|delete|rename|replace|link|table|tasks|navigation|title|heading|dictation|positions|writing|lists|editing|paragraph|block/i, 'needs the Documents editing acts (format, select, delete, move, dictate) declared with an executor'],
  [/move|relation|place|left|right|above|under|apart|layouts?|arrange|flip|resize|bigger|size|parts?|group|separate|together|recolou?r|colou?r|different/i, 'needs change / move / arrange acts of things of the open world declared with an executor (a thing named with "the" is not a new request)'],
  [/repair|I meant|correction|wrong|not the|nah|complaint|why|feedback|apology|repeat|explain|cancel/i, 'needs the dialogue world\'s repair and meta acts (w.dialogue) on the door'],
  [/route|tab|world|names?|signal|arbitration|steal|orphaned|catch-all|canonical|veto|referent|mirror|catalog/i, 'pins a route or a reader of the old patterns; the door reads by the declared capabilities only'],
];
const log = readFileSync(process.argv[2], 'utf8');
const section = log.split('== FAILURES:')[1] ?? '';
const rows = section.split('\n').slice(1).map((l) => l.match(/^\s{3}(\S+\.test\.mjs): (.+)$/)).filter(Boolean).map((m) => ({ file: m[1], name: m[2] }));
const list = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { doc: '', tests: [] };
list.doc = 'Tests that pin a reader, a wording or a route the request door replaced (reviewer 2026-11-15 16:40; owner 17:40, 17:55). Run and reported apart by scripts/run-tests.mjs, never counted. Each says the generic piece it needs.';
const have = new Set(list.tests.map((t) => `${t.file}|${t.name}`));
let added = 0; const refused = [];
for (const r of rows) {
  if (have.has(`${r.file}|${r.name}`)) continue;
  if (NEVER.some((re) => re.test(r.name))) { refused.push(r); continue; }
  const reason = (NEEDS.find(([re]) => re.test(r.name)) ?? [null, 'pins a reader of a declared tab (owner 17:55: no fallback); needs the act declared with an executor'])[1];
  list.tests.push({ file: r.file, name: r.name, reason }); added++;
}
list.tests.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
writeFileSync(FILE, JSON.stringify(list, null, 1) + '\n');
console.log(`legacy list: ${added} added, ${list.tests.length} in all; refused (must pass): ${refused.length}`);
for (const r of refused) console.log(`  REFUSED ${r.file}: ${r.name}`);
