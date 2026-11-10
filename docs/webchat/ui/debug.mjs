// SPDX-License-Identifier: AGPL-3.0-only
// DBG: the debug view of a tab, in developer mode (spec 06 "Debug view"). Loaded lazily (dynamic import) the first time developer mode is on,
// so with developer mode off nothing of it is downloaded, recorded or kept. Browser-safe: no node:* imports; the data builders are pure and tested in node.
import { h } from './util.mjs';
import { renderTrace, colorSop } from './trace.mjs';
import { hashState, buildDetail } from './phrase-log.mjs';

export const RING_MAX = 200;   // turns kept while developer mode is on
export const LAST_TURNS = 20;  // turns shown per world
export const DEBUG_SECTIONS = [['commands', 'Commands'], ['turns', 'Last turns'], ['dry', 'Dry run'], ['state', 'State'], ['world', 'World'], ['models', 'Models']];

const clip = (v, n = 80) => { const t = String(v ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const val = (e) => (e?.value && typeof e.value === 'object' && 'v' in e.value ? e.value.v : e?.value);
const entriesOf = (wire, key) => (wire?.entries ?? []).filter((e) => e.key === key).map(val);

// ---------- pure data builders ----------
/** The operation a pattern's emit line asks for: the `action=` of a request, else the first core.* word. */
export function opOfEmit(emit) {
  const s = String(emit ?? '');
  const a = /action=([\w.\-]+)/.exec(s);
  if (a) return a[1];
  const c = /\bcore\.([\w.]+)/.exec(s);
  return c ? `core.${c[1]}` : 'other';
}
/** Everything a world understands, from the loaded world: patterns grouped by operation, canonical examples, request shapes. */
export function commandsOf(w) {
  const groups = new Map();
  const canonical = [];
  for (const p of w?.patterns ?? []) {
    const op = opOfEmit(p.emit ?? entriesOf(p.wire, 'emit')[0]);
    const row = { id: p.id, op, kind: p.kind ?? entriesOf(p.wire, 'kind')[0] ?? null, priority: p.priority ?? null, emit: p.emit ?? entriesOf(p.wire, 'emit')[0] ?? '', examples: [...(p.examples ?? [])], canonical: [...(p.canonical ?? [])] };
    if (!groups.has(op)) groups.set(op, []);
    groups.get(op).push(row);
    for (const c of row.canonical) if (!canonical.includes(c)) canonical.push(c);
  }
  const shapes = (w?.shapes ?? []).map((s) => ({ id: s.id, family: entriesOf(s.wire, 'family')[0] ?? null, verb: entriesOf(s.wire, 'verb')[0] ?? null }));
  return {
    world: w?.id ?? null, canonical, shapes, patterns: (w?.patterns ?? []).length, examples: [...groups.values()].flat().reduce((n, r) => n + r.examples.length, 0),
    groups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([op, patterns]) => ({ op, patterns })),
  };
}
/** The manifest, legend, lexicons, operations, templates and imports of a world, as plain data. */
export function worldInfo(w) {
  if (!w) return null;
  const manifest = Object.fromEntries([...new Set((w.manifest?.entries ?? []).map((e) => e.key))].map((k) => [k, entriesOf(w.manifest, k)]));
  const legendTypes = (w.legendWires ?? []).filter((x) => x.type === 'core.type').map((x) => x.id);
  const legendKeys = (w.legendWires ?? []).filter((x) => x.type === 'core.key').map((x) => x.id);
  return {
    id: w.id, manifest, imports: [...(w.imports ?? [])].map(String),
    legend: { types: legendTypes, keys: legendKeys },
    lexicons: (w.lexicons ?? []).map((l) => ({ id: l.id, class: l.class ?? null, words: (l.words ? [...l.words] : entriesOf(l.wire, 'word')).length, sample: (l.words ? [...l.words] : entriesOf(l.wire, 'word')).slice(0, 40) })),
    operations: (w.operations ?? []).map((o) => ({ id: o.id, impl: entriesOf(o.wire, 'impl')[0] ?? null, action: entriesOf(o.wire, 'action')[0] ?? null, semantics: entriesOf(o.wire, 'semantics')[0] ?? null, doc: clip(entriesOf(o.wire, 'doc')[0] ?? '', 240) })),
    templates: (w.templates ?? []).map((t) => t.id),
    counts: { patterns: (w.patterns ?? []).length, shapes: (w.shapes ?? []).length, lexicons: (w.lexicons ?? []).length, words: (w.lexicons ?? []).reduce((n, l) => n + (l.words ? l.words.length : entriesOf(l.wire, 'word').length), 0), operations: (w.operations ?? []).length, templates: (w.templates ?? []).length, wires: (w.wires ?? []).length },
  };
}
/** The turns of the ring that touched a world (the tab's world was open, or a segment was read by it), newest first. */
export function turnsFor(ring, worldId, n = LAST_TURNS) {
  return ring.filter((t) => t.worlds.includes(worldId) || t.tabWorld === worldId).slice(-n).reverse();
}
/** Paths (`a.b.0`) whose value differs between two JSON values, plus the paths only one side has. */
// bounded: structural recursion over a JSON snapshot (finite, acyclic by structuredClone)
export function diffPaths(before, after, path = '', out = new Set()) {
  if (before === after) return out;
  const bo = before && typeof before === 'object', ao = after && typeof after === 'object';
  if (!bo || !ao || Array.isArray(before) !== Array.isArray(after)) { out.add(path); return out; }
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) diffPaths(before[k], after[k], path ? `${path}.${k}` : k, out);
  return out;
}
/** A ring entry from what the host knows after a turn. Compact: the reply is kept by reference, the state only as hashes. */
export function makeEntry({ seq, text, mode, tab, tabWorld, reply = null, usage = [], detection = [], effects = [], outcome = null, stage = null, ms = null, recId = null, stateBefore = null, stateAfter = null, serialize = null, endType = null }) {
  const detail = reply ? buildDetail(reply, { serialize, tab }) : null;
  return {
    seq, id: recId, time: new Date().toISOString(), text: String(text ?? ''), mode, tab, tabWorld, endType,
    worlds: detail?.worlds ?? [], answer: reply?.text ?? null, reply, usage, detection, effects, outcome, stage, ms: ms ?? reply?.perf?.totalMs ?? null,
    stateBefore, stateAfter, readings: detail?.readings ?? [], perf: reply?.perf ?? null,
  };
}

// ---------- DOM pieces ----------
const sopBlock = (text) => (text ? h('pre', { class: 'p2-code p2-dbg-sop' }, h('code', {}, colorSop(text))) : h('p', { class: 'p2-muted' }, 'No wires.'));
const kv = (rows) => h('dl', { class: 'p2-kv' }, rows.filter(([, v]) => v !== undefined && v !== null && v !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
const sec = (title, ...body) => h('section', { class: 'p2-trace-sec' }, h('h4', {}, title), ...body);

/** A collapsible JSON tree; paths in `changed` are highlighted (and their parents opened). */
// bounded: structural recursion over a JSON snapshot with a depth cap
export function jsonTree(value, changed = new Set(), path = '', depth = 0) {
  const isChanged = changed.has(path);
  if (value === null || typeof value !== 'object') {
    const kind = value === null ? 'null' : typeof value;
    return h('span', { class: `p2-j p2-j-${kind}${isChanged ? ' is-changed' : ''}` }, kind === 'string' ? JSON.stringify(clip(value, 300)) : String(value));
  }
  const keys = Object.keys(value);
  const inside = [...changed].some((p) => p === path || p.startsWith(path ? `${path}.` : ''));
  const label = Array.isArray(value) ? `[${keys.length}]` : `{${keys.length}}`;
  const d = h('details', { class: `p2-jt${isChanged ? ' is-changed' : ''}`, open: depth < 1 || (changed.size > 0 && inside && path !== '') }, h('summary', {}, label));
  for (const k of keys.slice(0, 400)) d.append(h('div', { class: 'p2-jrow' }, h('span', { class: 'p2-jkey' }, `${k}: `), jsonTree(value[k], changed, path ? `${path}.${k}` : k, depth + 1)));
  if (keys.length > 400) d.append(h('div', { class: 'p2-muted' }, `… ${keys.length - 400} more`));
  return d;
}

/**
 * @param host  { session(), engine(), tabs: [{id,label,world}], serializeWires, settings(), modalHost, inertOthers(on), tryText(text), models(), copy(text), saveFile(name, text), toast(msg), language() }
 */
export function createDebug(host) {
  const ring = [];
  let seq = 0, lastBefore = null, cur = null, section = 'commands', pushed = false, openerBtn = null;
  const query = { commands: '' };

  // ----- recording (only exists while developer mode is on) -----
  const snapshotState = () => { try { return host.session()?.state?.() ?? null; } catch { return null; } };
  function beforeTurn() { lastBefore = snapshotState(); return hashState(lastBefore); }
  function record(info) {
    const tabWorld = host.tabs.find((t) => t.id === info.tab)?.world ?? null;
    const entry = makeEntry({ ...info, seq: ++seq, tabWorld, serialize: host.serializeWires, stateBefore: info.stateBefore ?? null });
    ring.push(entry);
    // bounded: shrinks the ring each pass
    while (ring.length > RING_MAX) ring.shift();
    if (isOpen() && section === 'turns') render();
    return entry;
  }

  // ----- the modal (the same classes and behaviour as the Settings modal) -----
  const closeBtn = h('button', { class: 'p2-btn p2-modal-close', type: 'button', 'aria-label': 'Close debug view', title: 'Close debug view' }, '×');
  const titleEl = h('h2', { class: 'p2-modal-title', id: 'p2-dbg-title' }, 'Debug');
  const tabsEl = h('div', { class: 'p2-modal-tabs', role: 'tablist', 'aria-label': 'Debug sections' });
  const bodyEl = h('div', { class: 'p2-modal-body p2-dbg-body', role: 'tabpanel', id: 'p2-dbg-panel', tabindex: '0' });
  const el = h('div', { class: 'p2-modal p2-dbg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'p2-dbg-title', hidden: true }, h('div', { class: 'p2-modal-head' }, titleEl, closeBtn), tabsEl, bodyEl);
  for (const [id, label] of DEBUG_SECTIONS) tabsEl.append(h('button', { class: 'p2-tab p2-modal-tab', role: 'tab', type: 'button', id: `p2-dt-${id}`, 'aria-controls': 'p2-dbg-panel', 'data-section': id, onclick: () => setSection(id) }, label));
  host.modalHost.append(el);
  const isOpen = () => !el.hidden;
  const worldOf = () => host.engine()?.set?.list?.().find((w) => w.id === cur?.world) ?? null;

  function open(tabId, opener = null) {
    const tab = host.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    cur = tab; openerBtn = opener ?? openerBtn;
    titleEl.textContent = `Debug: ${tab.label} (${tab.world ?? 'no world'})`;
    const was = isOpen();
    el.hidden = false; host.inertOthers(true);
    if (!was) { try { history.pushState({ p2debug: true }, '', `#debug/${tab.id}`); pushed = true; } catch { /* no history */ } }
    setSection(section, !was);
    return true;
  }
  function close({ fromPop = false } = {}) {
    if (!isOpen()) return;
    el.hidden = true; host.inertOthers(false);
    if (pushed) { pushed = false; if (!fromPop) { try { history.back(); } catch { /* no history */ } } }
    try { openerBtn?.focus(); } catch { /* ignore */ }
  }
  closeBtn.addEventListener('click', () => close());
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button, input, select, a[href], textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f.at(-1);
    if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  tabsEl.addEventListener('keydown', (e) => {
    const ids = DEBUG_SECTIONS.map(([id]) => id), i = ids.indexOf(section);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : null;
    if (next) { e.preventDefault(); setSection(next, true); }
  });
  const onPop = () => { if (isOpen() && !/^#debug\//.test(location.hash)) close({ fromPop: true }); };
  window.addEventListener('popstate', onPop);

  function setSection(id, focus = false) {
    if (!DEBUG_SECTIONS.some(([k]) => k === id)) return;
    section = id; bodyEl.scrollTop = 0; render();
    if (focus) tabsEl.querySelector(`#p2-dt-${id}`)?.focus();
  }

  // ----- sections -----
  const toolbar = (name, data) => h('div', { class: 'p2-dbg-tools' },
    h('button', { class: 'p2-btn-text', type: 'button', 'data-act': 'copy', onclick: () => host.copy(JSON.stringify(data(), null, 1)) }, 'Copy'),
    h('button', { class: 'p2-btn-text', type: 'button', 'data-act': 'export', onclick: () => host.saveFile(`psys2-debug-${cur.id}-${name}.json`, `${JSON.stringify({ section: name, tab: cur.id, world: cur.world, time: new Date().toISOString(), data: data() }, null, 1)}\n`) }, 'Export JSON'));

  function commandsSection() {
    const w = worldOf(), c = commandsOf(w);
    const q = h('input', { type: 'search', class: 'p2-select p2-dbg-search', placeholder: 'Search commands, examples, operations…', 'aria-label': 'Search commands', value: query.commands });
    const list = h('div', { class: 'p2-dbg-list' });
    const draw = () => {
      query.commands = q.value;
      const needle = q.value.trim().toLowerCase();
      const match = (r) => !needle || r.id.toLowerCase().includes(needle) || r.op.toLowerCase().includes(needle) || r.examples.some((x) => x.toLowerCase().includes(needle));
      const groups = c.groups.map((g) => ({ op: g.op, patterns: g.patterns.filter(match) })).filter((g) => g.patterns.length);
      list.replaceChildren(...(groups.length ? groups : [null]).map((g) => !g ? h('p', { class: 'p2-muted' }, 'Nothing matches.') : h('details', { class: 'p2-dbg-op', open: !!needle || groups.length <= 3 },
        h('summary', {}, h('b', {}, g.op), ` (${g.patterns.length} pattern${g.patterns.length > 1 ? 's' : ''})`),
        g.patterns.map((r) => h('div', { class: 'p2-dbg-pat' }, h('div', {}, h('code', {}, r.id), r.priority != null ? h('small', {}, ` priority ${r.priority}`) : null, r.kind ? h('small', {}, ` · ${r.kind}`) : null),
          h('ul', { class: 'p2-dbg-ex' }, r.examples.slice(0, 12).map((x) => h('li', {}, h('span', {}, x), ' ', tryBtn(x), r.canonical.includes(x) ? h('small', { class: 'p2-tag is-supported' }, 'canonical') : null)), r.examples.length > 12 ? h('li', { class: 'p2-muted' }, `… ${r.examples.length - 12} more`) : null),
          h('small', { class: 'p2-muted' }, `emits: ${clip(r.emit, 160)}`))))));
    };
    q.addEventListener('input', draw); draw();
    return [
      h('div', { class: 'p2-dbg-sum', 'data-count': String(c.patterns) }, `${c.patterns} patterns, ${c.examples} examples, ${c.canonical.length} canonical, ${c.shapes.length} request shapes, ${c.groups.length} operations.`),
      toolbar('commands', () => c),
      sec('Canonical examples', h('ul', { class: 'p2-dbg-ex' }, c.canonical.slice(0, 40).map((x) => h('li', {}, h('span', {}, x), ' ', tryBtn(x))))),
      sec('Request shapes', c.shapes.length ? h('p', {}, c.shapes.map((s) => h('span', { class: 'p2-tag', title: s.verb ?? '' }, `${s.id}${s.family ? ` (${s.family})` : ''}`))) : h('p', { class: 'p2-muted' }, 'None.')),
      q, list,
    ];
  }
  const tryBtn = (text) => h('button', { class: 'p2-btn-text p2-dbg-try', type: 'button', onclick: () => { host.tryText(text); close(); } }, 'Try');

  function turnBox(t) {
    const stateChanged = t.stateBefore && t.stateAfter ? t.stateBefore !== t.stateAfter : null;
    const d = h('details', { class: 'p2-dbg-turn', 'data-seq': String(t.seq) },
      h('summary', {}, h('time', {}, t.time.slice(11, 19)), ' ', h('q', {}, clip(t.text, 70)), ' ',
        t.outcome ? h('span', { class: 'p2-tag is-warn' }, t.outcome) : null, t.ms != null ? h('small', { class: 'p2-muted' }, `${Math.round(t.ms)} ms`) : null, t.endType ? h('small', { class: 'p2-muted' }, ` ${t.endType}`) : null));
    d.addEventListener('toggle', () => { if (d.open && !d.dataset.built) { d.dataset.built = '1'; d.append(...turnBody(t, stateChanged)); } });
    return d;
  }
  function turnBody(t, stateChanged) {
    const r = t.reply, trace = r?.trace ?? {};
    const out = [kv([
      ['Input', t.text], ['Mode', `${t.mode}${t.endType ? ` (${t.endType})` : ''}`], ['Open tab', t.tab], ['Worlds', t.worlds.join(', ') || 'none'],
      ['Language', r ? `${r.lang ?? 'en'}${trace.english && trace.english !== trace.original ? ` → ${clip(trace.english, 120)}` : ''}` : undefined],
      ['Voice or spelling corrections', (trace.segments ?? []).flatMap((s) => (s.corrections ?? []).map((c) => `${c.to} ← ${c.from}`)).join(', ') || undefined],
      ['Reply', t.answer ?? undefined], ['Outcome', t.outcome ? `${t.outcome} in stage ${t.stage ?? '?'}` : undefined],
      ['State', stateChanged == null ? undefined : stateChanged ? 'changed by this turn' : 'unchanged'],
      ['Timing', r?.perf ? `${r.perf.totalMs ?? r.perf.total} ms total, engine ${r.perf.engineMs ?? '?'} ms, render ${r.perf.render ?? '?'} ms, host effects ${r.perf.effects ?? '?'} ms` : t.ms != null ? `${Math.round(t.ms)} ms` : undefined],
    ])];
    if (t.readings.length) {
      out.push(sec('Readings tried', ...t.readings.map((x) => h('div', { class: 'p2-dbg-reading' },
        h('div', {}, h('q', {}, clip(x.text, 100)), ' ', x.unparsed ? h('span', { class: 'p2-tag is-warn' }, 'not understood') : h('span', { class: `p2-tag ${x.complete ? 'is-supported' : 'is-warn'}` }, x.complete ? 'complete' : 'partial'),
          ' ', h('code', {}, x.pattern ?? '—'), ' ', h('small', { class: 'p2-muted' }, `${x.world ?? 'no world'} · ${x.strategy ?? ''}${x.refusal ? ` · refused: ${x.refusal}` : ''}`)),
        x.candidates?.length ? h('small', { class: 'p2-muted' }, `candidates: ${x.candidates.map((c) => `${c.world} ${c.score ?? ''}${c.valid ? '' : ' (invalid)'}`).join(', ')}`) : null,
        h('div', { class: 'p2-dbg-wires' }, h('strong', {}, 'SOP Lang wires'), sopBlock(x.wires))))));
    }
    if (r) {
      const ops = trace.operations ?? [];
      out.push(sec('Operations executed', ops.length ? h('ul', { class: 'p2-list' }, ops.map((o) => h('li', {}, h('code', {}, o.op), ` ${o.status}${o.ms != null ? `, ${Math.round(o.ms * 10) / 10} ms` : ''} `, o.args ? h('small', { class: 'p2-muted' }, clip(JSON.stringify(o.args), 200)) : null))) : h('p', { class: 'p2-muted' }, 'None.')));
      const full = h('details', { class: 'p2-dbg-full' }, h('summary', {}, 'Full trace (language, router, dispatcher, wires, effects)'));
      full.addEventListener('toggle', () => { if (full.open && !full.dataset.built) { full.dataset.built = '1'; full.append(renderTrace(r, { translation: t.usage, detection: t.detection, effects: t.effects, serializeWires: host.serializeWires, formalizer: host.settings()?.formalizer })); } });
      out.push(full);
    }
    out.push(h('div', { class: 'p2-dbg-tools' }, h('button', { class: 'p2-btn-text', type: 'button', onclick: () => host.copy(JSON.stringify(turnDump(t), null, 1)) }, 'Copy this turn'), h('button', { class: 'p2-btn-text', type: 'button', onclick: () => host.saveFile(`psys2-debug-turn-${t.seq}.json`, `${JSON.stringify(turnDump(t), null, 1)}\n`) }, 'Export this turn')));
    return out;
  }
  const turnDump = (t) => ({ seq: t.seq, id: t.id, time: t.time, text: t.text, mode: t.mode, tab: t.tab, endType: t.endType, worlds: t.worlds, answer: t.answer, outcome: t.outcome, stage: t.stage, ms: t.ms, readings: t.readings, perf: t.perf, state: { before: t.stateBefore, after: t.stateAfter }, trace: t.reply?.trace ?? null, effects: t.effects, translation: t.usage, detection: t.detection });
  function turnsSection() {
    const list = turnsFor(ring, cur.world), all = list.map(turnDump);
    return [
      h('div', { class: 'p2-dbg-sum', 'data-count': String(list.length) }, list.length ? `The last ${list.length} turn${list.length > 1 ? 's' : ''} that touched ${cur.world} (newest first; ${ring.length} of at most ${RING_MAX} turns are kept while developer mode is on).` : `No turn touched ${cur.world} since developer mode was switched on. Send a command to this tab.`),
      toolbar('turns', () => all), ...list.map(turnBox),
    ];
  }

  function describeDry(res, before, after) {
    const d = res.detail;
    return [
      kv([['Complete reading', h('b', { class: res.complete ? 'p2-ok' : 'p2-bad' }, res.complete ? 'yes' : `no (${res.reason})`)], ['Segments', String(res.segments)], ['English', d?.english], ['Language', d?.language],
        ['End of turn (voice)', res.complete ? 'plausible: the message would be sent after the short pause' : 'not plausible: the app would wait for more words'],
        ['State', before === after ? h('b', { class: 'p2-ok', 'data-state': 'unchanged' }, `unchanged (${before})`) : h('b', { class: 'p2-bad', 'data-state': 'changed' }, `CHANGED ${before} → ${after}`)]]),
      ...(d?.readings ?? []).map((x) => h('div', { class: 'p2-dbg-reading' },
        h('div', {}, h('q', {}, clip(x.text, 100)), ' ', h('span', { class: `p2-tag ${!x.unparsed && !x.partial ? 'is-supported' : 'is-warn'}` }, x.unparsed ? 'not understood' : x.partial ? 'partial' : 'complete'), ' ', h('code', {}, x.pattern ?? '—'), ' ', h('small', { class: 'p2-muted' }, `${x.world ?? 'no world'} · ${x.strategy ?? ''}`)),
        x.ignored?.length ? h('small', { class: 'p2-muted' }, `ignored: ${x.ignored.join(', ')}`) : null,
        x.candidates?.length ? h('small', { class: 'p2-muted' }, ` candidates: ${x.candidates.map((c) => `${c.id ?? c.worldId ?? c.world} ${c.score ?? ''}`).join(', ')}`) : null,
        sopBlock(x.wires.length ? host.serializeWires(x.wires.filter((w) => w.type !== 'core.agent')) : ''))),
    ];
  }
  let dryLast = { text: '', result: null };
  function drySection() {
    const ta = h('textarea', { class: 'p2-fb-wanted p2-dbg-dry-in', rows: '2', 'aria-label': 'Phrase to read without executing it', placeholder: 'Type a phrase: it is read, never executed' });
    ta.value = dryLast.text;
    const out = h('div', { class: 'p2-dbg-dry-out', 'aria-live': 'polite' });
    if (dryLast.result) out.append(...dryLast.result);
    const run = async () => {
      const text = ta.value.trim(); if (!text) return;
      dryLast.text = text;
      out.replaceChildren(h('p', { class: 'p2-muted' }, 'Reading…'));
      const s = host.session();
      const before = hashState(s?.state?.() ?? null);
      let res;
      try { res = await s.dryRead(text, { language: host.language(), deadlineMs: 2000, detail: true }); } catch (e) { res = { complete: false, segments: 0, reason: `error: ${e?.message ?? e}` }; }
      const after = hashState(s?.state?.() ?? null);
      dryLast.result = describeDry(res, before, after); dryRaw = { text, result: { complete: res.complete, reason: res.reason, segments: res.segments, detail: res.detail ? { english: res.detail.english, readings: res.detail.readings.map((x) => ({ ...x, wires: host.serializeWires(x.wires.filter((w) => w.type !== 'core.agent')) })) } : null }, state: { before, after } };
      out.replaceChildren(...dryLast.result);
    };
    return [
      h('p', { class: 'p2-muted' }, 'See how a phrase would be read: segments, candidate worlds, readings and SOP Lang wires, and whether the voice end-of-turn detector would send it. Nothing is executed and the state does not change. A running turn makes the dry run decline ("busy").'),
      ta, h('div', { class: 'p2-dbg-tools' }, h('button', { class: 'p2-btn-text', type: 'button', 'data-act': 'run', onclick: run }, 'Read it'), h('button', { class: 'p2-btn-text', type: 'button', 'data-act': 'copy', onclick: () => host.copy(JSON.stringify(dryRaw, null, 1)) }, 'Copy'),
        h('button', { class: 'p2-btn-text', type: 'button', 'data-act': 'export', onclick: () => host.saveFile(`psys2-debug-${cur.id}-dryrun.json`, `${JSON.stringify({ section: 'dry', tab: cur.id, world: cur.world, time: new Date().toISOString(), data: dryRaw }, null, 1)}\n`) }, 'Export JSON')),
      out,
    ];
  }
  let dryRaw = null;

  function stateSection() {
    const s = host.session();
    let now = null, astra = null, focus = null;
    try { now = s?.state?.(cur.world) ?? null; } catch { now = null; }
    const changed = lastBefore ? diffPaths(lastBefore?.[cur.world] ?? null, now, '') : new Set();
    const hasDiff = changed.size > 0 && !(changed.size === 1 && changed.has('') && lastBefore?.[cur.world] == null && now == null);
    try { astra = { discussions: s?.discussions?.({ tab: cur.id }) ?? [], capture: s?.astra?.capture?.() ?? null }; } catch { astra = null; }
    try { focus = { focus: s?.focus?.() ?? {}, context: s?.context?.() ?? {} }; } catch { focus = null; }
    const dump = () => ({ world: cur.world, state: now, lastTurnChangedPaths: [...changed], astra, focus });
    return [
      h('div', { class: 'p2-dbg-sum', 'data-changed': String(changed.size) }, `State of ${cur.world}${lastBefore ? (hasDiff ? `: ${changed.size} value${changed.size > 1 ? 's' : ''} changed by the last turn (highlighted)` : ': unchanged by the last turn') : ' (no turn recorded yet, so no diff)'}.`),
      toolbar('state', dump),
      sec('World state (JSON)', h('div', { class: 'p2-jtree', 'data-view': 'state' }, jsonTree(now, hasDiff ? changed : new Set(), '', 0))),
      sec('ASTRA: discussions, instances, focus and entities', astra ? h('div', { class: 'p2-dbg-astra' },
        kv([['Discussions of this tab', String(astra.discussions.length)], ['Active discussion', astra.capture?.active ?? 'none'], ['Instances', String(astra.capture?.instances?.length ?? 0)], ['Recent worlds', (focus?.context?.recentWorlds ?? []).join(', ') || undefined],
          ['Focus', focus ? Object.entries(focus.focus).map(([k, v]) => `${k} ${v}`).join(', ') || 'none' : undefined], ['Open tab world', focus?.context?.tabWorld ?? undefined], ['Modal world', focus?.context?.modalWorld ?? undefined]]),
        h('div', { class: 'p2-jtree', 'data-view': 'astra' }, jsonTree({ discussions: astra.discussions, ...(astra.capture ?? {}) }, new Set(), '', 0))) : h('p', { class: 'p2-muted' }, 'ASTRA is not available.')),
    ];
  }

  function worldSection() {
    const w = worldOf(), info = worldInfo(w);
    if (!info) return [h('p', { class: 'p2-muted' }, `The world ${cur.world ?? '(none)'} is not loaded.`)];
    const cov = h('div', { class: 'p2-dbg-cov' }, h('p', { class: 'p2-muted' }, 'Loading coverage.md…'));
    host.fetchText(`worlds/${w.id}/coverage.md`).then((t) => {
      if (!t) { cov.replaceChildren(h('p', { class: 'p2-muted' }, 'No coverage.md for this world.')); return; }
      const lines = t.split('\n');
      cov.replaceChildren(h('p', { class: 'p2-muted' }, `${lines.length} lines; the first ones are shown.`), h('pre', { class: 'p2-code' }, h('code', {}, lines.slice(0, 40).join('\n'))), h('details', {}, h('summary', {}, 'The whole file'), h('pre', { class: 'p2-code' }, h('code', {}, t))));
      info.coverage = t;
    }).catch(() => cov.replaceChildren(h('p', { class: 'p2-muted' }, 'coverage.md could not be loaded.')));
    return [
      toolbar('world', () => info),
      sec('Manifest (world.sop)', kv(Object.entries(info.manifest).map(([k, v]) => [k, v.join(', ')]))),
      sec('Imports', h('p', {}, info.imports.length ? info.imports.map((i) => h('span', { class: 'p2-tag' }, i)) : 'none')),
      sec(`Legend (${info.legend.types.length} types, ${info.legend.keys.length} keys)`, h('details', {}, h('summary', {}, 'Show'), h('p', {}, h('strong', {}, 'Types: '), info.legend.types.join(', ') || 'none'), h('p', {}, h('strong', {}, 'Keys: '), info.legend.keys.join(', ') || 'none'))),
      sec(`Lexicons (${info.counts.lexicons}, ${info.counts.words} words)`, h('div', { class: 'p2-dbg-lex' }, info.lexicons.map((l) => h('details', {}, h('summary', {}, h('code', {}, l.id), ` ${l.class ?? ''} · ${l.words} words`), h('p', { class: 'p2-muted' }, `${l.sample.join(', ')}${l.words > l.sample.length ? ', …' : ''}`))))),
      sec(`Operations (${info.counts.operations})`, h('table', { class: 'p2-table' }, h('thead', {}, h('tr', {}, ['Operation', 'Implementation', 'Action', 'Meaning'].map((x) => h('th', {}, x)))), h('tbody', {}, info.operations.map((o) => h('tr', {}, h('td', {}, h('code', {}, o.id)), h('td', {}, o.impl), h('td', {}, o.action), h('td', {}, o.doc)))))),
      sec(`Templates (${info.counts.templates})`, h('p', {}, info.templates.map((t) => h('span', { class: 'p2-tag' }, t)))),
      sec('Counts', kv(Object.entries(info.counts).map(([k, v]) => [k, String(v)]))),
      sec('Coverage (coverage.md)', cov),
    ];
  }

  function modelsSection() {
    const m = host.models(), ort = globalThis.__psys2Ort ?? null;
    const mine = ring.filter((t) => t.worlds.includes(cur.world) || t.tabWorld === cur.world).slice(-LAST_TURNS).reverse();
    const calls = mine.flatMap((t) => {
      const d = t.reply?.trace?.dispatch;
      const rows = [];
      if (d) rows.push({ seq: t.seq, model: 'dispatcher', input: t.text, output: `${d.status}${d.partial ? ' (partly)' : ''}: ${(d.segmentations?.[d.winnerIndex ?? 0]?.pieces ?? []).map((p) => `${clip(p.text, 30)} → ${p.chosen?.world ?? 'none'}`).join('; ')}`, ms: d.modelMs ?? null, totalMs: d.totalMs ?? null });
      for (const g of d?.segmentations ?? []) for (const p of g.pieces ?? []) for (const a of p.attempts ?? []) if (a.variant === 'normalized' && a.text) rows.push({ seq: t.seq, model: 'normalizer', input: p.text, output: a.text, ms: null, valid: !!a.valid });
      return rows;
    }).slice(0, 40);
    const ortInfo = ort ? { restarts: ort.restarts, stats: ort.stats, lanes: ort.lanes ? Object.fromEntries(Object.entries(ort.lanes).map(([k, v]) => [k, v && typeof v === 'object' ? { busy: !!v.busy, queued: v.queue?.length ?? v.queued ?? null } : v])) : null, sessions: ort.sessions ? [...(ort.sessions.keys?.() ?? Object.keys(ort.sessions))] : null } : null;
    const data = { ...m, ort: ortInfo, calls };
    return [
      toolbar('models', () => data),
      sec('Dispatcher', kv([['Formalizer setting', m.formalizer], ['Model', m.dispatcher?.label || 'none'], ['Status', m.dispatcher?.status?.state ? `${m.dispatcher.status.state}${m.dispatcher.status.message ? `: ${m.dispatcher.status.message}` : ''}` : undefined], ['Source', m.dispatcher?.source ?? undefined], ['Version', m.dispatcher?.version ? JSON.stringify(m.dispatcher.version) : undefined]])),
      sec('Normalizer', kv([['Model', m.normalizer?.label ?? 'none in this build'], ['Status', m.normalizer?.status?.state ?? undefined], ['Source', m.normalizer?.status?.source ?? undefined], ['Loaded in', m.normalizer?.status?.ms != null ? `${m.normalizer.status.ms} ms` : undefined]])),
      sec('ORT worker (onnxruntime-web)', ortInfo ? kv([['Restarts', String(ortInfo.restarts ?? 0)], ['Requests / responses', `${ortInfo.stats?.requests ?? 0} / ${ortInfo.stats?.responses ?? 0}`], ['Timeouts / aborts / cancelled', `${ortInfo.stats?.timeouts ?? 0} / ${ortInfo.stats?.aborts ?? 0} / ${ortInfo.stats?.cancelled ?? 0}`], ['By call', JSON.stringify(ortInfo.stats?.byLabel ?? {})], ['Lanes', ortInfo.lanes ? JSON.stringify(ortInfo.lanes) : undefined], ['Sessions', ortInfo.sessions?.join(', ') || undefined]]) : h('p', { class: 'p2-muted' }, 'No ORT worker was started (the rules answer, or the models are not loaded yet).')),
      sec(`Last model calls for ${cur.world}`, calls.length ? h('table', { class: 'p2-table' }, h('thead', {}, h('tr', {}, ['Turn', 'Model', 'Input', 'Output', 'ms'].map((x) => h('th', {}, x)))), h('tbody', {}, calls.map((c) => h('tr', {}, h('td', {}, String(c.seq)), h('td', {}, c.model), h('td', {}, clip(c.input, 60)), h('td', {}, clip(c.output, 120)), h('td', {}, c.ms != null ? String(Math.round(c.ms)) : ''))))) : h('p', { class: 'p2-muted' }, 'No model call recorded for this world (formalizer "rules", or a fast-path turn).')),
    ];
  }

  function render() {
    if (!cur) return;
    for (const b of tabsEl.children) { const a = b.dataset.section === section; b.setAttribute('aria-selected', String(a)); b.tabIndex = a ? 0 : -1; if (a) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
    bodyEl.setAttribute('aria-labelledby', `p2-dt-${section}`);
    bodyEl.dataset.section = section;
    const fns = { commands: commandsSection, turns: turnsSection, dry: drySection, state: stateSection, world: worldSection, models: modelsSection };
    const keep = bodyEl.scrollTop;
    bodyEl.replaceChildren(...fns[section]());
    bodyEl.scrollTop = keep;
  }

  return {
    ring, record, beforeTurn, open, close, isOpen, render, el, get section() { return section; },
    /** One dump of everything the view knows about a tab's world (the phrase log's "debug dump" link). */
    dumpFor(worldId) { return { world: worldId, turns: turnsFor(ring, worldId, RING_MAX).map(turnDump) }; },
    turnFor(id) { const t = ring.find((x) => x.id === id); return t ? turnDump(t) : null; },
    destroy() { window.removeEventListener('popstate', onPop); el.remove(); ring.length = 0; },
  };
}
