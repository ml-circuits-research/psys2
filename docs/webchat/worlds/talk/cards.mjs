// SPDX-License-Identifier: AGPL-3.0-only
// Renderers of the Talk tab (spec 18): the cards of an answer and the topic board, as plain SVG / HTML strings built from the card data the world keeps in its state.
// Browser-safe, no imports, no DOM: the tab sets the strings as innerHTML, tests read them as text. Every text from the knowledge is escaped and every colour is a
// whitelisted name or a #rrggbb value, so a card can never carry markup.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r1 = (v) => Math.round(v * 10) / 10;
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

const COLOURS = {
  red: '#d9453d', orange: '#ee8a2a', yellow: '#f2cf3e', green: '#4fa65a', blue: '#3f7fd8', purple: '#8a5cc7', pink: '#ea84b2', brown: '#8a5a36', black: '#2d2d34', white: '#f6f6f2',
  grey: '#9aa0a6', gray: '#9aa0a6', gold: '#e0b13a', silver: '#c3c8cf', turquoise: '#3fb6b2', beige: '#e6d3ad', tan: '#cdaa7c', cream: '#f3ead2', navy: '#24407a', maroon: '#7a2b34',
  'light blue': '#9cc5f2', 'dark green': '#2f7a3c', 'light green': '#9bd49f', 'dark blue': '#26467f', 'dark grey': '#5f656b', 'light grey': '#cfd3d8', violet: '#8b5fc9', lime: '#8bd24c', skin: '#f0c9a4',
};
/** A fill for a part: its exact rgb when it is #rrggbb, else the first known colour name, else grey. */
export function fillOf(p) {
  if (/^#[0-9a-f]{6}$/i.test(p?.rgb ?? '')) return p.rgb;
  for (const c of p?.colour ?? p?.c ?? []) { const k = String(c).toLowerCase().replace(/_/g, ' '); if (COLOURS[k]) return COLOURS[k]; }
  return COLOURS.grey;
}

// ---------------------------------------------------------------- the picture of a thing (parts in a 0-100 frame)
function partShape(p, fill, extra = '') {
  const x = num(p.x), y = num(p.y), w = Math.max(0.5, num(p.w)), h = Math.max(0.5, num(p.h));
  const st = `fill="${fill}" stroke="#2d2d34" stroke-opacity=".55" stroke-width=".9" stroke-linejoin="round"`;
  const pts = Array.isArray(p.points) ? p.points.filter((q) => Array.isArray(q) && q.length === 2).map((q) => `${r1(num(q[0]))},${r1(num(q[1]))}`) : [];
  const shape = String(p.shape ?? '');
  let svg;
  if (pts.length >= 2 && /^(?:polygon|poly|line|polyline|curve)/.test(shape)) svg = shape.startsWith('polygon') || shape === 'poly' ? `<polygon points="${pts.join(' ')}" ${st}/>` : `<polyline points="${pts.join(' ')}" fill="none" stroke="${fill}" stroke-width="${Math.max(1.4, Math.min(w, h, 4))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  else if (/^(?:circle|oval|ellipse)/.test(shape)) svg = `<ellipse cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}" ${st}/>`;
  else if (shape === 'triangle') svg = `<polygon points="${r1(x + w / 2)},${r1(y)} ${r1(x)},${r1(y + h)} ${r1(x + w)},${r1(y + h)}" ${st}/>`;
  else if (shape === 'line') svg = `<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x + w)}" y2="${r1(y + h)}" stroke="${fill}" stroke-width="${Math.max(1.4, Math.min(3, Math.max(w, h) / 6))}" stroke-linecap="round"/>`;
  else svg = `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(Math.min(w, h) / 6)}" ${st}/>`;
  return `<g class="tk-part" data-part="${esc(p.name)}"${extra}><title>${esc(String(p.name ?? '').replace(/_/g, ' '))}</title>${svg}</g>`;
}
/** The drawing of a thing: its parts in draw order. `opts.only` marks one part (the others fade). */
export function drawingSvg(parts, opts = {}) {
  const list = [...(parts ?? [])].filter((p) => p && typeof p === 'object').sort((a, b) => num(a.z) - num(b.z));
  const body = list.map((p) => partShape(p, fillOf(p), opts.only && opts.only !== p.name ? ' opacity=".28"' : '')).join('');
  return `<svg class="tk-svg tk-drawing" viewBox="-4 -4 108 108" role="img" aria-label="${esc(opts.label ?? 'drawing')}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

// ---------------------------------------------------------------- parts: a box for the thing on the left, a box for each named part in a column, elbow links (a plain layout until the layout module exists)
export function partsSvg(card) {
  const items = (card.data?.items ?? []).slice(0, 10);
  const bw = 130, bh = 28, gy = 8, rx = 150, W = rx + bw + 8, H = Math.max(48, items.length * (bh + gy) - gy + 16);
  const cy = H / 2;
  let out = `<rect x="8" y="${r1(cy - 18)}" width="104" height="36" rx="9" class="tk-box tk-rootbox"/><text x="60" y="${r1(cy + 4.5)}" text-anchor="middle" class="tk-t tk-b">${esc(clip(card.title ?? card.thing, 14))}</text>`;
  items.forEach((it, i) => {
    const y = 8 + i * (bh + gy), my = y + bh / 2;
    out += `<path d="M112 ${r1(cy)} C131 ${r1(cy)} 131 ${r1(my)} ${rx} ${r1(my)}" class="tk-link" fill="none"/>`;
    const label = it.n > 1 ? `${it.name} \u00d7${it.n}` : it.name;
    out += `<g class="tk-partbox" data-part="${esc(String(it.name).replace(/ /g, '_'))}"><rect x="${rx}" y="${r1(y)}" width="${bw}" height="${bh}" rx="7" class="tk-box"/><text x="${rx + bw / 2}" y="${r1(y + 18)}" text-anchor="middle" class="tk-t">${esc(clip(label, 18))}</text><title>${esc(label)}</title></g>`;
  });
  return `<svg class="tk-svg tk-partsdiagram" viewBox="0 0 ${W} ${r1(H)}" role="img" aria-label="${esc(`parts of ${card.thing}`)}">${out}</svg>`;
}

// ---------------------------------------------------------------- counted icons
export function iconsSvg(card) {
  const n = Math.max(0, Math.min(40, Math.round(num(card.data?.n))));
  const per = n > 16 ? 10 : 8, rows = Math.max(1, Math.ceil(n / per));
  const W = per * 30 + 20, H = rows * 30 + 46;
  let out = '';
  for (let i = 0; i < n; i++) out += `<circle cx="${20 + (i % per) * 30}" cy="${26 + Math.floor(i / per) * 30}" r="10" class="tk-dot"/><text x="${20 + (i % per) * 30}" y="${30 + Math.floor(i / per) * 30}" text-anchor="middle" class="tk-t tk-dotn">${i + 1}</text>`;
  out += `<text x="10" y="${H - 8}" class="tk-t tk-b">${esc(`${num(card.data?.n)} ${card.data?.label ?? ''}`)}</text>`;
  return `<svg class="tk-svg tk-icons" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${num(card.data?.n)} ${card.data?.label ?? ''}`)}">${out}</svg>`;
}

// ---------------------------------------------------------------- bars
export function barsSvg(card) {
  const bars = (card.data?.bars ?? []).slice(0, 4);
  const max = Math.max(...bars.map((b) => Math.abs(num(b.value))), 1);
  const lw = 92, bw = 190, H = 24 + bars.length * 38 + 20;
  let out = '';
  bars.forEach((b, i) => {
    const y = 14 + i * 38, w = Math.max(3, (Math.abs(num(b.value)) / max) * bw);
    out += `<text x="${lw - 8}" y="${y + 17}" text-anchor="end" class="tk-t">${esc(clip(b.label, 12))}</text><rect x="${lw}" y="${y}" width="${r1(w)}" height="24" rx="5" class="tk-bar${card.data?.big === i ? ' tk-big' : ''}"/><text x="${r1(lw + w + 6)}" y="${y + 17}" class="tk-t tk-b">${esc(num(b.value).toLocaleString('en-US'))}</text>`;
  });
  out += `<text x="${lw}" y="${H - 6}" class="tk-t tk-muted">${esc(clip(card.data?.unit ?? '', 34))}</text>`;
  return `<svg class="tk-svg tk-bars" viewBox="0 0 ${lw + bw + 56} ${H}" role="img" aria-label="${esc(card.title)}">${out}</svg>`;
}

// ---------------------------------------------------------------- a line with points
export function lineSvg(card) {
  const items = (card.data?.items ?? []).slice(0, 14), n = Math.max(1, items.length);
  const tilt = n > 5, step = tilt ? 40 : 76, W = 40 + (n - 1) * step + (tilt ? 40 : 40), y = tilt ? 40 : 52;
  const mark = num(card.data?.mark, -1), from = card.data?.from;
  let out = `<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" class="tk-axis"/>`;
  items.forEach((it, i) => {
    const x = 20 + i * step, hot = i === mark, was = i === from && from !== mark && from !== undefined;
    out += `<g class="tk-pt" data-item="${esc(it)}"><circle cx="${x}" cy="${y}" r="${hot ? 9 : 6}" class="tk-point${hot ? ' tk-hot' : was ? ' tk-was' : ''}"/>`;
    out += tilt ? `<text transform="translate(${x + 3} ${y + 16}) rotate(48)" class="tk-t${hot ? ' tk-b' : ''}">${esc(clip(it, 11))}</text>` : `<text x="${x}" y="${y + 28}" text-anchor="middle" class="tk-t${hot ? ' tk-b' : ''}">${esc(it)}</text>`;
    out += `<text x="${x}" y="${y - 14}" text-anchor="middle" class="tk-t tk-muted tk-small">${i + 1}</text><title>${esc(it)}</title></g>`;
  });
  return `<svg class="tk-svg tk-line" viewBox="0 0 ${W} ${tilt ? 112 : 92}" role="img" aria-label="${esc(card.title)}">${out}</svg>`;
}

// ---------------------------------------------------------------- how do you know
export function howHtml(card) {
  const steps = (card.data?.steps ?? []).slice(0, 8);
  return `<ol class="tk-how">${steps.map((s) => `<li><span class="tk-howlabel">${esc(s.label)}</span><span class="tk-howtext">${esc(s.text)}</span></li>`).join('')}</ol>`;
}

/** The markup of a card: { html, className } (an svg for the picture kinds, a list for `how`). */
export function cardHtml(card, opts = {}) {
  switch (card?.kind) {
    case 'drawing': return drawingSvg(card.data?.parts, { label: `drawing of ${card.thing}`, only: opts.only });
    case 'parts': return partsSvg(card);
    case 'icons': return iconsSvg(card);
    case 'bars': return barsSvg(card);
    case 'line': return lineSvg(card);
    case 'how': return howHtml(card);
    default: return '';
  }
}

// ---------------------------------------------------------------- the topic board: a tidy tree, left to right, leaves in their own rows (no two nodes overlap)
export const BOARD = { nodeW: 132, nodeH: 30, gapX: 34, gapY: 12, pad: 12 };
/** { nodes: [{ id, name, x, y, depth, parent }], links: [{ from, to }], width, height }. The root "Talk" holds the topics that came from nowhere. */
export function layoutBoard(topics) {
  const { nodeW, nodeH, gapX, gapY, pad } = BOARD;
  const byId = new Map([['root', { id: 'root', name: 'Talk', parent: null, children: [], depth: 0 }]]);
  for (const t of topics ?? []) byId.set(t.id, { id: t.id, name: t.name, parent: t.parent, children: [], depth: 0 });
  for (const t of byId.values()) if (t.id !== 'root') { const p = byId.has(t.parent) && t.parent !== t.id ? t.parent : 'root'; t.parent = p; byId.get(p).children.push(t); }
  // a cycle never forms (a parent is always an older topic) but a corrupt state must not hang: unreachable nodes are attached to the root
  const seen = new Set(), order = [];
  const visit = (start, d0) => {   // an explicit stack, no recursion: the preorder of the tree under `start`
    const stack = [[start, d0]];
    for (let i = 0; stack.length && i < 100000; i++) {
      const [n, d] = stack.pop();
      if (seen.has(n.id)) continue;
      seen.add(n.id); n.depth = d; order.push(n);
      for (let k = n.children.length - 1; k >= 0; k--) stack.push([n.children[k], d + 1]);
    }
  };
  visit(byId.get('root'), 0);
  for (const t of byId.values()) if (!seen.has(t.id)) { const root = byId.get('root'); t.parent = 'root'; root.children.push(t); visit(t, 1); }
  let row = 0;
  for (const n of order) if (!n.children.length) n.row = row++;
  for (let k = order.length - 1; k >= 0; k--) { const n = order[k]; if (n.children.length) n.row = (n.children[0].row + n.children.at(-1).row) / 2; }
  const nodes = [...byId.values()].map((n) => ({ id: n.id, name: n.name, parent: n.parent, depth: n.depth, x: pad + n.depth * (nodeW + gapX), y: pad + n.row * (nodeH + gapY) }));
  const maxD = Math.max(...nodes.map((n) => n.depth));
  return { nodes, links: nodes.filter((n) => n.parent).map((n) => ({ from: n.parent, to: n.id })), width: pad * 2 + (maxD + 1) * nodeW + maxD * gapX, height: pad * 2 + Math.max(1, row) * nodeH + Math.max(0, row - 1) * gapY };
}
export function boardSvg(topics, current = null) {
  const L = layoutBoard(topics), at = new Map(L.nodes.map((n) => [n.id, n]));
  const { nodeW, nodeH } = BOARD;
  const links = L.links.map((l) => { const a = at.get(l.from), b = at.get(l.to); const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2, mx = (x1 + x2) / 2; return `<path d="M${r1(x1)} ${r1(y1)} C${r1(mx)} ${r1(y1)} ${r1(mx)} ${r1(y2)} ${r1(x2)} ${r1(y2)}" class="tk-link" fill="none"/>`; }).join('');
  const nodes = L.nodes.map((n) => `<g class="tk-node${n.id === 'root' ? ' tk-rootnode' : ''}${n.id === current ? ' tk-current' : ''}" data-topic="${esc(n.id)}" transform="translate(${r1(n.x)} ${r1(n.y)})" tabindex="0" role="button" aria-label="${esc(n.name)}"><rect width="${nodeW}" height="${nodeH}" rx="9" class="tk-box"/><text x="${nodeW / 2}" y="${nodeH / 2 + 4.5}" text-anchor="middle" class="tk-t">${esc(clip(n.name, 17))}</text><title>${esc(n.name)}</title></g>`).join('');
  return `<svg class="tk-svg tk-board" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="img" aria-label="Topics we talked about">${links}${nodes}</svg>`;
}
