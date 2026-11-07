// Small DOM helpers shared by the host UI modules. No dependencies.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** First defined value among the given keys (state shapes are read leniently). */
export function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

const NAMED = {
  red: '#e0443e', orange: '#f28c28', yellow: '#f5cd3a', green: '#4caf6a', blue: '#4a8fe0', purple: '#8e5bd0', pink: '#f08ab4',
  brown: '#8a5a3c', black: '#2b2b33', white: '#f7f7f5', gray: '#9aa0a6', grey: '#9aa0a6', silver: '#c3c8cf', gold: '#e6b422',
  teal: '#2aa198', cyan: '#35c4d8', navy: '#2b3f8c', lime: '#9bd53a', magenta: '#d6409f', turquoise: '#40d0c0', violet: '#9b6bd8',
  beige: '#e8dcc2', maroon: '#8c2f3b', indigo: '#4b4bb0', coral: '#f2776b', peach: '#f9b99a', mint: '#8fe3b8', lavender: '#c3b1ec',
};
/** Named color (from the world's fixed list) to a CSS color; any valid CSS color is also accepted. */
export function colorOf(name, fallback) {
  if (!name) return fallback;
  const key = String(name).toLowerCase().trim();
  if (NAMED[key]) return NAMED[key];
  if (typeof CSS !== 'undefined' && CSS.supports?.('color', key)) return key;
  return fallback;
}
export const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : typeof v === 'string' ? [...v] : []);
