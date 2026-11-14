// Timeline tab plugin (world plan.timeline, spec 23 T6-lite): a view declared by a schema and nothing else. It draws the state the generic executor keeps (`items`: moments with a
// `when`) as one row, earliest first, and nothing else: every change comes through the chat or through "send it to the timeline". No library, no network, no `process`.
import { h } from '../util.mjs';

const WORLD = 'plan.timeline';
const CSS = `.pt-row{display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;border-top:3px solid var(--line,#ccd);margin-top:14px}.pt-moment{position:relative;min-width:110px;padding:12px 12px 4px 0}.pt-moment:before{content:"";position:absolute;top:-9px;left:0;width:14px;height:14px;border-radius:50%;background:var(--accent,#4a90d9)}.pt-name{font-weight:650;padding-left:2px}.pt-when{font-size:12px;color:var(--muted,#667)}.pt-empty{color:var(--muted,#667);font-style:italic}`;
const label = (i) => (i.name ? `${i.name}` : `${i.kind} ${i.n}`);
/** The moments in a row by time: a moment the calendar knows (`time`: its cycle, set from k.time) goes with the others of its cycle (months with months, days with days), the groups in the order they came; inside a group by `when`, and in the order they came when the times are equal. */
export const inOrder = (items) => {
  const group = (i) => i.time?.cycle ?? '', rank = [];
  for (const i of items) if (!rank.includes(group(i))) rank.push(group(i));
  return items.map((i, k) => ({ i, k })).sort((a, b) => rank.indexOf(group(a.i)) - rank.indexOf(group(b.i)) || (Number(a.i.attrs?.at) || 0) - (Number(b.i.attrs?.at) || 0) || a.k - b.k).map((x) => x.i);
};

function make(holder, host) {
  if (!document.querySelector('style[data-pt-css]')) document.head.append(h('style', { 'data-pt-css': '' }, CSS));
  const root = h('div', { class: 'pt-root', 'aria-label': 'Timeline' });
  holder.append(root);
  let state = host.state?.(WORLD) ?? null;
  const render = () => {
    root.replaceChildren();
    const items = state?.items ?? [];
    if (!items.length) { root.append(h('p', { class: 'pt-empty' }, 'The timeline is empty. Send it a day, a month or a season: "send it to the timeline".')); return; }
    root.append(h('div', { class: 'pt-row' }, ...inOrder(items).map((i) => h('div', { class: 'pt-moment' }, h('div', { class: 'pt-name' }, label(i)), h('div', { class: 'pt-when' }, `time ${i.attrs?.at ?? '?'}`)))));
  };
  render();
  return {
    update(next) { state = next && typeof next === 'object' ? next : state; render(); },
    show() { render(); },
    destroy() { root.remove(); },
  };
}

export default { id: 'timeline', label: 'Timeline', world: WORLD, order: 97, make, effects: {} };
