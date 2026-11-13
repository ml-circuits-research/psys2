#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// P3 (compare with the dispatcher + patterns): what the RULES read for every message of the operational set and the dialogue set, as one universal act, for act-level agreement with the act tagger.
// The rule pipeline (patterns, no model) is run per case like scripts/eval-operational.mjs does (tab, init, setup, then the message); the first segment's winning request action
// (`core.request.action`, e.g. draw.add, diagram.connect, plan.seating.place) is mapped to an act by its last word (a small table, ACT_OF below; actions that name no act, such as arithmetic or chat,
// map to null and are not comparable). Output: one JSON line per message { id, set, world, message, action, act, outcome? } where outcome is read from a published operational result file.
//   node scripts/act-agreement-rules.mjs --out <file.jsonl> [--outcomes training/results/operational/rules-nomodel-2026-11-10-cbd.json] [--limit N]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', 'act-agreement-rules.jsonl'));
const LIMIT = Number(arg('limit', 1e9));
const outcomesFile = path.resolve(REPO, arg('outcomes', 'training/results/operational/rules-nomodel-2026-11-10-cbd.json'));
const outcomes = new Map(existsSync(outcomesFile) ? (JSON.parse(readFileSync(outcomesFile, 'utf8')).rows ?? []).map((r) => [r.id, r.outcome]) : []);

/** last word(s) of an action name -> act. Only verbs of changing, making, asking about things of a world; everything else is null. */
const ACT_OF = [
  [/(^|[._])(add|create|make|new|draw|insert|spawn|put_on|dress|wear|give|put)$/, 'make'],
  [/(^|[._])(remove|delete|erase|clear|drop|take_off|undo_item|kill)$/, 'remove'],
  [/(^|[._])(set|change|colou?r|paint|resize|size|rename|edit|replace|recolou?r|fill|style|bigger|smaller|grow|shrink|turn|swap|variant|expression|mood|text|label|title)$/, 'change'],
  [/(^|[._])(move|place|position|arrange|align|seat|shift|layout|stack|nudge|rotate)$/, 'place'],
  [/(^|[._])(connect|link|join|attach|arrow)$/, 'connect'],
  [/(^|[._])(group|ungroup|apart|merge)$/, 'group'],
  [/(^|[._])(select|pick|choose|focus|highlight)$/, 'pick'],
  [/(^|[._])(copy|duplicate|clone)$/, 'copy'],
  [/(^|[._])undo$/, 'undo'], [/(^|[._])redo$/, 'redo'],
  [/(^|[._])(save|store)$/, 'save'], [/(^|[._])(load|open|restore)$/, 'load'],
  [/(^|[._])(send|share|export)$/, 'send'],
  [/(^|[._])(what|which|how_many|count|where|why|describe|query|ask|list|show|tell)$/, 'ask'],
];
const ACT_DIRECT = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'pick', 'ask', 'copy', 'send', 'undo', 'redo', 'save', 'load']);
const actOf = (action) => {
  if (!action) return null;
  const tail = action.split('.').slice(-1)[0];
  if (/^(plan|diagram|ui)\./.test(action) && ACT_DIRECT.has(tail)) return tail;
  for (const [re, act] of ACT_OF) if (re.test(action)) return act;
  return null;
};
const read = (f) => readFileSync(path.join(REPO, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const rows = [];
const firstAction = (r) => {
  for (const seg of r.segments ?? []) for (const w of seg.wires ?? []) { const e = (w.entries ?? []).find((x) => x.key === 'core.request.action'); if (e) return e.value.v; }
  return null;
};
const operational = read('training/eval/operational.jsonl').slice(0, LIMIT);
for (const c of operational) {
  const s = engine.createSession({ language: 'en' });
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  try {
    for (const m of c.setup ?? []) await s.send(m);
    const r = await s.send(c.message);
    const action = firstAction(r);
    rows.push({ id: c.id, set: 'operational', world: c.world, message: c.message, action, act: actOf(action), outcome: outcomes.get(c.id) ?? null });
  } catch (e) { rows.push({ id: c.id, set: 'operational', world: c.world, message: c.message, action: null, act: null, error: String(e.message).slice(0, 80) }); }
}
const dialogues = read('training/eval/dialogues.jsonl').slice(0, LIMIT);
for (const d of dialogues) {
  const s = engine.createSession({ language: 'en' });
  if (d.tab) s.setWorldState('ui.shell', { activeTab: d.tab });
  for (const [w, patch] of Object.entries(d.init ?? {})) s.setWorldState(w, patch);
  let k = 0;
  for (const t of d.turns) {
    k++;
    try {
      const r = await s.send(t.message);
      const action = firstAction(r);
      rows.push({ id: `${d.id}.${k}`, set: 'dialogue', world: d.world, message: t.message, turn: k, action, act: actOf(action) });
    } catch (e) { rows.push({ id: `${d.id}.${k}`, set: 'dialogue', world: d.world, message: t.message, turn: k, action: null, act: null }); }
  }
}
writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const byAct = {};
for (const r of rows) { const k = `${r.set}:${r.act ?? '(none)'}`; byAct[k] = (byAct[k] ?? 0) + 1; }
console.log(JSON.stringify({ rows: rows.length, withAct: rows.filter((r) => r.act).length, withOutcome: rows.filter((r) => r.outcome).length, byAct }));
const acts = {};
for (const r of rows) if (r.action) acts[r.action] = (acts[r.action] ?? 0) + 1;
console.log(Object.entries(acts).sort((a, b) => b[1] - a[1]).slice(0, 90).map(([k, v]) => `${v} ${k} -> ${actOf(k)}`).join('\n'));
