// TipTap (ProseMirror) view of the docs.editor state: renders `state.doc`, highlights the voice/mouse selection and the
// working block with decorations, and turns mouse selections and task clicks into world updates / typed commands.
// The editor is read-only (editable: false): every edit goes through the language layer (see spec 07 section 3).

export async function loadTipTap(url) {
  return import(url);
}

const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'table', 'horizontalRule'];

/** Create the TipTap editor in `element`. `api` = { getState(), onSelect({ selection, cursorId }), onTask(index, checked), onNavigate(id) }. */
export function createView(T, element, api) {
  const { Editor, Extension, StarterKit, Table, TableRow, TableHeader, TableCell, TaskList, TaskItem, Highlight, TextAlign, Plugin, PluginKey, Decoration, DecorationSet } = T;
  const key = new PluginKey('psys2-selection');

  const BlockId = Extension.create({
    name: 'blockId',
    addGlobalAttributes() {
      return [{
        types: BLOCK_TYPES,
        attributes: {
          blockId: { default: null, parseHTML: (el) => el.getAttribute('data-block-id'), renderHTML: (a) => (a.blockId ? { 'data-block-id': a.blockId } : {}) },
        },
      }];
    },
  });
  const editor = new Editor({
    element,
    editable: false,
    injectCSS: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }, dropcursor: false, gapcursor: false, undoRedo: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      TaskList, TaskItem.configure({ nested: false }),
      BlockId,
      Extension.create({
        name: 'titleAttrs',
        addGlobalAttributes() {
          return [{
            types: ['heading'],
            attributes: {
              title: { default: false, parseHTML: (el) => el.hasAttribute('data-title'), renderHTML: (a) => (a.title ? { 'data-title': '' } : {}) },
              size: { default: 0, renderHTML: (a) => (a.title ? { 'data-size': String(a.size ?? 0) } : {}) },
              untitled: { default: false, renderHTML: (a) => (a.untitled ? { 'data-untitled': '' } : {}) },
            },
          }];
        },
      }),
      Extension.create({
        name: 'psysSelection',
        addProseMirrorPlugins() {
          return [new Plugin({ key, props: { decorations: (state) => decorate(state.doc, api.getState()) } })];
        },
      }),
    ],
    content: api.getState()?.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  // ---- position mapping: world (block id, container, offset) <-> ProseMirror positions ----------------------
  const blockInfo = (state, id) => (state?.blocks ?? []).find((b) => b.id === id);
  const tbIndex = (b, at) => {
    if (b?.kind === 'list') return Number(at);
    if (b?.kind === 'table') { const [r, c] = String(at).split(':').map(Number); return r * (b.rows[0]?.length ?? 1) + c; }
    return 0;
  };
  const atOf = (b, idx) => {
    if (b?.kind === 'list') return String(idx);
    if (b?.kind === 'table') { const cols = b.rows[0]?.length ?? 1; return `${Math.floor(idx / cols)}:${idx % cols}`; }
    return '0';
  };
  function topNodes(doc) {
    const out = [];
    doc.forEach((node, offset) => out.push({ node, offset, id: node.attrs.blockId }));
    return out;
  }
  function textStart(doc, state, id, at) {
    const t = topNodes(doc).find((x) => x.id === id);
    if (!t) return null;
    const want = tbIndex(blockInfo(state, id), at);
    let i = -1, found = null;
    t.node.descendants((child, pos) => {
      if (child.isTextblock) { i++; if (i === want) found = t.offset + 1 + pos + 1; }
      return found === null;
    });
    return found === null && t.node.isTextblock ? t.offset + 1 : found;
  }
  function decorate(doc, state) {
    if (!state) return DecorationSet.empty;
    const decos = [];
    const tops = topNodes(doc);
    const node = (id, cls) => { const t = tops.find((x) => x.id === id); if (t) decos.push(Decoration.node(t.offset, t.offset + t.node.nodeSize, { class: cls })); };
    const sel = state.selection;
    const cur = state.blocks?.[state.cursor];
    if (sel?.type === 'blocks') for (const id of sel.blocks) node(id, 'is-selected');
    else if (sel?.type === 'range') {
      const start = textStart(doc, state, sel.block, sel.at);
      if (start !== null) {
        decos.push(Decoration.inline(start + sel.from, start + sel.to, { class: sel.item ? 'psys-sel psys-sel-item' : 'psys-sel' }));
        node(sel.block, 'has-selection');
      }
    } else if (cur) node(cur.id, 'is-cursor');
    if (state.inputMode === 'dictation') {
      const target = state.dictBlock ?? state.blocks?.at(-1)?.id;
      if (target) node(target, 'is-dictating');
    }
    return DecorationSet.create(doc, decos);
  }

  // ---- mouse: selection -> world --------------------------------------------------------------------------------
  function locate(domNode, offset) {
    try {
      const pos = editor.view.posAtDOM(domNode, offset);
      const doc = editor.state.doc;
      const tops = topNodes(doc);
      const top = tops.find((t) => pos >= t.offset && pos <= t.offset + t.node.nodeSize);
      if (!top) return null;
      let idx = -1, hit = null;
      top.node.descendants((child, p) => {
        if (child.isTextblock) { idx++; const s0 = top.offset + 1 + p + 1; if (pos >= s0 && pos <= s0 + child.content.size) hit = { idx, start: s0 }; }
        return hit === null;
      });
      if (!hit && top.node.isTextblock) hit = { idx: 0, start: top.offset + 1 };
      return { id: top.id, idx: hit?.idx ?? 0, offset: hit ? pos - hit.start : 0 };
    } catch { return null; }
  }
  function readSelection() {
    const s = window.getSelection();
    if (!s || !s.anchorNode || !element.contains(s.anchorNode)) return null;
    const a = locate(s.anchorNode, s.anchorOffset), f = locate(s.focusNode, s.focusOffset);
    if (!a || !f) return null;
    const state = api.getState();
    if (s.isCollapsed || (a.id === f.id && a.idx === f.idx && a.offset === f.offset)) return { selection: { type: 'blocks', blocks: [a.id] }, cursorId: a.id };
    if (a.id === f.id && a.idx === f.idx && a.id !== 'title') {
      const b = blockInfo(state, a.id);
      return { selection: { type: 'range', block: a.id, at: atOf(b, a.idx), from: Math.min(a.offset, f.offset), to: Math.max(a.offset, f.offset) }, cursorId: a.id };
    }
    if (a.id === f.id && a.id === 'title') return { selection: { type: 'range', block: 'title', at: '0', from: Math.min(a.offset, f.offset), to: Math.max(a.offset, f.offset) }, cursorId: null };
    const order = topNodes(editor.state.doc).map((t) => t.id);
    const [i, j] = [order.indexOf(a.id), order.indexOf(f.id)].sort((x, y) => x - y);
    return { selection: { type: 'blocks', blocks: order.slice(i, j + 1) }, cursorId: order[i] };
  }
  // The selection is read after a short pause: a double click (select a word) must not be disturbed by the re-render a first click causes.
  let pending = null;
  element.addEventListener('mousedown', () => clearTimeout(pending));
  element.addEventListener('mouseup', (e) => {
    if (e.target.closest?.('input[type=checkbox]')) return;
    if (e.target.closest?.('a')) e.preventDefault();
    clearTimeout(pending);
    pending = setTimeout(() => { const r = readSelection(); if (r) api.onSelect(r); }, 320);
  });
  element.addEventListener('click', (e) => {
    const box = e.target.closest?.('ul[data-type="taskList"] input[type=checkbox]');
    if (box) {
      e.preventDefault();
      const boxes = [...element.querySelectorAll('ul[data-type="taskList"] input[type=checkbox]')];
      api.onTask(boxes.indexOf(box) + 1, box.closest('li')?.getAttribute('data-checked') !== 'true');
    }
    if (e.target.closest?.('a')) e.preventDefault();
  });

  return {
    editor,
    /** Render a new state. */
    setState(state, changedDoc) {
      if (changedDoc) editor.commands.setContent(state.doc, { emitUpdate: false });
      editor.view.dispatch(editor.state.tr.setMeta(key, { t: Date.now() }));
      // the checkbox property can be left dirty by a click; make it follow the document
      for (const li of element.querySelectorAll('ul[data-type="taskList"] > li')) { const box = li.querySelector('input[type=checkbox]'); if (box) box.checked = li.getAttribute('data-checked') === 'true'; }
    },
    /** DOM element of a block (or the title). */
    blockEl(id) { return element.querySelector(`[data-block-id="${id}"]`); },
    textStart: (state, id, at) => textStart(editor.state.doc, state, id, at),
    destroy() { editor.destroy(); },
  };
}
