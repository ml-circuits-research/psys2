// SPDX-License-Identifier: AGPL-3.0-only
// USER-ACTIONS (spec 06 "Phrase log", export format 3): every user action, and every progress step, as one ordered event next to the phrase records.
// An event: { id, time, kind, target, tab, tabAfter, ...extra }. Kinds:
//   message  a message was sent (mode typed | voice | chip, recId links the phrase record)
//   tab      a tab was opened (via tap | message | card | command | key)
//   tap      a button, chip, option card, drawing or card was tapped (target = its name, zone = the tab or area)
//   undo | redo | clear   taps whose name says so
//   settings a setting changed (target = option id, value)       language   the language changed (from, to, reason)
//   recall   a message was recalled with the arrow keys (hook `recall(text)`, for INPUT-HISTORY)
//   mic      the microphone was turned on or off              step   a progress step finished (id, label, ms, bytes, ok)
// Nothing leaves the device: the events live in localStorage next to the phrase log and are only exported by the person. Browser-safe, no `node:*`.

export const EVENTS_KEY = 'psys2.webchat.events';
export const EVENTS_CAP = 3000;
export const KINDS = ['message', 'tab', 'tap', 'undo', 'redo', 'clear', 'settings', 'language', 'recall', 'mic', 'step'];

const newId = (now) => `e${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clip = (v, n = 80) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** The kind a tap belongs to, from its name: "Undo" -> undo, "Redo" -> redo, "Clear" / "New game" / "Reset" -> clear. */
export function tapKind(name) {
  const t = String(name ?? '').toLowerCase();
  if (/^\s*undo\b|\bundo (?:my|the|last)/.test(t)) return 'undo';
  if (/^\s*redo\b/.test(t)) return 'redo';
  if (/^\s*(?:clear|reset|new (?:game|chart|drawing|document|diagram)|start over)\b/.test(t)) return 'clear';
  return 'tap';
}

/** One event. `now` is injectable for tests. */
export function buildEvent({ kind, target = null, tab = null, tabAfter = null, now = Date.now(), ...extra }) {
  const k = KINDS.includes(kind) ? kind : 'tap';
  return { id: newId(now), time: new Date(now).toISOString(), kind: k, target: target == null ? null : clip(target), tab, tabAfter, ...extra };
}

/** What a tapped element is called, for the log: its accessible name, its title, its data id, its text; the zone is the tab panel or area it sits in. Generic: no per-tab code. */
export function describeTarget(el, root = null) {
  const hit = el?.closest?.('button, [role="button"], [role="tab"], a, label, [data-id], [data-option], [data-name], [data-kind], summary, svg g[id], .p2-card, .p2-example') ?? el;
  if (!hit || hit === root) return null;
  const attr = (n) => hit.getAttribute?.(n);
  const name = attr('aria-label') || attr('title') || attr('data-name') || attr('data-id') || attr('data-option') || hit.textContent || attr('id') || hit.tagName?.toLowerCase();
  const panel = hit.closest?.('[role="tabpanel"]');
  const zone = panel ? String(panel.id ?? '').replace(/^p2-panel-/, '') : hit.closest?.('.p2-modal-host') ? 'settings' : hit.closest?.('.p2-log') ? 'chat' : hit.closest?.('form') ? 'input' : null;
  const cls = String(hit.className?.baseVal ?? hit.className ?? '');
  const what = /p2-example|chip/.test(cls) ? 'chip' : /card/.test(cls) || attr('data-kind') ? 'card' : /^(?:svg|g|path|circle|rect)$/i.test(hit.tagName ?? '') || attr('data-id') ? 'drawing' : 'button';
  return { target: clip(name), zone, what };
}

/** A log of events, backed by localStorage (every storage access guarded). */
export function createEventLog(storage = globalThis.localStorage, { cap = EVENTS_CAP, key = EVENTS_KEY, getTab = () => null, enabled = () => true } = {}) {
  let list = [];
  try { const v = JSON.parse(storage?.getItem(key) ?? '[]'); if (Array.isArray(v)) list = v.filter((e) => e && typeof e.kind === 'string'); } catch { list = []; }
  let timer = 0, listeners = new Set();
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => { try { storage?.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable or full */ } }, 250); };
  const flush = () => { clearTimeout(timer); try { storage?.setItem(key, JSON.stringify(list)); } catch { /* ignore */ } };
  return {
    all: () => list,
    /** Records one event now; `tab` is the tab on screen before, `tabAfter` is filled shortly after unless given. Returns the event (or null when logging is off). */
    add(kind, target = null, extra = {}) {
      if (!enabled()) return null;
      const ev = buildEvent({ kind, target, tab: extra.tab ?? getTab(), ...extra });
      list.push(ev);
      if (list.length > cap) list = list.slice(list.length - cap);
      if (ev.tabAfter == null) setTimeout(() => { if (ev.tabAfter == null) { ev.tabAfter = getTab(); persist(); } }, 120);
      persist();
      for (const fn of [...listeners]) { try { fn(ev); } catch { /* a listener must not break logging */ } }
      return ev;
    },
    update(id, patch) { const e = list.find((x) => x.id === id); if (e) { Object.assign(e, patch); persist(); } },
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    clear() { list = []; flush(); },
    flush,
  };
}

/** The first event after a record within `gapMs` that is not the message itself: the reaction (undo, repeat, correction, thumbs tap, any other action). */
export function reactionOf(record, events, { gapMs = 120000 } = {}) {
  const t0 = Date.parse(record?.time) || 0, end = t0 + gapMs;
  const next = (events ?? []).find((e) => e.kind !== 'step' && e.kind !== 'language' && Date.parse(e.time) > t0 && !(e.kind === 'message' && e.recId === record.id));
  if (!next) return null;
  const at = Date.parse(next.time);
  if (at > end) return null;
  const repeat = next.kind === 'message' && String(next.target ?? '').toLowerCase() === String(record.text ?? '').toLowerCase().slice(0, 80);
  return { kind: repeat ? 'repeat' : next.kind, target: next.target ?? null, afterMs: at - t0, tab: next.tab ?? null };
}
