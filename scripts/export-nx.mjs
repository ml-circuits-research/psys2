#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NX1 converter: free labels in the NX segment format (training/nx/README.md).
 *
 * Sources (no LLM):
 *   rules   training/dataset/<world>/{train,dev,test,review}.jsonl (rule-derived, generator-backed, paraphrase readings, relabelled, canonical-ok):
 *           the label wires are split into segments (core.source offsets, or the rules' own segments when the label has none) and every slot
 *           gets a span from the rule formalizer's own match slots, else by surface alignment of the canonical value, else (second pass) by a
 *           surface lexicon learned from the aligned slots.
 *   diagram imports/diagram-vss-demo/data/train (never data/test or data/bench): wires with segment spans and args, one core.request per wire.
 *   phrase-logs (optional, --phrase-logs <dir>): rules readings of logged phrases.
 * Output (outside git): <out>/free-rules.jsonl, <out>/free-diagram.jsonl, <out>/free-phrase-logs.jsonl; report training/results/nx-data-report.json.
 *
 *   node scripts/export-nx.mjs [--out /home/salboaie/work/psys2/training/dataset/nx] [--jobs 6] [--limit N] [--report training/results/nx-data-report.json]
 *   node scripts/export-nx.mjs --check <file.jsonl>
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, createWriteStream } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { formalize, FormSession } from '../src/formalizer/rules/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { NO_SPAN_OK, BOOKKEEPING, OP_KEYS, opOfWire, vstr, alignValue, findSpan, statusOf, validateRecord, normText, segmentsOf } from './lib/nx-format.mjs';

const HERE = fileURLToPath(import.meta.url);
const REPO = resolve(HERE, '..', '..');
const MAIN_REPO = '/home/salboaie/work/psys2';
const DATASET = existsSync(join(REPO, 'training/dataset/routing.jsonl')) ? join(REPO, 'training/dataset') : join(MAIN_REPO, 'training/dataset');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

// ------------------------------------------------------------------------------------------------ slots of a segment
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'it', 'is', 'and', 'on', 'my', 'me', 'i', 'you', 'please', 'can', 'do', 'what', 'how', 'with', 'for']);
const SRC_RE = /^msg(\d+)#(\d+)-(\d+)$/;
const needsWorldTag = (k) => k.startsWith('core.request.arg.') || k.startsWith('core.question.where.');

function emitSlots(emit) {
  const map = {};
  for (const m of String(emit ?? '').matchAll(/([A-Za-z_][\w.-]*)="?\{(\w+)\}"?/g)) map[m[1]] = m[2];
  return map;
}

function askOf(legends, wire, key, action) {
  const direct = legends?.keys.get(key)?.ask;
  if (direct) return { ask: direct, src: 'legend' };
  if (key.startsWith('core.question.where.')) {
    const k = key.slice('core.question.where.'.length);
    const type = wire.entries.find((e) => e.key === 'core.question.type');
    const a = type && legends?.keys.get(`${vstr(type.value)}.${k}`)?.ask;
    if (a) return { ask: a, src: 'legend' };
    return { ask: `What is the ${k.replace(/_/g, ' ')} in the question about ${type ? vstr(type.value) : 'it'}?`, src: 'synthesized' };
  }
  if (key.startsWith('core.request.arg.')) return { ask: `What is the ${key.slice('core.request.arg.'.length).replace(/_/g, ' ')} of the ${action} request?`, src: 'synthesized' };
  return { ask: `What is the ${key.split('.').pop().replace(/_/g, ' ')}?`, src: 'synthesized' };
}

/** slots of one segment. `rulesSegs`: rule formalizer segments (with offsets relative to the message the rules read; `offset` = segment start in that message). */
function slotsOf({ world, text, offset, wires, rulesSegs = [], legends, patternsOf }) {
  const used = [];
  const slots = [];
  const ops = [];
  for (const w of wires) {
    const op = opOfWire(w);
    if (!op) continue;
    ops.push(op);
    const action = op.startsWith('request:') ? op.slice(8) : op;
    for (const e of w.entries) {
      if (BOOKKEEPING.has(e.key) || OP_KEYS.has(e.key)) continue;
      const value = vstr(e.value);
      if (value === '') continue;
      let span = null, spanSource = 'none', sText = null, surface = [];
      // 1. the rules' own slot of the same value
      for (const rs of rulesSegs) {
        const slotsOfMatch = rs.match?.slots ?? {};
        const emap = emitSlots(patternsOf?.get(rs.match.patternId)?.emit);
        const short = Object.keys(emap).find((k) => e.key === k || e.key.endsWith('.' + k));
        const cands = [];
        if (short && slotsOfMatch[emap[short]]) cands.push(slotsOfMatch[emap[short]]);
        for (const s of Object.values(slotsOfMatch)) if (!cands.includes(s) && s.value != null && normText(String(s.value)) === normText(value.replace(/^\$e\./, ''))) cands.push(s);
        for (const s of cands) {
          if (s.text) surface.push(s.text);
          if (!span && s.span) {
            const a = [s.span[0] - offset, s.span[1] - offset];
            if (a[0] >= 0 && a[1] <= text.length && a[1] > a[0] && !used.some((u) => a[0] < u[1] && a[1] > u[0])) { span = a; spanSource = 'rules'; }
          }
        }
        if (span) break;
      }
      if (!span) { span = alignValue(text, value, used, surface); if (span) spanSource = 'aligned'; }
      if (span) { used.push(span); sText = text.slice(span[0], span[1]); }
      else {
        // the same value already stated by another slot of this segment (art.draw kind / kt): no second span, not an error
        const stem = (v) => normText(String(v).replace(/^\$e\./, '').replace(/^(the|a|an) /i, '')).replace(/(es|s)$/, '');
        const nv = stem(value);
        if (nv && slots.some((x) => x.span && stem(x.value) === nv)) spanSource = 'dup';
      }
      const { ask, src } = askOf(legends, w, e.key, action);
      slots.push({ key: e.key, tag: needsWorldTag(e.key) ? `${world}|${e.key}` : e.key, ask, ask_source: src, span, text: sText, value, span_source: spanSource });
    }
  }
  return { ops, slots };
}

function mkRecord(base, segText, seg, ops, slots) {
  const rec = {
    id: 'nx-' + sha([base.world, base.message, seg.join('-'), ops.join('+'), base.context.prev.join('|')].join('\n')),
    group: base.group, split: base.split, world: base.world, tab: base.context.tab, context: base.context,
    message: base.message, seg, text: segText, lang: 'en',
    op: ops[0] ?? 'none', ops: ops.length ? ops : ['none'], slots,
    label_source: base.label_source, labeler: base.labeler, judge: null, status: 'complete', negative: !!base.negative,
  };
  if (base.needs_review) rec.needs_review = true;
  rec.status = statusOf(rec);
  return rec;
}

// ------------------------------------------------------------------------------------------------ dataset (rules) records
const labelerOf = (r) => {
  const s = r.label_status;
  if (['rules-agree', 'rules-own', 'rule-derived', 'relabelled'].includes(s)) return 'rules';
  if (s === 'generator-backed' || s === 'generator-disagrees') return 'generator';
  return r.provenance?.author ? `paraphrase:${r.provenance.author}` : 'paraphrase';
};

async function makeProcessor() {
  const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
  const set = await loadWorlds(loader);
  const legends = set.legends;
  const patternsOf = new Map();
  for (const w of set.list()) for (const p of w.patterns) patternsOf.set(p.id, p);
  const tabOf = new Map(set.list().map((w) => [w.id, w.tab?.id ?? w.id]));
  const norm = (w) => { try { const n = legends.normalizeWire(w); return n.errors?.length ? w : n.wire; } catch { return w; } };
  const canon = (wires) => wires.filter((w) => w.type !== 'core.agent').map((w) => `${w.type} ${w.entries.filter((e) => !BOOKKEEPING.has(e.key)).map((e) => `${e.key}=${vstr(e.value)}`).sort().join(' ')}`).sort().join('\n');

  const rulesRead = (messages) => {
    const form = new FormSession(); form.initDefaults();
    let res = null;
    messages.forEach((m, i) => { res = formalize(m, { worlds: set, session: form, source: `msg${i + 1}` }); });
    return res;
  };

  return function processDatasetRecord(item) {
    const { rec, routing } = item;
    const message = rec.text;
    const prev = Array.isArray(rec.context) ? rec.context : [];
    const world = rec.world;
    const context = { tab: routing?.tab ?? rec.tab ?? tabOf.get(world) ?? 'none', recent: routing?.recent ?? [], prev };
    const base = { world, group: rec.group, split: rec.split, message, context, label_source: rec.label_status, labeler: labelerOf(rec), negative: rec.negative, needs_review: rec.split === 'review' };
    const target = String(rec.target ?? '').trim();
    if (!target) return [mkRecord(base, message, [0, message.length], [], [])];
    const pr = parse(target, { source: rec.group });
    if (pr.errors?.length) return [];
    const wires = pr.wires.filter((w) => w.type !== 'core.agent').map(norm);
    if (!wires.length) return [mkRecord(base, message, [0, message.length], [], [])];
    let res = null;
    try { res = rulesRead([...prev, message]); } catch { res = null; }
    const rulesSegs = (res?.segments ?? []).filter((s) => s.match);
    const sourceOf = (w) => { const e = w.entries.find((x) => x.key === 'core.source'); const m = e && SRC_RE.exec(vstr(e.value)); return m ? [Number(m[2]), Number(m[3])] : null; };
    const groups = new Map();
    let hasSource = true;
    for (const w of wires) { const s = sourceOf(w); if (!s) { hasSource = false; break; } const k = s.join('-'); if (!groups.has(k)) groups.set(k, { seg: s, wires: [] }); groups.get(k).wires.push(w); }
    const out = [];
    const segsOut = [];
    if (hasSource && rec.provenance?.lineage?.kind === 'rule-derived') {
      // rule-derived rows carry the segment text; offsets are relative to the original message
      segsOut.push({ seg: [0, message.length], wires, rs: rulesSegs.filter((s) => s.span[0] === 0) });
    } else if (hasSource) {
      for (const g of groups.values()) {
        const [s, e] = g.seg;
        if (!(s >= 0 && e > s && e <= message.length)) { segsOut.length = 0; segsOut.push({ seg: [0, message.length], wires, rs: rulesSegs }); break; }
        segsOut.push({ seg: [s, e], wires: g.wires, rs: rulesSegs.filter((r) => Math.min(r.span[1], e) - Math.max(r.span[0], s) > 0.5 * (e - s)) });
      }
    } else if (res && canon(res.segments.flatMap((s) => s.wires)) === canon(wires) && rulesSegs.length) {
      for (const rs of rulesSegs) segsOut.push({ seg: [rs.span[0], rs.span[1]], wires: rs.wires.filter((w) => w.type !== 'core.agent').map(norm), rs: [rs] });
    } else {
      segsOut.push({ seg: [0, message.length], wires, rs: rulesSegs });
    }
    for (const g of segsOut) {
      const [s, e] = g.seg;
      const text = message.slice(s, e);
      if (!text.trim()) continue;
      const { ops, slots } = slotsOf({ world, text, offset: s, wires: g.wires, rulesSegs: g.rs, legends, patternsOf });
      out.push(mkRecord(base, text, [s, e], ops, slots));
    }
    return out;
  };
}

// ------------------------------------------------------------------------------------------------ diagram source
const actOf = (w) => (w.type === 'question' ? `diagram.ask.${w.args.ask}` : w.type === 'fact' ? 'diagram.fact' : w.type === 'rule' ? 'diagram.rule' : `diagram.${w.args.action}`);
function diagramWire(w) {
  const entries = [{ key: 'core.request.action', value: { kind: 'atom', v: actOf(w) } }];
  for (const [k, v] of Object.entries(w.args ?? {})) {
    if (k === 'action' || k === 'ask' || v === null || v === undefined || v === '') continue;
    entries.push({ key: `core.request.arg.${k}`, value: { kind: 'string', v: String(v) } });
  }
  return { type: 'core.request', entries };
}
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

function diagramRecords(datasetSplits) {
  const src = join(REPO, 'imports/diagram-vss-demo/data/train');
  const out = [];
  const stats = { files: 0, messages: 0, skipped: 0 };
  for (const f of walk(src).filter((x) => x.endsWith('.jsonl')).sort()) {
    stats.files++;
    const dir = relative(src, f).split('/')[0];
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { stats.skipped++; continue; }
      const wires = (Array.isArray(r.wires) ? r.wires : r.wire ? [{ ...r.wire }] : []).filter((w) => w.args);
      if (!r.text || !wires.length) { stats.skipped++; continue; }
      stats.messages++;
      const text = r.text;
      const id = `diagram.sketch/train/${dir}/${r.id}`;
      const group = `diagram.sketch/${dir}/${String(r.id).replace(/-?\d+$/, '')}`;
      const split = datasetSplits.get(id) ?? (parseInt(sha(`diagram.sketch\n${group}`).slice(0, 8), 16) / 0xffffffff < 0.1 ? 'dev' : 'train');
      const base = { world: 'diagram.sketch', group, split, message: text, context: { tab: 'diagram', recent: ['diagram.sketch'], prev: [] }, label_source: 'imported-diagram', labeler: 'imported', negative: false };
      let segs = segmentsOf(text, wires);
      const spanned = wires.filter((w) => String(w.span ?? '').trim()).length;
      if (!segs.length || spanned !== wires.length) segs = [{ start: 0, end: text.length, wires }];
      // text outside the spans: filler records (the "no request" chatter), one per gap longer than 3 chars
      let pos = 0;
      for (const sg of segs) {
        if (sg.start - pos > 3 && text.slice(pos, sg.start).trim().length > 3 && spanned === wires.length) out.push({ ...mkRecord(base, text.slice(pos, sg.start).trim(), [pos, sg.start], [], []), _filler: true });
        pos = sg.end;
      }
      for (const sg of segs) {
        const segText = text.slice(sg.start, sg.end);
        const { ops, slots } = slotsOf({ world: 'diagram.sketch', text: segText, offset: sg.start, wires: sg.wires.map(diagramWire) });
        out.push(mkRecord(base, segText, [sg.start, sg.end], ops, slots));
      }
    }
  }
  return { records: out, stats };
}

// ------------------------------------------------------------------------------------------------ protected texts
export function loadProtected(repo = REPO) {
  const set = new Set();
  const dir = join(repo, 'training/eval');
  const take = (s) => { if (typeof s === 'string' && s.trim().length >= 3) set.add(normText(s)); };
  const visit = (o) => { if (typeof o === 'string') take(o); else if (Array.isArray(o)) o.forEach(visit); else if (o && typeof o === 'object') Object.values(o).forEach(visit); };
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^real-phrases-2026-11-09|^real-dialogue|^expectations-|^operational.*\.jsonl$|^dialogues\.jsonl$/.test(f)) : [];
  for (const f of files) {
    const txt = readFileSync(join(dir, f), 'utf8');
    if (f.endsWith('.jsonl')) for (const l of txt.split('\n')) { if (l.trim()) { try { visit(JSON.parse(l)); } catch { take(l); } } }
    else if (f.endsWith('.json')) { try { visit(JSON.parse(txt)); } catch { /* ignore */ } }
    else for (const l of txt.split('\n')) take(l.replace(/^[^:]{1,12}:\s*/, ''));
  }
  set.delete('');
  return { set, files };
}

// ------------------------------------------------------------------------------------------------ worker
if (!isMainThread) {
  const proc = await makeProcessor();
  const out = [];
  let errors = 0;
  for (const it of workerData.items) { try { out.push(...proc(it)); } catch (e) { errors++; } }
  parentPort.postMessage({ out, errors });
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  if (args.includes('--check')) {
    const f = opt('--check');
    let bad = 0, n = 0;
    for (const r of readJsonl(f)) { n++; const p = validateRecord(r); if (p.length) { bad++; if (bad <= 10) console.log(r.id, p.join('; ')); } }
    console.log(`${f}: ${n} records, ${bad} invalid`);
    process.exit(bad ? 1 : 0);
  }
  const outDir = resolve(opt('--out', join(MAIN_REPO, 'training/dataset/nx')));
  const jobs = Number(opt('--jobs', Math.min(6, Math.max(1, os.cpus().length - 4))));
  const limit = Number(opt('--limit', 0));
  const reportPath = resolve(opt('--report', join(REPO, 'training/results/nx-data-report.json')));
  mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();

  // dataset rows
  const routing = new Map();
  if (existsSync(join(DATASET, 'routing.jsonl'))) for (const r of readJsonl(join(DATASET, 'routing.jsonl'))) routing.set(r.id, { tab: r.context?.tab, recent: r.context?.recent_worlds ?? [] });
  const items = [];
  const diagramSplits = new Map();
  for (const w of readdirSync(DATASET, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const sp of ['train', 'dev', 'test', 'review']) {
      const f = join(DATASET, w.name, `${sp}.jsonl`);
      if (!existsSync(f)) continue;
      for (const r of readJsonl(f)) {
        if (r.source === 'imported') { diagramSplits.set(r.provenance?.example_id ?? r.id, r.split); continue; }
        if (!r.world || r.target === undefined) continue;
        items.push({ rec: r, routing: routing.get(r.id) });
      }
    }
  }
  const use = limit ? items.slice(0, limit) : items;
  console.log(`dataset rows: ${items.length} (using ${use.length}), jobs ${jobs}`);
  const chunks = Array.from({ length: jobs }, (_, i) => use.filter((_, j) => j % jobs === i));
  const results = await Promise.all(chunks.map((items) => new Promise((res, rej) => { const w = new Worker(HERE, { workerData: { items } }); w.on('message', res); w.on('error', rej); })));
  let rules = results.flatMap((r) => r.out);
  const workerErrors = results.reduce((n, r) => n + r.errors, 0);
  console.log(`rules records: ${rules.length}, worker errors ${workerErrors}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const dg = diagramRecords(diagramSplits);
  let diagram = limit ? dg.records.slice(0, limit) : dg.records;
  console.log(`diagram records: ${diagram.length}`);

  // second pass: surface lexicon learned from the corpus (n-grams associated with an unresolved (key, value) pair)
  const all = [...rules, ...diagram];
  const grams = (text) => {
    const w = [...text.toLowerCase().matchAll(/[a-z0-9']+/g)].map((m) => m[0]);
    const out = new Set(w);
    for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]} ${w[i + 1]}`);
    return out;
  };
  const df = new Map(); const nByWorld = new Map();
  for (const r of all) { nByWorld.set(r.world, (nByWorld.get(r.world) ?? 0) + 1); const d = df.get(r.world) ?? new Map(); for (const g of grams(r.text)) d.set(g, (d.get(g) ?? 0) + 1); df.set(r.world, d); }
  const groupsU = new Map();
  for (const r of all) for (const s of r.slots) if (!s.span && s.span_source !== 'dup' && !/^\$|^mention\(/.test(s.value) && !NO_SPAN_OK.has(s.key) && !/^[A-Z]/.test(s.value) && !/\.(target|from|to|anchor|name|label|item|text|title|phrase)\d*$/.test(s.key)) {
    const k = `${r.world}\u0000${s.key}\u0000${s.value}`;
    const g = groupsU.get(k) ?? { n: 0, c: new Map(), world: r.world }; g.n++;
    for (const x of grams(r.text)) g.c.set(x, (g.c.get(x) ?? 0) + 1);
    groupsU.set(k, g);
  }
  const lexicon = new Map();
  for (const [k, g] of groupsU) {
    if (g.n < 3) continue;
    const d = df.get(g.world), N = nByWorld.get(g.world);
    const picks = [...g.c].filter(([x, c]) => c >= Math.max(3, 0.2 * g.n) && (c / g.n) / ((d.get(x) ?? 1) / N) >= 6 && !STOP.has(x)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([x]) => x);
    if (picks.length) lexicon.set(k, picks);
  }
  let recovered = 0;
  for (const r of all) {
    const used = r.slots.filter((s) => s.span).map((s) => s.span);
    for (const s of r.slots) {
      if (s.span) continue;
      const picks = lexicon.get(`${r.world}\u0000${s.key}\u0000${s.value}`);
      if (!picks) continue;
      for (const surf of picks) {
        const sp = findSpan(r.text, surf, used);
        if (sp) { s.span = sp; s.text = r.text.slice(sp[0], sp[1]); s.span_source = 'lexicon'; used.push(sp); recovered++; break; }
      }
    }
    r.status = statusOf(r);
  }
  console.log(`second pass recovered ${recovered} spans from ${lexicon.size} learned (key, value) surfaces`);

  // protected filter
  const prot = loadProtected();
  let protectedDropped = 0;
  const keep = (r) => { if (prot.set.has(normText(r.message)) || prot.set.has(normText(r.text))) { protectedDropped++; return false; } return true; };
  rules = rules.filter(keep); diagram = diagram.filter(keep);

  // dedupe by id, validate, write
  const writeSet = (name, recs) => {
    const seen = new Set(); const kept = []; let dup = 0, invalid = 0;
    for (const r of recs) {
      if (r._filler) delete r._filler;
      if (seen.has(r.id)) { dup++; continue; }
      seen.add(r.id);
      if (validateRecord(r).length) { invalid++; continue; }
      kept.push(r);
    }
    const f = join(outDir, name);
    const ws = createWriteStream(f);
    for (const r of kept) ws.write(JSON.stringify(r) + '\n');
    ws.end();
    return { kept, dup, invalid, file: f };
  };
  const wr = writeSet('free-rules.jsonl', rules), wd = writeSet('free-diagram.jsonl', diagram);
  const phraseLogs = { files: 0, records: 0, note: 'training/phrase-logs holds no .jsonl yet (gitignored, filled by the app export); no feedback records in the repo' };
  const logsDir = opt('--phrase-logs', join(MAIN_REPO, 'training/phrase-logs'));
  if (existsSync(logsDir)) phraseLogs.files = readdirSync(logsDir).filter((f) => f.endsWith('.jsonl')).length;

  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  const report = { generated_by: 'node scripts/export-nx.mjs', dataset: DATASET.replace(MAIN_REPO + '/', ''), seconds: Math.round((Date.now() - t0) / 1000), protected: { files: prot.files, texts: prot.set.size }, protected_dropped: protectedDropped, worker_errors: workerErrors, second_pass_recovered: recovered, second_pass_surfaces: lexicon.size, duplicates: wr.dup + wd.dup, invalid_dropped: wr.invalid + wd.invalid, phrase_logs: phraseLogs, diagram_source: dg.stats, files: {}, totals: { records: 0, by_status: {}, by_split: {}, by_label_source: {}, by_span_source: {}, slots: 0, slots_spanned: 0, ops: 0 }, worlds: {} };
  const ops = new Set();
  for (const [name, w] of [['free-rules.jsonl', wr], ['free-diagram.jsonl', wd]]) {
    report.files[name] = w.kept.length;
    for (const r of w.kept) {
      ops.add(r.op);
      const e = report.worlds[r.world] ??= { records: 0, by_status: {}, by_split: {}, by_label_source: {}, by_span_source: {}, slots: 0, slots_spanned: 0, ops: [] };
      e.records++; bump(e.by_status, r.status); bump(e.by_split, r.split); bump(e.by_label_source, r.label_source);
      if (!e.ops.includes(r.op)) e.ops.push(r.op);
      for (const s of r.slots) { e.slots++; bump(e.by_span_source, s.span_source); if (s.span) e.slots_spanned++; }
      const t = report.totals; t.records++; bump(t.by_status, r.status); bump(t.by_split, r.split); bump(t.by_label_source, r.label_source);
      for (const s of r.slots) { t.slots++; bump(t.by_span_source, s.span_source); if (s.span) t.slots_spanned++; }
    }
  }
  report.totals.ops = ops.size;
  for (const e of Object.values(report.worlds)) { e.ops = e.ops.length; }
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ totals: report.totals, protected_dropped: protectedDropped, files: report.files }, null, 1));
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === HERE) await main();
