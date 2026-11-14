#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Measures the gap of the diagram world (reviewer block 2026-11-15 04:40, item 1) on training/eval/diagram-gap-2026-11-15.jsonl: 60 diagram requests judged by STATE.
 * One fresh session per request (tab = diagram), both reasoners. Measurement only: nothing here changes behaviour.
 *   node scripts/measure-diagram-gap.mjs [--reasoner ops|matrix|both] [--out <results.json>] [--ledger] [--verbose]
 *
 * Row: { id, group, kind, request, state?: { shapes: [{name, kind, x, y, label?}], edges: [[from, to, label?]] }, check: {...} }
 *   The `state` is put on the canvas with scattered coordinates (so that an arrangement is not already true); no `state` = an empty canvas.
 * Outcome per row: right (the check holds on the state after the request), wrong (the state changed and the check fails),
 *   not understood (the state did not change, or the reply says it did not understand).
 * Checks (all on positions, kinds, edges, labels of the state; tolerance in px):
 *   circle row column grid alignLeft evenlyX tree(root) startTop(name) arrowsLR      arrangement of the shapes already there
 *   kind {name, kind}   edge {from, to, either?}   edgeLabel {from, to, label}      edits
 *   diagram {minShapes, minEdges, structure: chain|cycle|tree|hub|venn|timeline, all: [[word, alt...], ...], order: [labels]}   a diagram kind built from nothing
 *   random {}   "make a random diagram": what it draws is recorded; right = a labelled diagram (>= 3 labelled shapes) that is a template or a connected graph, not only circles; the draws are also compared for variety
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SET = join(REPO, 'training/eval/diagram-gap-2026-11-15.jsonl');
const LEDGER = join(REPO, 'training/eval/failures.jsonl');
const WORLD = 'diagram.sketch';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const TOL = 6;

// ---- state in / out ----
const KIND_ID = { circle: 'c', rectangle: 'r', square: 's', diamond: 'd', ellipse: 'e', triangle: 't', hexagon: 'h', star: 'k', text: 'x' };
function stateOf(spec) {
  const seq = {};
  const shapes = (spec?.shapes ?? []).map((s, i) => {
    const kind = s.kind ?? 'rectangle';
    seq[kind] = (seq[kind] ?? 0) + 1;
    return { name: s.name, shape: kind, size: 62, color: 'white', outline: null, label: s.label ?? null, x: s.x, y: s.y, order: i + 1, kind, id: `${KIND_ID[kind] ?? 'r'}${seq[kind]}` };
  });
  const edges = (spec?.edges ?? []).map(([from, to, label], i) => ({ id: `a${i + 1}`, from, to, style: 'solid', arrow: 'forward', label: label ?? null, color: null }));
  return { shapes, edges, rules: [], seq, edgeSeq: edges.length, ruleSeq: 0, order: shapes.length, frame: { x: 0, y: 0 }, frames: [], groups: [], last: [], selected: null, pending: null, undo: [], redo: [], rev: 0 };
}
const snap = (st) => JSON.stringify({ s: (st?.shapes ?? []).map((s) => [s.name, s.kind ?? s.shape, s.x, s.y, s.label, s.w, s.h]), e: (st?.edges ?? []).map((e) => [e.from, e.to, e.label, e.arrow, e.style]) });

// ---- check helpers ----
const text = (s) => `${s.label ?? ''} ${s.name ?? ''}`.toLowerCase();
const by = (st, n) => (st.shapes ?? []).find((s) => s.name.toLowerCase() === String(n).toLowerCase() || s.id === n || (s.label ?? '').toLowerCase() === String(n).toLowerCase());
const near = (vals, tol = TOL) => Math.max(...vals) - Math.min(...vals) <= tol;
const wOf = (s) => s.w ?? s.size ?? 62;
const hOf = (s) => s.h ?? s.size ?? 62;
const kindOf = (s) => s.kind ?? s.shape;
function components(st) {
  const names = (st.shapes ?? []).map((s) => s.name), p = Object.fromEntries(names.map((n) => [n, n]));
  const f = (n) => (p[n] === n ? n : (p[n] = f(p[n])));
  for (const e of st.edges ?? []) if (p[e.from] !== undefined && p[e.to] !== undefined) p[f(e.from)] = f(e.to);
  return new Set(names.map(f)).size;
}
function degrees(st) {
  const d = {}; for (const s of st.shapes) d[s.name] = { in: 0, out: 0 };
  for (const e of st.edges ?? []) { if (d[e.from]) d[e.from].out++; if (d[e.to]) d[e.to].in++; }
  return d;
}
const fail = (why) => ({ ok: false, why });
const ok = { ok: true };

const CHECKS = {
  circle(st) {
    const S = st.shapes; if (S.length < 3) return fail('fewer than 3 shapes');
    const cx = S.reduce((a, s) => a + s.x, 0) / S.length, cy = S.reduce((a, s) => a + s.y, 0) / S.length;
    const r = S.map((s) => Math.hypot(s.x - cx, s.y - cy));
    return Math.min(...r) > 30 && Math.max(...r) - Math.min(...r) <= 0.15 * Math.max(...r) + 4 ? ok : fail(`distances to centre ${r.map(Math.round)}`);
  },
  row(st) { const S = st.shapes; return near(S.map((s) => s.y)) && new Set(S.map((s) => Math.round(s.x / 10))).size === S.length ? ok : fail(`y ${S.map((s) => Math.round(s.y))}`); },
  column(st) { const S = st.shapes; return near(S.map((s) => s.x)) && new Set(S.map((s) => Math.round(s.y / 10))).size === S.length ? ok : fail(`x ${S.map((s) => Math.round(s.x))}`); },
  grid(st) {
    const S = st.shapes, rows = [...new Set(S.map((s) => Math.round(s.y / TOL)))], cols = [...new Set(S.map((s) => Math.round(s.x / TOL)))];
    const cells = new Set(S.map((s) => `${Math.round(s.x / TOL)},${Math.round(s.y / TOL)}`));
    return rows.length >= 2 && cols.length >= 2 && rows.length * cols.length <= S.length * 2 && cells.size === S.length && rows.length < S.length && cols.length < S.length ? ok : fail(`${rows.length} rows x ${cols.length} columns for ${S.length} shapes`);
  },
  alignLeft(st) { const S = st.shapes; const l = S.map((s) => s.x - wOf(s) / 2); return near(l) && new Set(S.map((s) => Math.round(s.y / 10))).size > 1 ? ok : fail(`left edges ${l.map(Math.round)}`); },
  evenlyX(st) {
    const S = [...st.shapes].sort((a, b) => a.x - b.x), g = S.slice(1).map((s, i) => s.x - S[i].x);
    return g.length >= 2 && Math.min(...g) > 20 && near(g, 4) ? ok : fail(`gaps ${g.map(Math.round)}`);
  },
  tree(st, c) {
    const root = by(st, c.root); if (!root) return fail('no root');
    const below = st.shapes.filter((s) => s !== root);
    if (!below.every((s) => s.y > root.y + 20)) return fail('root is not above all others');
    const kids = (st.edges ?? []).filter((e) => e.from === root.name).map((e) => by(st, e.to)).filter(Boolean);
    return kids.length >= 2 && new Set(kids.map((k) => Math.round(k.x / 10))).size === kids.length && near(kids.map((k) => k.y)) ? ok : fail('children are not spread on one level');
  },
  startTop(st, c) { const s = by(st, c.name); if (!s) return fail('no start'); const others = st.shapes.filter((x) => x !== s); return others.every((o) => s.y < o.y - 10) ? ok : fail(`start y ${Math.round(s.y)}, others ${others.map((o) => Math.round(o.y))}`); },
  arrowsLR(st) { const bad = (st.edges ?? []).filter((e) => { const a = by(st, e.from), b = by(st, e.to); return !a || !b || !(a.x + 10 < b.x); }); return (st.edges ?? []).length && !bad.length ? ok : fail(`${bad.length} arrows not left to right`); },
  kind(st, c) { const s = by(st, c.name); return s && kindOf(s) === c.kind ? ok : fail(`${c.name} is ${s ? kindOf(s) : 'missing'}`); },
  edge(st, c) { const has = (a, b) => (st.edges ?? []).some((e) => by(st, e.from)?.name === by(st, a)?.name && by(st, e.to)?.name === by(st, b)?.name); return has(c.from, c.to) || (c.either && has(c.to, c.from)) ? ok : fail(`no arrow ${c.from} -> ${c.to}`); },
  edgeLabel(st, c) { const e = (st.edges ?? []).find((x) => by(st, x.from)?.name === by(st, c.from)?.name && by(st, x.to)?.name === by(st, c.to)?.name); return e && (e.label ?? '').toLowerCase() === c.label ? ok : fail(`arrow label ${e ? JSON.stringify(e.label) : 'arrow missing'}`); },
  diagram(st, c) {
    const S = st.shapes, E = st.edges ?? [], n = S.length;
    if (n < (c.minShapes ?? 3)) return fail(`${n} shapes`);
    if (E.length < (c.minEdges ?? 0)) return fail(`${E.length} arrows`);
    for (const alts of c.all ?? []) if (!S.some((s) => alts.some((w) => text(s).includes(w)))) return fail(`no label with ${alts.join('/')}`);
    const d = degrees(st);
    switch (c.structure) {
      case 'chain': if (!(components(st) === 1 && E.length === n - 1 && Object.values(d).every((x) => x.in <= 1 && x.out <= 1))) return fail('not one chain'); break;
      case 'cycle': if (!(components(st) === 1 && E.length === n && Object.values(d).every((x) => x.in === 1 && x.out === 1))) return fail('not a cycle'); break;
      case 'tree': {
        const roots = Object.entries(d).filter(([, x]) => x.in === 0);
        if (!(components(st) === 1 && E.length === n - 1 && roots.length === 1)) return fail('not a tree');
        if (!E.every((e) => by(st, e.from).y < by(st, e.to).y)) return fail('children are not below parents');
        break;
      }
      case 'hub': if (!Object.values(d).some((x) => x.in + x.out >= Math.max(3, n - 2))) return fail('no hub'); if (components(st) !== 1) return fail('not connected'); break;
      case 'venn': {
        const R = S.filter((s) => ['circle', 'ellipse'].includes(kindOf(s)));
        const ov = R.some((a, i) => R.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < (wOf(a) + wOf(b)) / 2 - 4));
        if (!ov) return fail('no two overlapping round shapes'); break;
      }
      case 'timeline': {
        const found = (c.order ?? []).map((w) => S.find((s) => text(s).includes(w))).filter(Boolean);
        if (found.length < Math.min(5, (c.order ?? []).length)) return fail(`only ${found.length} of the ordered labels`);
        const xs = found.map((s) => s.x), ys = found.map((s) => s.y);
        const mono = (v) => v.every((x, i) => i === 0 || x > v[i - 1] + 5) || v.every((x, i) => i === 0 || x < v[i - 1] - 5);
        if (!mono(xs) && !mono(ys)) return fail('labels are not in order along an axis'); break;
      }
    }
    return ok;
  },
  random(st) {
    const S = st.shapes, E = st.edges ?? [];
    if (S.length < 3) return fail(`${S.length} shapes`);
    if (S.every((s) => kindOf(s) === 'circle') && !S.some((s) => s.label)) return fail('only unlabelled circles');
    if (S.filter((s) => s.label).length < 3) return fail('fewer than 3 labelled shapes');
    if (S.some((s) => s.template)) return ok;   // a template (pyramid, funnel, list ...) is structure without arrows
    return E.length >= 2 && components(st) === 1 ? ok : fail(`${E.length} arrows, ${components(st)} parts`);
  },
};

const NOT_UNDERSTOOD = /did not understand|didn't understand|do not understand|don't understand|not sure|which shape|what should|could not|couldn't|can't|cannot|don't know|nothing to|no shapes?|there is no|I do not know/i;

async function runRow(engine, row) {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  s.setWorldState(WORLD, stateOf(row.state));
  const before = s.state()[WORLD];
  let reply, error = null, worlds = [];
  try { const r = await s.send(row.request, { language: 'en' }); reply = r.text; worlds = (r.segments ?? []).map((x) => x.world ?? x.match?.worldId).filter(Boolean); } catch (e) { error = String(e?.message ?? e); reply = `(error) ${error}`; }
  const after = s.state()[WORLD] ?? { shapes: [], edges: [] };
  const changed = snap(before) !== snap(after);
  const res = CHECKS[row.check.type]?.(after, row.check) ?? fail(`unknown check ${row.check.type}`);
  const outcome = res.ok ? 'right' : (!changed || (NOT_UNDERSTOOD.test(reply ?? '') && !changed) || error) ? 'not understood' : 'wrong';
  const drew = after.shapes.map((x) => `${kindOf(x)}${x.label ? `:${x.label}` : ''}`).join(', ');
  return { id: row.id, group: row.group, kind: row.kind, request: row.request, outcome, why: res.why ?? null, reply, changed, worlds, shapes: after.shapes.length, edges: (after.edges ?? []).length, drew };
}

// ---- cause of a failing row (by what the state and the reply show) ----
function causeOf(row, r) {
  const g = row.kind, rep = r.reply ?? '';
  if (/raise the|Which part should move|which way: for example "raise/.test(rep)) return 'wrong world: "put them in a ..." is read by the avatar world (arrange/align verbs other than "arrange" are not layout)';
  if (/already connects/.test(rep)) return 'layout phrase read as an arrow command (connect), not as an arrangement of arrows';
  if (/rename/.test(rep) && row.group === 'edits') return 'edit verb "call the arrow X" read as renaming a shape';
  if (/I do not know enough/.test(rep) && /\(I read "(\w+)" as "(\w+)"\)/.test(rep)) return `the spell checker changed a word of the topic before the diagram world read it (${/\(I read [^)]*\)/.exec(rep)[0]}): the offline vocabulary lacks the word`;
  if (/I do not know enough/.test(rep)) return `the knowledge has no structure for the topic of this ${g.split(' ')[0]} (the fills of k.diagrams find no fact about it in the bundled subset or the catalog): a knowledge item, not code`;
  if (row.group === 'arrangements' && /already connects/.test(rep)) return 'layout direction of arrows ("go left to right") is read as connecting: the direction frame belongs to w.lang.en (arrangement phrases) and the engine';
  if (row.group === 'kinds') {
    if (/^Drew (a circle|Tree)\.$/.test(rep) && /hierarchy|on a timeline/.test(row.request)) return 'the kind is said by a word or a frame k.diagrams does not know ("a hierarchy of", "X on a timeline"): synonyms of kind names are a knowledge item';
    if (/could not find a command|I understood only part/.test(rep)) return `kind frame "a ${g.split(' ')[0]} of how to ..." not read by any pattern`;
    if (/placeholder/.test(rep)) return 'template named by the kind but the topic is taken as the items (or placeholders): no knowledge of the topic';
    if (/Idea 1/.test(rep)) return 'template drawn with placeholder labels: the topic is ignored';
    if (/^Drew (a circle|Tree)\.$/.test(rep)) return 'kind noun alone read ("circle", "tree", "cycle"): the rest of the request is ignored, one shape drawn';
    return 'kind drawn without the structure or the content of the kind';
  }
  if (row.group === 'random') return `random diagram: ${r.why} (a canned template with sample labels, no topic from knowledge)`;
  if (row.group === 'arrangements') return `arrangement ${r.outcome === 'wrong' ? 'done wrongly' : 'not understood'}: ${g}`;
  return `edit ${r.outcome === 'wrong' ? 'done wrongly' : 'not understood'}: ${g}`;
}

async function main() {
  const rows = readFileSync(SET, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const want = arg('reasoner', 'both');
  const modes = want === 'both' ? ['ops', 'matrix'] : [want];
  const build = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(); } catch { return 'unknown'; } })();
  const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
  const all = {};
  for (const mode of modes) {
    const engine = await createEngine({ loader, translator: createTranslator(), options: { reasoner: mode } });
    all[mode] = [];
    for (const row of rows) all[mode].push(await runRow(engine, row));
  }
  const groups = ['arrangements', 'kinds', 'edits', 'random'];
  const lines = [];
  for (const mode of modes) {
    lines.push(`reasoner ${mode}`, 'group'.padEnd(14) + '    n  right  wrong  not understood');
    const tot = { n: 0, right: 0, wrong: 0, nu: 0 };
    for (const g of groups) {
      const x = all[mode].filter((r) => r.group === g), c = (o) => x.filter((r) => r.outcome === o).length;
      lines.push(g.padEnd(14) + String(x.length).padStart(5) + String(c('right')).padStart(7) + String(c('wrong')).padStart(7) + String(c('not understood')).padStart(16));
      tot.n += x.length; tot.right += c('right'); tot.wrong += c('wrong'); tot.nu += c('not understood');
    }
    lines.push('total'.padEnd(14) + String(tot.n).padStart(5) + String(tot.right).padStart(7) + String(tot.wrong).padStart(7) + String(tot.nu).padStart(16), '');
  }
  const rand = (all[modes[0]] ?? []).filter((r) => r.group === 'random');
  lines.push(`random diagrams (${modes[0]}): what each drew`);
  for (const r of rand) lines.push(`  ${r.outcome.padEnd(14)} ${r.reply} | ${r.drew}`);
  console.log(lines.join('\n'));
  if (flag('verbose')) for (const mode of modes) for (const r of all[mode].filter((x) => x.outcome !== 'right')) console.log(`[${mode}] ${r.outcome} ${r.id} "${r.request}" -> ${r.why} | ${r.reply}`);
  if (arg('out')) writeFileSync(resolve(arg('out')), JSON.stringify(all, null, 1));
  if (flag('ledger')) {
    const have = new Set(existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => { try { const j = JSON.parse(l); return `${j.source}|${j.text}|${j.reasoner ?? ''}`; } catch { return ''; } }) : []);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const out = [];
    for (const mode of modes) for (const r of all[mode]) {
      if (r.outcome === 'right') continue;
      const src = arg('source', 'DIAG-KNOW scripts/measure-diagram-gap.mjs (diagram.sketch, composed from knowledge, sopworld 0.114)');
      if (have.has(`${src}|${r.request}|${mode}`)) continue;
      const row = byId[r.id];
      out.push(JSON.stringify({ text: r.request, tab: 'diagram', language: 'en', happened: `${r.reply} [${r.outcome}: ${r.why ?? 'state unchanged'}; ${r.shapes} shapes, ${r.edges} arrows]`, expected: row.expect, class: `diagram-gap:${row.group}:${row.kind}`, cause: causeOf(row, r), reasoner: mode, source: src, first_seen: new Date().toISOString().slice(0, 10), build }));
    }
    if (out.length) appendFileSync(LEDGER, `${out.join('\n')}\n`);
    console.log(`ledger: ${out.length} rows appended to training/eval/failures.jsonl`);
  }
}
main();
