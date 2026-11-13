// SPDX-License-Identifier: AGPL-3.0-only
// PROGRESS (spec 06 "Progress"): ONE progress service for every wait in the page. Any part reports start(id, label), step(id, label, done, total) and end(id);
// the service owns ONE small panel (a bar, the current step in plain words, a "Details" fold with the steps done and their times). No part draws its own spinner.
//
//   const pg = createProgress({ storage, localize, onStep });
//   pg.plan('startup', [{ id: 'page', label: 'page code' }, { id: 'worlds', label: 'worlds' }, ...]);   // an ordered set, weighted by the last start's measured times
//   pg.start('worlds', 'Loading 12 worlds'); pg.step('worlds', 'Loading 12 worlds', 3, 12); pg.end('worlds', { bytes });
//   pg.fail('catalog', 'The picture catalog could not be reached', 'basic drawings only');   // shown once in the panel, with what still works
//
// Texts are written in English by the caller; `localize(text) -> Promise<string>` (the host's interface translation, cached) swaps them for the selected language.
// Browser-safe: the DOM is optional (without `document` the service only keeps state), no `node:*`.
import { h } from './util.mjs';

export const PROGRESS_KEY = 'psys2.webchat.progress';
const HIDE_MS = 900, FAIL_MS = 20000, RENDER_MS = 80;

const mbText = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} kB` : `${b} B`);
const secText = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

export function createProgress({ storage = globalThis.localStorage, localize = null, onStep = null, now = () => globalThis.performance?.now?.() ?? Date.now(), document: doc = globalThis.document, setTimer = (fn, ms) => setTimeout(fn, ms) } = {}) {
  const tasks = new Map();      // id -> { id, label, t0, done, total, state: 'queued' | 'active' | 'done' | 'failed', ms, bytes, error, weight, plan }
  const plans = new Map();      // name -> { ids, weights }
  const failures = [];          // { key, text, still, at }
  const finished = [];          // step records in the order they ended
  const listeners = new Set();
  let noteText = '';             // one standing line under the bar ("still loading the model: answers may be simpler for a moment")
  let last = {};                // id -> { ms, bytes } from the previous start (localStorage)
  try { const v = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? '{}'); if (v && typeof v === 'object') last = v; } catch { last = {}; }
  const persist = () => { try { storage?.setItem(PROGRESS_KEY, JSON.stringify(last)); } catch { /* storage unavailable */ } };

  // ---------- state ----------
  const taskOf = (id, label) => { let t = tasks.get(id); if (!t) { t = { id, label: label ?? id, t0: null, done: 0, total: 0, state: 'queued', ms: null, bytes: null, error: null, weight: 1, plan: null }; tasks.set(id, t); } return t; };
  /** A set of steps in order. Their weights follow the last start's measured times (ms), so that the bar moves evenly; without a history every step weighs the same. */
  function plan(name, steps) {
    const ids = [];
    const known = steps.filter((s) => last[s.id]?.ms > 0).map((s) => last[s.id].ms);
    const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    for (const s of steps) {
      const t = taskOf(s.id, s.label); t.plan = name; t.state = 'queued'; t.t0 = null; t.done = 0; t.total = 0; t.ms = null; t.error = null; t.label = s.label ?? t.label;
      t.weight = Math.max(0.05 * mean, last[s.id]?.ms > 0 ? last[s.id].ms : mean);
      t.lastMs = last[s.id]?.ms ?? null;
      ids.push(s.id);
    }
    plans.set(name, { ids });
    schedule();
  }
  function start(id, label, { total = 0, done = 0 } = {}) {
    const t = taskOf(id, label);
    if (t.state === 'active') { if (label) t.label = label; return; }
    Object.assign(t, { label: label ?? t.label, t0: now(), state: 'active', done, total, ms: null, error: null });
    schedule();
  }
  function step(id, label, done = 0, total = 0) {
    const t = taskOf(id, label);
    if (t.state !== 'active') { Object.assign(t, { t0: now(), state: 'active', ms: null, error: null }); }
    if (label) t.label = label;
    t.done = done; t.total = total;
    schedule();
  }
  function finish(id, ok, { bytes = null, error = null, label = null, ms = null } = {}) {
    const t = taskOf(id, label);
    if (t.state === 'done' || t.state === 'failed') return t;
    if (label) t.label = label;
    t.ms = ms ?? (t.t0 == null ? 0 : Math.round(now() - t.t0));
    t.bytes = bytes ?? t.bytes; t.error = error; t.state = ok ? 'done' : 'failed'; t.done = t.total = t.total || 1;
    const rec = { id, label: t.label, ms: t.ms, bytes: t.bytes, ok, ...(error ? { error } : {}) };
    finished.push(rec); if (finished.length > 60) finished.shift();
    if (t.plan) last[id] = { ms: t.ms, ...(t.bytes != null ? { bytes: t.bytes } : {}) };
    persist();
    try { onStep?.(rec); } catch { /* a listener must not break the service */ }
    if (t.plan && planDone(t.plan)) { /* kept: the next start reads the timings */ }
    schedule();
    return t;
  }
  const end = (id, o = {}) => finish(id, true, o);
  /** A step that failed or timed out: the panel says so once, with what still works. */
  function fail(id, text, still = '', { label = null } = {}) {
    finish(id, false, { error: text, label });
    const key = `${id}|${text}`;
    if (!failures.some((f) => f.key === key)) failures.push({ key, text, still, at: now() });
    schedule();
  }
  const planDone = (name) => (plans.get(name)?.ids ?? []).every((id) => ['done', 'failed'].includes(tasks.get(id)?.state));

  // ---------- derived ----------
  const frac = (t) => (t.state === 'done' || t.state === 'failed' ? 1 : t.state === 'active' ? (t.total ? Math.min(0.98, t.done / t.total) : t.lastMs ? Math.min(0.9, (now() - t.t0) / t.lastMs) : 0.3) : 0);
  /** What the panel shows now: { label, fraction (0..1 or null = unknown), count, steps }. */
  function view() {
    const active = [...tasks.values()].filter((t) => t.state === 'active');
    const open = [...plans.entries()].filter(([n]) => !planDone(n));
    let main = null, fraction = null;
    if (open.length) {
      const ids = plans.get(open[0][0]).ids.map((id) => tasks.get(id));
      const sum = ids.reduce((a, t) => a + t.weight, 0), got = ids.reduce((a, t) => a + t.weight * frac(t), 0);
      fraction = sum ? got / sum : null;
      main = ids.find((t) => t.state === 'active') ?? ids.find((t) => t.state === 'queued');
    } else if (active.length) {
      main = active[active.length - 1];
      fraction = main.total ? main.done / main.total : null;
    }
    const idx = open.length ? plans.get(open[0][0]).ids.indexOf(main?.id) + 1 : 0;
    const label = main ? `${main.label}${main.total && main.total > 1 && !/\d+\s*\/\s*\d+|MB/.test(main.label) ? ` (${main.done}/${main.total})` : ''}` : '';
    return { note: noteText, label, fraction, busy: !!main || active.length > 0, stepNo: idx, stepOf: open.length ? plans.get(open[0][0]).ids.length : 0, active: active.map((t) => t.id), failures: failures.slice(), steps: [...tasks.values()].filter((t) => t.state !== 'queued' || t.plan) };
  }

  // ---------- panel ----------
  let el = null, rendering = 0, hideAt = 0, lastShown = null;
  if (doc) {
    const bar = h('i', {});
    el = h('div', { class: 'p2-progress', role: 'status', 'aria-live': 'polite', hidden: true },
      h('div', { class: 'p2-pg-row' }, h('span', { class: 'p2-pg-label' }), h('span', { class: 'p2-pg-count' }), h('button', { class: 'p2-pg-close', type: 'button', hidden: true, 'aria-label': 'Dismiss' }, '×')),
      h('div', { class: 'p2-pg-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar),
      h('p', { class: 'p2-pg-note', hidden: true }),
      h('p', { class: 'p2-pg-fail', hidden: true }),
      h('details', { class: 'p2-pg-details' }, h('summary', {}, 'Details'), h('ol', { class: 'p2-pg-steps' })));
    el.querySelector('.p2-pg-close').addEventListener('click', () => { failures.length = 0; hideAt = 0; render(); });
  }
  const txt = (node, text) => {
    if (node._en === text) return;
    node._en = text; node.textContent = text;
    if (localize && text) Promise.resolve(localize(text)).then((t) => { if (node._en === text && t && t !== text) node.textContent = t; }).catch(() => {});
  };
  function render() {
    rendering = 0;
    const v = view();
    for (const fn of [...listeners]) { try { fn(v); } catch { /* ignore */ } }
    if (!el) return;
    const show = v.busy || v.failures.length > 0 || (hideAt && now() < hideAt);
    if (v.busy) hideAt = 0; else if (!hideAt && !v.failures.length && lastShown?.busy) { hideAt = now() + HIDE_MS; setTimer(schedule, HIDE_MS + 20); }
    if (v.failures.length && !el.dataset.failAt) { el.dataset.failAt = '1'; setTimer(() => { if (failures.length && now() - failures[0].at >= FAIL_MS - 50) { failures.length = 0; delete el.dataset.failAt; schedule(); } }, FAIL_MS); }
    if (!v.failures.length) delete el.dataset.failAt;
    lastShown = v;
    el.hidden = !show;
    if (!show) return;
    const idle = !v.busy && !v.failures.length;
    txt(el.querySelector('.p2-pg-label'), idle ? 'Ready' : v.label || (v.failures.length ? 'Something did not load' : 'Working'));
    el.querySelector('.p2-pg-count').textContent = v.stepOf ? `${Math.min(v.stepNo || v.stepOf, v.stepOf)}/${v.stepOf}` : '';
    const barEl = el.querySelector('.p2-pg-bar'), pct = idle ? 100 : v.fraction == null ? null : Math.round(v.fraction * 100);
    barEl.classList.toggle('is-indeterminate', pct == null);
    barEl.firstChild.style.width = pct == null ? '' : `${pct}%`;
    if (pct == null) barEl.removeAttribute('aria-valuenow'); else barEl.setAttribute('aria-valuenow', String(pct));
    const ne = el.querySelector('.p2-pg-note');
    ne.hidden = !v.note || idle;
    if (v.note) txt(ne, v.note);
    const fe = el.querySelector('.p2-pg-fail');
    fe.hidden = !v.failures.length;
    if (v.failures.length) txt(fe, v.failures.map((f) => `${f.text}${f.still ? `: ${f.still}` : ''}`).join(' '));
    el.querySelector('.p2-pg-close').hidden = !v.failures.length;
    el.classList.toggle('is-failed', v.failures.length > 0);
    const ol = el.querySelector('.p2-pg-steps');
    const items = v.steps.map((t) => `${t.state}|${t.label}|${t.ms ?? ''}|${t.bytes ?? ''}|${t.state === 'active' ? Math.round((now() - t.t0) / 100) : ''}`);
    const sig = items.join('\n');
    if (ol._sig !== sig) {
      ol._sig = sig;
      ol.replaceChildren(...v.steps.map((t) => h('li', { class: `is-${t.state}` }, `${t.state === 'done' ? '✓' : t.state === 'failed' ? '✗' : t.state === 'active' ? '…' : '·'} ${t.label}`,
        h('span', { class: 'p2-pg-ms' }, t.state === 'active' ? ` ${secText(now() - t.t0)}` : t.ms != null ? ` ${secText(t.ms)}${t.bytes ? `, ${mbText(t.bytes)}` : ''}` : ''))));
    }
  }
  function schedule() { if (rendering) return; rendering = 1; setTimer(render, RENDER_MS); }
  // a long step keeps its elapsed time moving
  if (doc) setInterval(() => { if (lastShown?.busy) render(); }, 500);

  return {
    plan, start, step, end, fail, view,
    /** A standing line shown under the bar while something is loading; '' clears it. */
    note(text) { noteText = text || ''; schedule(); },
    get element() { return el; },
    steps: () => finished.slice(),
    state: (id) => tasks.get(id)?.state ?? null,
    /** The bar's fraction of the open plan (tests), or null. */
    get fraction() { return view().fraction; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** The last start's measured times (what the next start weights by). */
    history: () => ({ ...last }),
    flush: render,
  };
}
