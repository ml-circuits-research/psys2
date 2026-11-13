// Formatting toolbar of the Editor tab. It mirrors the document state (bold is active when the selection is bold) and every
// click sends the equivalent voice command through host.send, so mouse and voice share one language layer.
import { h } from '../../util.mjs';

const svg = (d, extra = '') => { const s = document.createElement('span'); s.className = 'pe-ico'; s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`; return s; };
const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  undo: P('M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62A8 8 0 0 1 12.5 10c3.5 0 6.47 2.3 7.5 5.5l2.37-.78C21.04 10.6 17.1 8 12.5 8Z'),
  redo: P('M18.4 10.6A11.9 11.9 0 0 0 10 8c-4.6 0-8.54 2.6-9.87 6.72L2.5 15.5C3.53 12.3 6.5 10 10 10c1.95 0 3.73.72 5.12 1.88L11.5 15.5H22V5l-3.6 3.6Z'),
  code: P('m9.4 16.6-4.6-4.6 4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z'),
  hl: P('m15.2 3.3 5.5 5.5-9.9 9.9-4.9.9-1.2-1.2.9-4.9 9.6-10.2Zm-1.4 3.6-6 6.3-.4 2.2 2.2-.4 6.2-6.1-2-2ZM3 20h18v2H3v-2Z'),
  link: P('M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z'),
  left: P('M3 3h18v2H3V3Zm0 4h12v2H3V7Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Zm0 4h18v2H3v-2Z'),
  center: P('M3 3h18v2H3V3Zm3 4h12v2H6V7Zm-3 4h18v2H3v-2Zm3 4h12v2H6v-2Zm-3 4h18v2H3v-2Z'),
  right: P('M3 3h18v2H3V3Zm6 4h12v2H9V7Zm-6 4h18v2H3v-2Zm6 4h12v2H9v-2Zm-6 4h18v2H3v-2Z'),
  justify: P('M3 3h18v2H3V3Zm0 4h18v2H3V7Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Z'),
  bullets: P('M4 10.5A1.5 1.5 0 1 0 4 13.5a1.5 1.5 0 0 0 0-3Zm0-6A1.5 1.5 0 1 0 4 7.5a1.5 1.5 0 0 0 0-3Zm0 12A1.5 1.5 0 1 0 4 19.5a1.5 1.5 0 0 0 0-3ZM7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2Z'),
  numbers: P('M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1Zm1-9h1V4H2v1h1v3Zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1Zm5-6v2h14V5H7Zm0 14h14v-2H7v2Zm0-6h14v-2H7v2Z'),
  tasks: P('M22 7h-9v2h9V7Zm0 8h-9v2h9v-2ZM5.5 11 2 7.5l1.4-1.4 2.1 2.1 4.1-4.2L11 5.4 5.5 11Zm0 8L2 15.5l1.4-1.4 2.1 2.1 4.1-4.2 1.4 1.4L5.5 19Z'),
  quote: P('M6 17h3l2-4V7H5v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z'),
  table: P('M3 3h18v18H3V3Zm2 4v3h6V7H5Zm8 0v3h6V7h-6Zm6 5h-6v3h6v-3Zm0 5h-6v2h6v-2Zm-8 2v-2H5v2h6Zm-6-4h6v-3H5v3Z'),
  rule: P('M3 11h18v2H3v-2Z'),
  read: P('M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z'),
  copy: P('M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z'),
  down: P('M5 20h14v-2H5v2Zm14-9h-4V3H9v8H5l7 7 7-7Z'),
  caret: P('M7 10l5 5 5-5H7Z'),
  rowAdd: P('M3 5h18v4H3V5Zm0 6h18v2H3v-2Zm9 4h2v2h2v2h-2v2h-2v-2h-2v-2h2v-2Z'),
  colAdd: P('M5 3h4v18H5V3Zm6 0h2v18h-2V3Zm4 9h2v2h2v2h-2v2h-2v-2h-2v-2h2v-2Z'),
  rowDel: P('M3 5h18v4H3V5Zm0 6h18v2H3v-2Zm6 6h8v2H9v-2Z'),
  colDel: P('M5 3h4v18H5V3Zm6 0h2v18h-2V3Zm3 9h6v2h-6v-2Z'),
};
// the swatches are colours of the catalog (the one colour reader) drawn as a highlighter: filled by `setHighlightHex` once the document model is loaded
const COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'].map((n) => [n, '#eee']);

export function createToolbar({ send, say }) {
  const btns = {};
  const mk = (id, label, content, cmd, opts = {}) => {
    const b = h('button', { class: `pe-btn${opts.cls ? ` ${opts.cls}` : ''}`, type: 'button', title: opts.title ?? label, 'aria-label': label, 'data-cmd': id, 'aria-pressed': opts.toggle ? 'false' : null }, content);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { const c = typeof cmd === 'function' ? cmd() : cmd; if (c) send(c); });
    btns[id] = b;
    return b;
  };
  const sep = () => h('span', { class: 'pe-sep', role: 'separator' });
  const text = (t, cls) => h('span', { class: `pe-txt ${cls ?? ''}` }, t);
  let info = {};

  // block style
  const style = h('select', { class: 'pe-select', 'aria-label': 'Text style', title: 'Text style' },
    h('option', { value: 'paragraph' }, 'Normal text'), h('option', { value: 'h1' }, 'Heading 1'), h('option', { value: 'h2' }, 'Heading 2'), h('option', { value: 'h3' }, 'Heading 3'),
    h('option', { value: 'quote' }, 'Quote'), h('option', { value: 'title', disabled: true, hidden: true }, 'Title'), h('option', { value: 'other', disabled: true, hidden: true }, '—'));
  style.addEventListener('change', () => {
    const v = style.value;
    send(v === 'paragraph' ? 'turn it into a paragraph' : v === 'quote' ? 'turn it into a quote' : `turn it into heading ${v.slice(1)}`);
  });

  // menus
  const menuHost = h('div', { class: 'pe-menus' });
  let openMenu = null;
  const closeMenu = () => { openMenu?.el.setAttribute('hidden', ''); openMenu?.btn.setAttribute('aria-expanded', 'false'); openMenu = null; };
  const toggleMenu = (btn, el) => {
    if (openMenu?.el === el) { closeMenu(); return; }
    closeMenu();
    const r = btn.getBoundingClientRect(), hr = menuHost.getBoundingClientRect();
    el.style.top = `${r.bottom - hr.top + 4}px`;
    el.removeAttribute('hidden');
    el.style.left = `${Math.max(4, Math.min(r.left - hr.left, hr.width - el.offsetWidth - 8))}px`;
    el.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); openMenu = { el, btn };
  };
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.el.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenu(); });

  const palette = h('div', { class: 'pe-menu pe-palette', hidden: true, role: 'menu', 'aria-label': 'Highlight color' },
    COLORS.map(([n, c]) => { const b = h('button', { class: 'pe-swatch', type: 'button', title: `Highlight ${n}`, 'aria-label': `Highlight ${n}`, style: `background:${c}` }); b.addEventListener('click', () => { closeMenu(); send(`highlight it in ${n}`); }); return b; }),
    (() => { const b = h('button', { class: 'pe-swatch pe-swatch-none', type: 'button', title: 'Remove highlight', 'aria-label': 'Remove highlight' }, '×'); b.addEventListener('click', () => { closeMenu(); send('remove the highlight from it'); }); return b; })());
  const linkInput = h('input', { class: 'pe-input', type: 'text', placeholder: 'example.com', 'aria-label': 'Link address', autocomplete: 'off' });
  const linkMenu = h('form', { class: 'pe-menu pe-linkmenu', hidden: true },
    linkInput, h('button', { class: 'pe-go', type: 'submit' }, 'Link'));
  linkMenu.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = linkInput.value.trim();
    if (!u) return;
    closeMenu(); linkInput.value = '';
    send(`add a link to ${u.replace(/^https?:\/\//i, '').replace(/\//g, ' slash ').replace(/\./g, ' dot ')}`);
  });
  const dlMenu = h('div', { class: 'pe-menu pe-dlmenu', hidden: true, role: 'menu' },
    [['Markdown (.md)', 'markdown'], ['Web page (.html)', 'html'], ['Plain text (.txt)', 'text'], ['Editor JSON (.json)', 'json']].map(([t, f]) => {
      const b = h('button', { class: 'pe-menuitem', type: 'button', role: 'menuitem' }, t); b.addEventListener('click', () => { closeMenu(); send(`download the document as ${f}`); }); return b;
    }));
  menuHost.append(palette, linkMenu, dlMenu);

  const hlBtn = mk('highlight', 'Highlight (yellow)', svg(ICONS.hl), () => (info.marks?.highlight ? 'remove the highlight from it' : 'highlight it in yellow'), { toggle: true });
  const hlCaret = h('button', { class: 'pe-btn pe-caret', type: 'button', title: 'Highlight color', 'aria-label': 'Highlight color', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, svg(ICONS.caret));
  hlCaret.addEventListener('mousedown', (e) => e.preventDefault());
  hlCaret.addEventListener('click', () => toggleMenu(hlCaret, palette));
  const linkBtn = mk('link', 'Link', svg(ICONS.link), () => { if (info.marks?.link) return 'remove the link from it'; toggleMenu(linkBtn, linkMenu); setTimeout(() => linkInput.focus(), 0); return null; }, { toggle: true });
  const dlBtn = h('button', { class: 'pe-btn', type: 'button', title: 'Download', 'aria-label': 'Download', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, svg(ICONS.down), svg(ICONS.caret, 'class="pe-small"'));
  dlBtn.addEventListener('mousedown', (e) => e.preventDefault());
  dlBtn.addEventListener('click', () => toggleMenu(dlBtn, dlMenu));

  const tableTools = h('span', { class: 'pe-group pe-table-tools', hidden: true, role: 'group', 'aria-label': 'Table' },
    sep(), mk('rowAdd', 'Add a row', svg(ICONS.rowAdd), 'add a row'), mk('colAdd', 'Add a column', svg(ICONS.colAdd), 'add a column'),
    mk('rowDel', 'Delete the last row', svg(ICONS.rowDel), 'delete the last row'), mk('colDel', 'Delete the last column', svg(ICONS.colDel), 'delete the last column'));

  let sizeGroup;
  const bar = h('div', { class: 'pe-toolbar', role: 'toolbar', 'aria-label': 'Formatting (each button sends the matching voice command)' },
    h('span', { class: 'pe-group' }, mk('undo', 'Undo', svg(ICONS.undo), 'undo'), mk('redo', 'Redo', svg(ICONS.redo), 'redo')), sep(),
    style, sep(),
    sizeGroup = h('span', { class: 'pe-group' }, mk('smaller', 'Smaller', text('A', 'pe-a-small'), () => (info.sizePhrase ? `make ${info.sizePhrase} smaller` : null)), mk('bigger', 'Bigger', text('A', 'pe-a-big'), () => (info.sizePhrase ? `make ${info.sizePhrase} bigger` : null))), sep(),
    h('span', { class: 'pe-group' },
      mk('bold', 'Bold', text('B', 'pe-b'), () => (info.marks?.bold ? 'remove the bold from it' : 'make it bold'), { toggle: true }),
      mk('italic', 'Italic', text('I', 'pe-i'), () => (info.marks?.italic ? 'remove the italic from it' : 'make it italic'), { toggle: true }),
      mk('underline', 'Underline', text('U', 'pe-u'), () => (info.marks?.underline ? 'remove the underline from it' : 'make it underlined'), { toggle: true }),
      mk('strike', 'Strikethrough', text('S', 'pe-s'), () => (info.marks?.strike ? 'remove the strikethrough from it' : 'make it strikethrough'), { toggle: true }),
      mk('code', 'Code', svg(ICONS.code), () => (info.marks?.code ? 'remove the code from it' : 'make it code'), { toggle: true }),
      hlBtn, hlCaret, linkBtn), sep(),
    h('span', { class: 'pe-group' },
      mk('left', 'Align left', svg(ICONS.left), 'align it to the left', { toggle: true }), mk('center', 'Center', svg(ICONS.center), 'align it to the center', { toggle: true }),
      mk('right', 'Align right', svg(ICONS.right), 'align it to the right', { toggle: true }), mk('justify', 'Justify', svg(ICONS.justify), 'justify it', { toggle: true })), sep(),
    h('span', { class: 'pe-group' },
      mk('bullets', 'Bullet list', svg(ICONS.bullets), 'turn it into a bullet list', { toggle: true }), mk('numbers', 'Numbered list', svg(ICONS.numbers), 'turn it into a numbered list', { toggle: true }),
      mk('tasks', 'Task list', svg(ICONS.tasks), 'turn it into a task list', { toggle: true }), mk('quote', 'Quote', svg(ICONS.quote), 'turn it into a quote', { toggle: true })), sep(),
    h('span', { class: 'pe-group' }, mk('table', 'Insert a table', svg(ICONS.table), 'add a table'), mk('rule', 'Insert a line', svg(ICONS.rule), 'insert a line')),
    tableTools,
    h('span', { class: 'pe-spacer' }));
  const actions = h('span', { class: 'pe-group pe-actions' }, mk('read', 'Read the document aloud', svg(ICONS.read), () => (info.hasSelection ? 'read the selection' : 'read the document')),
      mk('copy', 'Copy', svg(ICONS.copy), () => (info.hasSelection ? 'copy the selection' : 'copy the document')), dlBtn);
  const root = h('div', { class: 'pe-toolbar-wrap' }, bar);
  void say;

  return {
    el: root, actions, menus: menuHost,
    /** Paints the swatches with the highlight colours of the document model (`model.highlightHex`: the catalog's colours as a highlighter draws them). */
    paintSwatches(highlightHex) { for (const b of palette.querySelectorAll('.pe-swatch:not(.pe-swatch-none)')) { const n = b.title.replace('Highlight ', ''); b.style.background = highlightHex(n) ?? ''; } },
    update(i) {
      info = i;
      const set = (id, on) => { const b = btns[id]; if (b) { b.setAttribute('aria-pressed', String(!!on)); b.classList.toggle('is-on', !!on); } };
      for (const m of ['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'link']) set(m, i.marks?.[m]);
      for (const a of ['left', 'center', 'right', 'justify']) set(a, (i.align ?? 'left') === a);
      set('bullets', i.listStyle === 'bullet'); set('numbers', i.listStyle === 'numbered'); set('tasks', i.listStyle === 'task'); set('quote', i.kind === 'quote');
      btns.undo.disabled = !i.canUndo; btns.redo.disabled = !i.canRedo;
      btns.bigger.disabled = btns.smaller.disabled = !i.sizePhrase;
      style.value = i.kind === 'title' ? 'title' : i.kind === 'heading' ? `h${i.level ?? 2}` : i.kind === 'quote' ? 'quote' : i.kind === 'paragraph' ? 'paragraph' : 'other';
      tableTools.hidden = !i.inTable;
      sizeGroup.hidden = !!i.inTable;
      style.querySelector('option[value=other]').textContent = { table: 'Table', list: i.listStyle === 'task' ? 'Task list' : i.listStyle === 'numbered' ? 'Numbered list' : 'Bullet list', rule: 'Line' }[i.kind] ?? '—';
    },
  };
}
