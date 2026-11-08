#!/usr/bin/env node
/**
 * Export encoder training data (spec 08, spec 03 section 6, vision section 6).
 *
 * Two sources per world, both written to training/data/<world>.jsonl:
 *   1. rule-derived    - inputs of tests.sop (replayed per test session) and `example=` entries of patterns.sop,
 *                        formalized by the rule strategy (label_status = rule-derived).
 *   2. generator-backed - examples of worlds/<id>/datagen.mjs (fixed seed per world = hash of id + generator version).
 *                        The text (after its `context` messages, formalized first in the same session) is formalized by
 *                        the rules and the canonical wires are compared with the generator's `expect`
 *                        (ids and core.source / core.seq / core.via / core.in ignored; entity wires core.agent ignored).
 *                        Status: generator-backed (agree), generator-disagrees (kept, flagged), negative.
 * Splits are assigned per group (hash of world + group), so paraphrases of one template never straddle train and dev.
 * training/data/report.json holds counts per status, phenomenon and split and the agreement rate per world.
 *
 * Usage: node scripts/export-training.mjs [--world <id>] [--count <n per world>] [--out-dir training/data]
 *                                         [--dev 0.1] [--root worlds] [--seed-salt <text>] [--no-rules]
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { formalize, FormSession } from '../src/formalizer/rules/index.mjs';
import { parse, serialize } from '../src/soplang/index.mjs';

export const IGNORED_KEYS = new Set(['core.source', 'core.seq', 'core.via', 'core.in']);
export const DEFAULT_COUNT = 2000;

/** Deterministic seed of a world's generator: first 32 bits of sha256(world id + '@' + generator version + salt). */
export function seedOf(worldId, version, salt = '') {
  return createHash('sha256').update(`${worldId}@${version}${salt}`).digest().readUInt32BE(0);
}

/** mulberry32: small seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split name of a group: stable hash of world and group. */
export function splitOf(world, group, devShare = 0.1) {
  const h = createHash('sha256').update(`${world}\n${group}`).digest();
  return h.readUInt32BE(0) / 0xffffffff < devShare ? 'dev' : 'train';
}

const valueText = (v) => {
  if (v.kind === 'string') return JSON.stringify(v.v);
  if (v.kind === 'ref') return '$' + v.v;
  return /^-?\d+(\.\d+)?$/.test(v.v) ? String(Number(v.v)) : v.v;
};

/**
 * Canonical form of wires for comparison: entity wires (core.agent) and bookkeeping keys dropped, keys in full form,
 * entries sorted, wire ids ignored, wires sorted.
 */
export function canonicalWires(wires, legends) {
  const out = [];
  for (const w of wires) {
    if (w.type === 'core.agent') continue;
    const n = legends ? legends.normalizeWire(w).wire : w;
    const entries = n.entries.filter((e) => !IGNORED_KEYS.has(e.key)).map((e) => `${e.key}=${valueText(e.value)}`).sort();
    out.push(`${n.type} ${entries.join(' ')}`);
  }
  return out.sort();
}

/** Map key -> slot name from an emit template such as "@{_} t.holding owner={who} count={n}". */
function keySlots(emit) {
  const map = {};
  for (const m of String(emit).matchAll(/([A-Za-z_][\w.-]*)=\{(\w+)\}/g)) map[m[1]] = m[2];
  return map;
}

/** Typed mentions, key spans and references of the matched segments of a formalization result. */
function spansOf(res, patterns) {
  const mentions = [], keys = [], references = [];
  for (const seg of res.segments) {
    if (!seg.match) continue;
    const pat = patterns.get(seg.match.patternId);
    const slotOf = keySlots(pat?.emit ?? '');
    const segWires = seg.wires.filter((x) => x.type !== 'core.agent');
    const spans = [];
    for (const sw of segWires) {
      for (const [short, slot] of Object.entries(slotOf)) {
        const s = seg.match.slots[slot];
        if (!s) continue;
        const entry = sw.entries.find((e) => e.key === short || e.key.endsWith('.' + short));
        if (!entry) continue;
        keys.push({ wire: sw.id, key: entry.key, span: s.span, text: s.text, value: s.value });
        spans.push(s.span);
        if (entry.value.kind === 'ref') references.push({ wire: sw.id, key: entry.key, target: entry.value.v, span: s.span });
      }
    }
    for (const w of segWires) {
      mentions.push({ wire: w.id, type: w.type, span: spans.length ? [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))] : seg.span });
    }
  }
  return { mentions, keys, references };
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Formalize `messages` in order inside one fresh session; returns the result of the last one. */
function formalizeSession(set, messages) {
  const form = new FormSession();
  form.initDefaults();
  let res = null;
  messages.forEach((m, i) => { res = formalize(m, { worlds: set, session: form, source: `msg${i + 1}` }); });
  return res;
}

/** Plain data handed to generators through `context` (generators stay browser-safe and import nothing). */
function generatorContext(set, world) {
  const lexicons = {};
  for (const w of set.list()) for (const lex of w.lexicons) lexicons[lex.id] = lex.words.map((x) => x.toLowerCase());
  const names = { m: [], f: [] };
  for (const w of set.list()) for (const lex of w.lexicons) {
    if (lex.class === 'name') (lex.gender === 'f' ? names.f : names.m).push(...lex.words.map((x) => x.toLowerCase()));
  }
  const short = (type, k) => (k.startsWith(type + '.') ? k.slice(type.length + 1) : k);
  const kb = (world?.kb ?? []).filter((w) => !w.type.startsWith('core.')).map((w) => {
    const o = { type: w.type };
    for (const e of w.entries) {
      if (e.key.startsWith('core.')) continue;
      const k = short(w.type, e.key);
      (o[k] ??= []).push(e.value.v);
    }
    return o;
  });
  return { worldId: world?.id, lexicons, names, kb };
}

/** Run a generator and check its records. */
async function runGenerator(mod, { world, set, count, seed }) {
  const rng = mulberry32(seed);
  const items = await mod.generate({ rng, count, context: generatorContext(set, world) });
  const seen = new Set();
  const out = [];
  for (const it of items ?? []) {
    if (!it || typeof it.text !== 'string' || !it.text.trim()) continue;
    const key = JSON.stringify([it.context ?? [], it.text]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= count) break;
  }
  return out;
}

const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

/**
 * Export. Returns { records: Map(worldId -> record[]), report }.
 * `opts`: { root, world, count, devShare, seedSalt, ruleDerived (default true), log }
 */
export async function exportTraining({ root = DEFAULT_ROOT, world: only = null, count = DEFAULT_COUNT, devShare = 0.1, seedSalt = '', ruleDerived = true, log = () => {} } = {}) {
  const loader = createFsLoader({ roots: [root] });
  const set = await loadWorlds(loader);
  const legends = set.legends;
  const records = new Map();
  const report = { options: { count, dev_share: devShare, seed_salt: seedSalt }, worlds: {}, totals: {} };
  const add = (worldId, rec) => {
    if (only && worldId !== only) return false;
    if (!records.has(worldId)) records.set(worldId, []);
    records.get(worldId).push(rec);
    return true;
  };
  const patternsOf = new Map();
  for (const w of set.list()) for (const p of w.patterns) patternsOf.set(p.id, p);

  // ---- 1. rule-derived: tests (replayed per session) and pattern examples
  const ruleRecord = (res, message, context, kind) => {
    for (const seg of res.segments) {
      if (!seg.match) continue;
      const segWires = seg.wires.filter((x) => x.type !== 'core.agent');
      const only1 = { segments: [seg] };
      const { mentions, keys, references } = spansOf(only1, patternsOf);
      const group = `${seg.match.worldId}/${seg.match.patternId}`;
      add(seg.match.worldId, {
        example_id: sha(group + '\n' + context.join('\n') + '\n' + message + '\n' + seg.span.join('-')),
        lineage: { kind: 'rule-derived', source: kind, world: seg.match.worldId, pattern: seg.match.patternId },
        source_group: group, group, language: 'en',
        text: seg.text, message, context, segment_span: seg.span,
        mentions, keys, references, kind: seg.match.kind,
        expected_circuit: serialize(segWires),
        label_status: 'rule-derived', phenomenon: seg.match.kind, split: splitOf(seg.match.worldId, group, devShare),
      });
    }
  };
  for (const w of ruleDerived ? set.list() : []) {
    const sessions = new Map();
    const seen = new Set();
    for (const wire of w.wires) {
      if (wire.type !== 'core.test') continue;
      const input = wire.entries.find((e) => e.key.endsWith('input'))?.value.v;
      if (typeof input !== 'string') continue;
      const sid = wire.entries.find((e) => e.key.endsWith('session'))?.value.v ?? `__${wire.id}`;
      const s = sessions.get(sid) ?? { form: (() => { const f = new FormSession(); f.initDefaults(); return f; })(), msgs: [] };
      sessions.set(sid, s);
      const res = formalize(input, { worlds: set, session: s.form, source: `msg${s.msgs.length + 1}` });
      const context = [...s.msgs];
      s.msgs.push(input);
      const key = context.join('\n') + '\u0000' + input;
      if (!seen.has(key)) { seen.add(key); ruleRecord(res, input, context, 'test'); }
    }
    for (const p of w.patterns) {
      for (const ex of p.examples ?? []) {
        if (p.match.includes('recent(')) continue; // elliptic patterns need an earlier mention: covered by the tests and generators
        const key = '\u0000' + ex;
        if (seen.has(key)) continue;
        seen.add(key);
        ruleRecord(formalizeSession(set, [ex]), ex, [], 'example');
      }
    }
  }

  // ---- 2. generator-backed
  const gen = new Map();
  for (const w of set.list()) {
    if (only && w.id !== only) continue;
    const file = join(root, w.id, 'datagen.mjs');
    if (!existsSync(file)) continue;
    let mod;
    try { mod = await import(pathToFileURL(file).href); } catch (e) { gen.set(w.id, { error: `import failed: ${e.message}` }); continue; }
    const version = String(mod.version ?? '0');
    const seed = seedOf(w.id, version, seedSalt);
    let items;
    try { items = await runGenerator(mod, { world: w, set, count, seed }); } catch (e) { gen.set(w.id, { error: `generate failed: ${e.message}`, version, seed }); continue; }
    const stat = { seed, version, total: 0, by_status: {}, positives: 0, positives_agree: 0, negatives: 0, negatives_ok: 0, invalid_expect: 0, gap_groups: {}, gap_examples: {} };
    gen.set(w.id, stat);
    for (const it of items) {
      const context = Array.isArray(it.context) ? it.context : [];
      const group = String(it.group ?? 'default');
      const negative = !!it.negative;
      let status, note = null, res;
      try { res = formalizeSession(set, [...context, it.text]); } catch (e) { res = { segments: [], wires: [] }; note = `formalizer error: ${e.message}`; }
      const gotWires = res.segments.flatMap((s) => s.wires);
      const got = canonicalWires(gotWires, legends);
      const fromThisWorld = res.segments.some((s) => s.match && s.match.worldId === w.id);
      let expected = [];
      let expectWires = [];
      if (it.expect != null && String(it.expect).trim()) {
        const pr = parse(String(it.expect), { source: group });
        expectWires = pr.wires;
        if (pr.errors.length) { note = `expect is not valid SOP Lang: ${pr.errors[0].message}`; stat.invalid_expect++; }
        else {
          for (const ew of expectWires) {
            const r = legends.normalizeWire(ew);
            if (r.errors.length) { note = `expect does not match the legend: ${r.errors[0].message}`; stat.invalid_expect++; break; }
          }
        }
        expected = canonicalWires(expectWires, legends);
      }
      if (negative) {
        status = fromThisWorld ? 'generator-disagrees' : 'negative';
        if (fromThisWorld) note = note ?? 'negative text was formalized by this world';
        stat.negatives++;
        if (status === 'negative') stat.negatives_ok++;
      } else {
        const agree = !note && JSON.stringify(got) === JSON.stringify(expected);
        status = agree ? 'generator-backed' : 'generator-disagrees';
        if (!agree && !note) note = got.length ? 'rule wires differ from expect' : 'rule formalizer found no reading';
        stat.positives++;
        if (agree) stat.positives_agree++;
      }
      if (status === 'generator-disagrees') {
        bump(stat.gap_groups, group);
        if (!stat.gap_examples[group]) stat.gap_examples[group] = { text: it.text, context, expect: expected, got, note };
      }
      stat.total++;
      bump(stat.by_status, status);
      const message = it.text;
      const { mentions, keys, references } = status === 'generator-disagrees' ? { mentions: [], keys: [], references: [] } : spansOf(res, patternsOf);
      const expectedCircuit = expectWires.length ? serialize(expectWires) : '';
      const rec = {
        example_id: sha(`${w.id}\n${group}\n${context.join('\n')}\n${it.text}`),
        lineage: { kind: 'generator', world: w.id, generator_version: version, seed },
        source_group: `${w.id}/${group}`, group, language: 'en',
        text: it.text, message, context, segment_span: [0, it.text.length],
        mentions, keys, references,
        kind: it.kind ?? it.phenomenon ?? 'statement',
        expected_circuit: expectedCircuit,
        label_status: status, phenomenon: it.phenomenon ?? 'statement', negative,
        split: splitOf(w.id, group, devShare), seed, generator_version: version,
      };
      if (status === 'generator-disagrees') {
        rec.rule_circuit = serialize(gotWires.filter((x) => x.type !== 'core.agent'));
        rec.note = note;
      }
      add(w.id, rec);
    }
  }

  // ---- report
  for (const [id, recs] of records) {
    const counts = { total: recs.length, by_status: {}, by_phenomenon: {}, by_split: {} };
    for (const r of recs) { bump(counts.by_status, r.label_status); bump(counts.by_phenomenon, r.phenomenon); bump(counts.by_split, r.split); }
    const g = gen.get(id);
    const entry = { ...counts, generator: !!g };
    if (g) {
      if (g.error) entry.generator_error = g.error;
      else {
        const all = g.total;
        entry.generator_version = g.version;
        entry.seed = g.seed;
        entry.generator_records = all;
        entry.agreement = {
          rate: all ? Number(((g.positives_agree + g.negatives_ok) / all).toFixed(4)) : null,
          positive_rate: g.positives ? Number((g.positives_agree / g.positives).toFixed(4)) : null,
          negative_rate: g.negatives ? Number((g.negatives_ok / g.negatives).toFixed(4)) : null,
          positives: g.positives, positives_agree: g.positives_agree, negatives: g.negatives, negatives_ok: g.negatives_ok,
          invalid_expect: g.invalid_expect,
        };
        entry.pattern_gaps = Object.entries(g.gap_groups).sort((a, b) => b[1] - a[1]).map(([group, n]) => ({ group, count: n, example: g.gap_examples[group] }));
      }
    }
    report.worlds[id] = entry;
  }
  for (const [id, g] of gen) if (!records.has(id)) report.worlds[id] = { total: 0, generator: true, generator_error: g.error ?? 'no records' };
  const tot = { records: 0, by_status: {}, by_split: {} };
  for (const e of Object.values(report.worlds)) {
    tot.records += e.total ?? 0;
    for (const [k, v] of Object.entries(e.by_status ?? {})) tot.by_status[k] = (tot.by_status[k] ?? 0) + v;
    for (const [k, v] of Object.entries(e.by_split ?? {})) tot.by_split[k] = (tot.by_split[k] ?? 0) + v;
  }
  report.totals = tot;
  log(`worlds with records: ${[...records.keys()].join(', ')}`);
  return { records, report };
}

// ---------------------------------------------------------------------------------------------- CLI
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  const root = resolve(opt('--root', DEFAULT_ROOT));
  const outDir = resolve(opt('--out-dir', 'training/data'));
  const only = opt('--world', null);
  const count = Number(opt('--count', DEFAULT_COUNT));
  const devShare = Number(opt('--dev', '0.1'));
  const seedSalt = opt('--seed-salt', '');
  const { records, report } = await exportTraining({ root, world: only, count, devShare, seedSalt, ruleDerived: !args.includes('--no-rules') });
  mkdirSync(outDir, { recursive: true });
  for (const [id, recs] of records) {
    writeFileSync(join(outDir, `${id}.jsonl`), recs.map((r) => JSON.stringify(r)).join('\n') + (recs.length ? '\n' : ''));
  }
  // with --world, merge into the existing report instead of replacing it
  let finalReport = report;
  const reportPath = join(outDir, 'report.json');
  if (only && existsSync(reportPath)) {
    try {
      const old = JSON.parse(readFileSync(reportPath, 'utf8'));
      finalReport = { ...old, worlds: { ...old.worlds, ...report.worlds } };
      const tot = { records: 0, by_status: {}, by_split: {} };
      for (const e of Object.values(finalReport.worlds)) {
        tot.records += e.total ?? 0;
        for (const [k, v] of Object.entries(e.by_status ?? {})) tot.by_status[k] = (tot.by_status[k] ?? 0) + v;
        for (const [k, v] of Object.entries(e.by_split ?? {})) tot.by_split[k] = (tot.by_split[k] ?? 0) + v;
      }
      finalReport.totals = tot;
    } catch { /* keep the fresh report */ }
  }
  writeFileSync(reportPath, JSON.stringify(finalReport, null, 2) + '\n');
  let total = 0;
  for (const [id, recs] of records) {
    total += recs.length;
    const e = report.worlds[id];
    const a = e?.agreement;
    console.log(`${id.padEnd(16)} ${String(recs.length).padStart(6)} records  ${Object.entries(e.by_status).map(([k, v]) => `${k}=${v}`).join(' ')}${a ? `  agreement=${a.rate} (positives ${a.positive_rate})` : ''}`);
  }
  console.log(`wrote ${total} records for ${records.size} worlds to ${outDir}`);
}
