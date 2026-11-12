#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E2, step 3 (READER-ROUTE, spec 16 section 7): the library's reader core (`interpret` over the English `core.word` facts of every described world, split candidates, `score`,
 * `rank`) on the messages of the E1 sets that belong to a described world. Measurement of the reader alone; what it does inside the dialogue (`fill`, `choose`) is
 * `scripts/reader-route-report.mjs`.
 *
 *   node scripts/e2-splits.mjs --rows <f-rules-off.json> [--world <id>] [--out <file.json>]
 *
 * Per set: messages of the world, how many the reader has candidates for, how many it accepts (unambiguous, nothing left out), how many of those the rules read right, how
 * many are accepted on a message the rules did not get right (the reader's chance), and how many readings are splits of a compound message.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { readerWorlds, readerSegments } from '../src/dialog/reader-route.mjs';

process.env.PSYS2_READER = 'choose';   // the descriptions are read
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const only = arg('world');
const all = JSON.parse(readFileSync(arg('rows'), 'utf8')).rows.filter((r) => r.kind !== 'dialogue-turn' && r.world);
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const session = engine.createSession({ language: 'en' });
const rws = readerWorlds(session.isession.rs.reasoner.lib, engine.set);
const worlds = [...rws.keys()].filter((w) => !only || w === only);
const out = { worlds, rows: 0, bySet: {}, cases: [] };
for (const r of all.filter((x) => worlds.includes(x.world))) {
  const text = r.english ?? r.message;
  const set = (out.bySet[r.set] ??= { n: 0, candidates: 0, accepted: 0, ambiguous: 0, acceptedOnRight: 0, acceptedOnNotRight: 0, splits: 0, rulesRight: 0 });
  out.rows++; set.n++;
  const right = r.outcome === 'right';
  if (right) set.rulesRight++;
  let res;
  try { res = readerSegments(session, { text, span: [0, text.length] }, { worldOrder: [r.world], allowed: [r.world] }); } catch (e) { res = { info: { error: String(e.message).slice(0, 80) } }; }
  if (res.info?.candidates) set.candidates++;
  if (res.info?.accepted && res.ambiguous) set.ambiguous++;
  if (res.segments && !res.ambiguous) {
    set.accepted++;
    right ? set.acceptedOnRight++ : set.acceptedOnNotRight++;
    if (res.info.top?.split) set.splits++;
    if (!right) out.cases.push({ set: r.set, world: r.world, text, rules: r.outcome, reader: res.info.top?.ops, split: !!res.info.top?.split });
  }
}
const o = arg('out');
if (o) writeFileSync(o, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.bySet, null, 1));
console.log('worlds:', worlds.join(', '), '| rows:', out.rows, '| cases listed (accepted where the rules were not right):', out.cases.length);
