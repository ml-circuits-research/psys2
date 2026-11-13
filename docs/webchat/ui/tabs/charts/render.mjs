// Chart.js configuration for the Charts tab: turns a chart view (worlds/data.charts/chart.mjs chartView) into Chart.js options,
// updates a live chart in place (so bars grow, slices turn and colors fade on every change) and draws value labels.

export function themeOf(el) {
  const cs = getComputedStyle(el);
  const g = (n, f) => cs.getPropertyValue(n).trim() || f;
  return {
    ink: g('--ink', '#1f2a30'), muted: g('--muted', '#66727a'), line: g('--line', '#ddd8cf'), surface: g('--surface', '#ffffff'),
    dark: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  };
}

/** Charts with the same key can be updated in place; a different key needs a new Chart.js instance. */
export const shapeKey = (v) => [v.type, v.horizontal, v.stacked, v.datasets.length, v.pointwise].join('|');

const luminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const fmtNum = (n) => String(Math.round(n * 100) / 100);

/** Draws the numbers (or percentages) of every point; the mode comes from options.plugins.valueLabels.mode. */
export const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const mode = opts?.mode;
    if (!mode) return;
    const { ctx } = chart;
    const type = chart.config.type;
    const arc = type === 'pie' || type === 'doughnut' || type === 'polarArea';
    const grand = chart.data.datasets.reduce((a, d) => a + d.data.reduce((x, v) => x + (typeof v === 'object' ? v.y : Number(v) || 0), 0), 0);
    ctx.save();
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      const dsTotal = ds.data.reduce((x, v) => x + (typeof v === 'object' ? v.y : Number(v) || 0), 0);
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        const v = typeof raw === 'object' ? raw.y : Number(raw) || 0;
        const text = mode === 'percent' ? `${Math.round(((arc ? dsTotal : grand) ? v / (arc ? dsTotal : grand) : 0) * 1000) / 10}%` : fmtNum(v);
        let x, y, color = opts.ink;
        if (arc) {
          if (el.circumference != null && el.circumference < 0.22) return;   // slice too thin for a label
          const p = el.tooltipPosition(); x = p.x; y = p.y;
          const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
          color = luminance(bg) > 0.62 ? '#14202a' : '#ffffff';
        } else if (type === 'bar') {
          const horiz = chart.options.indexAxis === 'y';
          if (chart.options.scales?.x?.stacked || chart.options.scales?.y?.stacked) {
            const p = el.getCenterPoint(); x = p.x; y = p.y;
            const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
            color = luminance(bg) > 0.62 ? '#14202a' : '#ffffff';
            if (v === 0) return;
          } else if (horiz) { x = el.x + (v >= 0 ? 16 : -16); y = el.y; ctx.textAlign = 'center'; }
          else { x = el.x; y = el.y + (v >= 0 ? -12 : 12); }
        } else { x = el.x; y = el.y - 14; }
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      });
    });
    ctx.restore();
  },
};

const alpha = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

/** Properties of one dataset for Chart.js. */
function datasetProps(v, d, di, theme) {
  const t = v.type;
  const color = d.color;
  const base = d.base;
  const first = (c) => (Array.isArray(c) ? c[0] : c);
  if (t === 'line') {
    const single = v.datasets.length === 1;
    return {
      label: d.label, data: d.data, borderColor: base, borderWidth: 3, tension: 0.35, fill: single,
      backgroundColor: (c) => {
        const a = c.chart.chartArea;
        if (!single || !a) return alpha(base, 0.12);
        const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, alpha(base, 0.32)); g.addColorStop(1, alpha(base, 0.02));
        return g;
      },
      pointBackgroundColor: color, pointBorderColor: theme.surface, pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8, pointHitRadius: 14,
    };
  }
  if (t === 'radar') {
    return { label: d.label, data: d.data, borderColor: base, borderWidth: 2.5, backgroundColor: Array.isArray(color) ? alpha(first(color), 0.2) : alpha(color, 0.2), pointBackgroundColor: color, pointBorderColor: theme.surface, pointRadius: 4, pointHoverRadius: 7, fill: true };
  }
  if (t === 'scatter') {
    return { label: d.label, data: d.data, backgroundColor: Array.isArray(color) ? color.map((c) => alpha(c, 0.85)) : alpha(color, 0.85), borderColor: theme.surface, borderWidth: 2, pointRadius: 8, pointHoverRadius: 11 };
  }
  if (t === 'pie' || t === 'doughnut') {
    return { label: d.label, data: d.data, backgroundColor: color, borderColor: theme.surface, borderWidth: 3, hoverOffset: 10, borderRadius: t === 'doughnut' ? 6 : 3, spacing: 0 };
  }
  if (t === 'polarArea') {
    return { label: d.label, data: d.data, backgroundColor: Array.isArray(color) ? color.map((c) => alpha(c, 0.8)) : alpha(color, 0.8), borderColor: theme.surface, borderWidth: 2 };
  }
  return { label: d.label, data: d.data, backgroundColor: color, borderColor: theme.surface, borderWidth: v.stacked ? 2 : 0, borderRadius: v.stacked ? 3 : 8, borderSkipped: v.stacked ? false : 'start', maxBarThickness: 64, categoryPercentage: 0.78, barPercentage: v.datasets.length > 1 && !v.stacked ? 0.9 : 0.8 };
}

const ANIM = (reduce) => (reduce ? false : { duration: 800, easing: 'easeOutQuart' });

export function buildConfig(v, theme, { onClick, reduce } = {}) {
  const t = v.type;
  const radial = t === 'pie' || t === 'doughnut' || t === 'polarArea';
  const axisTick = { color: theme.muted, font: { size: 12 }, padding: 8 };
  const grid = { color: alpha(theme.line.startsWith('#') ? theme.line : '#888888', 0.9), drawTicks: false };
  const cat = { stacked: v.stacked, grid: { display: false }, border: { color: theme.line }, ticks: { ...axisTick, maxRotation: 40 } };
  const val = { stacked: v.stacked, beginAtZero: true, grid, border: { display: false }, ticks: { ...axisTick, precision: 0 } };
  const horiz = v.horizontal;
  let scales;
  if (radial && t !== 'polarArea') scales = {};
  else if (t === 'polarArea') scales = { r: { beginAtZero: true, grid: { color: theme.line }, ticks: { color: theme.muted, backdropColor: 'transparent' }, angleLines: { color: theme.line } } };
  else if (t === 'radar') scales = { r: { beginAtZero: true, grid: { color: theme.line }, angleLines: { color: theme.line }, pointLabels: { color: theme.ink, font: { size: 12, weight: '600' } }, ticks: { color: theme.muted, backdropColor: 'transparent', precision: 0 } } };
  else if (t === 'scatter') scales = { x: { type: 'linear', grid, border: { display: false }, ticks: axisTick }, y: { beginAtZero: true, grid, border: { display: false }, ticks: axisTick } };
  else scales = horiz ? { x: { ...val, position: 'bottom' }, y: { ...cat, ticks: { ...axisTick, maxRotation: 0 } } } : { x: cat, y: val };
  return {
    type: t,
    data: { labels: t === 'scatter' ? undefined : v.labels, datasets: v.datasets.map((d, i) => datasetProps(v, d, i, theme)) },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horiz ? 'y' : 'x', animation: ANIM(reduce),
      layout: { padding: { top: 22, right: 30, bottom: 4, left: 4 } },
      cutout: t === 'doughnut' ? '62%' : undefined,
      interaction: { mode: radial || t === 'radar' ? 'nearest' : 'index', intersect: radial || t === 'scatter', axis: horiz ? 'y' : 'x' },
      onClick: (e, els, chart) => {
        if (!els.length || !onClick) return;
        const el = els[0];
        const label = t === 'scatter' ? (chart.$labels?.[el.index] ?? '') : chart.data.labels[el.index];
        if (label !== undefined && label !== '') onClick(String(label));
      },
      onHover: (e, els) => { const c = e.native?.target; if (c) c.style.cursor = els.length ? 'pointer' : 'default'; },
      scales,
      plugins: {
        legend: legendOf(v, theme), valueLabels: { mode: v.showValues, ink: theme.ink },
        tooltip: {
          backgroundColor: theme.dark ? '#e8edef' : '#1f2a30', titleColor: theme.dark ? '#14202a' : '#ffffff', bodyColor: theme.dark ? '#14202a' : '#ffffff',
          padding: 10, cornerRadius: 8, boxPadding: 5, usePointStyle: true, titleFont: { weight: '700' },
          callbacks: t === 'scatter' ? { title: (items) => v.labels[items[0].dataIndex] ?? '', label: (c) => ` ${c.dataset.label}: ${c.parsed.y}` } : undefined,
        },
      },
    },
    plugins: [valueLabels],
  };
}

function legendOf(v, theme) {
  return { display: v.showLegend, position: 'bottom', labels: { color: theme.ink, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 12.5 } } };
}

/** Update a live chart of the same shape: new numbers animate from the old ones. */
export function applyInPlace(chart, v, theme) {
  const t = v.type;
  if (t !== 'scatter') chart.data.labels = v.labels;
  chart.$labels = v.labels;
  v.datasets.forEach((d, i) => {
    const props = datasetProps(v, d, i, theme);
    const target = chart.data.datasets[i];
    if (!target) { chart.data.datasets[i] = props; return; }
    Object.assign(target, props);
  });
  chart.data.datasets.length = v.datasets.length;
  chart.options.plugins.legend = legendOf(v, theme);
  chart.options.plugins.valueLabels = { mode: v.showValues, ink: theme.ink };
  chart.update();
}
