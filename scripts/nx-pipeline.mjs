#!/usr/bin/env node
/**
 * NX3 pipeline after generation (see nx-gen.mjs): gate -> rules agreement -> judge -> splits.
 *   node scripts/nx-pipeline.mjs gate                 gen/candidates/<w>.jsonl -> gen/gated/<w>.jsonl (+ drops by reason in gen/gate-report.json)
 *   node scripts/nx-pipeline.mjs agree                the rules read every gated text: gen/agreed/<w>.jsonl, gen/disagreed/<w>.jsonl
 *   node scripts/nx-pipeline.mjs judge-prepare        judge batches of 50 (all disagreed + a 3% audit sample of agreed) in gen/judge/shards
 *   node scripts/nx-pipeline.mjs finalize [--dev 0.05 --test 0.05]   verdicts -> dataset/nx/final/<w>.jsonl with status + split, nx3-generation.json
 * Data dir: training/dataset/nx/gen (outside git). Every stage is a pure function of the previous stage's files.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadSet, formalizeIn, readSegments } from './lib/nx-read.mjs';
import { makeGateContext, gateOne } from './lib/nx-gate.mjs';
import { worldPrompt } from './lib/nx-prompt.mjs';
import { GEN } from './nx-gen.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const wl = (f, a) => { mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(f, a.map((x) => JSON.stringify(x)).join('\n') + (a.length ? '\n' : '')); };
const wj = (f, o) => { mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 1)); };
const hash01 = (s) => createHash('sha256').update(s).digest().readUInt32BE(0) / 0xffffffff;
const files = (d) => (existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.jsonl')) : []);
const nv = (v) => (v == null ? '' : String(v).replace(/^\$(e\.)?/, '').toLowerCase().replace(/_/g, ' ').trim());

/** Split of a group: hash of world + group, dev / test shares, rest train. */
export function splitOf(world, group, dev = 0.05, test = 0.05) {
  const h = hash01(`${world}\n${group}\nnx`);
  return h < test ? 'test' : h < test + dev ? 'dev' : 'train';
}

/** True when the rules' reading of rec.text (with its context) has the record's op and values. */
export function rulesAgree(set, rec) {
  const ctxTab = set.get(rec.world)?.manifest?.entries?.find((e) => e.key === 'tab')?.value.v ?? rec.world;
  let segs;
  try { segs = readSegments(set, formalizeIn(set, [...(rec.context ?? []), rec.text], { tab: { id: ctxTab, world: rec.world } })); } catch { return { agree: false, why: 'rules-error' }; }
  const parsed = segs.filter((s) => s.op);
  if (!parsed.length) return { agree: false, why: 'rules-unparsed' };
  if (parsed.length > 1 || segs.length > 1) return { agree: false, why: 'rules-multi-segment' };
  const s = parsed[0];
  if (s.op !== rec.op) return { agree: false, why: 'rules-other-op', rules_op: s.op };
  const mine = new Map(rec.slots.map((x) => [x.key, nv(x.value)]));
  for (const x of s.slots) { if (x.key === 'seek') continue; const m = mine.get(x.key.replace(/^core\.request\./, '')); if (m === undefined || m !== nv(x.value)) return { agree: false, why: 'rules-other-value', key: x.key }; }
  for (const x of rec.slots) if (x.text != null && !s.slots.some((y) => y.key === x.key)) return { agree: false, why: 'rules-missing-slot', key: x.key };
  return { agree: true };
}

async function gate() {
  const set = await loadSet(); const gc = makeGateContext(set);
  const rep = { worlds: {}, reasons: {} };
  for (const f of files(`${GEN}/candidates`)) {
    const w = f.replace('.jsonl', ''); const acc = []; const r = { input: 0, accepted: 0, dropped: {} };
    for (const rec of jl(`${GEN}/candidates/${f}`)) {
      r.input++; const g = gateOne(gc, rec);
      if (g.ok) { acc.push(g.rec); r.accepted++; } else { r.dropped[g.reason] = (r.dropped[g.reason] ?? 0) + 1; rep.reasons[g.reason] = (rep.reasons[g.reason] ?? 0) + 1; }
    }
    wl(`${GEN}/gated/${w}.jsonl`, acc); rep.worlds[w] = r;
  }
  wj(`${GEN}/gate-report.json`, rep); console.log(JSON.stringify({ reasons: rep.reasons, accepted: Object.values(rep.worlds).reduce((a, b) => a + b.accepted, 0), input: Object.values(rep.worlds).reduce((a, b) => a + b.input, 0) }));
}

async function agree() {
  const set = await loadSet(); const rep = { agreed: 0, disagreed: 0, why: {}, worlds: {} };
  for (const f of files(`${GEN}/gated`)) {
    const w = f.replace('.jsonl', ''); const a = []; const d = [];
    for (const rec of jl(`${GEN}/gated/${f}`)) {
      const r = rulesAgree(set, rec);
      if (r.agree) a.push({ ...rec, label_source: 'seed+rules-agree' }); else { d.push({ ...rec, rules_why: r.why }); rep.why[r.why] = (rep.why[r.why] ?? 0) + 1; }
    }
    wl(`${GEN}/agreed/${w}.jsonl`, a); wl(`${GEN}/disagreed/${w}.jsonl`, d);
    rep.agreed += a.length; rep.disagreed += d.length; rep.worlds[w] = { agreed: a.length, disagreed: d.length };
  }
  wj(`${GEN}/agree-report.json`, rep); console.log(JSON.stringify({ agreed: rep.agreed, disagreed: rep.disagreed, why: rep.why }));
}

const JUDGE_INSTR = `You are a judge in a data pipeline. Work ONLY with the files named here; do not read or search any other file in the repository.
SHARD (in your task) holds batches.json: a list of judge calls {call_id, world, prompt_file, items: [{k, context, text, proposed: {op, slots}}]}.
For EVERY call, in order: read the world prompt file once per world (it defines the operations and keys; ignore its generation task), then for each item decide whether the proposed label (op and slots) is a correct reading of the sentence for this world (the label is for the last sentence; context only resolves what it leaves out):
accept = op and all slot keys and values are right; reject = wrong op, wrong or missing value, or the sentence does not ask for this op; fix = nearly right (give "fixed": {"op":..., "slots":[{"key":..,"text":..,"value":..}]}).
Write each call's verdicts with the Write tool as a JSON array to OUT/<call_id>.json: [{"k": <n>, "verdict": "accept"|"reject"|"fix", "reason": "ok" for accept, at most 8 words otherwise, "fixed": {...only for fix}}] one entry per item, nothing else. No scripts that generate verdicts. Never ask questions. Reply with one line: the number of calls written.`;

function judgePrepare() {
  const audit = Number(arg('audit', 0.03)); const J = `${GEN}/judge`;
  const calls = []; const key = {};
  for (const f of files(`${GEN}/disagreed`)) {
    const w = f.replace('.jsonl', '');
    const pool = [...jl(`${GEN}/disagreed/${f}`).map((r) => ({ r, kind: 'disagreed' })), ...jl(`${GEN}/agreed/${f}`).filter((r) => hash01(r.id + 'audit') < audit).map((r) => ({ r, kind: 'audit' }))];
    pool.sort((a, b) => hash01(a.r.id + 'o') - hash01(b.r.id + 'o'));
    const pf = `${GEN}/prompts/${w}.md`;
    for (let k = 0; k * 50 < pool.length; k++) {
      const part = pool.slice(k * 50, k * 50 + 50); const id = `${w}.${String(k).padStart(3, '0')}`;
      if (existsSync(`${J}/out/${id}.json`)) { key[id] = part.map((x) => ({ id: x.r.id, kind: x.kind })); continue; }
      calls.push({ call_id: id, world: w, prompt_file: pf, items: part.map((x, j) => ({ k: j + 1, context: x.r.context, text: x.r.text, proposed: { op: x.r.op, slots: x.r.slots.map((s) => ({ key: s.key, text: s.text, value: s.value })) } })) });
      key[id] = part.map((x) => ({ id: x.r.id, kind: x.kind }));
    }
  }
  // judge-style prompt files: the world prompt is the labeler prompt (operations + keys)
  wj(`${J}/key.json`, key);
  const n = Number(arg('shards', 4)); const sh = Array.from({ length: n }, () => []);
  calls.forEach((c, i) => sh[i % n].push(c));
  sh.forEach((s, i) => wj(`${J}/shards/shard-${i}/batches.json`, s));
  writeFileSync(`${J}/INSTRUCTIONS.md`, JUDGE_INSTR);
  console.log(JSON.stringify({ calls_todo: calls.length, items: calls.reduce((a, c) => a + c.items.length, 0) }));
}

async function finalize() {
  const dev = Number(arg('dev', 0.05)); const test = Number(arg('test', 0.05));
  const key = existsSync(`${GEN}/judge/key.json`) ? JSON.parse(readFileSync(`${GEN}/judge/key.json`, 'utf8')) : {};
  const verdict = new Map(); // id -> { v, kind, fixed }
  for (const [call, rows] of Object.entries(key)) {
    const f = `${GEN}/judge/out/${call}.json`; if (!existsSync(f)) continue;
    let arr; try { arr = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    rows.forEach((r, i) => { const a = arr.find((x) => x.k === i + 1); if (a) verdict.set(r.id, { v: a.verdict, kind: r.kind, fixed: a.fixed }); });
  }
  const set = await loadSet(); const gc = makeGateContext(set);
  const rep = { worlds: {}, judge: { disagreed: { n: 0, accept: 0, fix: 0, reject: 0 }, audit: { n: 0, accept: 0, fix: 0, reject: 0 } }, totals: {} };
  mkdirSync(`${MAIN}training/dataset/nx/final`, { recursive: true });
  for (const f of files(`${GEN}/agreed`)) {
    const w = f.replace('.jsonl', ''); const out = []; const st = { agreed: 0, judge_accepted: 0, judge_fixed: 0, judge_rejected: 0, unjudged: 0 };
    for (const r of jl(`${GEN}/agreed/${f}`)) {
      const v = verdict.get(r.id); if (v) { const c = rep.judge.audit; c.n++; c[v.v] = (c[v.v] ?? 0) + 1; }
      st.agreed++; out.push({ ...r, status: v && v.v === 'reject' ? 'agreed-audit-rejected' : 'agreed', judge: v ? 'audited' : null });
    }
    for (const r of jl(`${GEN}/disagreed/${f}`)) {
      const v = verdict.get(r.id);
      if (!v) { st.unjudged++; continue; }
      const c = rep.judge.disagreed; c.n++; c[v.v] = (c[v.v] ?? 0) + 1;
      if (v.v === 'accept') { st.judge_accepted++; out.push({ ...r, label_source: 'seed+judge', status: 'judge-accepted', judge: 'accept' }); }
      else if (v.v === 'fix' && v.fixed?.op) {
        const g = gateOne(gc, { ...r, op: v.fixed.op, slots: v.fixed.slots ?? [] });
        if (g.ok) { st.judge_fixed++; out.push({ ...g.rec, label_source: 'judge-fixed', status: 'judge-fixed', judge: 'fix' }); } else st.judge_rejected++;
      } else st.judge_rejected++;
    }
    const final = out.filter((x) => x.status !== 'agreed-audit-rejected').map((x) => ({ ...x, split: splitOf(x.world, x.group, dev, test) }));
    wl(`${MAIN}training/dataset/nx/final/${w}.jsonl`, final);
    rep.worlds[w] = { ...st, final: final.length, splits: final.reduce((a, x) => ((a[x.split] = (a[x.split] ?? 0) + 1), a), {}) };
  }
  const a = rep.judge.audit; rep.audit_error_rate = a.n ? Math.round(((a.reject ?? 0) / a.n) * 10000) / 10000 : null;
  const d = rep.judge.disagreed; rep.judge_accept_rate = d.n ? Math.round((((d.accept ?? 0) + (d.fix ?? 0)) / d.n) * 10000) / 10000 : null;
  rep.totals = { final: Object.values(rep.worlds).reduce((s, x) => s + x.final, 0) };
  wj(`${GEN}/finalize-report.json`, rep); console.log(JSON.stringify({ totals: rep.totals, judge: rep.judge, audit_error_rate: rep.audit_error_rate, judge_accept_rate: rep.judge_accept_rate }));
}

const cmd = process.argv[2];
if (cmd === 'gate') await gate();
if (cmd === 'agree') await agree();
if (cmd === 'judge-prepare') judgePrepare();
if (cmd === 'finalize') await finalize();
