// SPDX-License-Identifier: AGPL-3.0-only
// The generated set of space requests (SPACE, specs/19-space-module.md): seeded, 150 cases over both hosts (art.draw and diagram.sketch), 2 to 6 objects each,
// selection x move x relation x layout x question, with the expected result computed here from plain geometry (never from the module under test).
//   import { generate, hosts } from './space-set.mjs';   generate(seed = 20261113, n = 150) -> [{ id, host, cls, objects, text, expect }]
// expect: { boxes: { id: { x, y } } } exact centres after the move (tolerance 2) | { ask: true } nothing moves and the reply asks | { swap: [a, b] } | { row | column | circle | align | tidy | grid }
//   | { rel: 'above' | 'under' | 'leftof' | 'rightof' | 'next', mover, ref } | { say: regexp source } for a question.
export const hosts = {
  draw: { frame: { w: 1000, h: 700 }, step: 110, kind: 'house', other: 'sun', size: 100, aspect: 1, say: 'house', tab: 'draw' },
  diagram: { frame: { w: 800, h: 500 }, step: 80, kind: 'circle', other: 'square', size: 62, aspect: 1, say: 'circle', tab: 'diagram' },
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const range = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1)));

const AMOUNTS = [['', 1, ''], ['a bit', 0.5, 'a bit'], ['a lot', 2.5, 'a lot'], ['a tiny bit', 0.3, 'a tiny bit'], ['much', 2.2, 'much']];
const DIRS = { left: [-1, 0, 'to the left'], right: [1, 0, 'to the right'], up: [0, -1, 'up'], down: [0, 1, 'down'], higher: [0, -1, 'higher'], lower: [0, 1, 'lower'] };
const VERBS = ['move', 'shift', 'push', 'slide'];
const SEL_ROW = ['first', 'last', 'left', 'right', 'middle', 'second', 'leftmost', 'rightmost', 'second from the right', 'biggest'];
const SEL_COL = ['top', 'bottom', 'first', 'last', 'middle', 'second', 'highest', 'lowest'];
const box = (o, h) => ({ w: o.size * h.aspect, h: o.size * h.aspect });
const overlap = (a, b, h, pad = 8) => Math.abs(a.x - b.x) < (box(a, h).w + box(b, h).w) / 2 + pad && Math.abs(a.y - b.y) < (box(a, h).h + box(b, h).h) / 2 + pad;
const inside = (o, h) => o.x - box(o, h).w / 2 >= 30 && o.x + box(o, h).w / 2 <= h.frame.w - 30 && o.y - box(o, h).h / 2 >= 30 && o.y + box(o, h).h / 2 <= h.frame.h - 30;

/** n objects of the host's kind in a row (or a column), distinct sizes when `sizes`. */
function line(r, h, n, vertical, sizes, yFrac) {
  const { w, h: H } = h.frame, along = vertical ? range(130, H - 130, n) : range(150, w - 150, n);
  const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
  return along.map((v, i) => ({ id: '', kind: h.kind, x: vertical ? Math.round(w / 2) : v, y: vertical ? v : Math.round(H * (yFrac ?? (h === hosts.draw ? 0.55 : 0.5))), size: sizes ? h.size - 24 + order[i] * 12 : h.size }));
}
const withIds = (host, list) => list.map((o, i) => ({ ...o, id: host === 'draw' ? `o${i + 1}` : `c${i + 1}` }));
/** The index the selection words mean among n objects sorted along the axis (null: ambiguous). */
function indexOf(sel, n, objs, vertical) {
  const by = objs.map((o, i) => i);
  const bySize = by.slice().sort((a, b) => objs[b].size - objs[a].size);
  const m = { first: 0, last: n - 1, left: 0, right: n - 1, leftmost: 0, rightmost: n - 1, top: 0, bottom: n - 1, highest: 0, lowest: n - 1, second: 1, 'second from the right': n - 2, biggest: bySize[0], middle: n % 2 ? (n - 1) / 2 : null }[sel];
  return m;
}

export function generate(seed = 20261113, count = 150) {
  const r = rng(seed), out = [];
  const plan = [['select', 62], ['amount', 28], ['relation', 25], ['layout', 20], ['question', 15]];
  const total = plan.reduce((a, b) => a + b[1], 0);
  for (const [cls, share] of plan) {
    const k = Math.round((share * count) / total);
    for (let i = 0; i < k && out.length < count; i++) {
      const host = i % 2 ? 'diagram' : 'draw', h = hosts[host];
      const c = make(r, cls, host, h);
      out.push({ id: `sp${String(out.length + 1).padStart(3, '0')}`, host, cls, ...c });
    }
  }
  while (out.length < count) { const host = out.length % 2 ? 'diagram' : 'draw'; out.push({ id: `sp${String(out.length + 1).padStart(3, '0')}`, host, cls: 'select', ...make(r, 'select', host, hosts[host]) }); }
  return out;
}

function make(r, cls, host, h) {
  const noun = host === 'diagram' && r() < 0.4 ? 'shape' : h.say;
  if (cls === 'select' || cls === 'amount') {
    for (let tries = 0; tries < 50; tries++) {
      const vertical = r() < 0.2, n = 2 + Math.floor(r() * 5), sel = pick(r, vertical ? SEL_COL : SEL_ROW);
      if (n < 3 && /second from|middle|second/.test(sel) && sel !== 'second') continue;
      if (sel === 'second' && n < 2) continue;
      const objs = withIds(host, line(r, h, n, vertical, sel === 'biggest'));
      const idx = indexOf(sel, n, objs, vertical);
      const [amtWords, mult, amtSay] = cls === 'amount' ? pick(r, AMOUNTS.slice(1)) : pick(r, AMOUNTS.slice(0, 1));
      const text0 = (d) => `${pick(r, VERBS)} the ${sel} ${noun}${n > 0 && sel === 'biggest' ? '' : ''}`;
      if (idx === null) return { objects: objs, text: `${pick(r, VERBS)} the ${sel} ${noun} to the right`, expect: { ask: true } };
      // one or two directions (combined), each that keeps the thing inside and off its neighbours
      const names = Object.keys(DIRS), dirs = [];
      const target = objs[idx];
      for (const d of [pick(r, names), r() < 0.35 ? pick(r, names) : null].filter(Boolean)) {
        if (dirs.some((x) => (DIRS[x][0] && DIRS[d][0]) || (DIRS[x][1] && DIRS[d][1]))) continue;
        dirs.push(d);
      }
      const move = (ds) => { const m = ds.length === 1 ? mult : 1; return { x: target.x + ds.reduce((a, d) => a + DIRS[d][0], 0) * h.step * m, y: target.y + ds.reduce((a, d) => a + DIRS[d][1], 0) * h.step * m }; };
      let ds = dirs;
      const okAt = (ds2) => { const p = { ...target, ...move(ds2) }; return inside(p, h) && !objs.some((o) => o !== target && overlap(p, o, h)); };
      if (!okAt(ds)) ds = ds.map((d) => ({ left: 'right', right: 'left', up: 'down', down: 'up', higher: 'lower', lower: 'higher' }[d]));
      if (!okAt(ds)) continue;
      const p = move(ds);
      const phrase = ds.length === 1 ? `${amtSay ? `${amtSay} ` : ''}${DIRS[ds[0]][2]}` : `${ds.map((d) => DIRS[d][2]).join(' and ')}`;
      const text = `${pick(r, VERBS)} the ${sel} ${noun} ${phrase}`;
      return { objects: objs, text, expect: { boxes: { [target.id]: { x: Math.round(p.x), y: Math.round(p.y) } }, mult: ds.length === 1 ? mult : 1 }, _amt: amtWords };
    }
    throw new Error('no select case');
  }
  if (cls === 'relation') {
    const n = 2 + Math.floor(r() * 3), objs = withIds(host, line(r, h, n, false, false, 0.82));
    const ref = { id: host === 'draw' ? `o${n + 1}` : `c${n + 1}`, kind: h.other, x: Math.round(h.frame.w * 0.5), y: Math.round(h.frame.h * 0.42), size: h.size };
    const sel = pick(r, ['first', 'last', 'left', 'right']), idx = { first: 0, last: n - 1, left: 0, right: n - 1 }[sel];
    const rel = pick(r, [['next to', 'next'], ['above', 'above'], ['under', 'under'], ['to the left of', 'leftof'], ['to the right of', 'rightof']]);
    const refName = h.other;
    const text = `put the ${sel} ${noun} ${rel[0]} the ${refName}`;
    return { objects: [...objs, ref], text, expect: { rel: rel[1], mover: objs[idx].id, ref: ref.id } };
  }
  if (cls === 'layout') {
    const n = 3 + Math.floor(r() * 3), kind = pick(r, ['row', 'column', 'circle', 'swap', 'align', 'tidy', 'grid']);
    const objs = kind === 'swap' || kind === 'align' ? line(r, h, n, false, false) : [];
    for (let t = 0; objs.length < n && t < 400; t++) {
      const o = { id: '', kind: h.kind, x: Math.round(150 + r() * (h.frame.w - 300)), y: Math.round(120 + r() * (h.frame.h - 240)), size: h.size };
      if (kind === 'tidy' ? objs.length && r() < 0.8 : false) { const b = pick(r, objs); o.x = b.x + Math.round((r() - 0.5) * h.size * 0.8); o.y = b.y + Math.round((r() - 0.5) * h.size * 0.8); }
      if (kind !== 'tidy' && objs.some((q) => overlap(o, q, h, 20))) continue;
      objs.push(o);
    }
    const list = withIds(host, objs);
    const text = { row: `put the ${noun}s in a row`, column: `put the ${noun}s in a column`, circle: `put the ${noun}s in a circle`, grid: `put the ${noun}s in a grid`, swap: `swap the first and the last ${noun}`, align: `align the ${noun}s on the left`, tidy: 'tidy up' }[kind];
    const expect = kind === 'swap' ? { swap: true } : { [kind]: true };
    return { objects: list, text, expect };
  }
  // question
  const n = 3, objs = withIds(host, line(r, h, n, false, false));
  const ref = { id: host === 'draw' ? `o${n + 1}` : `c${n + 1}`, kind: h.other, x: objs[0].x + Math.round(h.size * 1.4 * (r() < 0.5 ? 1 : 0)), y: Math.round(h.frame.h * 0.15), size: h.size };
  const q = pick(r, ['above', 'under', 'far', 'which']);
  if (q === 'above') { const yes = ref.y < objs[0].y; return { objects: [...objs, ref], text: `is the ${h.other} above the left ${noun}`, expect: { say: yes ? '^Yes' : '^No', yes } }; }
  if (q === 'under') return { objects: [...objs, ref], text: `is the ${h.other} under the left ${noun}`, expect: { say: '^No', yes: false } };
  if (q === 'far') return { objects: [...objs, ref], text: `how far apart are the ${h.other} and the left ${noun}`, expect: { say: 'far apart|a bit apart|close' } };
  return { objects: [...objs, ref], text: `which ${noun} is in the middle`, expect: { say: 'middle' } };
}
