// Seating plan tab plugin (world plan.seating, spec 21 P2): the plan of a world that is a schema and nothing else. It draws the state the generic executor keeps (`items`: tables with seats
// and a colour, guests with a place) as one card per table, and nothing else: every change comes through the chat. No library, no network, no `process`.
import { h } from '../util.mjs';

const WORLD = 'plan.seating';
const COLOURS = { white: '#ffffff', red: '#e4572e', orange: '#f28c28', yellow: '#f6d743', green: '#58a55c', blue: '#4a90d9', purple: '#8e6bbf', pink: '#f08fb0', brown: '#8d6748', black: '#333333', grey: '#9aa0a6', gray: '#9aa0a6' };
const CSS = `.ps-root{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}.ps-table{min-width:150px;padding:10px 12px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--line,#ccd);background:var(--surface,#fff)}.ps-top{display:flex;align-items:center;gap:8px;font-weight:650}.ps-dot{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}.ps-seats{font-size:12px;color:var(--muted,#667)}.ps-guest{margin:3px 0 0;font-size:14px}.ps-free{opacity:.8}.ps-empty{color:var(--muted,#667);font-style:italic}`;
const isTable = (i) => i.kind === 'table';
const label = (i) => (i.name ? `${i.name}` : `${i.kind} ${i.n}`);

function make(holder, host) {
  if (!document.querySelector('style[data-ps-css]')) document.head.append(h('style', { 'data-ps-css': '' }, CSS));
  const root = h('div', { class: 'ps-root', 'aria-label': 'Seating plan' });
  holder.append(root);
  let state = host.state?.(WORLD) ?? null;
  const render = () => {
    root.replaceChildren();
    const items = state?.items ?? [];
    const tables = items.filter(isTable);
    if (!items.length) { root.append(h('p', { class: 'ps-empty' }, 'The plan is empty. Say "add 3 tables" or "add a guest called Ann at table 1".')); return; }
    const sameTable = (g, t) => g.place && (g.place.ref === t.id || g.place.id === t.id || (g.place.kind === t.kind && g.place.n === t.n));
    for (const t of tables) {
      const guests = items.filter((g) => !isTable(g) && sameTable(g, t));
      const seats = Number(t.attrs?.seats) || 0;
      const col = String(t.attrs?.colour ?? 'white');
      root.append(h('div', { class: 'ps-table' },
        h('div', { class: 'ps-top' }, h('span', { class: 'ps-dot', style: `background:${COLOURS[col] ?? col}` }), label(t)),
        h('div', { class: 'ps-seats' }, `${guests.length} of ${seats} seats`),
        ...guests.map((g) => h('p', { class: 'ps-guest' }, label(g)))));
    }
    const free = items.filter((g) => !isTable(g) && !tables.some((t) => sameTable(g, t)));
    if (free.length) root.append(h('div', { class: 'ps-table ps-free' }, h('div', { class: 'ps-top' }, 'Not seated'), ...free.map((g) => h('p', { class: 'ps-guest' }, label(g)))));
  };
  render();
  return {
    update(next) { state = next && typeof next === 'object' ? next : state; render(); },
    show() { render(); },
    destroy() { root.remove(); },
  };
}

export default { id: 'seating', label: 'Seating', world: WORLD, order: 96, make, effects: {} };
