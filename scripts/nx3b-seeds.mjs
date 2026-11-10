#!/usr/bin/env node
/**
 * NX3b seeds (second generation round). Per world, labelled seed sentences that were NOT used by NX3, allocated to close the gap to 2,000.
 * Sources, in priority order (a seed is pre-gated with the deterministic gate before it can cost any generation tokens):
 *   const    - the constants the heads cannot see: kids.arith operator forms (where.op / op2), every ui.avatar operation, arg.list, arg.anim
 *   rulesfail- rules-fail / rules-differ paraphrases of training/paraphrases (out + heldout/out) with the inherited canonical target,
 *              train split only (texts of the gold set and of the NX dev/test records are excluded: they stay clean for evaluation)
 *   judged   - NX3 phrasings the rules did not read and the judge accepted (hard phrasings), from calls with a real judge reason
 *   orig     - NX3 seeds that were not used (pattern examples, canonical paraphrases)
 *   agreed   - NX3 phrasings the rules read identically (at most 2 per original group)
 * Protected sets (operational*, dialogues, real phrases, expectations, loose words, typos, ...) are excluded by normalised text.
 *   node scripts/nx3b-seeds.mjs [--total 20000] [--yield 0.85] [--k 20]
 * Writes training/dataset/nx/seeds2/<world>.jsonl and seeds2/allocation.json. Reads gen/ (round a), writes nothing there.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadSet, wireToRec, findSpan } from './lib/nx-read.mjs';
import { makeGateContext, gateOne } from './lib/nx-gate.mjs';
import { parse } from '../src/soplang/index.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const DATA = MAIN + 'training/dataset/nx/';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const h01 = (s) => createHash('sha256').update(s).digest().readUInt32BE(0) / 0xffffffff;
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const files = (d) => (existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.jsonl')) : []);

const TOTAL = Number(arg('total', 20000)); const YIELD = Number(arg('yield', 0.85)); const K = Number(arg('k', 20));
const set = await loadSet(); const gc = makeGateContext(set);
// normalised texts of every protected set (same rule as nx-seeds.mjs, which runs on import and so cannot be imported)
const prot = new Set();
for (const f of readdirSync(REPO + 'training/eval/').filter((x) => x.endsWith('.jsonl'))) for (const r of jl(REPO + 'training/eval/' + f)) {
  for (const k of ['message', 'text', 'english']) if (r[k]) prot.add(norm(r[k]));
  for (const t of r.turns ?? []) prot.add(norm(t.message));
  for (const s of [r.setup, r.context].filter(Array.isArray).flat()) prot.add(norm(s));
}

// texts that stay clean for evaluation: the gold set and the NX records of the dev/test splits
const evalClean = new Set();
for (const r of jl(REPO + 'training/nx/gold/pilot-300.jsonl')) evalClean.add(norm(r.text));
for (const r of jl(DATA + 'free-rules.jsonl')) if (r.split !== 'train') evalClean.add(norm(r.text));

// the NX3 state: per-world final counts decide the allocation
const per = JSON.parse(readFileSync(REPO + 'training/results/nx3-generation.json', 'utf8')).per_world;
const gap = Object.fromEntries(Object.entries(per).map(([w, v]) => [w, Math.max(0, 2000 - v.final)]));
const gapSum = Object.values(gap).reduce((a, b) => a + b, 0);
const alloc = {};
for (const w of Object.keys(gap)) { const target = Math.round((gap[w] * TOTAL) / gapSum); alloc[w] = { current: per[w].final, gap: gap[w], target_final: target, seeds: Math.ceil(target / YIELD / K) }; }

// existing texts per world (NX3 candidates): a seed text is never one of the NX3 seeds
const usedSeedTexts = new Map();
const addUsed = (w, t) => { (usedSeedTexts.get(w) ?? usedSeedTexts.set(w, new Set()).get(w)).add(norm(t)); };

const CONST_KEY = /\.(op2?|anim)$|\.arg\.(list|anim)$|^arg\.(list|anim)$/;
const isConst = (s) => s.world === 'ui.avatar' || s.slots.some((x) => CONST_KEY.test(x.key) || /^kids\.arith\.\w+\.op2?$/.test(x.key));

const pools = new Map(); // world -> class -> seeds
const stats = {};
const push = (cls, s) => {
  if (!alloc[s.world]) return;
  const p = pools.get(s.world) ?? pools.set(s.world, {}).get(s.world);
  (p[cls] ??= []).push({ ...s, source: cls });
};
const clean = (s) => ({ ...s, slots: s.slots.map((x) => ({ key: x.key, text: x.text ?? null, value: x.value })) });

// orig: NX3 seeds not picked (same rank as nx-gen prepare, 150 per world)
const rank = (s) => (s.source === 'hardfail' ? 0 : 1) + parseInt(sha(s.seed_id).slice(0, 6), 16) / 1e8;
for (const f of files(DATA + 'seeds')) {
  const w = f.replace('.jsonl', ''); const all = jl(DATA + 'seeds/' + f).sort((a, b) => rank(a) - rank(b));
  all.slice(0, 150).forEach((s) => addUsed(w, s.text));
  all.slice(150).forEach((s) => push(isConst(s) ? 'const' : 'orig', clean(s)));
}
// rulesfail: paraphrase seeds of the rules' gaps, train split only
for (const d of ['training/paraphrases/out', 'training/paraphrases/heldout/out']) for (const f of existsSync(REPO + d) ? readdirSync(REPO + d).filter((x) => x.endsWith('.jsonl')) : []) for (const r of jl(REPO + d + '/' + f)) {
  if (!['rules-fail', 'rules-differ'].includes(r.label_status) || r.target_from !== 'canonical' || !r.expected_circuit || r.language !== 'en') continue;
  if (evalClean.has(norm(r.text))) continue;
  try {
    const wires = parse(r.expected_circuit).wires?.filter((x) => x.type !== 'core.agent') ?? [];
    if (wires.length !== 1) continue;
    const rec = wireToRec(set, wires[0]); if (!rec.op || rec.op === 'undefined') continue;
    for (const s of rec.slots) { const sp = s.key === 'seek' ? null : findSpan(r.text, s.value); if (sp) { s.span = sp; s.text = r.text.slice(sp[0], sp[1]); } }
    const tab = set.get(r.world)?.manifest?.entries?.find((e) => e.key === 'tab')?.value.v ?? null;
    const s = { world: r.world, tab: r.tab ?? tab, context: r.setup ?? [], text: r.text, lang: 'en', op: rec.op, slots: rec.slots, group: r.group ?? `${r.world}/${sha(r.text)}`, seed_id: sha(r.world + '\nrf\n' + r.text) };
    push('rulesfail', clean(s));
  } catch { /* skip */ }
}
// judged / agreed: NX3 phrasings (gen format records)
const J = DATA + 'gen/judge';
const key = existsSync(J + '/key.json') ? JSON.parse(readFileSync(J + '/key.json', 'utf8')) : {};
const accepted = new Set(); let realCalls = 0, fakeCalls = 0;
for (const [call, rows] of Object.entries(key)) {
  const f = `${J}/out/${call}.json`; if (!existsSync(f)) continue;
  let arr; try { arr = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const real = arr.some((a) => a.reason && a.reason !== 'ok'); // a call whose every reason is the default "ok" was not really judged
  if (!real) { fakeCalls++; continue; } realCalls++;
  rows.forEach((r, i) => { const a = arr.find((x) => x.k === i + 1); if (a?.verdict === 'accept' && r.kind === 'disagreed') accepted.add(r.id); });
}
const perGroup = new Map();
const derived = (cls, r) => {
  const gk = cls + r.group; const n = perGroup.get(gk) ?? 0; if (n >= 2) return; perGroup.set(gk, n + 1);
  const s = { world: r.world, tab: r.tab, context: r.context ?? [], text: r.text, lang: 'en', op: r.op, slots: r.slots, group: r.group, seed_id: sha(r.world + '\n' + cls + '\n' + r.text) };
  push(isConst(s) ? 'const' : cls, clean(s));
};
for (const f of files(DATA + 'gen/disagreed')) for (const r of jl(DATA + 'gen/disagreed/' + f)) if (accepted.has(r.id) && !r.orig) derived('judged', r);
for (const f of files(DATA + 'gen/agreed')) for (const r of jl(DATA + 'gen/agreed/' + f)) if (!r.orig) derived('agreed', r);

// pick: pre-gate, protected filter, dedupe, in class priority; const seeds capped at 40 % of the allocation
const ORDER = ['const', 'rulesfail', 'judged', 'orig', 'agreed'];
mkdirSync(DATA + 'seeds2', { recursive: true });
const out = {};
for (const [w, a] of Object.entries(alloc)) {
  const p = pools.get(w) ?? {}; const picked = []; const seen = new Set(); const drop = { gate: 0, protected: 0, eval: 0, used: 0, dup: 0 };
  const byClass = {};
  // class quotas: const <= 40 % (all of ui.avatar is const), rulesfail <= 30 %, then judged 50 % / orig 30 % / agreed 20 % of the rest; leftovers go to the next class
  const frac = { const: w === 'ui.avatar' ? 1 : 0.4, rulesfail: 0.3 };
  const take = (cls, cap) => {
    const list = (p[cls] ?? []).slice().sort((x, y) => h01(x.seed_id) - h01(y.seed_id));
    for (const s of list) {
      if (picked.length >= a.seeds || (byClass[cls] ?? 0) >= cap) break;
      const t = norm(s.text);
      if (prot.has(t)) { drop.protected++; continue; }
      if (evalClean.has(t)) { drop.eval++; continue; }
      if (usedSeedTexts.get(w)?.has(t)) { drop.used++; continue; }
      if (seen.has(t + '|' + s.context.join('|'))) { drop.dup++; continue; }
      if (!gateOne(gc, { id: s.seed_id, group: s.group, world: s.world, context: s.context, text: s.text, op: s.op, slots: s.slots }).ok) { drop.gate++; continue; }
      seen.add(t + '|' + s.context.join('|')); picked.push(s); byClass[cls] = (byClass[cls] ?? 0) + 1;
    }
  };
  take('const', Math.ceil(a.seeds * frac.const)); take('rulesfail', Math.ceil(a.seeds * frac.rulesfail));
  const rest = () => a.seeds - picked.length;
  const r0 = rest(); take('judged', Math.ceil(r0 * 0.5)); take('orig', Math.ceil(r0 * 0.3)); take('agreed', Math.ceil(r0 * 0.2));
  for (const cls of ['judged', 'orig', 'agreed', 'rulesfail', 'const']) take(cls, a.seeds); // fill the remainder
  writeFileSync(`${DATA}seeds2/${w}.jsonl`, picked.map((x) => JSON.stringify(x)).join('\n') + '\n');
  out[w] = { ...a, picked: picked.length, by_class: byClass, pool: Object.fromEntries(Object.entries(p).map(([c, l]) => [c, l.length])), dropped: drop };
}
const rep = { total_target: TOTAL, yield: YIELD, k: K, judge_calls_real: realCalls, judge_calls_default_ok_only: fakeCalls, seeds: Object.values(out).reduce((s, x) => s + x.picked, 0), per_world: out };
writeFileSync(DATA + 'seeds2/allocation.json', JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ seeds: rep.seeds, judge_calls_real: realCalls, judge_calls_default: fakeCalls, short: Object.entries(out).filter(([, x]) => x.picked < x.seeds).map(([w, x]) => `${w} ${x.picked}/${x.seeds}`) }));
