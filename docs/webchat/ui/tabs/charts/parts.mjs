// DOM parts of the Charts tab: styles, chart thumbnails (inline SVG), the data table and the empty state.

export const CSS = `
.cc-root { display: flex; flex-direction: column; gap: 14px; width: 100%; font-variant-numeric: tabular-nums; }
.cc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cc-titles { min-width: 0; }
.cc-eyebrow { margin: 0 0 2px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.cc-title { margin: 0; font-size: clamp(20px, 3vw, 28px); line-height: 1.15; font-weight: 750; letter-spacing: -.01em; overflow-wrap: anywhere; }
.cc-title.is-empty { color: var(--muted); font-weight: 600; }
.cc-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.cc-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 650; color: var(--ink); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); transition: background .15s, box-shadow .15s, transform .12s; }
.cc-btn:hover, .cc-btn:focus-visible { background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--accent); }
.cc-btn:active { transform: translateY(1px); }
.cc-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.cc-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--ink); }
.cc-btn[disabled] { opacity: .45; cursor: default; }
.cc-card { position: relative; background: var(--surface); border-radius: 18px; padding: 14px 14px 10px; box-shadow: inset 0 0 0 1px var(--line), 0 10px 30px -14px rgba(20, 40, 50, .28); overflow: hidden; }
.cc-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #2a78d6, #1baf7a, #eda100, #eb6834, #e87ba4); opacity: .85; }
.cc-stage { position: relative; height: clamp(250px, 44vh, 440px); }
.cc-stage canvas { display: block; }
.cc-stage.is-fresh canvas { animation: cc-in .5s cubic-bezier(.2, .8, .2, 1); }
@keyframes cc-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
.cc-pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cc-pill { all: unset; box-sizing: border-box; cursor: pointer; padding: 5px 11px; border-radius: 999px; font-size: 12.5px; font-weight: 650; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); transition: all .15s; }
.cc-pill:hover, .cc-pill:focus-visible { color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
.cc-pill[aria-pressed="true"] { color: var(--accent-ink); background: var(--accent); box-shadow: none; }
.cc-sep { width: 1px; align-self: stretch; background: var(--line); margin: 0 4px; }
.cc-source { margin: 0; font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.cc-source code { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 6px; border-radius: 6px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.cc-table-wrap { background: var(--surface); border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.cc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.cc-table caption { text-align: left; padding: 10px 14px 4px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.cc-table th, .cc-table td { padding: 7px 14px; text-align: right; }
.cc-table th:first-child, .cc-table td:first-child { text-align: left; }
.cc-table thead th { font-size: 12px; color: var(--muted); font-weight: 650; border-bottom: 1px solid var(--line); }
.cc-table tbody tr { cursor: pointer; transition: background .12s; }
.cc-table tbody tr:hover, .cc-table tbody tr:focus-visible { background: var(--surface-2); }
.cc-table tbody tr + tr td { border-top: 1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.cc-table tfoot td { border-top: 1px solid var(--line); font-weight: 700; color: var(--muted); }
.cc-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 9px; vertical-align: -1px; }
.cc-meter { position: relative; }
.cc-meter span { position: absolute; left: 0; right: 14px; bottom: 3px; height: 3px; border-radius: 2px; background: currentColor; opacity: .0; }
.cc-strip { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; scroll-snap-type: x proximity; }
.cc-thumb { all: unset; box-sizing: border-box; cursor: pointer; position: relative; flex: none; width: 132px; scroll-snap-align: start; background: var(--surface); border-radius: 12px; padding: 8px 8px 7px; box-shadow: inset 0 0 0 1px var(--line); transition: transform .15s, box-shadow .15s; }
.cc-thumb:hover, .cc-thumb:focus-visible { transform: translateY(-2px); box-shadow: inset 0 0 0 1px var(--accent), 0 8px 18px -10px rgba(20, 40, 50, .4); }
.cc-thumb[aria-current="true"] { box-shadow: inset 0 0 0 2px var(--accent), 0 8px 18px -10px rgba(20, 40, 50, .4); }
.cc-thumb svg { display: block; width: 100%; height: 54px; }
.cc-thumb b { display: block; margin-top: 5px; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-thumb small { display: block; font-size: 11px; color: var(--muted); }
.cc-x { all: unset; cursor: pointer; position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; font-size: 14px; line-height: 1; color: var(--muted); opacity: 0; transition: opacity .15s, background .15s; }
.cc-thumb:hover .cc-x, .cc-x:focus-visible { opacity: 1; }
.cc-x:hover { background: var(--surface-2); color: var(--bad); }
.cc-new { display: grid; place-items: center; align-content: center; gap: 2px; min-height: 106px; text-align: center; color: var(--muted); border: 1.5px dashed var(--line); background: transparent; box-shadow: none; }
.cc-new:hover { color: var(--accent); border-color: var(--accent); }
.cc-new span { font-size: 24px; line-height: 1; }
.cc-empty { display: grid; justify-items: center; gap: 12px; text-align: center; padding: 34px 18px 28px; }
.cc-empty svg { width: 120px; height: 84px; }
.cc-empty h3 { margin: 0; font-size: 20px; }
.cc-empty p { margin: 0; color: var(--muted); max-width: 46ch; }
.cc-chips { display: flex; flex-direction: column; gap: 7px; align-items: stretch; width: min(100%, 440px); }
.cc-chip { all: unset; box-sizing: border-box; cursor: pointer; text-align: left; padding: 8px 13px; border-radius: 12px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); font-size: 13.5px; transition: all .15s; }
.cc-chip:hover, .cc-chip:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); transform: translateX(2px); }
.cc-chip q { quotes: "\\201c" "\\201d"; color: var(--accent); font-weight: 650; }
@media (prefers-reduced-motion: reduce) { .cc-stage.is-fresh canvas { animation: none; } .cc-btn, .cc-thumb, .cc-chip { transition: none; } }
`;

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of kids) if (c) e.append(c);
  return e;
};
const colorAt = (v, j) => { const c = v.datasets[0]?.color; return Array.isArray(c) ? c[j % c.length] : c ?? '#2a78d6'; };

/** A tiny drawing of a chart for the thumbnail strip, in the chart's own colors. */
export function thumbSvg(v) {
  const W = 120, H = 54, s = svg('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const n = v.labels.length;
  const vals = v.datasets[0]?.rawData ?? [];
  const max = Math.max(1, ...v.datasets.flatMap((d) => d.rawData));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  if (!n) { s.append(svg('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 8, fill: 'none', stroke: 'currentColor', 'stroke-dasharray': '4 4', opacity: '.35' })); return s; }
  if (v.type === 'bar') {
    const k = v.datasets.length, bw = (W - 12) / n;
    v.datasets.forEach((d, di) => d.rawData.forEach((x, j) => {
      const w = Math.max(3, (bw * 0.7) / (v.stacked ? 1 : k)), h = Math.max(2, (x / max) * (H - 8));
      const bx = 6 + j * bw + (bw - w * (v.stacked ? 1 : k)) / 2 + (v.stacked ? 0 : di * w);
      s.append(svg('rect', { x: bx, y: H - 3 - h, width: w, height: h, rx: 2, fill: Array.isArray(d.color) ? d.color[j] : d.color }));
    }));
  } else if (v.type === 'line' || v.type === 'scatter') {
    v.datasets.forEach((d) => {
      const pts = d.rawData.map((x, j) => [6 + (n === 1 ? (W - 12) / 2 : (j * (W - 12)) / (n - 1)), H - 6 - (x / max) * (H - 14)]);
      if (v.type === 'line') s.append(svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: d.base, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      pts.forEach((p) => s.append(svg('circle', { cx: p[0], cy: p[1], r: v.type === 'scatter' ? 3.4 : 2.4, fill: d.base })));
    });
  } else if (v.type === 'radar') {
    const cx = W / 2, cy = H / 2, r = H / 2 - 4;
    const pts = vals.map((x, j) => { const a = (j / n) * Math.PI * 2 - Math.PI / 2; const rr = Math.max(0.15, x / max) * r; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
    s.append(svg('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill: v.datasets[0].base, 'fill-opacity': '.25', stroke: v.datasets[0].base, 'stroke-width': 2 }));
  } else {
    const cx = W / 2, cy = H / 2, r = H / 2 - 3, inner = v.type === 'doughnut' ? r * 0.55 : 0;
    let a0 = -Math.PI / 2;
    vals.forEach((x, j) => {
      const sweep = v.type === 'polarArea' ? (Math.PI * 2) / n : (x / total) * Math.PI * 2;
      const rr = v.type === 'polarArea' ? Math.max(0.2, x / max) * r : r;
      const a1 = a0 + sweep;
      const P = (rad, a) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
      const [x0, y0] = P(rr, a0), [x1, y1] = P(rr, a1), large = sweep > Math.PI ? 1 : 0;
      let d;
      if (n === 1 && v.type !== 'polarArea') d = `M${cx - rr},${cy} a${rr},${rr} 0 1,0 ${rr * 2},0 a${rr},${rr} 0 1,0 ${-rr * 2},0`;
      else if (inner) { const [i0x, i0y] = P(inner, a0), [i1x, i1y] = P(inner, a1); d = `M${x0},${y0} A${rr},${rr} 0 ${large} 1 ${x1},${y1} L${i1x},${i1y} A${inner},${inner} 0 ${large} 0 ${i0x},${i0y}Z`; }
      else d = `M${cx},${cy} L${x0},${y0} A${rr},${rr} 0 ${large} 1 ${x1},${y1}Z`;
      s.append(svg('path', { d, fill: colorAt(v, j), stroke: 'var(--surface, #fff)', 'stroke-width': 1.2 }));
      a0 = a1;
    });
  }
  return s;
}

export const num = (n) => String(Math.round(Number(n) * 100) / 100);
const KIND = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', doughnut: 'Doughnut chart', radar: 'Radar chart', polarArea: 'Polar area chart', scatter: 'Scatter plot' };
export const kindName = (t) => KIND[t] ?? 'Chart';

/** Illustration for the empty state: three bars growing. */
export function emptyArt() {
  const s = svg('svg', { viewBox: '0 0 120 84', 'aria-hidden': 'true' });
  s.append(svg('rect', { x: 14, y: 70, width: 92, height: 3, rx: 1.5, fill: 'currentColor', opacity: '.25' }));
  [[22, 34, '#2a78d6'], [48, 52, '#1baf7a'], [74, 24, '#eda100']].forEach(([x, h, c], i) => {
    const r = svg('rect', { x, y: 70 - h, width: 20, height: h, rx: 5, fill: c });
    r.append(svg('animate', { attributeName: 'height', values: `0;${h};${h * 0.8};${h}`, dur: '2.4s', begin: `${i * 0.2}s`, repeatCount: 'indefinite', keyTimes: '0;.4;.7;1' }));
    r.append(svg('animate', { attributeName: 'y', values: `70;${70 - h};${70 - h * 0.8};${70 - h}`, dur: '2.4s', begin: `${i * 0.2}s`, repeatCount: 'indefinite', keyTimes: '0;.4;.7;1' }));
    s.append(r);
  });
  return s;
}
