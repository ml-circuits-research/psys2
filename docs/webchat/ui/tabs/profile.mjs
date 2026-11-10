// Profile tab (world user.profile, spec 12): a CV-style card built from what the conversation has learned about the user.
// Header (name, role · field, organisation, place), a progress ring, the buttons Start interview / Pause / Export (JSON, Markdown CV) / Delete,
// and the sections Professional, Education, Skills, Interests, Goals and Preferences. Every value is marked "said" or "guessed (confirm?)",
// empty fields say what we would like to learn. The world owns the state; this file renders it and turns every click into a typed command
// through host.send. Data stays in this browser: the state is kept in localStorage (key psys2.profile.v1) and nothing is sent anywhere.
const WORLD = 'user.profile';
const STORE = 'psys2.profile.v1';
const CV_ASSET = 'worlds/user.profile/cv.mjs';
const KEEP = ['v', 'fields', 'skipped', 'asks', 'followed', 'sensitive', 'n', 'turns', 'lastKey', 'lastSection', 'phrase'];
// field id -> the word the user can say ("forget my job", "ask me about my hobbies")
const WORD = { name: 'name', address: 'address', location: 'city', role: 'job', field: 'field', org: 'company', years: 'years', previous: 'previous', education: 'education', skills: 'skills', tools: 'tools', hobbies: 'hobbies', topics: 'topics', media: 'media', sports: 'sports', learning: 'learning', career: 'career', year: 'year', length: 'length', tone: 'tone', language: 'language' };

const CSS = `
.pf-root { display: grid; gap: 14px; max-width: 1080px; }
.pf-card { background: var(--surface); border-radius: 16px; box-shadow: inset 0 0 0 1px var(--line), 0 10px 30px -16px rgba(20, 40, 50, .28); }
.pf-head { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 18px 20px; }
@media (max-width: 640px) { .pf-head { grid-template-columns: auto 1fr; } .pf-ring { grid-column: 1 / -1; justify-self: start; } }
.pf-avatar { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font: 700 24px/1 system-ui, sans-serif; color: var(--accent-ink); background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #1d6fe0)); }
.pf-avatar.is-empty { background: var(--surface-2); color: var(--muted); box-shadow: inset 0 0 0 1.5px var(--line); }
.pf-name { margin: 0; font-size: 24px; line-height: 1.15; color: var(--ink); }
.pf-name.is-empty, .pf-headline.is-empty { color: var(--muted); font-weight: 500; }
.pf-headline { margin: 3px 0 0; font-size: 15px; font-weight: 650; color: var(--accent); }
.pf-line { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
.pf-ring { display: flex; align-items: center; gap: 10px; }
.pf-ring svg { width: 76px; height: 76px; transform: rotate(-90deg); }
.pf-ring circle { fill: none; stroke-width: 7; }
.pf-ring .bg { stroke: var(--surface-2); box-shadow: none; }
.pf-ring .fg { stroke: var(--accent); stroke-linecap: round; transition: stroke-dasharray .5s ease; }
.pf-ringtext { display: grid; line-height: 1.2; }
.pf-ringtext b { font-size: 20px; color: var(--ink); }
.pf-ringtext span { font-size: 12px; color: var(--muted); }
.pf-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 16px; align-items: center; }
.pf-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 650; color: var(--ink); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); transition: background .15s, box-shadow .15s; }
.pf-btn:hover, .pf-btn:focus-visible { background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--accent); }
.pf-btn.is-primary { background: var(--accent); color: var(--accent-ink); box-shadow: none; }
.pf-btn.is-primary:hover, .pf-btn.is-primary:focus-visible { background: color-mix(in srgb, var(--accent) 88%, #000); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.pf-btn.is-danger { color: var(--bad); }
.pf-btn.is-danger:hover, .pf-btn.is-danger:focus-visible { box-shadow: inset 0 0 0 1px var(--bad); }
.pf-sep { width: 1px; height: 22px; background: var(--line); margin: 0 2px; }
.pf-ask { margin: 0 20px 16px; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.45; color: var(--ink); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); border-left: 3px solid var(--accent); display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.pf-ask small { color: var(--muted); font-size: 12px; }
.pf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; align-items: start; }
.pf-sec { padding: 14px 16px 10px; }
.pf-sec h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.pf-field { padding: 8px 0; border-top: 1px solid var(--line); display: grid; gap: 4px; }
.pf-field:first-of-type { border-top: 0; }
.pf-label { font-size: 12px; font-weight: 650; color: var(--muted); display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.pf-vals { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.pf-chip { font-size: 13.5px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 13%, var(--surface)); color: var(--ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
.pf-chip.is-guess { background: transparent; box-shadow: inset 0 0 0 1.5px var(--warn); border-radius: 999px; }
.pf-tag { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 1px 7px; border-radius: 6px; color: var(--muted); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.pf-tag.is-guess { color: var(--warn); box-shadow: inset 0 0 0 1px var(--warn); background: transparent; }
.pf-link { all: unset; cursor: pointer; font-size: 12px; font-weight: 650; color: var(--accent); border-radius: 6px; padding: 1px 4px; }
.pf-link:hover, .pf-link:focus-visible { text-decoration: underline; }
.pf-link.is-bad { color: var(--muted); }
.pf-link.is-bad:hover, .pf-link.is-bad:focus-visible { color: var(--bad); }
.pf-ghost { font-size: 13px; color: var(--muted); font-style: italic; }
.pf-note { font-size: 12.5px; color: var(--muted); }
.pf-field.is-skipped .pf-ghost { opacity: .7; }
.pf-field.is-new { animation: pf-flash 1.6s ease-out; }
@keyframes pf-flash { from { background: color-mix(in srgb, var(--accent) 22%, transparent); } to { background: transparent; } }
.pf-private { padding: 12px 16px; font-size: 13px; color: var(--ink); }
.pf-private h3 { margin: 0 0 6px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.pf-foot { font-size: 12.5px; color: var(--muted); display: flex; gap: 8px; align-items: center; padding: 0 4px; }
.pf-foot svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pf-chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 20px 16px; }
.pf-example { all: unset; cursor: pointer; font-size: 12.5px; padding: 5px 11px; border-radius: 999px; background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.pf-example:hover, .pf-example:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }
@media (prefers-reduced-motion: reduce) { .pf-ring .fg, .pf-btn { transition: none; } .pf-field.is-new { animation: none; } }
`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const ICON = {
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

function make(holder, host) {
  if (!document.getElementById('p2-profile-css')) { const st = document.createElement('style'); st.id = 'p2-profile-css'; st.textContent = CSS; document.head.append(st); }
  holder.classList.add('pf-root');
  let cv = null, state = null, destroyed = false, confirmDelete = false, lastN = -1, lastSaved = '';
  const send = (text) => host.send(text);

  // ---- restore what this browser kept; the world state is the single source afterwards ---------------------------------
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (saved && typeof saved === 'object' && saved.fields) {
      host.setWorldState(WORLD, { ...saved, active: false, pending: null, question: '', inputMode: null });
      state = host.state(WORLD) ?? null;
      lastSaved = JSON.stringify(saved);
    }
  } catch (e) { console.warn('profile tab: could not restore the saved profile', e); }

  function persist(s) {
    try {
      if (!s?.fields) return;
      const empty = !Object.keys(s.fields).length && !Object.keys(s.skipped ?? {}).length && !(s.sensitive ?? []).length;
      if (empty) { localStorage.removeItem(STORE); lastSaved = ''; return; }
      const out = {}; for (const k of KEEP) if (s[k] !== undefined) out[k] = s[k];
      const text = JSON.stringify(out);
      if (text !== lastSaved) { localStorage.setItem(STORE, text); lastSaved = text; }
    } catch { /* private mode or quota: the profile still works for this visit */ }
  }

  const head = el('section', 'pf-card');
  const grid = el('div', 'pf-grid');
  const priv = el('section', 'pf-card pf-private'); priv.hidden = true;
  const foot = el('p', 'pf-foot', `${ICON.lock}<span>Everything stays in this browser (local storage). Nothing is sent anywhere, and "delete my profile" removes it. I never ask about health, religion, politics, sexuality, your exact address or income.</span>`);
  holder.append(head, grid, priv, foot);

  const ready = import(host.asset(CV_ASSET)).then((m) => { cv = m; if (!destroyed) render(); }, (e) => { console.warn('profile tab: cv module failed to load', e); });

  function button(label, cls, say, title) {
    const b = el('button', `pf-btn${cls ? ` ${cls}` : ''}`, esc(label)); b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', () => { confirmDelete = false; send(say); });
    return b;
  }
  function link(label, say, cls) { const b = el('button', `pf-link${cls ? ` ${cls}` : ''}`, esc(label)); b.type = 'button'; b.addEventListener('click', () => send(say)); return b; }

  function render() {
    if (destroyed || !cv) return;
    const s = state ?? { fields: {}, skipped: {}, sensitive: [] };
    const plan = s.plan?.length ? s.plan : cv.PLAN_FALLBACK;
    const v = cv.buildView(s, plan);
    const { known, total, skipped } = v.counts;

    // header
    head.replaceChildren();
    const top = el('div', 'pf-head');
    top.append(el('div', `pf-avatar${v.name ? '' : ' is-empty'}`, v.name ? esc(initials(v.name)) : '?'));
    const who = el('div');
    who.append(el('h2', `pf-name${v.name ? '' : ' is-empty'}`, esc(v.name || 'Your profile')));
    who.append(el('p', `pf-headline${v.headline ? '' : ' is-empty'}`, esc(v.headline || 'Say "interview me" and I will get to know you')));
    if (v.line) who.append(el('p', 'pf-line', esc(v.line)));
    top.append(who);
    const C = 2 * Math.PI * 34, dash = (known / Math.max(1, total)) * C;
    const ring = el('div', 'pf-ring');
    ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', `${known} of ${total} things known`);
    ring.innerHTML = `<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="34"/><circle class="fg" cx="40" cy="40" r="34" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}"/></svg>`
      + `<div class="pf-ringtext"><b>${known} of ${total}</b><span>known${skipped ? ` · ${skipped} skipped` : ''}</span></div>`;
    top.append(ring);
    head.append(top);

    // current question
    if (s.active && s.question) {
      const q = el('div', 'pf-ask'); q.append(el('span', '', esc(s.question)));
      q.append(el('small', '', 'Answer in the chat. "skip" and "stop" work too.'));
      head.append(q);
    }
    // buttons
    const bar = el('div', 'pf-bar');
    bar.append(s.active ? button('Pause', '', 'pause the interview', 'Pause the interview') : button(known ? 'Continue interview' : 'Start interview', 'is-primary', 'interview me'));
    if (s.active) bar.append(button('Skip this', '', 'skip', 'Skip this question and never ask it again'));
    bar.append(el('span', 'pf-sep'));
    bar.append(button('Export JSON', '', 'export my profile as json', 'Download the profile as JSON'));
    bar.append(button('Export CV', '', 'export my profile as a cv', 'Download the profile as a Markdown CV'));
    bar.append(el('span', 'pf-sep'));
    if (confirmDelete) {
      const sure = el('button', 'pf-btn is-danger', 'Really delete everything?'); sure.type = 'button';
      sure.addEventListener('click', () => { confirmDelete = false; send('delete my profile for good'); });
      const keep = el('button', 'pf-btn', 'Keep it'); keep.type = 'button'; keep.addEventListener('click', () => { confirmDelete = false; render(); });
      bar.append(sure, keep);
    } else {
      const del = el('button', 'pf-btn is-danger', 'Delete'); del.type = 'button'; del.title = 'Delete the whole profile from this browser';
      del.addEventListener('click', () => { confirmDelete = true; render(); });
      bar.append(del);
    }
    head.append(bar);
    if (!known && !s.active) {
      const chips = el('div', 'pf-chips');
      for (const t of ['interview me', 'I am a nurse', 'I love hiking and jazz', 'call me Andy', 'what do you know about me?']) {
        const c = el('button', 'pf-example', esc(t)); c.type = 'button'; c.addEventListener('click', () => send(t)); chips.append(c);
      }
      head.append(chips);
    }

    // sections
    grid.replaceChildren();
    const fresh = s.focus && s.focus.n !== lastN ? s.focus.key : null;
    lastN = s.focus?.n ?? lastN;
    for (const sec of v.sections) {
      const box = el('section', 'pf-card pf-sec'); box.append(el('h3', '', esc(sec.label)));
      for (const f of sec.fields) {
        const row = el('div', `pf-field${f.skipped ? ' is-skipped' : ''}${fresh === f.id ? ' is-new' : ''}`);
        const lab = el('div', 'pf-label'); lab.append(el('span', '', esc(f.label)));
        const word = WORD[f.id];
        if (f.values.length) {
          const tag = el('span', `pf-tag${f.src === 'guessed' ? ' is-guess' : ''}`, f.src === 'guessed' ? 'guessed' : 'said');
          lab.append(tag);
          row.append(lab);
          const vals = el('div', 'pf-vals');
          for (const x of f.values) vals.append(el('span', `pf-chip${f.src === 'guessed' ? ' is-guess' : ''}`, esc(cap(x))));
          if (f.src === 'guessed') { vals.append(link('confirm?', `confirm my ${word}`)); vals.append(link('not right', `forget my ${word}`, 'is-bad')); }
          else vals.append(link('forget', `forget my ${word}`, 'is-bad'));
          row.append(vals);
          if (f.note) row.append(el('div', 'pf-note', esc(f.note)));
        } else {
          row.append(lab);
          const g = el('div', 'pf-vals');
          g.append(el('span', 'pf-ghost', f.skipped ? 'Skipped. You can still tell me any time.' : `I would like to learn ${esc(f.want)} (for example: ${esc(f.example)})`));
          g.append(link('tell me', `ask me about my ${word}`));
          row.append(g);
        }
        box.append(row);
      }
      grid.append(box);
    }
    // private notes the user asked to remember
    priv.hidden = !(s.sensitive ?? []).length;
    if (!priv.hidden) {
      priv.replaceChildren(el('h3', '', 'Private notes you asked me to remember'));
      for (const n of s.sensitive) priv.append(el('div', '', `${esc(cap(n.cat))}: ${esc(n.text)}`));
    }
  }

  return {
    update(next) {
      state = next && typeof next === 'object' ? next : state;
      if (next) persist(next);
      if (cv) render();
    },
    show() { if (cv) render(); },
    hide() { confirmDelete = false; },
    destroy() { destroyed = true; void ready; },
  };
}

export default { id: 'profile', label: 'Profile', world: WORLD, order: 90, make };
