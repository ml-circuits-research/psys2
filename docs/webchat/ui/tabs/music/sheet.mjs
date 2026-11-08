// Sheet music with abcjs (MIT, vendored in docs/webchat/vendor/music/abcjs.mjs). The playing note is highlighted.
export function createSheet(el, loadAbc) {
  let abcjs = null, rendered = '', lastWidth = 0, timings = new Map(), lit = [], pending = null, tune = null;
  async function lib() { abcjs ??= (await loadAbc()).default; return abcjs; }
  async function render(abc) {
    const text = String(abc ?? '');
    const width = el.clientWidth;
    if (!text.trim()) { el.replaceChildren(); rendered = ''; timings = new Map(); return; }
    if (width < 40) { pending = text; return; }   // hidden tab: render when it becomes visible
    if (text === rendered && Math.abs(width - lastWidth) < 24) return;
    const A = await lib();
    pending = null;
    const staff = Math.max(300, Math.min(960, width - 8));
    const tunes = A.renderAbc(el, text, { responsive: 'resize', add_classes: true, staffwidth: staff, paddingtop: 4, paddingbottom: 4, paddingleft: 0, paddingright: 0, scale: 1.05, wrap: { minSpacing: 1.8, maxSpacing: 2.8, preferredMeasuresPerLine: 4 }, format: { titlefont: 'serif 17', subtitlefont: 'serif 12', composerfont: 'serif italic 12', gchordfont: 'sans-serif 11' } });
    tune = tunes?.[0] ?? null;
    rendered = text; lastWidth = width; lit = [];
    timings = new Map();
    try {
      tune?.setTiming?.(120);
      for (const t of tune?.noteTimings ?? []) if (t.type === 'event' && t.elements) timings.set(t.startChar, { end: t.endChar, els: t.elements.flat() });
    } catch { /* timing is optional */ }
  }
  function clear() { for (const e of lit) e.classList?.remove('p2m-hl'); lit = []; }
  /** Highlight the notes of the event spanning characters a..b. */
  function highlight(a, on) {
    let hit = timings.get(a);
    if (!hit) for (const [s, v] of timings) if (s <= a && a < v.end) { hit = v; break; }
    if (!hit) return;
    if (on) {
      clear();
      for (const e of hit.els) { e.classList?.add('p2m-hl'); }
      lit = hit.els;
      const r = hit.els[0]?.getBoundingClientRect?.();
      const host = el.closest('.p2-panel');
      if (r && host) { const hr = host.getBoundingClientRect(); if (r.top < hr.top + 60 || r.bottom > hr.bottom - 40) host.scrollTo?.({ top: host.scrollTop + r.top - hr.top - 140, behavior: 'smooth' }); }
    } else for (const e of hit.els) e.classList?.remove('p2m-hl');
  }
  return {
    render, clear, highlight,
    get rendered() { return rendered; },
    retry() { if (pending !== null) return render(pending); return Promise.resolve(); },
    resize() { return render(pending ?? rendered); },
  };
}
