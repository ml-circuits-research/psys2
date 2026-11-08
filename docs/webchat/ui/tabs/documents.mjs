// Documents tab (world docs.reader, spec 09): add documents (drag and drop or picker: .md .txt .pdf .docx), see them with the sentences
// the last answer cited highlighted, the entities, the outline, the search hits and the other documents. Everything runs in the browser.
// Files: .md/.txt are read as text; .pdf with pdf.js and .docx with mammoth (vendored in ../../vendor/documents/, loaded on first use).
// The document object comes from worlds/docs.reader/ops.mjs (loaded with host.asset); the tab only renders world state and turns every
// click into a typed command through host.send, so mouse and voice share one language layer.
// While the tab is visible it sets { visible: true, inputMode: 'documents' } in the world state; docs.reader answers free questions only then.
const OPS_ASSET = 'worlds/docs.reader/ops.mjs';
const VENDOR = (f) => new URL(`../../vendor/documents/${f}`, import.meta.url).href;
const MAX_BYTES = 12 * 1024 * 1024;
const EXAMPLES = ['what is this story about', 'who are the characters', 'who is the main character', 'what did the witch do', 'where did they live', 'find "bread"', 'give me the outline', 'read the ending aloud'];

const CSS = `
.dr-root { display: grid; gap: 14px; max-width: 1080px; }
.dr-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dr-eyebrow { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.dr-title { margin: 2px 0 0; font-size: 22px; line-height: 1.2; color: var(--ink); }
.dr-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }
.dr-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 650; color: var(--ink); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); transition: background .15s, box-shadow .15s; }
.dr-btn:hover, .dr-btn:focus-visible { background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--accent); }
.dr-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.dr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dr-drop { border-radius: 14px; padding: 12px 14px; font-size: 13px; color: var(--muted); background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--line); transition: box-shadow .15s, background .15s; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dr-drop.is-over { box-shadow: inset 0 0 0 2px var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); color: var(--ink); }
.dr-drop b { color: var(--ink); }
.dr-msg { font-size: 12.5px; color: var(--muted); margin-left: auto; }
.dr-msg.is-bad { color: var(--bad, #c0392b); }
.dr-docs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.dr-doc { all: unset; box-sizing: border-box; cursor: pointer; flex: none; max-width: 240px; padding: 8px 12px; border-radius: 12px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 1px; position: relative; padding-right: 28px; }
.dr-doc:hover, .dr-doc:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }
.dr-doc[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); box-shadow: inset 0 0 0 1.5px var(--accent); }
.dr-doc strong { font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dr-doc span { font-size: 11.5px; color: var(--muted); }
.dr-x { all: unset; cursor: pointer; position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; border-radius: 6px; text-align: center; line-height: 18px; font-size: 14px; color: var(--muted); }
.dr-x:hover, .dr-x:focus-visible { background: var(--surface-2); color: var(--bad, #c0392b); }
.dr-main { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 14px; align-items: start; }
@media (max-width: 820px) { .dr-main { grid-template-columns: 1fr; } }
.dr-card { background: var(--surface); border-radius: 16px; box-shadow: inset 0 0 0 1px var(--line), 0 10px 30px -16px rgba(20, 40, 50, .28); }
.dr-text { padding: 16px 20px; max-height: 560px; overflow: auto; font-family: Georgia, 'Times New Roman', serif; font-size: 15.5px; line-height: 1.65; color: var(--ink); }
.dr-text h3 { margin: 18px 0 6px; font: 700 15px/1.3 system-ui, sans-serif; letter-spacing: .01em; color: var(--ink); }
.dr-text h3:first-child { margin-top: 0; }
.dr-text p { margin: 0 0 11px; }
.dr-s { border-radius: 4px; cursor: pointer; transition: background .15s; }
.dr-s:hover { background: color-mix(in srgb, var(--accent) 9%, transparent); }
.dr-s.is-cited { background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
.dr-s.is-hit { background: color-mix(in srgb, #f5cd3a 28%, transparent); }
.dr-s.is-now { box-shadow: 0 0 0 2px var(--accent); }
.dr-n { font: 600 10px/1 ui-monospace, Menlo, monospace; color: var(--muted); vertical-align: super; margin-right: 2px; opacity: .65; user-select: none; }
.dr-e { border-bottom: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); }
.dr-e.is-focus { background: color-mix(in srgb, #4caf6a 30%, transparent); border-bottom-color: #2f8a4d; }
mark.dr-t { background: #f5cd3a; color: #2b2b33; border-radius: 3px; padding: 0 1px; }
.dr-side { display: grid; gap: 12px; }
.dr-box { padding: 12px 14px; }
.dr-box h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.dr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 190px; overflow: auto; }
.dr-li { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 4px 8px; border-radius: 8px; font-size: 13px; color: var(--ink); }
.dr-li:hover, .dr-li:focus-visible { background: var(--surface-2); }
.dr-li small { color: var(--muted); font-size: 11.5px; }
.dr-li.is-focus { background: color-mix(in srgb, #4caf6a 24%, transparent); }
.dr-stats { display: flex; flex-wrap: wrap; gap: 6px; }
.dr-pill { font-size: 12px; padding: 3px 9px; border-radius: 999px; background: var(--surface-2); color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.dr-hits { padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.dr-hits b { color: var(--ink); }
.dr-answer { padding: 12px 16px; font-size: 14px; line-height: 1.5; color: var(--ink); border-left: 3px solid var(--accent); }
.dr-empty { padding: 34px 20px; text-align: center; color: var(--muted); }
.dr-empty h3 { margin: 0 0 6px; color: var(--ink); font-size: 17px; }
.dr-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dr-chip { all: unset; cursor: pointer; font-size: 12.5px; padding: 5px 11px; border-radius: 999px; background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.dr-chip:hover, .dr-chip:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }
.dr-chip q { quotes: none; }
@media (prefers-reduced-motion: reduce) { .dr-s, .dr-drop, .dr-btn { transition: none; } }
`;
const ICON = {
  add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  sample: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- text extraction from files ------------------------------------------------------------------------------------
const baseName = (n) => String(n).replace(/\.[a-z0-9]+$/i, '');
async function readPdf(buf) {
  const pdfjs = await import(VENDOR('pdf.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = VENDOR('pdf.worker.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let cur = '', lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(cur.trim()); cur = ''; }
      cur += it.str; lastY = y;
      if (it.hasEOL) { lines.push(cur.trim()); cur = ''; lastY = null; }
    }
    if (cur.trim()) lines.push(cur.trim());
    lines.push('');
  }
  // lines to paragraphs: a line shorter than 60% of the longest ends its paragraph; hyphenated line ends are joined
  const max = Math.max(1, ...lines.map((l) => l.length));
  const out = []; let para = '';
  const flush = () => { if (para.trim()) out.push(para.trim()); para = ''; };
  for (const l of lines) {
    if (!l) { flush(); continue; }
    para = para ? (/[a-z]-$/.test(para) ? para.slice(0, -1) + l : `${para} ${l}`) : l;
    if (l.length < max * 0.6 && /[.!?:”"]$/.test(l)) flush();
  }
  flush();
  return { text: out.join('\n\n'), format: 'txt' };
}
async function readDocx(buf) {
  const mammoth = (await import(VENDOR('mammoth.mjs'))).default;
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const dom = new DOMParser().parseFromString(value, 'text/html');
  const out = [];
  for (const n of dom.body.children) {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const h = /^H([1-6])$/.exec(n.tagName);
    if (h) out.push(`${'#'.repeat(Math.min(+h[1], 4))} ${t}`);
    else if (n.tagName === 'UL' || n.tagName === 'OL') for (const li of n.querySelectorAll('li')) out.push(li.textContent.replace(/\s+/g, ' ').trim());
    else out.push(t);
  }
  return { text: out.join('\n\n'), format: 'md' };
}
async function readFile(file) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? '').toLowerCase();
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than ${MAX_BYTES / 1048576} MB`);
  if (ext === 'md' || ext === 'markdown') return { text: await file.text(), format: 'md' };
  if (ext === 'txt' || ext === 'text' || file.type === 'text/plain') return { text: await file.text(), format: 'txt' };
  if (ext === 'pdf') return readPdf(await file.arrayBuffer());
  if (ext === 'docx') return readDocx(await file.arrayBuffer());
  throw new Error(`${file.name}: I read .md, .txt, .pdf and .docx files`);
}

// ---- rendering ---------------------------------------------------------------------------------------------------
/** HTML of one sentence: entity mentions underlined, focus entity and search terms marked. */
function sentenceHtml(d, s, focus, terms, stemFn) {
  const ms = d.mentions.filter((m) => m[1] === s.i && m[2] >= 0 && m[3] <= s.text.length && m[3] > m[2]).sort((a, b) => a[2] - b[2]);
  const marks = [];
  let end = 0;
  for (const m of ms) if (m[2] >= end) { marks.push({ a: m[2], b: m[3], e: m[0] }); end = m[3]; }
  const termMark = (t) => t.replace(/[A-Za-z]+/g, (w) => (terms.size && stemFn && terms.has(stemFn(w.toLowerCase())) ? `<mark class="dr-t">${w}</mark>` : w));
  let html = '', at = 0;
  for (const m of marks) {
    html += termMark(esc(s.text.slice(at, m.a)));
    html += `<span class="dr-e${focus.has(m.e) ? ' is-focus' : ''}" data-e="${esc(m.e)}">${termMark(esc(s.text.slice(m.a, m.b)))}</span>`;
    at = m.b;
  }
  return html + termMark(esc(s.text.slice(at)));
}

function make(holder, host) {
  if (!document.getElementById('p2-documents-css')) { const st = document.createElement('style'); st.id = 'p2-documents-css'; st.textContent = CSS; document.head.append(st); }
  holder.classList.add('dr-root');
  let ops = null, state = null, destroyed = false, lastFocusN = -1, lastDocId = null, lastKey = '';
  const send = (t) => host.send(t);

  const title = el('h2', 'dr-title', 'Documents');
  const sub = el('p', 'dr-sub');
  const head = el('div', 'dr-head');
  const titles = el('div'); titles.append(el('p', 'dr-eyebrow', 'Documents'), title, sub);
  const actions = el('div', 'dr-actions');
  const picker = el('input'); picker.type = 'file'; picker.multiple = true; picker.accept = '.md,.markdown,.txt,.pdf,.docx,text/plain,text/markdown'; picker.hidden = true;
  const btn = (label, icon, fn, tip) => { const b = el('button', 'dr-btn', `${ICON[icon]}<span>${label}</span>`); b.type = 'button'; if (tip) b.title = tip; b.addEventListener('click', fn); actions.append(b); return b; };
  btn('Add file', 'add', () => picker.click(), 'Choose .md, .txt, .pdf or .docx files');
  btn('Sample', 'sample', () => send('load the sample'), 'Say: load the sample');
  btn('Read aloud', 'speak', () => send('read it aloud'), 'Say: read it aloud');
  head.append(titles, actions, picker);

  const drop = el('div', 'dr-drop');
  const msg = el('span', 'dr-msg');
  drop.innerHTML = '<span><b>Drop a file here</b> (.md, .txt, .pdf, .docx) or use Add file. The file stays in your browser.</span>';
  drop.append(msg);
  const docs = el('div', 'dr-docs'); docs.setAttribute('aria-label', 'Your documents');
  const answerBox = el('div', 'dr-answer card'); answerBox.hidden = true;
  const hitsBar = el('div', 'dr-card dr-hits'); hitsBar.hidden = true;
  const main = el('div', 'dr-main');
  const view = el('div', 'dr-card dr-text'); view.setAttribute('tabindex', '0'); view.setAttribute('aria-label', 'Document text');
  const side = el('div', 'dr-side');
  main.append(view, side);
  const empty = el('div', 'dr-card dr-empty'); empty.hidden = true;
  holder.append(head, drop, docs, hitsBar, main, empty);

  const note = (t, bad) => { msg.textContent = t; msg.classList.toggle('is-bad', !!bad); };
  async function addFiles(files) {
    if (!ops) await ready;
    for (const f of files) {
      note(`Reading ${f.name}…`);
      try {
        const { text, format } = await readFile(f);
        if (!text.trim()) throw new Error(`${f.name} has no text I can read (a scanned PDF needs OCR first)`);
        const doc = ops.makeDocument(text, { name: f.name, title: baseName(f.name).replace(/[_-]+/g, ' '), format, origin: 'file', tags: [] });
        host.setWorldState('docs.reader', ops.withDocument(state ?? ops.initialState(), doc));
        note(`Added ${f.name}: ${doc.sentences.length} sentences.`);
        send('describe the file');
      } catch (e) { console.warn('documents tab:', e); note(String(e.message ?? e), true); }
    }
  }
  picker.addEventListener('change', () => { addFiles([...picker.files]); picker.value = ''; });
  for (const t of ['dragenter', 'dragover']) holder.addEventListener(t, (e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
  holder.addEventListener('dragleave', (e) => { if (!holder.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
  holder.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); drop.classList.remove('is-over'); addFiles([...e.dataTransfer.files]); });

  // click delegation: entities, sentences, outline, documents all become commands
  holder.addEventListener('click', (e) => {
    const t = e.target;
    const ent = t.closest?.('[data-e]');
    if (ent && !t.closest('.dr-li')) { e.stopPropagation(); send(`tell me about ${ent.dataset.name ?? ent.textContent}`); return; }
    const s = t.closest?.('[data-s]');
    if (s) send(`read sentence ${Number(s.dataset.s) + 1}`);
  });

  // ---- visibility: the world answers free questions only while this tab is shown ---------------------------------
  let visible = null, asserting = false;
  const setVisible = (v) => { if (v === visible) return; visible = v; host.setWorldState('docs.reader', { visible: v, inputMode: v ? 'documents' : null }); };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const x of es) setVisible(x.isIntersecting && holder.offsetParent !== null); }) : null;
  io?.observe(holder);

  const ready = import(host.asset(OPS_ASSET)).then((o) => { ops = o; if (!destroyed) { if (!state) host.setWorldState('docs.reader', { ...o.initialState(), ...(visible !== null ? { visible, inputMode: visible ? 'documents' : null } : {}) }); render(); } },
    (e) => { console.warn('documents tab: ops failed to load', e); note('The documents module did not load. Reload the page.', true); });

  function emptyState() {
    view.hidden = true; main.hidden = true; empty.hidden = false; docs.replaceChildren(); hitsBar.hidden = true; answerBox.hidden = true;
    empty.replaceChildren();
    empty.append(el('h3', '', 'No document yet'), el('p', '', 'Drop a file on this page, or load the sample story and ask about it.'));
    const chips = el('div', 'dr-chips'); chips.style.justifyContent = 'center';
    const b = el('button', 'dr-chip', '<q>load the sample</q>'); b.type = 'button'; b.addEventListener('click', () => send('load the sample')); chips.append(b);
    empty.append(chips);
  }

  function render() {
    if (destroyed || !ops) return;
    const s = state;
    const d = s?.docs?.find((x) => x.id === s.active);
    if (!d) { sub.textContent = ''; emptyState(); return; }
    empty.hidden = true; main.hidden = false; view.hidden = false;
    title.textContent = d.title || d.name;
    sub.textContent = `${d.name} · ${d.words} words · ${d.sentences.length} sentences · ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}`;

    // document list
    docs.replaceChildren();
    for (const x of s.docs) {
      const b = el('button', 'dr-doc'); b.type = 'button'; b.setAttribute('aria-pressed', String(x.id === s.active));
      b.innerHTML = `<strong>${esc(x.title || x.name)}</strong><span>${esc(x.name)} · ${x.sentences.length} sentences</span>`;
      b.addEventListener('click', () => send(`switch to the ${x.title || x.name} file`));
      if (s.docs.length > 1 || x.origin !== 'sample') {
        const c = el('button', 'dr-x', '×'); c.type = 'button'; c.title = `Close ${x.name}`; c.setAttribute('aria-label', `Close ${x.name}`);
        c.addEventListener('click', (ev) => { ev.stopPropagation(); send(`close the ${x.title || x.name} file`); });
        b.append(c);
      }
      docs.append(b);
    }

    const f = s.focus?.doc === d.id ? s.focus : { sentences: [], entities: [], terms: [], n: 0 };
    const cited = new Set(f.sentences ?? []), focusE = new Set(f.entities ?? []);
    const terms = new Set(f.terms ?? []);
    const sr = s.search?.doc === d.id && s.search.hits?.length ? s.search : null;
    const hitSet = new Set(sr?.hits ?? []);
    const nowHit = sr ? sr.hits[sr.pos ?? 0] : null;
    const key = `${d.id}|${f.n}|${sr ? `${sr.query}:${sr.pos}` : ''}|${s.docs.length}`;
    if (key === lastKey) return;
    const sameDoc = lastDocId === d.id;
    lastKey = key; lastDocId = d.id;

    // text
    const scroll = view.scrollTop;
    view.replaceChildren();
    let secAt = -1, para = null, paraAt = -1;
    for (const sen of d.sentences) {
      if (sen.sec !== secAt) {
        secAt = sen.sec; paraAt = -1;
        const sec = d.sections[secAt];
        if (sec?.title) { const h = el('h3'); h.textContent = sec.title; view.append(h); }
      }
      if (sen.p !== paraAt) { paraAt = sen.p; para = el('p'); view.append(para); }
      const span = el('span', `dr-s${cited.has(sen.i) ? ' is-cited' : ''}${hitSet.has(sen.i) ? ' is-hit' : ''}${nowHit === sen.i ? ' is-now' : ''}`);
      span.dataset.s = sen.i; span.id = `dr-s-${sen.i}`;
      span.innerHTML = `<span class="dr-n">${sen.i + 1}</span>${sentenceHtml(d, sen, focusE, terms, ops.stemWord)}`;
      for (const e of span.querySelectorAll('[data-e]')) e.dataset.name = d.entities.find((x) => x.id === e.dataset.e)?.name ?? e.textContent;
      para.append(span, ' ');
    }
    const target = f.emphasis ?? nowHit ?? (cited.size ? Math.min(...cited) : null);
    if (target !== null && target !== undefined && (f.n !== undefined)) {
      const t = view.querySelector(`#dr-s-${target}`);
      if (t) { const top = t.offsetTop - view.offsetTop - view.clientHeight / 3; view.scrollTo({ top: Math.max(0, top), behavior: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    } else view.scrollTop = sameDoc ? scroll : 0;

    // search bar
    hitsBar.hidden = !sr;
    if (sr) {
      hitsBar.replaceChildren();
      hitsBar.append(el('span', '', `<b>${sr.hits.length}</b> ${sr.hits.length === 1 ? 'result' : 'results'} for <b>“${esc(sr.query)}”</b>, showing ${(sr.pos ?? 0) + 1}`));
      const nx = el('button', 'dr-btn', `${ICON.next}<span>Next result</span>`); nx.type = 'button'; nx.addEventListener('click', () => send('next result')); hitsBar.append(nx);
      const cl = el('button', 'dr-btn', '<span>Clear</span>'); cl.type = 'button'; cl.addEventListener('click', () => send('clear the search')); hitsBar.append(cl);
    }

    // side: outline, characters, places, keywords
    side.replaceChildren();
    const box = (h, items, render) => {
      if (!items.length) return;
      const b = el('div', 'dr-card dr-box'); b.append(el('h4', '', h));
      const ul = el('ul', 'dr-list'); for (const it of items) { const li = el('li'); li.append(render(it)); ul.append(li); }
      b.append(ul); side.append(b);
    };
    const li = (html, say, cls) => { const b = el('button', `dr-li${cls ? ` ${cls}` : ''}`, html); b.type = 'button'; b.title = `Say: ${say}`; b.addEventListener('click', () => send(say)); return b; };
    box('Outline', d.sections.map((x, i) => ({ ...x, n: i + 1 })).filter((x) => x.title), (x) => li(`<span>${esc(x.title)}</span><small>${x.last - x.first + 1}</small>`, `read section ${x.n}`));
    const chars = d.entities.filter((e) => e.kind === 'character' && !e.minor).sort((a, b) => b.n - a.n).slice(0, 10);
    box('Characters', chars, (e) => li(`<span>${esc(e.name)}</span><small>${e.n}×</small>`, `tell me about ${e.name}`, focusE.has(e.id) ? 'is-focus' : ''));
    const places = d.entities.filter((e) => e.kind === 'place').sort((a, b) => b.n - a.n).slice(0, 8);
    box('Places', places, (e) => li(`<span>${esc(e.name)}</span><small>${e.n}×</small>`, `find ${e.name}`, focusE.has(e.id) ? 'is-focus' : ''));
    if (d.keywords?.length) {
      const b = el('div', 'dr-card dr-box'); b.append(el('h4', '', 'Keywords'));
      const w = el('div', 'dr-stats');
      for (const k of d.keywords.slice(0, 10)) { const c = el('button', 'dr-chip', esc(k.term)); c.type = 'button'; c.title = `Say: find ${k.term}`; c.addEventListener('click', () => send(`find ${k.term}`)); w.append(c); }
      b.append(w); side.append(b);
    }
    if (!s.last && !cited.size) {
      const b = el('div', 'dr-card dr-box'); b.append(el('h4', '', 'Try asking'));
      const w = el('div', 'dr-chips'); w.style.flexDirection = 'column'; w.style.alignItems = 'flex-start';
      for (const t of EXAMPLES) { const c = el('button', 'dr-chip', `<q>${esc(t)}</q>`); c.type = 'button'; c.addEventListener('click', () => send(t)); w.append(c); }
      b.append(w); side.append(b);
    }
  }

  return {
    update(next) { state = next; if (next && visible !== null && next.visible !== visible && !asserting) { asserting = true; Promise.resolve().then(() => { asserting = false; host.setWorldState('docs.reader', { visible, inputMode: visible ? 'documents' : null }); }); } if (next && typeof next === 'object' && ops) render(); else if (!next && ops) { lastKey = ''; render(); } },
    show() { setVisible(true); },
    hide() { setVisible(false); },
    destroy() { destroyed = true; io?.disconnect(); },
  };
}

export default { id: 'documents', label: 'Documents', world: 'docs.reader', order: 80, make };
