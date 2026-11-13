#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// The first measurement of the world diagram.sketch with the rules (task DIAG): the labelled sets of diagram-vss-demo scored with the logic of its
// bench-canon.js (imports/diagram-vss-demo/reference/bench-canon.js): right act, right args, extras, wrong.
//
//   node scripts/eval-diagram.mjs [--set bench|test|all] [--jobs N] [--limit N] [--stride N] [--no-write] [--verbose]
//
// Sets: data/bench/*.json (single sentences with gold args) and data/test (labelled messages, one or several wires each).
// For every row the world is loaded in a dialog session with the Diagram tab open and the shapes of the row on the canvas.
//   act      the act of the pattern that read the sentence (diagram.<action>, diagram.ask.<ask>, diagram.fact, diagram.rule) against the gold act
//   args     the engine's rules reader (ops.read: the arguments the operation would run) scored with bench-canon `score` against the gold args
//   right    the act is the gold act and every gold arg is read as the gold says
//   extras   args the reader adds that the gold does not have (counted on rows with the right act)
//   wrong    another act, or another world, read the sentence (a wrong command would have run)
//   unread   no segment read the sentence as a request
// Messages: every gold wire is matched to the segment that covers its span (the wires of the haiku batches carry no span: they count only in the reader score).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { score, canon, canonWant } from '../imports/diagram-vss-demo/reference/bench-canon.js';
import { createSourceSystem } from './lib/diagram-source.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const DATA = join(REPO, 'imports/diagram-vss-demo/data');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const WORLD = 'diagram.sketch';

const actOfWire = (w0) => { const w = { type: w0.type, args: w0.args ?? w0.gold }; return actOfWire0(w).toLowerCase(); };
const actOfWire0 = (w) => (w.type === 'question' ? `diagram.ask.${w.args.ask}` : w.type === 'fact' ? 'diagram.fact' : w.type === 'rule' ? 'diagram.rule' : `diagram.${w.args.action}`);
const rowActs = (row) => (row.wires ? row.wires.filter((w) => w.args).map(actOfWire) : [actOfWire({ type: row.type, args: row.gold })]);

function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])); }
function loadRows(which, limit) {
  const rows = [];
  if (which !== 'test') {
    for (const id of ['hand', 'blind', 'broad', 'seen', 'new_identities', 'heldout_formulations']) {
      for (const [i, r] of JSON.parse(readFileSync(join(DATA, 'bench', `${id}.json`), 'utf8')).entries()) rows.push(r.wires ? { set: `bench/${id}`, id: `${id}#${i}`, text: r.text, names: r.names ?? [], groups: {}, wires: r.wires.filter((w) => w.args ?? w.gold).map((w) => ({ ...w, args: w.args ?? w.gold })) } : { set: `bench/${id}`, id: `${id}#${i}`, text: r.text, names: r.names ?? [], groups: {}, type: r.type, gold: r.gold });
    }
  }
  if (which !== 'bench') {
    for (const f of walk(join(DATA, 'test')).filter((x) => x.endsWith('.jsonl')).sort()) {
      const dir = f.slice(join(DATA, 'test').length + 1).split('/')[0];
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        const wires = (r.wires ?? []).filter((w) => w.args);
        if (!wires.length || !r.text) continue;
        rows.push({ set: `test/${dir}`, id: String(r.id), text: r.text, names: r.names ?? [], groups: r.groups ?? {}, wires });
      }
    }
  }
  const stride = Number(arg('stride', 1));   // --stride N keeps every Nth row (a quick, spread-out sample)
  const kept = stride > 1 ? rows.filter((_, i) => i % stride === 0) : rows;
  return limit ? kept.slice(0, limit) : kept;
}

const stateOf = (row) => ({
  shapes: (row.names ?? []).map((name, i) => ({ name, shape: 'circle', x: 80 + 100 * (i % 6), y: 80 + 100 * Math.floor(i / 6), size: 62, color: 'white', order: i + 1 })),
  groups: Object.entries(row.groups ?? {}).map(([name, members]) => ({ name, members })), seq: {}, edgeSeq: 0, order: (row.names ?? []).length,
});

async function setup() {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const ops = await import('../worlds/diagram.sketch/engine.mjs');
  const actOf = new Map(engine.set.get(WORLD).patterns.map((p) => [p.id, /action=([\w.]+)/.exec(p.emit)?.[1]]));
  const allActs = new Map(engine.set.list().flatMap((w) => w.patterns.map((p) => [p.id, /action=([\w.]+)/.exec(p.emit ?? '')?.[1] ?? null])));
  const src = createSourceSystem();
  return { engine, ops, actOf, allActs, src };
}
/** The act of a node of the source reader ("diagram.label", "diagram.ask.count" ...). */
const nodeAct = (n) => actOfWire({ type: n.type, args: n.args });
/** The source rules reader on the same row (DIAG3 item 6): its main nodes, scored with the same bench-canon logic. */
function readSource(env, row, goldRow) {
  const ctx = { names: (row.names ?? []).concat(Object.keys(row.groups ?? {})) };
  let nodes = [];
  try { nodes = env.src.formalize(row.text, ctx).nodes ?? []; } catch { nodes = []; }
  const main = nodes.filter((n) => n.type !== 'mention');
  return { nodes, acts: main.map(nodeAct), ok: score(nodes, goldRow).ok };
}

/** Scores one row. */
async function scoreRow(env, row) {
  const { engine, ops, allActs } = env;
  const out = { set: row.set, id: row.id, text: row.text };
  const nodes = ops.read(row.text, stateOf(row))?.nodes ?? [];
  const goldRow = row.wires ? { wires: row.wires, text: row.text } : { type: row.type, gold: row.gold };
  const s = score(nodes, goldRow);
  out.reader = s.ok;
  const sr = readSource(env, row, goldRow);
  out.srcOk = sr.ok; out.srcActs = sr.acts;
  out.readerFails = Object.entries(s.per).filter(([, p]) => !p.ok).map(([k, p]) => `${k}:${p.got}!=${p.want}`).slice(0, 4);
  const sess = engine.createSession({ language: 'en' });
  sess.setWorldState('ui.shell', { activeTab: 'diagram' });
  sess.setWorldState(WORLD, stateOf(row));
  let r;
  try { r = await sess.send(row.text, { language: 'en' }); } catch (e) { out.error = String(e?.message ?? e); return out; }
  const segs = (r.segments ?? []).filter((x) => x.match);
  const acts = (x) => (allActs.get(x.match.patternId) ?? '').toLowerCase() || null;
  if (!row.wires) {
    const gold = rowActs(row)[0];
    const mine = segs.find((x) => x.match.worldId === WORLD && acts(x) === gold) ?? segs[0] ?? null;
    out.got = mine ? { world: mine.match.worldId, act: acts(mine) } : null;
    out.actRight = !!mine && mine.match.worldId === WORLD && acts(mine) === gold;
    out.outcome = !mine ? 'unread' : out.actRight ? (s.ok ? 'right' : 'right-act-wrong-args') : 'wrong';
    if (out.actRight) {   // extras: keys the reader adds beyond the gold
      const main = [...nodes].reverse().find((n) => n.type !== 'mention');
      if (main) { const got = canon(main, nodes), want = canonWant(row.type, row.gold); out.extras = Object.keys(got).filter((k) => !(k in want) && k !== 'action' && k !== 'ask'); }
    }
    out.gold = gold;
    return out;
  }
  // a message: every gold wire against the segment that covers its span
  const wires = [];
  let from = 0;
  for (const w of row.wires) {
    const sp = String(w.span ?? '').trim();
    let at = sp ? row.text.indexOf(sp, from) : -1;
    if (sp && at < 0) at = row.text.indexOf(sp);
    if (at >= 0) from = at;
    const gold = actOfWire(w);
    if (at < 0) { wires.push({ gold, outcome: 'nospan' }); continue; }
    const seg = (r.segments ?? []).find((x) => x.span && x.span[0] < at + sp.length && at < x.span[1]);
    if (!seg || !seg.match) { wires.push({ gold, outcome: 'unread', span: sp }); continue; }
    const got = acts(seg);
    wires.push({ gold, got, world: seg.match.worldId, span: sp, outcome: seg.match.worldId === WORLD && got === gold ? 'right' : seg.match.worldId === WORLD ? 'wrong-act' : 'other-world' });
  }
  out.wires = wires;
  out.fullSpan = wires.every((w) => w.outcome !== 'nospan');
  out.gold = rowActs(row);
  return out;
}

if (!isMainThread) serveShard(async () => { const env = await setup(); return (row) => scoreRow(env, row); });
else if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const which = arg('set', 'all');
  const rows = loadRows(which, arg('limit') ? Number(arg('limit')) : 0);
  const jobs = parseJobs(process.argv);
  const t0 = Date.now();
  const res = await runSharded({ file: SELF, items: rows, jobs });
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
  const bench = res.filter((r) => !r.wires), test = res.filter((r) => r.wires);
  const summary = { rows: res.length, seconds: Math.round((Date.now() - t0) / 1000) };
  const lines = [];
  if (bench.length) {
    const by = {};
    for (const r of bench) { const k = r.set; const b = (by[k] ??= { n: 0, right: 0, actRight: 0, readerRight: 0, rightActWrongArgs: 0, wrong: 0, unread: 0, extras: 0, actRightN: 0 }); b.n++; if (r.outcome === 'right') b.right++; if (r.actRight) { b.actRight++; if ((r.extras ?? []).length) b.extras++; } if (r.reader) b.readerRight++; if (r.outcome === 'right-act-wrong-args') b.rightActWrongArgs++; if (r.outcome === 'wrong') b.wrong++; if (r.outcome === 'unread') b.unread++; }
    const tot = Object.values(by).reduce((a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] ?? 0) + b[k]; return a; }, {});
    lines.push('bench (single sentences, the 10 multi-clause rows of broad count with the messages; world loaded on the Diagram tab with the row\'s shapes)');
    lines.push('set'.padEnd(28) + 'n'.padStart(5) + '  right  act-right  wrong-args  extras  wrong  unread  reader-only');
    for (const [k, b] of [...Object.entries(by), ['total', tot]]) lines.push(k.padEnd(28) + String(b.n).padStart(5) + `  ${pct(b.right, b.n).padStart(5)}  ${pct(b.actRight, b.n).padStart(8)}  ${pct(b.rightActWrongArgs, b.n).padStart(10)}  ${pct(b.extras, b.n).padStart(6)}  ${pct(b.wrong, b.n).padStart(5)}  ${pct(b.unread, b.n).padStart(6)}  ${pct(b.readerRight, b.n).padStart(10)}`);
    summary.bench = Object.fromEntries(Object.entries({ ...by, total: tot }).map(([k, b]) => [k, { ...b }]));
    const perAct = {};
    for (const r of bench) { const a = (perAct[r.gold] ??= { n: 0, right: 0, actRight: 0 }); a.n++; if (r.outcome === 'right') a.right++; if (r.actRight) a.actRight++; }
    summary.bench_per_act = perAct;
  }
  if (test.length) {
    const w = test.flatMap((r) => r.wires);
    const c = {}; for (const x of w) c[x.outcome] = (c[x.outcome] ?? 0) + 1;
    const spanned = w.filter((x) => x.outcome !== 'nospan').length;
    lines.push('', `test messages: ${test.length} messages, ${w.length} gold wires (${spanned} with a span)`);
    lines.push(`  wire level (act of the covering segment): right ${pct(c.right ?? 0, spanned)}  wrong act ${pct(c['wrong-act'] ?? 0, spanned)}  other world ${pct(c['other-world'] ?? 0, spanned)}  unread ${pct(c.unread ?? 0, spanned)}`);
    lines.push(`  message level (all wires read exactly as gold by the engine's rules reader): ${pct(test.filter((r) => r.reader).length, test.length)}`);
    summary.test = { messages: test.length, wires: w.length, spanned, outcomes: c, reader_exact_messages: test.filter((r) => r.reader).length };
    const bySet = {};
    for (const r of test) { const b = (bySet[r.set] ??= { n: 0, reader: 0 }); b.n++; if (r.reader) b.reader++; }
    summary.test.by_set = bySet;
  }
  // parity with the source rules reader (DIAG3 item 6): the same rows read by the source (createSystem().formalize) and by the world
  const P = (a, b) => (b ? (100 * a / b).toFixed(1) : '-');
  const parity = {};
  {
    const bn = bench.length, b = { n: bn, ours: { act: 0, args: 0, right: 0, wrong: 0, unread: 0 }, source: { act: 0, args: 0, right: 0, wrong: 0, unread: 0 } };
    for (const r of bench) {
      const o = b.ours, s = b.source, srcAct = r.srcActs.at(-1) === r.gold;
      if (r.actRight) o.act++; if (r.reader) o.args++; if (r.outcome === 'right') o.right++; if (r.outcome === 'wrong') o.wrong++; if (r.outcome === 'unread') o.unread++;
      if (srcAct) s.act++; if (r.srcOk) s.args++; if (srcAct && r.srcOk) s.right++; if (r.srcActs.length && !srcAct) s.wrong++; if (!r.srcActs.length) s.unread++;
    }
    parity.bench = b;
    const full = test.filter((r) => r.fullSpan), m = { messages: test.length, args_messages: { ours: test.filter((r) => r.reader).length, source: test.filter((r) => r.srcOk).length }, full_span: { messages: full.length, wires: 0, ours: { act: 0, wrong: 0, unread: 0 }, source: { act: 0, wrong: 0, unread: 0 } } };
    for (const r of full) {
      const f = m.full_span, n = r.gold.length; f.wires += n;
      for (const w of r.wires) { if (w.outcome === 'right') f.ours.act++; else if (w.outcome === 'unread') f.ours.unread++; else f.ours.wrong++; }
      const pool = [...r.srcActs]; let right = 0;
      for (const g of r.gold) { const i = pool.indexOf(g); if (i >= 0) { right++; pool.splice(i, 1); } }
      const wrong = Math.min(pool.length, n - right);
      f.source.act += right; f.source.wrong += wrong; f.source.unread += n - right - wrong;
    }
    parity.test = m;
    if (bn || test.length) {
      lines.push('', 'parity: source rules reader (imports/diagram-vss-demo/engine/logic.js createSystem().formalize) vs ours (world diagram.sketch through the dialog)');
      lines.push('bench (single sentences)'.padEnd(34) + `n=${bn}`.padStart(8) + '  act right  args right  right (both)  wrong  unread');
      for (const k of ['source', 'ours']) { const x = b[k]; lines.push(`  ${k}`.padEnd(34) + ''.padStart(8) + `  ${P(x.act, bn).padStart(9)}  ${P(x.args, bn).padStart(10)}  ${P(x.right, bn).padStart(12)}  ${P(x.wrong, bn).padStart(5)}  ${P(x.unread, bn).padStart(6)}`); }
      const f = m.full_span;
      lines.push(`messages: wires of ${f.messages} fully spanned messages (${f.wires} wires); args = all wires of the message read exactly (${test.length} messages)`.padEnd(34));
      lines.push('  act right  wrong  unread  | args right (message)');
      for (const k of ['source', 'ours']) { const x = f[k]; lines.push(`  ${k.padEnd(7)}${P(x.act, f.wires).padStart(9)}  ${P(x.wrong, f.wires).padStart(5)}  ${P(x.unread, f.wires).padStart(6)}  | ${P(m.args_messages[k], test.length)}`); }
    }
  }
  summary.parity = parity;
  console.log(lines.join('\n'));
  if (flag('verbose')) for (const r of res) if ((r.outcome && r.outcome !== 'right') || (r.wires && r.wires.some((x) => x.outcome !== 'right' && x.outcome !== 'nospan'))) console.log(`${r.outcome ?? "msg"}${r.srcOk === true && r.reader === false ? "/SRC-OK" : ""}\t${r.id}\t${JSON.stringify(r.text).slice(0, 110)}\t${r.gold}\t${JSON.stringify(r.got ?? r.wires?.filter((x) => x.outcome !== 'right').slice(0, 2))}`);
  if (!flag('no-write')) {
    const dir = join(REPO, 'training/results/diagram');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `rules-${arg('name', 'first')}.json`);
    writeFileSync(file, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), mode: 'rules', ...summary }, null, 1)}\n`);
    console.log(`wrote ${file.replace(`${REPO}/`, '')}`);
  }
}
