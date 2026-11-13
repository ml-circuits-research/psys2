#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// P3 round 2 (reviewer 2026-11-13 23:30 a-d): REAL training / test data for the act + roles tagger, labelled by the accepted readings of the acts executor.
// Sources (English only; the English side of a translated row is used when the row has one): the three owner logs (training/eval/owner-log-2026-11-13*.jsonl), the failure ledger
// (training/eval/failures.jsonl), the round-trip paraphrases (training/eval/paraphrases-rt-2026-11-12.jsonl).
// Each message is replayed through the whole rule pipeline (the engine: rules clause splitter + the card-driven clause cutter), so the PIECES are the engine's segments (segment first, then tag).
// A piece is ACCEPTED when its winning reading is a request of one of the schema worlds (ui.avatar, diagram.sketch, plan.seating, plan.timeline, worlds-pilot/art.draw) that the acts
// grammar names an act for (the same table as scripts/act-agreement-rules.mjs); its act is that act and its spans are the reading's slots (thing, set, attribute, value, place, amount).
// Everything else is `none` (not a request to a doing world: arithmetic, chat, games, knowledge questions, declined or not understood). The replay runs in the row's own tab and in the
// five doing tabs; the row's own tab wins a disagreement, otherwise the plurality; ties are dropped. The TAGGER sees none of this (no tab, no history).
// Held out: every piece whose accepted reading belongs to ui.avatar or diagram.sketch, and the `none` pieces of the robot / diagram tabs. The rest is split 80 / 20 by message into train / test-seen.
//   node scripts/gen-act-tagger-real.mjs [--out training/data/act-tagger-real] [--hold ui.avatar,diagram.sketch] [--seed 1]
// Outputs: real-train.jsonl real-test-seen.jsonl real-test-held.jsonl (one { text, words, tags, act, world, msg, piece, pieces, source, tab, none } per line), real-stats.json.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(REPO, arg('out', 'training/data/act-tagger-real'));
const HOLD = new Set(arg('hold', 'ui.avatar,diagram.sketch').split(','));
const SEED = Number(arg('seed', 1));
mkdirSync(OUT, { recursive: true });
// art.draw is a schema world in worlds/ since the switch (2026-11-14): no pilot root any more
const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
const { createEngine } = await import('../src/dialog/index.mjs');
const { createFacts } = await import('../src/knowledge/facts.mjs');
const CAT = path.join(REPO, 'tests/fixtures/catalog');
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
engine.setKnowledge(createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } }));

const DOING = { 'ui.avatar': 'robot', 'diagram.sketch': 'diagram', 'plan.seating': 'seating', 'plan.timeline': 'timeline', 'art.draw': 'draw' };
const TABS = Object.values(DOING);
const TAB_ALIAS = { avatar: 'robot', seating: 'seating', draw: 'draw', diagram: 'diagram', timeline: 'timeline' };
// last word(s) of the action -> act (the table of scripts/act-agreement-rules.mjs)
const ACT_OF = [
  [/(^|[._])(add|create|make|new|draw|insert|spawn|put_on|dress|wear|give|put)$/, 'make'], [/(^|[._])(remove|delete|erase|clear|drop|take_off|undo_item|kill)$/, 'remove'],
  [/(^|[._])(set|change|colou?r|paint|resize|size|rename|edit|replace|recolou?r|fill|style|bigger|smaller|grow|shrink|turn|swap|variant|expression|mood|text|label|title)$/, 'change'],
  [/(^|[._])(move|place|position|arrange|align|seat|shift|layout|stack|nudge|rotate)$/, 'place'], [/(^|[._])(connect|link|join|attach|arrow)$/, 'connect'],
  [/(^|[._])(group|ungroup|apart|merge)$/, 'group'], [/(^|[._])(select|pick|choose|focus|highlight)$/, 'pick'], [/(^|[._])(copy|duplicate|clone)$/, 'copy'],
  [/(^|[._])undo$/, 'undo'], [/(^|[._])redo$/, 'redo'], [/(^|[._])(save|store)$/, 'save'], [/(^|[._])(load|open|restore)$/, 'load'], [/(^|[._])(send|share|export)$/, 'send'],
  [/(^|[._])(what|which|how_many|count|where|why|describe|query|ask|list|show|tell)$/, 'ask'],
];
const DIRECT = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'pick', 'ask', 'copy', 'send', 'undo', 'redo', 'save', 'load']);
const actOf = (a) => { if (!a) return null; const t = a.split('.').slice(-1)[0]; if (/^(plan|diagram|ui)\./.test(a) && DIRECT.has(t)) return t; for (const [re, act] of ACT_OF) if (re.test(a)) return act; return null; };
const ROLE_OF = { thing: 'thing', k: 'thing', kind: 'thing', target: 'thing', item: 'thing', set: 'set', attribute: 'attribute', attr: 'attribute', value: 'value', colour: 'value', color: 'value', place: 'place', dest: 'place', amount: 'amount', n: 'amount', count: 'amount', number: 'amount' };
const toks = (t) => [...String(t).toLowerCase().matchAll(/[a-z0-9]+(?:['-][a-z0-9]+)*/g)].map((m) => ({ w: m[0], s: m.index, e: m.index + m[0].length }));

// ---- sources -------------------------------------------------------------------------------------------------------------------------------------------
const read = (f) => readFileSync(path.join(REPO, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const asciiEn = (t) => typeof t === 'string' && t.trim() && /^[\x20-\x7e]+$/.test(t);
const msgs = []; const seen = new Set();
const add = (text, tab, source) => {
  text = String(text ?? '').trim(); if (!asciiEn(text) || text.length > 200) return;
  const key = text.toLowerCase(); if (seen.has(key)) return; seen.add(key);
  msgs.push({ text, tab: TAB_ALIAS[tab] ?? tab ?? 'talk', source });
};
for (const f of ['owner-log-2026-11-13', 'owner-log-2026-11-13b', 'owner-log-2026-11-13c']) for (const r of read(`training/eval/${f}.jsonl`)) add(r.lang === 'en' || !r.lang ? r.text : r.english, r.tab, f.replace('owner-log-2026-', 'ownerlog'));
for (const r of read('training/eval/failures.jsonl')) add(r.language === 'en' || r.lang === 'en' || (!r.language && !r.lang) ? r.text : r.english, r.tab, 'ledger');
const RT_TAB = { robot: 'robot', draw: 'draw', diagram: 'diagram', seating: 'seating', timeline: 'timeline' };
for (const r of read('training/eval/paraphrases-rt-2026-11-12.jsonl')) add(r.message, RT_TAB[r.world] ?? 'talk', 'paraphrase-rt');
console.error(`messages: ${msgs.length}`);

// ---- replay --------------------------------------------------------------------------------------------------------------------------------------------
async function run(text, tab) {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab });
  try { return await s.send(text); } catch { return null; }
}
const reading = (seg) => {
  const m = seg.match; if (!m || seg.unparsed || m.kind !== 'request' || !DOING[m.worldId]) return null;
  const w = seg.wires?.[0]; const action = w?.entries?.find((e) => e.key === 'core.request.action')?.value.v;
  const act = actOf(action); if (!act) return null;
  return { world: m.worldId, action, act, slots: m.slots ?? {} };
};
const segs = [];   // one record per piece
let nrun = 0;
for (let mi = 0; mi < msgs.length; mi++) {
  const M = msgs[mi];
  const tabs = [...new Set([M.tab, ...TABS])];
  const runs = {};
  for (const t of tabs) { runs[t] = await run(M.text, t); nrun++; }
  const own = runs[M.tab]; const base = own?.segments?.length ? own : Object.values(runs).find((r) => r?.segments?.length);
  if (!base) continue;
  const pieces = base.segments;
  pieces.forEach((seg, pi) => {
    const rds = [];
    for (const t of tabs) { const sg = runs[t]?.segments?.find((x) => x.text === seg.text); const rd = sg && reading(sg); if (rd) rds.push({ ...rd, tab: t, seg: sg }); }
    let pick = null, dropped = false;
    if (rds.length) {
      const ownRd = rds.find((r) => r.tab === M.tab);
      if (ownRd) pick = ownRd;
      else { const cnt = {}; for (const r of rds) cnt[r.act] = (cnt[r.act] ?? 0) + 1; const best = Object.entries(cnt).sort((a, b) => b[1] - a[1]); if (best.length > 1 && best[0][1] === best[1][1]) dropped = true; else pick = rds.find((r) => r.act === best[0][0]); }
    }
    if (dropped) return;
    segs.push({ msg: mi, piece: pi, pieces: pieces.length, text: seg.text, offset: seg.span?.[0] ?? 0, tab: M.tab, source: M.source, pick });
  });
  if (mi % 200 === 0) console.error(`replayed ${mi}/${msgs.length}`);
}

// ---- labels --------------------------------------------------------------------------------------------------------------------------------------------
const rows = []; let unmappedSlots = 0, badSpan = 0;
for (const g of segs) {
  const tk = toks(g.text); const tags = tk.map(() => 'O'); let act = 'none', world = null;
  if (g.pick) {
    act = g.pick.act; world = g.pick.world;
    for (const [name, sl] of Object.entries(g.pick.slots)) {
      const role = ROLE_OF[name]; if (!role) { unmappedSlots++; continue; }
      const span = sl.span; if (!span) continue;
      // slot offsets are in the message; a segment's text starts at `offset`
      let a = span[0], b = span[1];
      const txt = String(sl.text ?? '');
      if (g.text.slice(a, b).toLowerCase() !== txt.toLowerCase()) { a -= g.offset; b -= g.offset; }
      if (a < 0 || g.text.slice(a, b).toLowerCase() !== txt.toLowerCase()) { badSpan++; continue; }
      let first = true;
      tk.forEach((t, i) => { if (t.s >= a && t.e <= b) { tags[i] = `${first ? 'B' : 'I'}-${role}`; first = false; } });
    }
  }
  rows.push({ text: g.text, words: tk.map((t) => t.w), tags, act, world: world ?? (g.pick ? '?' : `none:${g.tab}`), msg: g.msg, piece: g.piece, pieces: g.pieces, source: g.source, tab: g.tab, none: act === 'none' });
}
const clean = rows.filter((r) => r.words.length);
// ---- split ---------------------------------------------------------------------------------------------------------------------------------------------
let seed = SEED >>> 0; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// a message is held out when any piece is accepted by a held-out world, or when it is a none message of a held-out tab
const heldTab = new Set([...HOLD].map((w) => DOING[w]));
const byMsg = new Map(); for (const r of clean) (byMsg.get(r.msg) ?? byMsg.set(r.msg, []).get(r.msg)).push(r);
const out = { train: [], 'test-seen': [], 'test-held': [] };
for (const [, rs] of byMsg) {
  const held = rs.some((r) => HOLD.has(r.world)) || (rs.every((r) => r.none) && heldTab.has(rs[0].tab));
  const k = held ? 'test-held' : rnd() < 0.2 ? 'test-seen' : 'train';
  out[k].push(...rs);
}
const stats = {};
for (const [k, v] of Object.entries(out)) {
  writeFileSync(path.join(OUT, `real-${k}.jsonl`), v.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const byAct = {}; for (const r of v) byAct[r.act] = (byAct[r.act] ?? 0) + 1;
  const byW = {}; for (const r of v) byW[r.world.startsWith('none:') ? 'none' : r.world] = (byW[r.world.startsWith('none:') ? 'none' : r.world] ?? 0) + 1;
  const bySrc = {}; for (const r of v) bySrc[r.source] = (bySrc[r.source] ?? 0) + 1;
  stats[k] = { pieces: v.length, messages: new Set(v.map((r) => r.msg)).size, byAct, byWorld: byW, bySource: bySrc };
}
writeFileSync(path.join(OUT, 'real-stats.json'), `${JSON.stringify({ messages: msgs.length, runs: nrun, pieces: clean.length, unmappedSlots, badSpan, ...stats }, null, 1)}\n`);
console.log(JSON.stringify({ messages: msgs.length, pieces: clean.length, unmappedSlots, badSpan, ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { pieces: v.pieces, byAct: v.byAct, byWorld: v.byWorld }])) }, null, 1));
