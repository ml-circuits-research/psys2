// Editor tab plugin (world docs.editor, spec 07 sections 3 and 6): a TipTap (ProseMirror) document editor.
// It replaces the built-in Editor tab (app.mjs: a plugin with id 'editor' wins). The world owns the document and keeps a
// TipTap-compatible JSON in `state.doc`; this module renders it as a page, mirrors the formatting state in a toolbar and
// turns every click into a typed command through host.send, so mouse and voice share the language layer.
// Decision (spec 07 section 3): the page is read-only. Edits come only through the world (commands, dictation); the mouse
// can select text (the selection is reported to the world as state, not as an edit) and tick task boxes (sent as commands).
import { h } from '../util.mjs';
import { createEditor as createFallback } from '../editor.mjs';
import { createToolbar } from './editor/toolbar.mjs';
import { createView, loadTipTap } from './editor/view.mjs';

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const DOC_ICON = '<svg viewBox="0 0 24 32" class="pe-doc-icon" aria-hidden="true"><path fill="#4285f4" d="M2 0h14l8 8v22a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2Z"/><path fill="#a1c2fa" d="M16 0l8 8h-6a2 2 0 0 1-2-2V0Z"/><path fill="#fff" d="M5 15h14v2H5v-2Zm0 4h14v2H5v-2Zm0 4h9v2H5v-2Z"/></svg>';
const plural = (n, w) => `${n} ${n === 1 ? w : `${w}s`}`;

export default {
  id: 'editor', label: 'Editor', world: 'docs.editor', order: 20,
  make(holder, host) {
    const cssHref = host.asset('ui/tabs/editor/editor.css');
    if (!document.querySelector('link[data-pe-css]')) document.head.append(h('link', { rel: 'stylesheet', href: cssHref, 'data-pe-css': '' }));

    const root = h('div', { class: 'pe', 'aria-label': 'Document editor' });
    holder.append(root);
    let state = host.state?.('docs.editor') ?? null;
    let view = null, model = null, fallback = null, lastDoc = '', lastCursor = null, lastFocus = 0, lastKey = '';

    // ---- chrome ----
    const nameEl = h('h3', { class: 'pe-doc-name' }, 'Untitled document');
    const hint = h('span', { class: 'pe-doc-hint' }, 'Edit by talking: every change comes through the assistant');
    const live = h('span', { class: 'pe-live' });
    const pill = h('span', { class: 'pe-pill', role: 'status', hidden: true }, h('i', { class: 'pe-rec' }), 'Dictating', live);
    const bar = createToolbar({ send: (t) => host.send(t) });
    const top = h('div', { class: 'pe-top' });
    top.innerHTML = DOC_ICON;
    top.append(nameEl, hint, pill, bar.actions);
    const outlineList = h('ul', {});
    const outline = h('nav', { class: 'pe-outline', 'aria-label': 'Outline' }, h('h4', {}, 'Outline'), outlineList);
    const editorEl = h('div', { class: 'pe-editor' });
    const chips = [];   // filled from the sampler (spec 25)
    const chipBox = h('div', { class: 'pe-chips' }, chips);
    Promise.resolve(host.sample?.('few', { tab: 'editor', count: 4 })).then((list) => { for (const t of list ?? []) { const b = h('button', { class: 'pe-chip', type: 'button' }, t); b.addEventListener('click', () => host.send(t)); chipBox.append(b); } }).catch(() => {});
    const empty = h('div', { class: 'pe-empty', hidden: true }, h('p', {}, 'The page is empty. Tell the assistant what to write, or try one of these:'), chipBox);
    const paper = h('article', { class: 'pe-paper', 'aria-label': 'Document page (read-only; edit by talking to the assistant)' }, editorEl, empty);
    const scroll = h('div', { class: 'pe-scroll' }, paper);
    const stats = h('span', {}); const sel = h('span', { class: 'pe-sel-info' }); const prog = h('span', { class: 'pe-progress', hidden: true }); const undo = h('span', {});
    const status = h('div', { class: 'pe-status', role: 'status' }, stats, prog, sel, h('span', { class: 'pe-grow' }), undo);
    root.append(top, bar.el, bar.menus, h('div', { class: 'pe-body' }, outline, scroll), status);
    editorEl.append(h('p', {}, 'Loading the editor…'));

    // ---- mirrored state ----
    const blockById = (id) => (id === 'title' ? { id: 'title', kind: 'title', align: state?.titleAlign, marks: state?.titleMarks, text: state?.title } : state?.blocks?.find((b) => b.id === id));
    /** What the toolbar edits: the selection, or else the block the assistant last worked on. */
    function targetInfo() {
      const s = state ?? {};
      const refs = [];     // { b, at, from, to }
      const sel0 = s.selection;
      if (sel0?.type === 'range') { const b = blockById(sel0.block); if (b) refs.push({ b, at: sel0.at, from: sel0.from, to: sel0.to }); }
      else if (sel0?.type === 'blocks') for (const id of sel0.blocks) { const b = blockById(id); if (b) for (const c of model.containers(b)) refs.push({ b, at: c.at, from: 0, to: c.text.length }); }
      else { const b = s.blocks?.[s.cursor]; if (b) for (const c of model.containers(b)) refs.push({ b, at: c.at, from: 0, to: c.text.length }); }
      const first = refs[0]?.b;
      const marks = {};
      for (const m of ['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'link']) marks[m] = refs.length > 0 && refs.every((r) => r.to > r.from && model.covered(r.b, r.at, r.from, r.to, m));
      let sizePhrase = null;
      if (first?.kind === 'title') sizePhrase = 'the title';
      else if (first?.kind === 'heading') { const n = (s.blocks ?? []).filter((b) => b.kind === 'heading').findIndex((b) => b.id === first.id); if (n >= 0 && n < ORDINALS.length) sizePhrase = `the ${ORDINALS[n]} heading`; }
      return {
        sizePhrase, marks, kind: first?.kind, level: first?.level, align: first?.align ?? 'left', listStyle: first?.kind === 'list' ? first.style ?? 'bullet' : null,
        inTable: refs.some((r) => r.b.kind === 'table'), hasSelection: !!s.selection, dictating: s.inputMode === 'dictation',
        canUndo: !!s.history?.length, canRedo: !!s.future?.length,
      };
    }
    function render() {
      if (!state || !view) return;
      const s = state;
      nameEl.textContent = s.title ?? 'Untitled document';
      const dict = s.inputMode === 'dictation';
      root.classList.toggle('is-dictating', dict);
      pill.hidden = !dict;
      if (dict) { const b = s.blocks?.find((x) => x.id === s.dictBlock); live.textContent = b?.text ? `“${b.text.slice(-70)}”` : 'listening for the first words…'; }
      const docKey = JSON.stringify(s.doc ?? null);
      const changed = docKey !== lastDoc;
      lastDoc = docKey;
      view.setState(s, changed);
      bar.update(targetInfo());
      // status bar
      const st = s.stats ?? {};
      stats.innerHTML = `<b>${st.words ?? 0}</b> ${st.words === 1 ? 'word' : 'words'} · ${plural(st.characters ?? 0, 'character')}${st.words ? ` · ${st.readingMinutes ?? 1} min read` : ''}`;
      prog.hidden = !st.tasks;
      if (st.tasks) { prog.style.setProperty('--p', `${Math.round(100 * st.tasksDone / st.tasks)}%`); prog.replaceChildren(h('i', {}), `${st.tasksDone}/${st.tasks} tasks`); }
      const sl = s.selection;
      sel.textContent = !sl ? '' : sl.type === 'blocks' ? `${plural(sl.blocks.length, 'block')} selected` : (() => { const b = blockById(sl.block); const t = b ? model.containers(b).find((c) => c.at === sl.at)?.text.slice(sl.from, sl.to) : ''; return `“${t.length > 28 ? `${t.slice(0, 26)}…` : t}” selected`; })();
      undo.textContent = s.history?.length ? plural(s.history.length, 'undo step') : '';
      // outline
      const heads = [{ id: 'title', level: 0, text: s.title }, ...(s.blocks ?? []).filter((b) => b.kind === 'heading').map((b) => ({ id: b.id, level: b.level ?? 2, text: b.text }))];
      const cur = s.blocks?.[s.cursor]?.id;
      let curHead = heads[0].id, hi = 0;
      for (const hd of heads.slice(1)) { if ((s.blocks ?? []).findIndex((b) => b.id === hd.id) <= (s.cursor ?? -1)) curHead = hd.id; }
      void cur; void hi;
      outlineList.replaceChildren(...heads.map((hd, i) => {
        const b = h('button', { type: 'button', title: hd.text }, hd.text || '(empty heading)');
        b.addEventListener('click', () => {
          if (i === 0) host.send('go to the top');
          else if (i - 1 < ORDINALS.length) host.send(`go to the ${ORDINALS[i - 1]} heading`);
          else view.blockEl(hd.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        return h('li', { 'data-level': hd.level, class: hd.id === curHead && heads.length > 1 ? 'is-current' : '' }, b);
      }));
      if (heads.length === 1) outlineList.append(h('li', { class: 'pe-none' }, 'Headings you add appear here.'));
      empty.hidden = !!(s.blocks?.length) || (s.title && s.title !== 'Untitled document');
      // scroll to what changed
      const cb = s.blocks?.[s.cursor];
      const key = `${cb?.id}:${s.cursor}:${s.blocks?.length}:${cb?.text ?? cb?.items?.length ?? cb?.rows?.length ?? ''}`;
      const wantFocus = s.focus && s.focus.n !== lastFocus ? s.focus.id : null;
      lastFocus = s.focus?.n ?? 0;
      const target = wantFocus ?? (key !== lastKey && cb ? cb.id : null);
      lastKey = key;
      if (target) requestAnimationFrame(() => {
        const el = view.blockEl(target);
        if (!el) return;
        el.scrollIntoView?.({ block: target === 'title' ? 'start' : 'nearest', behavior: 'smooth' });
        if (changed && !wantFocus) { el.classList.remove('pe-flash'); void el.offsetWidth; el.classList.add('pe-flash'); }
      });
    }

    // ---- start TipTap ----
    (async () => {
      try {
        const [T, M] = await Promise.all([loadTipTap(host.asset('vendor/editor/tiptap.mjs')), import(host.asset('worlds/docs.editor/model.mjs'))]);
        model = M; bar.paintSwatches(M.highlightHex);
        editorEl.replaceChildren();
        const api = {
          getState: () => state,
          onSelect: ({ selection, cursorId }) => {
            if (!state) return;
            const idx = cursorId && cursorId !== 'title' ? state.blocks.findIndex((b) => b.id === cursorId) : state.cursor;
            state = { ...state, selection, cursor: idx };
            host.setWorldState('docs.editor', { selection, cursor: idx });
            render();
          },
          onTask: (n, checked) => host.send(`${checked ? 'check' : 'uncheck'} task ${n}`),
        };
        view = createView(T, editorEl, api);
        render();
      } catch (e) {
        console.warn('TipTap failed to load; using the plain renderer', e);
        root.replaceChildren(h('p', { class: 'pe-fallback-note' }, 'The rich editor could not be loaded; showing the plain view.'));
        const box = h('div', {}); root.append(box);
        fallback = createFallback(box);
        if (state) fallback.update(state);
      }
    })();
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state?.selection) { state = { ...state, selection: null }; host.setWorldState('docs.editor', { selection: null }); render(); } });
    root.tabIndex = -1;

    return {
      update(s) {
        state = s;
        if (fallback) { fallback.update(s); return; }
        if (view && model) render();
      },
    };
  },
};
