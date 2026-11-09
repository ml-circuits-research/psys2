#!/usr/bin/env node
/**
 * NX3 seeds: per world, labelled seed sentences for the generator. Sources:
 *   pattern  - examples of the world's patterns, read by the rules (op + slots with spans);
 *   canonical- paraphrase canonicals (label_status canonical-ok) with their circuit;
 *   hardfail - paraphrases the rules fail on, with the inherited canonical target (the rules' gaps).
 * Protected sets (operational*, dialogues, real phrases, expectations, loose words, typos) are excluded by normalised text.
 *   node scripts/nx-seeds.mjs [--out training/dataset/nx/seeds]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadSet, formalizeIn, readSegments, wireToRec, findSpan } from './lib/nx-read.mjs';
import { parse } from '../src/soplang/index.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', MAIN + 'training/dataset/nx/seeds');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

/** Normalised texts of every protected set. */
export function protectedTexts() {
  const prot = new Set();
  const dir = REPO + 'training/eval/';
  for (const f of readdirSync(dir)) {
    const p = dir + f;
    if (/\.jsonl$/.test(f)) for (const r of jl(p)) {
      for (const k of ['message', 'text', 'english']) if (r[k]) prot.add(norm(r[k]));
      for (const t of r.turns ?? []) prot.add(norm(t.message));
      for (const s of [r.setup, r.context].filter(Array.isArray).flat()) prot.add(norm(s));
    }
  }
  return prot;
}

const set = await loadSet();
const prot = protectedTexts();
const tabOf = (w) => set.get(w)?.manifest?.entries?.find((e) => e.key === 'tab')?.value.v ?? null;
const ctxOf = (w) => ({ activeTab: tabOf(w) ?? w, tabWorld: w, recentWorlds: [w] });
const counts = { protected: 0 };
const seeds = new Map();   // world -> seed[]
const add = (s) => {
  if (prot.has(norm(s.text))) { counts.protected++; return; }
  const list = seeds.get(s.world) ?? seeds.set(s.world, []).get(s.world);
  if (list.some((x) => norm(x.text) === norm(s.text) && x.context.join('|') === s.context.join('|'))) return;
  list.push({ seed_id: sha(s.world + '\n' + s.context.join('\n') + '\n' + s.text), group: `${s.world}/${sha(s.text)}`, ...s });
  counts[s.source] = (counts[s.source] ?? 0) + 1;
};

for (const w of set.list()) {
  if (['core', 'lang.common'].includes(w.id)) continue;
  for (const p of w.patterns) for (const ex of p.examples ?? []) {
    try {
      const segs = readSegments(set, formalizeIn(set, [ex], { tab: ctxOf(w.id) }));
      const s = segs[0];
      if (segs.length !== 1 || s.nWires !== 1 || !s.op || s.worldId !== w.id) continue;
      add({ world: w.id, tab: tabOf(w.id), context: [], text: ex, lang: 'en', op: s.op, slots: s.slots, source: 'pattern' });
    } catch { /* skip */ }
  }
}
for (const d of ['training/paraphrases/out']) for (const f of readdirSync(REPO + d).filter((x) => x.endsWith('.jsonl'))) for (const r of jl(REPO + d + '/' + f)) {
  const hard = ['rules-fail', 'rules-differ'].includes(r.label_status) && r.target_from === 'canonical';
  if ((r.label_status !== 'canonical-ok' && !hard) || !r.expected_circuit || r.language !== 'en') continue;
  try {
    const wires = parse(r.expected_circuit).wires?.filter((x) => x.type !== 'core.agent') ?? [];
    if (wires.length !== 1) continue;
    const rec = wireToRec(set, wires[0]);
    if (!rec.op || rec.op === 'undefined') continue;
    for (const s of rec.slots) { const sp = s.key === 'seek' ? null : findSpan(r.text, s.value); if (sp) { s.span = sp; s.text = r.text.slice(sp[0], sp[1]); } }
    add({ world: r.world, tab: r.tab ?? tabOf(r.world), context: r.setup ?? [], text: r.text, lang: 'en', op: rec.op, slots: rec.slots, source: hard ? 'hardfail' : 'canonical' });
  } catch { /* skip */ }
}
mkdirSync(OUT, { recursive: true });
const report = {};
for (const [w, list] of seeds) { writeFileSync(`${OUT}/${w}.jsonl`, list.map((x) => JSON.stringify(x)).join('\n') + '\n'); report[w] = list.length; }
console.log(JSON.stringify({ counts, per_world: report, total: Object.values(report).reduce((a, b) => a + b, 0) }));
