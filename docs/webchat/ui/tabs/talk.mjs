// Talk tab (world talk, spec 18): a chat about things where an answer comes with a small card made from knowledge (a drawing, a parts diagram, counted icons, bars,
// a line), and where the conversation is a board of topics. The world owns the state (cards, topics, current topic); this file renders it. A card is shown inside the
// answer of the chat (effect talk.card -> host.attach), the board and the suggestions live in the panel: beside the chat on a wide screen, behind a button on a phone.
// Nothing here talks to a network: the pictures are drawn from the parts the world put in its state.
const WORLD = 'talk';
const CARDS = 'worlds/talk/cards.mjs';
const OPENING = 'I can talk about things you can draw, their parts, how many parts they have, which of two things is bigger, and the order of the months, seasons, days and planets. Ask me, and I answer with a sentence and a small picture.';
/** The suggestion chips: example questions of the world (tests/talk-world.test.mjs checks that the world reads every one). */
export const CHIPS = [
  'What does a lighthouse look like?', 'What are the parts of a bicycle?', 'How many legs does a spider have?', 'Which is bigger, Jupiter or Mars?',
  'What are the planets in order?', 'What comes after March?',
];

const CSS = `
.tk-root { display: grid; gap: 14px; max-width: 1080px; }
.tk-card-panel { background: var(--surface); border-radius: 16px; box-shadow: inset 0 0 0 1px var(--line), 0 10px 30px -16px rgba(20, 40, 50, .28); padding: 16px 18px; }
.tk-sum { padding: 12px 16px; }
.tk-sum h3 { margin: 0 0 6px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.tk-sum-para { margin: 0 0 6px; font-size: 14px; line-height: 1.45; color: var(--ink); }
.tk-sum-empty { margin: 0; font-size: 13.5px; color: var(--muted); font-style: italic; }
.tk-sum-sec { margin: 8px 0 0; }
.tk-sum-sec h4 { margin: 0 0 2px; font-size: 12px; font-weight: 700; color: var(--ink); }
.tk-sum-sec ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 1px; font-size: 13px; color: var(--ink); }
.tk-sum-sec li { overflow-wrap: anywhere; }
.tk-sum-sec li::before { content: '\\2022'; margin-right: .45em; color: var(--muted); }
.tk-open { margin: 0 0 10px; font-size: 15px; line-height: 1.5; color: var(--ink); }
.tk-priv { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }
.tk-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tk-chip { all: unset; cursor: pointer; font-size: 13px; padding: 6px 12px; border-radius: 999px; background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.tk-chip:hover, .tk-chip:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }
.tk-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.tk-head h3 { margin: 0; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); flex: 1; }
.tk-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 10px; font-size: 13px; font-weight: 650; color: var(--ink); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
.tk-btn:hover, .tk-btn:focus-visible { background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--accent); }
.tk-toggle { display: none; }
.tk-boardwrap { overflow: auto; max-height: 440px; border-radius: 10px; background: var(--surface-2); padding: 6px; }
.tk-empty { margin: 0; font-size: 13.5px; color: var(--muted); font-style: italic; }
.tk-list { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13.5px; color: var(--ink); }
.tk-list b { font-weight: 650; }
.tk-list span { color: var(--muted); }
@media (max-width: 720px) { .tk-toggle { display: inline-flex; } .tk-root:not(.is-board) .tk-boardsec { display: none; } }
/* the card inside the answer */
.tk-inchat { margin: 8px 0 2px; padding: 10px 12px 8px; border-radius: 14px; background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); max-width: 420px; }
.tk-inchat.is-flash { animation: tk-flash 1.4s ease-out; }
@keyframes tk-flash { from { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 30%, transparent); } to { box-shadow: inset 0 0 0 1px var(--line); } }
.tk-title { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.tk-svg { display: block; width: 100%; height: auto; }
.tk-drawing { max-height: 230px; }
.tk-board { width: auto; max-width: none; }
.tk-t { font: 12px system-ui, sans-serif; fill: var(--ink); }
.tk-t.tk-b { font-weight: 700; }
.tk-t.tk-muted { fill: var(--muted); }
.tk-t.tk-small { font-size: 9px; }
.tk-dotn { fill: var(--accent-ink); font-size: 10px; font-weight: 700; }
.tk-box { fill: var(--surface-2); stroke: var(--line); stroke-width: 1.2; }
rect.tk-rootbox, .tk-rootnode .tk-box { fill: color-mix(in srgb, var(--accent) 16%, var(--surface)); stroke: var(--accent); }
.tk-link { stroke: var(--muted); stroke-width: 1.4; opacity: .7; }
.tk-dot { fill: var(--accent); }
.tk-bar { fill: color-mix(in srgb, var(--accent) 55%, var(--surface-2)); }
.tk-bar.tk-big { fill: var(--accent); }
.tk-axis { stroke: var(--muted); stroke-width: 2; }
.tk-point { fill: var(--surface); stroke: var(--accent); stroke-width: 2.2; }
.tk-point.tk-hot { fill: var(--accent); }
.tk-point.tk-was { stroke-dasharray: 3 2; }
.tk-node { cursor: pointer; outline: none; }
.tk-node:hover .tk-box, .tk-node:focus-visible .tk-box { stroke: var(--accent); }
.tk-node.tk-current .tk-box { fill: color-mix(in srgb, var(--accent) 24%, var(--surface)); stroke: var(--accent); stroke-width: 2; }
.tk-partbox { cursor: pointer; }
.tk-partbox:hover .tk-box { stroke: var(--accent); }
.tk-names { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 0; }
.tk-name { all: unset; cursor: pointer; font-size: 12px; padding: 2px 9px; border-radius: 999px; background: var(--surface-2); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.tk-name:hover, .tk-name:focus-visible, .tk-name.is-on { box-shadow: inset 0 0 0 1.5px var(--accent); }
.tk-cap { margin: 4px 0 0; font-size: 12px; color: var(--muted); min-height: 1.2em; }
.tk-acts { display: flex; gap: 8px; margin-top: 6px; }
.tk-link-btn { all: unset; cursor: pointer; font-size: 12px; font-weight: 650; color: var(--accent); border-radius: 6px; padding: 1px 4px; }
.tk-link-btn:hover, .tk-link-btn:focus-visible { text-decoration: underline; }
.tk-facts { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13.5px; }
.tk-facts li { display: grid; grid-template-columns: minmax(70px, 38%) 1fr; gap: 8px; padding: 3px 8px; border-radius: 8px; background: var(--surface-2); }
.tk-factk { color: var(--muted); text-transform: capitalize; }
.tk-factv { color: var(--ink); font-weight: 650; }
.tk-tree { max-height: 220px; }
.tk-inchat .tk-pic { margin-inline: auto; }
.tk-how { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.tk-how li { display: grid; grid-template-columns: 96px 1fr; gap: 8px; font-size: 13px; line-height: 1.4; }
.tk-howlabel { font-weight: 700; color: var(--muted); }
.tk-howtext { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .tk-inchat.is-flash { animation: none; } }
`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The board as a standalone SVG (colours written out, no page styles needed) for "save as picture". */
export function standaloneBoard(svgText) {
  const style = '<style>.tk-t{font:12px sans-serif;fill:#1f2933}.tk-box{fill:#eef2f6;stroke:#9aa5b1;stroke-width:1.2}.tk-rootnode .tk-box{fill:#dbeafe;stroke:#3b82f6}.tk-current .tk-box{fill:#bfdbfe;stroke:#2563eb;stroke-width:2}.tk-link{stroke:#7b8794;stroke-width:1.4;fill:none}</style>';
  return svgText.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/>/, `>${style}<rect width="100%" height="100%" fill="#ffffff"/>`);
}

function make(holder, host) {
  if (!document.getElementById('p2-talk-css')) { const st = document.createElement('style'); st.id = 'p2-talk-css'; st.textContent = CSS; document.head.append(st); }
  holder.classList.add('tk-root');
  let cards = null, state = null, destroyed = false;
  const cardEls = new Map();      // card id -> the element inside the chat
  const firstOfTopic = new Map(); // topic id -> the first card element of the topic
  const send = (text) => host.send(text);

  // the live summary: what this conversation is about, rebuilt by the host after each turn (src/dialog/conversation.mjs: topics, worlds used, what was taught, what failed, what is open)
  const sum = el('section', 'tk-card-panel tk-sum'); sum.setAttribute('aria-label', 'What this conversation is about');
  const open = el('section', 'tk-card-panel');
  open.append(el('p', 'tk-open', esc(OPENING)));
  const chips = el('div', 'tk-chips');
  for (const c of CHIPS) { const b = el('button', 'tk-chip', esc(c)); b.type = 'button'; b.addEventListener('click', () => send(c)); chips.append(b); }
  open.append(chips, el('p', 'tk-priv', 'What you type stays on this device. I only read the shared picture catalog when I need a thing. When I do not know something I say so, and I draw no picture.'));
  const boardSec = el('section', 'tk-card-panel tk-boardsec');
  const head = el('div', 'tk-head', '<h3>Topics we talked about</h3>');
  const saveBtn = el('button', 'tk-btn', 'Save as picture'); saveBtn.type = 'button';
  head.append(saveBtn);
  const boardWrap = el('div', 'tk-boardwrap');
  const list = el('ul', 'tk-list');
  boardSec.append(head, boardWrap, list);
  const toggle = el('button', 'tk-btn tk-toggle', 'Show the topic board'); toggle.type = 'button';
  toggle.addEventListener('click', () => { const on = holder.classList.toggle('is-board'); toggle.textContent = on ? 'Hide the topic board' : 'Show the topic board'; });
  function renderSummary(model) {
    sum.replaceChildren(el('h3', null, 'What we are talking about'));
    if (!model?.sections?.length) { sum.append(el('p', 'tk-sum-empty', 'Nothing yet. Ask or tell me something and it is listed here.')); return; }
    if (model.paragraph) sum.append(el('p', 'tk-sum-para', esc(model.paragraph)));   // std.summarize, above the structured list; absent while the library has none
    for (const sec of model.sections) {
      const box = el('div', 'tk-sum-sec'); box.dataset.section = sec.id;
      box.append(el('h4', null, esc(sec.title)));
      const ul = el('ul'); for (const l of sec.lines) ul.append(el('li', null, esc(l.text)));
      box.append(ul); sum.append(box);
    }
  }
  renderSummary(null);
  holder.append(sum, open, toggle, boardSec);

  const ready = import(host.asset(CARDS)).then((m) => { cards = m; if (!destroyed) render(); }, (e) => { console.warn('talk tab: cards module failed to load', e); });

  function flash(node) {
    if (!node?.isConnected) return;
    node.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    node.classList.remove('is-flash'); void node.offsetWidth; node.classList.add('is-flash');
  }

  function render() {
    if (destroyed || !cards) return;
    const topics = state?.topics ?? [];
    boardWrap.innerHTML = topics.length ? cards.boardSvg(topics, state?.current) : '';
    if (!topics.length) boardWrap.append(el('p', 'tk-empty', 'Nothing yet. Ask me about something and it appears here.'));
    saveBtn.disabled = !topics.length; saveBtn.style.opacity = topics.length ? '' : '.5';
    list.innerHTML = topics.map((t) => `<li><b>${esc(t.name)}</b>${t.say ? ` <span>${esc(t.say)}</span>` : ''}</li>`).join('');
    for (const g of boardWrap.querySelectorAll('.tk-node')) {
      const go = () => { const id = g.getAttribute('data-topic'); const node = id === 'root' ? null : firstOfTopic.get(id); if (node) flash(node); };
      g.addEventListener('click', go);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
  }

  saveBtn.addEventListener('click', () => {
    const svg = boardWrap.querySelector('svg');
    if (!svg) return;
    const text = standaloneBoard(new XMLSerializer().serializeToString(svg));
    const img = new Image(), url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    img.onload = () => {
      const w = Number(svg.getAttribute('width')) || 600, h = Number(svg.getAttribute('height')) || 300, k = 2;
      const cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k;
      const g = cv.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob((blob) => { if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'topic-board.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
    };
    img.src = url;
  });

  /** A card made bigger or smaller by talking ("bigger"): the picture's width, and the frame of the card grows with it. */
  function sizeOf(root, pic, card) {
    const k = Number(card.data?.scale) || 1;
    pic.style.width = `${Math.round(Math.min(100, 100 * k) )}%`;
    root.style.maxWidth = `${Math.round(420 * Math.max(1, k))}px`;
    if (k > 1) pic.style.width = '100%';
  }

  /** The element of a card for the chat: title, picture, the parts on tap (a drawing), and the how-do-you-know link. */
  function buildCard(card) {
    const root = el('div', 'tk-inchat');
    root.dataset.card = card.id;
    root.append(el('p', 'tk-title', esc(card.title ?? '')));
    const pic = el('div', 'tk-pic');
    pic.innerHTML = cards.cardHtml(card);
    root.append(pic);
    sizeOf(root, pic, card);
    if (card.kind === 'drawing') {
      const names = card.data?.names ?? [], cap = el('p', 'tk-cap', names.length ? 'Tap a part to find it.' : '');
      const row = el('div', 'tk-names');
      let on = null;
      for (const n of names.slice(0, 14)) {
        const b = el('button', 'tk-name', esc(n)); b.type = 'button';
        b.addEventListener('click', () => {
          on = on === n ? null : n;
          pic.innerHTML = cards.cardHtml(card, { only: on ? n.replace(/ /g, '_') : null });
          for (const x of row.children) x.classList.toggle('is-on', x === b && !!on);
          cap.textContent = on ? `This is the ${n}.` : 'Tap a part to find it.';
        });
        row.append(b);
      }
      root.append(row, cap);
    }
    if (card.kind !== 'how') {
      const acts = el('div', 'tk-acts');
      const how = el('button', 'tk-link-btn', 'How do you know?'); how.type = 'button'; how.addEventListener('click', () => send('How do you know?'));
      acts.append(how); root.append(acts);
    }
    return root;
  }

  return {
    /** The summary of the conversation (src/dialog/conversation.mjs `summarize`), set by the host after each turn. */
    setSummary: renderSummary,
    update(next) { state = next && typeof next === 'object' ? next : state; if (cards) render(); },
    show() { if (cards) render(); },
    destroy() { destroyed = true; void ready; },
    /** Called by the effect talk.card: build the card and put it inside the current answer. */
    async showCard(id, update = false) {
      await ready;
      const s = host.state(WORLD) ?? state;
      const card = (s?.cards ?? []).find((c) => c.id === id);
      if (!card || !cards) return false;
      state = s;
      const old = update ? cardEls.get(id) : null;
      if (old) {   // the card changed by talking: the same element, redrawn in place
        const pic = old.querySelector('.tk-pic');
        if (pic) { pic.innerHTML = cards.cardHtml(card); sizeOf(old, pic, card); }
        flash(old);
        render();
        return true;
      }
      const node = buildCard(card);
      cardEls.set(id, node);
      if (card.topic && !firstOfTopic.has(card.topic)) firstOfTopic.set(card.topic, node);
      const placed = host.attach?.(node) ?? false;
      render();
      return placed;
    },
    showBoard() { holder.classList.add('is-board'); toggle.textContent = 'Hide the topic board'; boardSec.scrollIntoView?.({ block: 'nearest' }); },
  };
}

/**
 * The avatar's reaction to a turn of this tab (host hook `mood`, called by app.mjs after each reply on the Talk tab): found -> smile, not found -> null (the host's general reaction applies),
 * a surprising big number (100,000 or more in the answer) -> surprised; null for anything else (the host's general reaction applies). Pure.
 */
export function mood(reply, answer) {
  const statuses = reply?.statuses ?? [];
  const text = String(answer ?? reply?.text ?? '');
  const nums = (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, '')));
  if (statuses.includes('missing')) return null;
  if (!statuses.includes('supported')) return null;
  return nums.some((n) => n >= 100000) ? 'surprised' : 'smile';
}

export default {
  id: 'talk', mood, label: 'Talk', world: WORLD, order: 1, make,
  effects: {
    'talk.card': async ({ id, update }, { ui }) => { const ok = await ui?.showCard?.(String(id), !!update); return ok ? { ok: true } : { ok: false, detail: 'the card could not be shown' }; },
    'talk.board': async (_args, { ui }) => { ui?.showBoard?.(); return { ok: !!ui }; },
  },
};
