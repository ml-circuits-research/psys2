#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// SPACE-2 experiments E-S1 .. E-S6 (worker-tasks 17:40). Deterministic (seeded), Node only, no wall clock in any result except the informational ms of E-S5.
//   node scripts/exp-space.mjs [--only s1,s2,...] [--seed N] [--json out.json]
// E-S1 overlap rate and frame escapes after each of 200 scripted additions and moves (solver on pieces; drawing host through the dialog engine; 30 scripted scenes)
// E-S2 stability: mean displacement of pieces a request did not mention
// E-S3 joins: 40 near pairs that should join and 40 that should not, and "apart" respected afterwards
// E-S4 the same 20 requests in drawing, diagram and avatar (the face slots) with no tab-specific patterns
// E-S5 cost in solver steps for 10, 50, 200 pieces (steps are the phone-independent measure; the phone's milliseconds are pending a device run)
// E-S6 hold-out: a layout written only as knowledge (k.layouts text) is usable with no PSys2 change
import { writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import * as S from '../worlds/space/space.mjs';
import * as P from '../worlds/space/pieces.mjs';
import { solve } from '../worlds/space/solver.mjs';
import { createLayouts } from '../src/knowledge/layouts.mjs';
import { drawScenes } from '../training/eval/space-draw-scenes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only') ? new Set(arg('only').split(',')) : null;
const want = (k) => !only || only.has(k);
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(arg('seed', 20261114));
const frame = { w: 1000, h: 700 };
const out = {};
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const table = (title, rows) => { console.log(`\n${title}`); for (const r of rows) console.log('  ' + r.map((c, i) => String(c).padEnd(i ? 14 : 44)).join('')); };

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
if (want('s1') || want('s2')) {
  // module level: 200 scripted additions and moves with the solver (the host pins what the user placed; only the new or moved piece may be adjusted)
  const R = rng(SEED), pieces = [], store = P.createStore();
  let overl = 0, esc = 0, refused = 0, steps = 0, disp = 0, dispN = 0;
  const unwanted = () => { let n = 0; for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) if (S.overlaps(pieces[i], pieces[j], 1) && !store.facts.some((f) => ((f.a === pieces[i].id && f.b === pieces[j].id) || (f.a === pieces[j].id && f.b === pieces[i].id)) && ['on', 'in', 'attached_to'].includes(f.rel))) n++; return n; };
  const escapes = () => pieces.filter((p) => { const b = S.boxOf(p); return b.l < -1 || b.t < -1 || b.r > frame.w + 1 || b.b > frame.h + 1; }).length;
  for (let step = 0; step < 200; step++) {
    const add = pieces.length < 8 || R() < 0.35;
    const before = pieces.map((p) => ({ id: p.id, x: p.x, y: p.y }));
    let mentioned;
    if (add && pieces.length < 40) {
      const w = 50 + Math.round(R() * 110), h = 40 + Math.round(R() * 110), id = `p${pieces.length + 1}`;
      pieces.push(P.pieceFrom({ id, kind: ['box', 'house', 'tree'][Math.floor(R() * 3)], x: w / 2 + R() * (frame.w - w), y: h / 2 + R() * (frame.h - h), w, h, z: pieces.length }));
      mentioned = [id];
    } else {
      const p = pieces[Math.floor(R() * pieces.length)], m = P.movePiece(store, pieces, p.id, Math.round((R() - 0.5) * 300), Math.round((R() - 0.5) * 300), { frame, commit: true });
      for (const [id, b] of Object.entries(m.boxes)) Object.assign(pieces.find((q) => q.id === id), b);
      mentioned = [p.id, ...m.moved];
    }
    const r = solve({ pieces, facts: store.facts, frame, pinned: pieces.filter((p) => !mentioned.includes(p.id)).map((p) => p.id), mentioned });
    steps += r.steps;
    if (r.ok) for (const [id, b] of Object.entries(r.boxes)) Object.assign(pieces.find((q) => q.id === id), b);
    else { refused++; if (add) pieces.pop(); else for (const b of before) Object.assign(pieces.find((q) => q.id === b.id), { x: b.x, y: b.y }); }   // the host keeps the last valid state
    if (unwanted() > 0 && process.env.DBG) console.log("overlap at step", step, add ? "add" : "move", mentioned, r.ok, JSON.stringify(r.boxes), pieces.flatMap((p, i) => pieces.slice(i + 1).filter((q) => S.overlaps(p, q, 1)).map((q) => [p.id, q.id, p.x, p.y, p.w, p.h, q.x, q.y, q.w, q.h])));
    overl += unwanted() > 0 ? 1 : 0; esc += escapes() > 0 ? 1 : 0;
    for (const b of before) { if (mentioned.includes(b.id)) continue; const p = pieces.find((q) => q.id === b.id); disp += Math.hypot(p.x - b.x, p.y - b.y); dispN++; }
  }
  out.s1_module = { steps200: 200, stepsWithOverlap: overl, stepsWithEscape: esc, solverRefused: refused, solverSteps: steps };
  out.s2_module = { unmentionedPieceMoves: dispN, meanDisplacementPx: Number((disp / Math.max(1, dispN)).toFixed(3)) };
}

if (want('s1') || want('s2')) {
  const dr = await drawScenes({ engine, seed: SEED + 1 });
  out.s1_draw = dr.s1; out.s2_draw = dr.s2;
}
if (want('s1') || want('s2')) {
  table('E-S1 overlap and frame escapes after each step (target 0 unwanted overlaps)', [['', 'steps/turns', 'with overlap', 'with escape'], ['module + solver (200 additions and moves)', 200, out.s1_module.stepsWithOverlap, out.s1_module.stepsWithEscape], ['drawing host, 30 scenes of 7 turns', out.s1_draw.turns, out.s1_draw.turnsWithUnwantedOverlap, out.s1_draw.turnsWithEscape]]);
  console.log(`  solver refusals (kept the last valid state and said why): ${out.s1_module.solverRefused} of 200`);
  table('E-S2 stability: mean displacement (px) of pieces the request did not mention (target near 0)', [['', 'moves observed', 'mean px'], ['module + solver', out.s2_module.unmentionedPieceMoves, out.s2_module.meanDisplacementPx], ['drawing host', out.s2_draw.unmentionedObjectMoves, out.s2_draw.meanDisplacementPx]]);
}

if (want('s3')) {
  const R = rng(SEED + 2);
  const SUP = [['roof', 'walls'], ['cup', 'table'], ['lamp', 'table'], ['book', 'shelf'], ['plate', 'table']], PARTS = [['arm', 'body'], ['hat', 'head'], ['wheel', 'car'], ['wing', 'bird']], NOPE = [['cow', 'sun'], ['fish', 'tree'], ['boat', 'cup'], ['dog', 'lamp'], ['cat', 'plate']];
  const mkPair = (a, b, gapPx, rel) => {
    const B = P.pieceFrom({ id: 'b', kind: b, x: 400 + R() * 200, y: 400 + R() * 100, w: 160, h: 90 });
    const bb = S.boxOf(B), A = P.pieceFrom({ id: 'a', kind: a, x: B.x + (R() - 0.5) * 60, y: bb.t - 30 - gapPx, w: 70, h: 60 });
    return [A, B, rel];
  };
  let shouldOk = 0, shouldN = 0, notOk = 0, notN = 0, apartOk = 0, apartN = 0, solverRejoin = 0;
  for (let i = 0; i < 40; i++) {
    const [a, b] = [...SUP, ...PARTS][i % 9], [A, B] = mkPair(a, b, 4 + Math.round(R() * 8), true), st = P.createStore();
    P.inferFacts([A, B], st, { frame });
    shouldN++; if (st.facts.some((f) => f.a === 'a' && f.b === 'b' && ['on', 'attached_to'].includes(f.rel))) shouldOk++;
    // the user says apart: the pair is never joined again, by the rules or by the solver
    const st2 = P.createStore(); P.propose(st2, { rel: 'apart_from', a: 'a', b: 'b', tier: 'said' });
    P.inferFacts([A, B], st2, { frame });
    const r = solve({ pieces: [A, B], facts: st2.facts, frame }); const A2 = { ...A, ...(r.boxes.a ?? {}) };
    apartN++; if (!st2.facts.some((f) => f.rel !== 'apart_from') && S.gap(A2, B) >= Math.min(24, 0.04 * frame.w) - 1) apartOk++; else solverRejoin++;
  }
  for (let i = 0; i < 40; i++) {
    const [a, b] = NOPE[i % 5], far = i % 2 === 0;
    const [A, B] = mkPair(a, b, far ? 260 : 6, false), st = P.createStore();
    P.inferFacts([A, B], st, { frame });
    notN++; if (!st.facts.length) notOk++;
  }
  out.s3 = { shouldJoin: `${shouldOk}/${shouldN}`, shouldNotJoin: `${notOk}/${notN}`, apartRespected: `${apartOk}/${apartN}` };
  table('E-S3 joins (correct / total)', [['near pairs that should join (knowledge supports, part of)', out.s3.shouldJoin], ['pairs that should not (unrelated kinds near, or far apart)', out.s3.shouldNotJoin], ['after the user said apart: not joined by rules or solver', out.s3.apartRespected]]);
}

if (want('s4')) {
  // the same 20 requests in each tab, read by the module with that tab's projection; the tab owns no pattern for any of them
  const reqs = [
    ['next', 'put the {A} next to the {B}'], ['left', 'put the {A} left of the {B}'], ['above', 'put the {A} above the {B}'], ['under', 'put the {A} under the {B}'], ['between', 'put the {C} between the {A} and the {B}'],
    ['row', 'arrange them in a row'], ['column', 'put them in a column'], ['grid', 'arrange them in a grid'], ['circle', 'arrange them in a circle'], ['corners', 'put them in different corners'],
    ['spread', 'spread them out evenly'], ['align', 'align them on the left'], ['size', 'make them the same size'], ['height', 'arrange them by height'], ['stack', 'stack them'],
    ['tidy', 'tidy up'], ['swap', 'swap the first and the last'], ['centre', 'centre them'], ['far', 'move the {A} all the way to the right'], ['bit', 'move the {A} a bit lower'],
  ];
  const hosts = {
    drawing: { A: 'house', B: 'tree', C: 'sun', size: [120, 120], kinds: ['house', 'tree', 'sun'] },
    diagram: { A: 'box', B: 'circle', C: 'triangle', size: [100, 100], kinds: ['box', 'circle', 'triangle'] },
    avatar: { A: 'eye', B: 'nose', C: 'mouth', size: [90, 60], kinds: ['eye', 'nose', 'mouth'] },
  };
  const res = {};
  for (const [name, h] of Object.entries(hosts)) {
    let ok = 0; const bad = [];
    for (const [cls, tpl] of reqs) {
      const items = [h.A, h.B, h.C, h.A, h.B].slice(0, ['between', 'next', 'left', 'above', 'under', 'far', 'bit'].includes(cls) ? 3 : 4).map((k, i) => ({ id: `${k}${i}`, kind: k, name: k, x: 250 + i * 150, y: 300 + (i % 2) * 90, w: h.size[0] + (i % 3) * 30, h: h.size[1] + (i % 3) * 20, z: i }));
      const kindOf = (w) => { const k = h.kinds.find((x) => w === x || w === `${x}s`); return k ? { kind: k, plural: w.endsWith('s') } : (w === 'them' ? { kind: '*', plural: true } : null); };
      const text = tpl.replace('{A}', h.A).replace('{B}', h.B).replace('{C}', h.C).replace('{A}', h.A);
      let r;
      try { r = S.interpret(text, { items, frame, kindOf, last: [], knowledge: undefined }); } catch (e) { r = { type: 'error', say: e.message }; }
      const moved = r?.boxes ? Object.keys(r.boxes).length : 0;
      const good = r && (r.type === 'move' || r.type === 'layout') && (moved > 0 || (cls === 'tidy' && r.say));
      if (good) { const after = items.map((it) => ({ ...it, ...(r.boxes?.[it.id] ?? {}) })); const inF = after.every((it) => { const b = S.boxOf(it); return b.l >= -2 && b.r <= frame.w + 2 && b.t >= -2 && b.b <= frame.h + 2; }); if (inF) ok++; else bad.push(`${cls}:escape`); } else bad.push(`${cls}:${r?.type ?? 'null'}`);
    }
    res[name] = { ok: `${ok}/${reqs.length}`, bad };
  }
  out.s4 = res;
  table('E-S4 the same 20 requests per tab through the module (answered, inside the frame)', [['', 'answered', 'not answered'], ...Object.entries(res).map(([k, v]) => [k, v.ok, v.bad.join(' ')])]);
}

if (want('s5')) {
  const R = rng(SEED + 3), rows = [];
  for (const n of [10, 50, 200]) {
    const pieces = Array.from({ length: n }, (_, i) => P.pieceFrom({ id: `p${i}`, kind: 'box', x: 60 + R() * 880, y: 60 + R() * 580, w: 20 + Math.round(R() * 30), h: 16 + Math.round(R() * 24), z: i }));   // about 30 % of the frame at 200 pieces: crowded, not impossible
    const store = P.createStore();
    for (let i = 0; i + 1 < n; i += 5) P.propose(store, { rel: 'left_of', a: pieces[i].id, b: pieces[i + 1].id, tier: 'said' });
    const t0 = performance.now();
    const tidy = solve({ pieces, facts: store.facts, frame, maxSteps: 400000 });
    const ms1 = performance.now() - t0;
    const t1 = performance.now();
    const layout = solve({ pieces, facts: [], frame, layout: 'grid', maxSteps: 400000 });
    rows.push([n, tidy.steps, tidy.ok ? 'ok' : 'kept: ' + String(tidy.say).slice(0, 60), layout.steps, layout.ok ? 'ok' : 'kept last state', `${ms1.toFixed(0)} / ${(performance.now() - t1).toFixed(0)} ms (this box)`]);
  }
  out.s5 = rows;
  table('E-S5 solver cost (steps; phone milliseconds PENDING a device run)', [['pieces', 'tidy+rel steps', 'result', 'grid steps', 'result', 'ms'], ...rows]);
}

if (want('s6')) {
  const text = `@layout.family-photo k.layouts.layout\n    name="family photo" synonym="group photo" sort=height slot="0.2 0.55" slot="0.4 0.55" slot="0.6 0.55" slot="0.8 0.55"\n`;
  const L = createLayouts({ text });
  await L.load();
  const found = L.find('arrange them like a family photo');
  const pieces = [['dad', 200], ['mum', 170], ['kid', 100], ['baby', 60]].map(([id, h], i) => P.pieceFrom({ id, kind: 'person', x: 100 + i * 20, y: 300, w: 60, h, z: i }));
  const r = found ? solve({ pieces, facts: [], frame, layout: found }) : null;
  const xs = r?.boxes ? ['dad', 'mum', 'kid', 'baby'].map((id) => r.boxes[id]?.x) : [];
  const ordered = xs.length === 4 && xs.every((x, i) => i === 0 || x > xs[i - 1]);
  out.s6 = { from: L.from, found: found?.id ?? null, tallestFirst: ordered, xs };
  table('E-S6 hold-out: a layout that exists only as knowledge text', [['layouts source', L.from], ['found "like a family photo"', found?.id ?? 'no'], ['pieces placed tallest first, left to right, no overlap', ordered && r.ok ? 'yes' : 'no']]);
}
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
