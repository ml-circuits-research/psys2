// Charts tab (world data.charts, spec 07 sections 6-7): draws the active chart of the world state with Chart.js
// (vendored in ../../vendor/charts/), updates it in place so every change animates, shows the numbers in a small table,
// keeps a strip of thumbnails for several charts and turns every click into a typed command through host.send, so mouse and
// voice share one language layer ("what is <label>?" for a click on a bar).
// The view of a chart (sorted data, resolved colors, flags) comes from worlds/data.charts/chart.mjs (chartView), loaded with
// host.asset, so the tab draws exactly what the state says.
// Effects: charts.download { filename, format: 'png' | 'jpeg' } (canvas toDataURL).
import { CSS, thumbSvg, emptyArt, num, kindName } from './charts/parts.mjs';
import { themeOf, shapeKey, buildConfig, applyInPlace } from './charts/render.mjs';

const VENDOR = new URL('../../vendor/charts/chart.mjs', import.meta.url);
const OPS_ASSET = 'worlds/data.charts/chart.mjs';
const TYPE_PILLS = [['bar', 'Bar', 'make it a bar chart'], ['line', 'Line', 'make it a line chart'], ['pie', 'Pie', 'make it a pie chart'], ['doughnut', 'Doughnut', 'make it a doughnut chart'],
  ['radar', 'Radar', 'make it a radar chart'], ['polarArea', 'Polar', 'make it a polar area chart'], ['scatter', 'Scatter', 'make it a scatter plot']];
const EXAMPLES = ['make a chart: apples 5, pears 3, plums 8', 'chart the prices of the toys', 'compare the legs of the sea animals', 'Tom has 5 apples. Ana has 3 apples. Make a bar chart of what everyone has'];
const ICON = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/></svg>',
  table: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
};

function ensureCss() {
  if (document.getElementById('p2-charts-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-charts-css';
  st.textContent = CSS;
  document.head.append(st);
}
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function make(holder, host) {
  ensureCss();
  holder.style.maxWidth = '980px';
  holder.classList.add('cc-root');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const eyebrow = el('p', 'cc-eyebrow', 'Charts'), title = el('h2', 'cc-title');
  const actions = el('div', 'cc-actions');
  const head = el('div', 'cc-head', ''); head.append(Object.assign(el('div', 'cc-titles'), {}), actions);
  head.firstChild.append(eyebrow, title);
  const card = el('div', 'cc-card'), stage = el('div', 'cc-stage'), canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  stage.append(canvas);
  const empty = el('div', 'cc-empty');
  const pills = el('div', 'cc-pills');
  pills.setAttribute('role', 'toolbar'); pills.setAttribute('aria-label', 'Chart style');
  card.append(stage, empty);
  const source = el('p', 'cc-source');
  const tableWrap = el('div', 'cc-table-wrap');
  const strip = el('div', 'cc-strip');
  strip.setAttribute('aria-label', 'Your charts');
  holder.append(head, card, pills, source, tableWrap, strip);

  const send = (text) => host.send(text);
  const act = (label, icon, text) => { const b = el('button', 'cc-btn', `${ICON[icon]}<span>${label}</span>`); b.type = 'button'; b.title = `Say: ${text}`; b.addEventListener('click', () => send(text)); actions.append(b); return b; };
  act('Image', 'image', 'download the chart as an image');
  act('Data', 'table', 'download the chart data as a spreadsheet');
  act('Read', 'speak', 'read the chart aloud');

  let Chart = null, ops = null, ready = false, loadError = null, destroyed = false;
  let state, chart = null, key = '', shownId = null, lastView = null;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const onScheme = () => { if (chart) { chart.destroy(); chart = null; key = ''; } render(); };
  mq?.addEventListener?.('change', onScheme);

  Promise.all([import(VENDOR.href), import(host.asset(OPS_ASSET))]).then(([c, o]) => { Chart = c.Chart ?? c.default; ops = o; ready = true; if (!destroyed) render(); },
    (e) => { loadError = e; console.warn('charts tab: libraries failed to load', e); if (!destroyed) render(); });

  // ---- empty state ----------------------------------------------------------------------------------------------
  function showEmpty(c) {
    stage.hidden = true; empty.hidden = false; card.querySelector('.cc-stage').classList.remove('is-fresh');
    empty.replaceChildren(emptyArt());
    if (loadError) { empty.append(el('h3', '', 'The chart library did not load'), el('p', '', 'Reload the page; if it keeps failing, check that docs/webchat/vendor/charts/chart.mjs is served.')); return; }
    if (c) empty.append(el('h3', '', `“${esc(c.title) || 'This chart'}” is empty`), el('p', '', 'Tell me some numbers, or ask for them from the conversation:'));
    else empty.append(el('h3', '', 'No chart yet'), el('p', '', 'Type or say what to chart. I build it from your words and from what I know, and I keep the wires the numbers came from.'));
    const chips = el('div', 'cc-chips');
    for (const t of c ? ['add apples 5', 'add pears 3 and plums 8'] : EXAMPLES) {
      const b = el('button', 'cc-chip', `<q>${esc(t)}</q>`); b.type = 'button'; b.addEventListener('click', () => send(t)); chips.append(b);
    }
    empty.append(chips);
  }

  // ---- pieces ----------------------------------------------------------------------------------------------------
  function renderPills(c, v) {
    pills.replaceChildren();
    for (const [type, label, say] of TYPE_PILLS) {
      const b = el('button', 'cc-pill', label); b.type = 'button'; b.setAttribute('aria-pressed', String(c.type === type)); b.title = `Say: ${say}`;
      b.addEventListener('click', () => send(say)); pills.append(b);
    }
    pills.append(el('span', 'cc-sep'));
    const o = c.options ?? {};
    const toggle = (label, on, sayOn, sayOff) => { const b = el('button', 'cc-pill', label); b.type = 'button'; b.setAttribute('aria-pressed', String(!!on)); b.title = `Say: ${on ? sayOff : sayOn}`; b.addEventListener('click', () => send(on ? sayOff : sayOn)); pills.append(b); };
    toggle('Values', o.showValues, 'show the values', 'hide the values');
    toggle('Legend', v.showLegend, 'show the legend', 'hide the legend');
    toggle('Sorted', o.sort, 'sort from biggest to smallest', 'stop sorting');
    if (c.type === 'bar' || c.type === 'line') toggle('Horizontal', o.horizontal, 'make it horizontal', 'make it vertical');
    if (c.datasets.length > 1) toggle('Stacked', o.stacked, 'stack the bars', 'unstack the bars');
  }
  function renderSource(c) {
    source.replaceChildren();
    const ids = c.source ?? [];
    if (!ids.length) { source.hidden = true; return; }
    source.hidden = false;
    source.append(document.createTextNode(c.spec ? `Every number comes from ${ids.length} ${ids.length === 1 ? 'wire' : 'wires'} of the conversation:` : 'Typed by you:'));
    for (const id of ids.slice(0, 10)) source.append(el('code', '', esc(id)));
    if (ids.length > 10) source.append(el('span', '', `and ${ids.length - 10} more`));
  }
  function renderTable(v) {
    tableWrap.hidden = false;
    const multi = v.datasets.length > 1;
    const cols = v.datasets.map((d) => `<th scope="col">${esc(d.label)}</th>`).join('');
    const dot = (j) => { const d = v.datasets[0]; const c = Array.isArray(d.color) ? d.color[j] : d.color; return `<i class="cc-dot" style="background:${esc(c)}"></i>`; };
    const rows = v.labels.map((l, j) => `<tr tabindex="0" data-label="${esc(l)}"><td>${dot(j)}${esc(l)}</td>${v.datasets.map((d) => `<td>${num(d.rawData[j])}</td>`).join('')}${multi ? `<td>${num(v.datasets.reduce((a, d) => a + d.rawData[j], 0))}</td>` : ''}</tr>`).join('');
    const sums = v.datasets.map((d) => d.rawData.reduce((a, b) => a + b, 0));
    tableWrap.innerHTML = `<table class="cc-table"><caption>The numbers (click a row to ask about it)</caption><thead><tr><th scope="col">Label</th>${cols}${multi ? '<th scope="col">Total</th>' : ''}</tr></thead><tbody>${rows}</tbody>`
      + (v.labels.length > 1 ? `<tfoot><tr><td>Total</td>${sums.map((s) => `<td>${num(s)}</td>`).join('')}${multi ? `<td>${num(sums.reduce((a, b) => a + b, 0))}</td>` : ''}</tr></tfoot>` : '') + '</table>';
    for (const tr of tableWrap.querySelectorAll('tbody tr')) {
      const go = () => send(`what is ${tr.dataset.label}?`);
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
  }
  function renderStrip(s) {
    strip.replaceChildren();
    const charts = s?.charts ?? [];
    strip.hidden = !charts.length;
    charts.forEach((c, i) => {
      const v = ops.chartView(c, { dark: themeOf(holder).dark });
      const b = el('button', 'cc-thumb'); b.type = 'button'; b.setAttribute('aria-label', `Chart ${i + 1}: ${c.title || 'untitled'}`);
      if (c.id === s.active) b.setAttribute('aria-current', 'true');
      b.append(thumbSvg(v), el('b', '', esc(c.title) || 'Untitled'), el('small', '', `${i + 1} · ${kindName(c.type)}`));
      b.addEventListener('click', () => send(`go to chart ${i + 1}`));
      const x = el('span', 'cc-x', '×'); x.setAttribute('role', 'button'); x.tabIndex = 0; x.title = `Delete chart ${i + 1}`; x.setAttribute('aria-label', `Delete chart ${i + 1}`);
      const del = (e) => { e.stopPropagation(); send(`delete chart ${i + 1}`); };
      x.addEventListener('click', del); x.addEventListener('keydown', (e) => { if (e.key === 'Enter') del(e); });
      b.append(x);
      strip.append(b);
    });
    if (charts.length) {
      const n = el('button', 'cc-thumb cc-new', '<span>+</span><small>New chart</small>'); n.type = 'button'; n.addEventListener('click', () => send('new chart'));
      strip.append(n);
    }
  }

  // ---- main render -----------------------------------------------------------------------------------------------
  function render() {
    if (destroyed) return;
    if (!ready) { if (loadError) showEmpty(null); return; }
    const s = state ?? {};
    const c = (s.charts ?? []).find((x) => x.id === s.active) ?? null;
    renderStrip(s);
    eyebrow.textContent = c ? `${kindName(c.type)}${(s.charts?.length ?? 0) > 1 ? ` · ${s.charts.findIndex((x) => x.id === c.id) + 1} of ${s.charts.length}` : ''}` : 'Charts';
    title.textContent = c ? (c.title || 'Untitled chart') : 'Talk to draw a chart';
    title.classList.toggle('is-empty', !c);
    for (const b of actions.children) b.disabled = !c || !c.labels.length;
    if (!c || !c.labels.length) {
      if (chart) { chart.destroy(); chart = null; key = ''; }
      pills.hidden = !c; if (c) renderPills(c, ops.chartView(c, { dark: themeOf(holder).dark }));
      source.hidden = true; tableWrap.hidden = true; showEmpty(c); lastView = null;
      return;
    }
    empty.hidden = true; stage.hidden = false; pills.hidden = false;
    const theme = themeOf(holder);
    const v = ops.chartView(c, { dark: theme.dark });
    lastView = v;
    const k = shapeKey(v);
    canvas.setAttribute('aria-label', `${kindName(c.type)} “${c.title}”: ${v.labels.map((l, j) => `${l} ${num(v.datasets.reduce((a, d) => a + d.rawData[j], 0))}`).join(', ')}`);
    if (chart && k === key && shownId === c.id) {
      applyInPlace(chart, v, theme);
    } else {
      if (chart) chart.destroy();
      const cfg = buildConfig(v, theme, { onClick: (label) => send(`what is ${label}?`), reduce });
      chart = new Chart(canvas, cfg);
      chart.$labels = v.labels;
      key = k; shownId = c.id;
      if (!reduce) { stage.classList.remove('is-fresh'); void stage.offsetWidth; stage.classList.add('is-fresh'); }
    }
    renderPills(c, v); renderSource(c); renderTable(v);
  }

  // ---- download (effect charts.download) ---------------------------------------------------------------------------
  async function download({ filename, format } = {}) {
    if (!chart || !lastView) return { ok: false, detail: 'there is no chart to save' };
    const theme = themeOf(holder);
    const src = chart.canvas, sc = src.width / (src.clientWidth || src.width);
    const pad = Math.round(28 * sc), head = Math.round(60 * sc);
    const out = document.createElement('canvas');
    out.width = src.width + pad * 2; out.height = src.height + pad * 2 + head;
    const g = out.getContext('2d');
    g.fillStyle = theme.surface; g.fillRect(0, 0, out.width, out.height);
    g.fillStyle = theme.ink; g.font = `700 ${Math.round(26 * sc)}px system-ui, sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(lastView.title || 'Chart', pad, pad + Math.round(26 * sc));
    g.fillStyle = theme.muted; g.font = `500 ${Math.round(13 * sc)}px system-ui, sans-serif`;
    g.fillText(`${kindName(lastView.type)} · made with PSys2`, pad, pad + Math.round(48 * sc));
    g.drawImage(src, pad, pad + head);
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const url = out.toDataURL(mime, 0.92);
    const name = String(filename || 'chart.png').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
    const a = document.createElement('a'); a.href = url; a.download = name; a.hidden = true; document.body.append(a); a.click(); a.remove();
    return { ok: true, detail: name, data: { width: out.width, height: out.height } };
  }

  return {
    update(st) { state = st; render(); },
    download,
    destroy() { destroyed = true; mq?.removeEventListener?.('change', onScheme); chart?.destroy(); },
  };
}

export default {
  id: 'charts',
  label: 'Charts',
  world: 'data.charts',
  order: 70,
  make,
  effects: {
    'charts.download': async (args, { ui }) => (ui?.download ? ui.download(args ?? {}) : { ok: false, detail: 'the Charts tab is not open' }),
  },
};
