#!/usr/bin/env node
/**
 * NX2 gold set builder: training/nx/gold/pilot-300.jsonl (150 rules-verified + 100 paraphrase-inherited + 50 real phrases).
 * The real-phrase labels are written by hand (training/nx/gold/real-50.json: reviewed labels), this script only merges them.
 *   node scripts/build-nx-gold.mjs [--seed 7]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadSet, formalizeIn, readSegments, wireToRec, findSpan } from './lib/nx-read.mjs';
import { parse } from '../src/soplang/index.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
let seed = Number(process.argv[process.argv.indexOf('--seed') + 1]) || 7;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** Round-robin over groups so every world is represented. */
function spread(items, key, n) {
  const g = new Map();
  for (const it of shuffle(items)) { const k = key(it); if (!g.has(k)) g.set(k, []); g.get(k).push(it); }
  const out = []; const lists = [...g.values()];
  for (let i = 0; out.length < n && lists.some((l) => l.length); i = (i + 1) % lists.length) if (lists[i].length) out.push(lists[i].pop());
  return out;
}

const set = await loadSet();
const tabOf = (w) => set.get(w)?.manifest?.entries?.find((e) => e.key === 'tab')?.value.v ?? null;
const ctxOf = (w) => ({ activeTab: tabOf(w) ?? w, tabWorld: w, recentWorlds: [w] });
const faithful = (text, slots) => slots.every((s) => s.span == null || (s.text && text.toLowerCase().includes(String(s.text).toLowerCase())));

// ---- A. rules-verified (operational right outcome by the rules) ----
const rep = JSON.parse(readFileSync(REPO + 'training/results/operational/rules-nomodel-2026-11-09-r3h-shipped.json', 'utf8'));
const right = new Set(rep.cases.filter((c) => c.outcome === 'right').map((c) => c.id));
const cases = ['operational', 'operational-long'].flatMap((f) => jl(REPO + `training/eval/${f}.jsonl`)).filter((c) => c.world && right.has(c.id));
const A = [];
for (const c of cases) {
  try {
    const res = formalizeIn(set, [...c.setup, c.message], { tab: ctxOf(c.world) });
    const segs = readSegments(set, res);
    if (segs.length !== 1 || segs[0].nWires !== 1 || !segs[0].op || segs[0].worldId !== c.world) continue;
    const s = segs[0];
    if (!faithful(s.text, s.slots)) continue;
    A.push({ id: c.id, subset: 'rules', world: c.world, tab: c.tab ?? null, context: c.setup, text: s.text, op: s.op, slots: s.slots, source: 'operational-right' });
  } catch { /* skip */ }
}
// diagram.sketch has no operational set: pattern examples (the rules read them by construction)
const diag = [];
for (const p of set.get('diagram.sketch').patterns) for (const ex of (p.examples ?? []).slice(0, 2)) {
  try {
    const segs = readSegments(set, formalizeIn(set, [ex], { tab: ctxOf('diagram.sketch') }));
    if (segs.length === 1 && segs[0].nWires === 1 && segs[0].op && segs[0].worldId === 'diagram.sketch' && faithful(segs[0].text, segs[0].slots))
      diag.push({ id: 'diagram.sketch#' + sha(ex), subset: 'rules', world: 'diagram.sketch', tab: tabOf('diagram.sketch'), context: [], text: segs[0].text, op: segs[0].op, slots: segs[0].slots, source: 'pattern-example' });
  } catch { /* skip */ }
}
const goldA = [...spread(diag, () => 'd', 8), ...spread(A, (x) => x.world, 142)];

// ---- B. paraphrases where the rules fail / differ and the canonical label is inherited ----
const B = [];
const dirs = ['training/paraphrases/out', 'training/paraphrases/heldout/out'];
for (const d of dirs) for (const f of readdirSync(REPO + d).filter((x) => x.endsWith('.jsonl'))) for (const r of jl(REPO + d + '/' + f)) {
  if (!['rules-fail', 'rules-differ'].includes(r.label_status) || r.target_from !== 'canonical' || !r.expected_circuit || r.language !== 'en') continue;
  try {
    const wires = parse(r.expected_circuit).wires?.filter((w) => w.type !== 'core.agent') ?? [];
    if (wires.length !== 1) continue;
    const rec = wireToRec(set, wires[0]);
    if (!rec.op || rec.op === 'undefined') continue;
    for (const s of rec.slots) { const sp = findSpan(r.text, s.value); if (sp && s.key !== 'seek') { s.span = sp; s.text = r.text.slice(sp[0], sp[1]); } }
    B.push({ id: 'para#' + r.example_id, subset: 'para', world: r.world, tab: r.tab ?? null, context: r.setup ?? r.context ?? [], text: r.text, op: rec.op, slots: rec.slots, source: `${d.includes('heldout') ? 'heldout' : 'out'}:${r.label_status}` });
  } catch { /* skip */ }
}
const goldB = spread(B, (x) => x.world, 100);

// ---- C. real phrases: hand-reviewed labels ----
const realFile = REPO + 'training/nx/gold/real-50.json';
const goldC = existsSync(realFile) ? JSON.parse(readFileSync(realFile, 'utf8')).map((x) => ({ ...x, subset: 'real' })) : [];

mkdirSync(REPO + 'training/nx/gold', { recursive: true });
const all = [...goldA, ...goldB, ...goldC];
writeFileSync(REPO + 'training/nx/gold/pilot-300.jsonl', all.map((x) => JSON.stringify(x)).join('\n') + '\n');
const per = {}; for (const x of all) per[x.world] = (per[x.world] ?? 0) + 1;
console.log(JSON.stringify({ rules: goldA.length, para: goldB.length, real: goldC.length, candidates: { A: A.length, B: B.length, diag: diag.length }, per_world: per }));
