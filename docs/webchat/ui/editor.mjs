// Editor tab: renders docs.editor state. Read-only for the mouse (edits come through commands); text is selectable.
import { h } from './util.mjs';

const words = (s) => (String(s ?? '').match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

export function createEditor(container) {
  container.classList.add('p2-editor');
  const badge = h('span', { class: 'p2-badge', hidden: true, role: 'status' });
  const meta = h('span', { class: 'p2-editor-meta' });
  const bar = h('div', { class: 'p2-editor-bar' }, h('span', { class: 'p2-editor-label' }, 'Document'), badge, meta);
  const page = h('article', { class: 'p2-page', 'aria-label': 'Document (read-only; change it by talking to the assistant)' });
  container.append(bar, page);
  let lastCursorKey = null;

  function cursorIndex(state, blocks) {
    const c = state.cursor ?? state.lastEdited;
    if (typeof c === 'number') return Math.max(-1, Math.min(blocks.length - 1, c < 0 ? -1 : c));
    if (typeof c === 'string') return blocks.findIndex((b) => b.id === c);
    if (c && typeof c === 'object') {
      if (typeof c.block === 'string') return blocks.findIndex((b) => b.id === c.block);
      if (typeof c.block === 'number') return c.block;
      if (typeof c.index === 'number') return c.index;
    }
    return -1;
  }

  return {
    update(state) {
      const st = state ?? {};
      const blocks = Array.isArray(st.blocks) ? st.blocks : [];
      const dictating = st.inputMode === 'dictation';
      badge.hidden = !dictating;
      badge.textContent = dictating ? 'Dictating: what you say goes into the document' : '';
      const total = words(st.title) + blocks.reduce((n, b) => n + words(b.text) + (b.items ?? []).reduce((m, i) => m + words(typeof i === 'string' ? i : i?.text), 0), 0);
      meta.textContent = `${total} ${total === 1 ? 'word' : 'words'}` + (st.history?.length ? ` · ${st.history.length} undo step${st.history.length === 1 ? '' : 's'}` : '');
      page.replaceChildren();
      page.classList.toggle('is-dictating', dictating);
      const idx = cursorIndex(st, blocks);
      if (st.title) page.append(h('h2', { class: 'p2-doc-title' }, st.title));
      if (!st.title && !blocks.length) {
        page.append(h('p', { class: 'p2-empty' }, 'The document is empty.'),
          h('p', { class: 'p2-empty' }, 'Try: “add a heading Shopping”, “add a list with milk, eggs and bread” or “start dictation”.'));
      }
      let cursorEl = null;
      blocks.forEach((b, i) => {
        let el;
        if (b.kind === 'heading') el = h('h3', {}, b.text ?? '');
        else if (b.kind === 'list') el = h('ul', {}, (b.items ?? []).map((it) => h('li', {}, typeof it === 'string' ? it : it?.text ?? '')));
        else el = h('p', {}, b.text ?? '');
        el.classList.add('p2-block');
        el.dataset.blockId = b.id ?? String(i);
        if (i === idx) { el.classList.add('is-cursor'); el.setAttribute('aria-current', 'true'); cursorEl = el; }
        page.append(el);
      });
      if (dictating) page.append(h('span', { class: 'p2-caret', 'aria-hidden': 'true' }));
      const key = `${idx}:${blocks.length}:${blocks[idx]?.text ?? ''}`;
      if (cursorEl && key !== lastCursorKey) cursorEl.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      lastCursorKey = key;
    },
  };
}
