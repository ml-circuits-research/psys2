// PSys2 browser demo (spec 06 "Webchat", spec 07 §4). Runs C2 entirely in the browser: no server, no LLM.
//
//   import { mountPsys2 } from './app.mjs';
//   const psys2 = await mountPsys2(document.querySelector('#chat'), { tabs: ['robot'], worlds: ['core', 'kids.common'] });
//
// The host renders world state (`reply.state`, `session.state()`) and executes effects from an allow-list.
import { h } from './ui/util.mjs';
import { createAvatar } from './ui/avatar.mjs';
import { createEditor } from './ui/editor.mjs';
import { createTicTacToe, createGuess, createHangman } from './ui/games.mjs';
import { createSpeech, speechSupport, LANG_TAGS } from './ui/speech.mjs';
import { createSwitchTranslator, browserTranslatorKind, browserTranslatorAvailability } from './ui/translation.mjs';
import { renderTrace } from './ui/trace.mjs';

const HERE = new URL('.', import.meta.url);

export const TABS = [
  { id: 'robot', label: 'Avatar', world: 'ui.avatar', make: createAvatar },
  { id: 'editor', label: 'Editor', world: 'docs.editor', make: createEditor },
  { id: 'tictactoe', label: 'Tic-tac-toe', world: 'games.tictactoe', make: createTicTacToe },
  { id: 'guess', label: 'Guess the animal', world: 'games.guess', make: createGuess },
  { id: 'hangman', label: 'Hangman', world: 'games.hangman', make: createHangman },
];
/**
 * Tab plugins (spec 07 §6): every module listed in ui/tabs/index.json (written by scripts/build-webchat.mjs from
 * docs/webchat/ui/tabs/*.mjs) default-exports { id, label, world, order?, make(holder, host) -> { update(state) },
 * effects?: { [effectName]: async (args, { ui, host }) -> { ok, detail?, data? } } }.
 */
async function loadTabPlugins(base) {
  let list = [];
  try { const r = await fetch(new URL('ui/tabs/index.json', base)); if (r.ok) list = await r.json(); } catch { return []; }
  const out = [];
  for (const file of Array.isArray(list) ? list : []) {
    try { const m = await import(new URL(`ui/tabs/${file}`, base).href); if (m.default?.id && m.default?.make) out.push(m.default); }
    catch (e) { console.warn(`tab plugin ${file} failed to load`, e); }
  }
  return out;
}
const SHELL = 'ui.shell';
const EXAMPLES = [
  'Become a person', 'Let’s play tic tac toe', 'Open the editor and start dictation', 'How many legs does a spider have?',
  'Tom has 5 apples. He gives 2 to Ana. How many apples does Tom have?',
];
const DEFAULT_SETTINGS = { language: 'en', formalizer: 'rules', translation: 'auto', speechLang: 'follow', voice: '', rate: 1, handsFree: false, speaker: false, showTrace: false };
const SETTINGS_KEY = 'psys2.webchat.settings';
const ICON = {
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
  hands: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1v-7H5v-1a7 7 0 0 1 14 0v1h-2v7h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.4h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 22 12 3 3.5v6.6l11 1.9-11 1.9v6.6Z"/></svg>',
};
const icon = (name) => { const s = document.createElement('span'); s.className = 'p2-icon'; s.innerHTML = ICON[name]; return s; };
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadSettings(persist) {
  if (!persist) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}

/**
 * Mounts the chat (and the tool tabs) into `element`.
 * options: { baseUrl, worlds: [ids] | undefined, tabs: [tab ids] | undefined ([] = chat only), language, title,
 *            onboarding = true, persist = true, pushToTalk = true, onReply(reply), onState(states) }
 * Returns { engine, session, send(text), applyState(snapshot), settings, destroy() }.
 */
export async function mountPsys2(element, options = {}) {
  const base = new URL(options.baseUrl ?? HERE, document.baseURI);
  if (!document.querySelector('link[data-psys2-css]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: new URL('style.css', base).href, 'data-psys2-css': '' }));
  }
  const settings = { ...loadSettings(options.persist !== false), ...(options.language ? { language: options.language } : {}) };
  const save = () => { if (options.persist !== false) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } };
  const plugins = await loadTabPlugins(base);
  const builtin = TABS.map((t, i) => ({ order: (i + 1) * 10, ...t }));
  const allTabs = [...builtin.filter((t) => !plugins.some((p) => p.id === t.id)), ...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const tabDefs = allTabs.filter((t) => !options.tabs || options.tabs.includes(t.id));
  const states = {};           // world id -> latest state snapshot
  const panelUI = {};          // tab id -> { ui, present }
  let engine = null, session = null, translator = null, speech = null;
  let view = tabDefs[0]?.id ?? null, lastShellTab = null, lastShell = {};
  let busy = 0, chain = Promise.resolve(), interim = '', mic = { listening: false, speaking: false, mode: null };
  let destroyed = false, shellSeen = false;
  const cleanups = [];
  const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); };

  // ---------- DOM ----------
  const root = h('div', { class: 'p2' });   // element is the size container (container queries), root is the grid
  element.classList.add('p2-box');
  element.replaceChildren(root);
  const log = h('div', { class: 'p2-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Conversation', tabindex: '0' });
  const statusEl = h('p', { class: 'p2-status', 'aria-live': 'off' }, 'Loading…');
  const input = h('input', { class: 'p2-text', type: 'text', id: `p2-in-${Math.random().toString(36).slice(2, 7)}`, autocomplete: 'off', enterkeyhint: 'send', placeholder: 'Type a message…', 'aria-label': 'Message' });
  const micBtn = h('button', { class: 'p2-btn p2-mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Speak a message' }, icon('mic'));
  const sendBtn = h('button', { class: 'p2-btn p2-send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
  const langSel = h('select', { class: 'p2-select', 'aria-label': 'Language' }, h('option', { value: 'en' }, 'English'), h('option', { value: 'ro' }, 'Română'));
  const speakerBtn = h('button', { class: 'p2-btn', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Read answers aloud' }, icon('speaker'));
  const handsBtn = h('button', { class: 'p2-btn', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Hands-free mode' }, icon('hands'));
  const gearBtn = h('button', { class: 'p2-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Settings', title: 'Settings' }, icon('gear'));
  const settingsEl = h('div', { class: 'p2-settings', role: 'dialog', 'aria-label': 'Settings', hidden: true });
  const form = h('form', { class: 'p2-form' }, micBtn, input, sendBtn);
  const chat = h('section', { class: 'p2-chat', 'aria-label': 'Chat' },
    h('header', { class: 'p2-head' },
      h('div', { class: 'p2-title' }, h('strong', {}, options.title ?? 'PSys2'), h('span', {}, 'no LLM · runs in your browser')),
      h('div', { class: 'p2-tools' }, langSel, speakerBtn, handsBtn, gearBtn)),
    statusEl, log, form, settingsEl);
  const tabsEl = h('div', { class: 'p2-tabs', role: 'tablist', 'aria-label': 'Tools' });
  const panelsEl = h('div', { class: 'p2-panels' });
  root.append(chat);
  if (tabDefs.length) {
    root.append(h('section', { class: 'p2-pane', 'aria-label': 'Tools' }, tabsEl, panelsEl));
  } else root.classList.add('p2-chat-only');

  const tabBtns = {};
  for (const t of tabDefs) {
    const btn = h('button', { class: 'p2-tab', role: 'tab', type: 'button', id: `p2-tab-${t.id}`, 'aria-controls': `p2-panel-${t.id}`, onclick: () => showTab(t.id) }, t.label);
    const panel = h('div', { class: 'p2-panel', role: 'tabpanel', id: `p2-panel-${t.id}`, 'aria-labelledby': `p2-tab-${t.id}`, tabindex: '0' });
    tabBtns[t.id] = { btn, panel };
    tabsEl.append(btn); panelsEl.append(panel);
  }
  on(tabsEl, 'keydown', (e) => {
    const ids = tabDefs.map((t) => t.id), i = ids.indexOf(view);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1) : null;
    if (next) { e.preventDefault(); showTab(next); tabBtns[next].btn.focus(); }
  });
  function showTab(id) {
    if (!tabBtns[id]) return;
    view = id;
    for (const [k, { btn, panel }] of Object.entries(tabBtns)) {
      const active = k === id;
      btn.setAttribute('aria-selected', String(active)); btn.tabIndex = active ? 0 : -1; panel.hidden = !active;
    }
  }

  // ---------- chat ----------
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function addMessage(who, text, { children, className } = {}) {
    const bubble = h('div', { class: 'p2-bubble' }, text, children);
    const meta = h('div', { class: 'p2-meta' }, h('time', {}, time()));
    const msg = h('div', { class: `p2-msg is-${who}${className ? ` ${className}` : ''}` }, bubble, meta);
    log.append(msg); scrollDown();
    return { msg, bubble, meta };
  }
  function setStatus() {
    const parts = [];
    if (busy) parts.push('Thinking…');
    if (mic.speaking) parts.push('Speaking…');
    else if (mic.listening) parts.push(interim ? `Listening: “${interim}”` : mic.mode === 'ptt' ? 'Listening (hold space)…' : 'Listening…');
    else if (settings.handsFree && speech) parts.push('Hands-free: waiting…');
    statusEl.textContent = parts.join(' · ') || 'Ready';
    statusEl.classList.toggle('is-active', parts.length > 0);
    micBtn.setAttribute('aria-pressed', String(mic.listening && mic.mode === 'once'));
    micBtn.classList.toggle('is-on', mic.listening);
  }
  function note(text) { const m = addMessage('bot', text, { className: 'is-note' }); return m; }

  // ---------- state -> UI ----------
  function applyState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const changed = [];
    for (const [id, st] of Object.entries(snapshot)) { states[id] = st; changed.push(id); }
    for (const t of tabDefs) if (changed.includes(t.world)) panelUI[t.id]?.ui?.update(states[t.world]);
    if (changed.includes(SHELL)) applyShell(states[SHELL]);
    options.onState?.(states, changed);
  }
  function applyShell(sh) {
    if (!sh) return;
    if (!shellSeen) { shellSeen = true; lastShell = { ...sh }; if (sh.activeTab) { lastShellTab = sh.activeTab; showTab(sh.activeTab); } return; } // startup snapshot: do not override saved host settings
    if (sh.activeTab && sh.activeTab !== lastShellTab) { lastShellTab = sh.activeTab; showTab(sh.activeTab); }
    if (sh.speaker !== undefined && sh.speaker !== lastShell.speaker) setSpeaker(!!sh.speaker, false);
    if (sh.handsFree !== undefined && sh.handsFree !== lastShell.handsFree) setHandsFree(!!sh.handsFree, false);
    if (sh.listening === false && lastShell.listening !== false) speech?.stopListening();
    if (typeof sh.rate === 'number' && sh.rate !== lastShell.rate) { settings.rate = sh.rate; save(); renderSettings(); }
    if ((sh.language === 'en' || sh.language === 'ro') && sh.language !== lastShell.language) { settings.language = sh.language; langSel.value = sh.language; save(); renderSettings(); }
    lastShell = { ...sh };
  }

  // ---------- effects (allow-list) ----------
  const toast = (text) => { const t = h('div', { class: 'p2-toast', role: 'status' }, text); chat.append(t); setTimeout(() => t.remove(), 2600); };
  const ALLOW = {
    'speech.say': async ({ text, lang }) => {
      if (!speechSupport.synthesis || !speech) return { ok: false, detail: 'speech synthesis is not supported by this browser' };
      if (!String(text ?? '').trim()) return { ok: false, detail: 'no text' };
      speech.speak(String(text), lang ? { lang: LANG_TAGS[lang] ?? lang } : undefined);
      return { ok: true };
    },
    'clipboard.copy': async ({ text }) => {
      const value = String(text ?? '');
      try { await navigator.clipboard.writeText(value); } catch {
        const ta = h('textarea', { style: 'position:fixed;opacity:0', 'aria-hidden': 'true' }); ta.value = value; document.body.append(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
        if (!ok) return { ok: false, detail: 'the browser refused clipboard access' };
      }
      toast('Copied to the clipboard'); return { ok: true };
    },
    'file.download': async ({ filename, text, content, mime }) => {
      const body = String(text ?? content ?? '');
      if (body.length > 5e6) return { ok: false, detail: 'file too large' };
      const name = String(filename || 'document.txt').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
      const url = URL.createObjectURL(new Blob([body], { type: /^[\w.+-]+\/[\w.+-]+$/.test(mime ?? '') ? mime : 'text/plain' }));
      const a = h('a', { href: url, download: name, hidden: true }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); toast(`Downloaded ${name}`); return { ok: true, detail: name };
    },
    'avatar.animate': async (args) => { robotUI()?.animate?.(args); return { ok: !!robotUI() }; },
    'ui.focus': async ({ target, element: el }) => {
      const t = String(target ?? el ?? 'input');
      if (t === 'input' || t === 'chat') input.focus();
      else if (t === 'mic') micBtn.focus();
      else if (tabBtns[t]) { showTab(t); tabBtns[t].panel.focus(); } else return { ok: false, detail: `unknown focus target "${t}"` };
      return { ok: true };
    },
  };
  /** What tab plugins may use: send a command through the language layer, speak, read/patch world state, load assets. */
  const hostApi = {
    send: (text) => send(String(text)),
    speak: (text) => { if (speech && speechSupport.synthesis) speech.speak(String(text), { lang: speechLangTag() }); },
    state: (worldId) => states[worldId],
    setWorldState: (worldId, patch) => session?.setWorldState?.(worldId, patch),
    asset: (path) => new URL(path, base).href,
    /** Report a later outcome (playback finished, position found) to the world that owns the tab. */
    observe: (effect, { ok = true, detail = '', data = null } = {}, world = null) => observeAndFollow(
      typeof effect === 'object' ? { ok: true, detail: '', data: null, world: null, ...effect } : { effect, ok, detail, data, world }),
    get speaking() { return !!speech?.speaking; },
  };
  // Effects declared by tab plugins: the tab's UI executes them (a chess engine, a synthesizer, a map...).
  for (const t of tabDefs) for (const [name, fn] of Object.entries(t.effects ?? {})) {
    if (!Object.hasOwn(ALLOW, name)) ALLOW[name] = (args) => fn(args, { ui: panelUI[t.id]?.ui, host: hostApi });
  }
  /** Report an observation to the engine and render the world's reaction (vision §8: action -> effect -> observation). */
  async function observeAndFollow(obs, depth = 0) {
    let follow = null;
    try { follow = await session?.observe?.(obs); } catch (e) { console.warn('observe failed', e); }
    if (!follow || typeof follow !== 'object') return [];
    if (follow.state && Object.keys(follow.state).length) applyState(follow.state);
    if (follow.text) {
      addMessage('bot', follow.text);
      if (settings.speaker && speech && speechSupport.synthesis) speech.speak(follow.text, { lang: speechLangTag() });
    }
    return follow.effects?.length && depth < 5 ? runEffects(follow.effects, depth + 1) : [];
  }
  async function runEffects(effects, depth = 0) {
    const out = [];
    for (const raw of Array.isArray(effects) ? effects : []) {
      const name = raw?.name ?? raw?.effect;
      const args = raw?.args ?? raw?.arguments ?? {};
      const rec = { name, args, ok: false, detail: '' };
      const fn = Object.hasOwn(ALLOW, name) ? ALLOW[name] : null;
      let data = null;
      if (!fn) rec.detail = 'not in the host allow-list';
      else {
        try { const r = await fn(args); rec.ok = r?.ok !== false; rec.detail = r?.detail ?? ''; data = r?.data ?? null; } catch (e) { rec.detail = e?.message ?? String(e); }
      }
      out.push(rec);
      out.push(...await observeAndFollow({ effect: name, ok: rec.ok, detail: rec.detail || (rec.ok ? 'executed' : 'failed'), data, world: raw?.world ?? null }, depth));
    }
    return out;
  }

  // ---------- sending ----------
  const robotUI = () => panelUI.robot?.ui;
  function serializeWires(wires) {
    const L = engine.set.legends;
    const shaped = wires.map((w) => ({ ...w, entries: w.entries.map((e) => ({ key: L.shortKey?.(w.type, e.key) ?? e.key, value: e.value })) }));
    return lib.serialize(shaped);
  }
  async function process(text) {
    const user = addMessage('user', text);
    busy++; setStatus();
    const typing = addMessage('bot', h('span', { class: 'p2-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), { className: 'is-typing' });
    typing.msg.removeAttribute('aria-live');
    translator.resetUsage();
    let reply;
    try {
      reply = await session.send(text, { language: settings.language, formalizer: settings.formalizer });
    } catch (e) {
      console.error(e);
      typing.msg.remove(); busy--; setStatus();
      addMessage('bot', `Something went wrong while processing that: ${e?.message ?? e}`, { className: 'is-error' });
      return;
    }
    typing.msg.remove();
    const usage = translator.usage.map((u) => ({ ...u }));
    const answer = (reply.text ?? '').trim() || '(no answer)';
    const botMsg = addMessage('bot', answer);
    if (reply.lang && reply.lang !== 'en') user.meta.prepend(h('span', { class: 'p2-lang' }, `${reply.lang.toUpperCase()} → EN`));

    const avatarChanged = !!reply.state?.['ui.avatar'];
    applyState(reply.state);
    const expressions = reply.statuses ?? [];
    if (!avatarChanged && robotUI()) {
      if (expressions.includes('missing')) robotUI().express('surprised');
      else if (expressions.includes('supported')) robotUI().express('smile');
    }
    if (settings.speaker && speech && speechSupport.synthesis) speech.speak(answer, { lang: speechLangTag() });
    const effects = await runEffects(reply.effects);

    const traceBox = h('div', { class: 'p2-trace-slot', hidden: !settings.showTrace });
    let built = false;
    const toggle = h('button', { class: 'p2-linkbtn', type: 'button', 'aria-expanded': String(!!settings.showTrace) }, 'Trace');
    const build = () => { if (!built) { built = true; traceBox.append(renderTrace(reply, { translation: usage, effects, serializeWires, formalizer: settings.formalizer })); } };
    if (settings.showTrace) build();
    toggle.addEventListener('click', () => { const open = traceBox.hidden; traceBox.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) build(); });
    botMsg.meta.append(toggle);
    botMsg.msg.append(traceBox);
    busy--; setStatus(); scrollDown();
    options.onReply?.(reply);
    return reply;
  }
  const send = (text) => {
    const t = String(text ?? '').trim();
    if (!t || !session) return Promise.resolve(null);
    const run = chain.then(() => process(t));
    chain = run.catch(() => {});
    return run;
  };
  on(form, 'submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; send(t); });

  // ---------- speech ----------
  const speechLangTag = () => (settings.speechLang === 'follow' ? LANG_TAGS[settings.language] ?? 'en-US' : settings.speechLang);
  function setSpeaker(on, fromUser = true) {
    settings.speaker = on; speakerBtn.setAttribute('aria-pressed', String(on)); speakerBtn.classList.toggle('is-on', on);
    if (!on) speech?.stopSpeaking();
    save();
    renderSettings();
  }
  function setHandsFree(on, fromUser = true) {
    if (on && !speechSupport.recognition) return;
    settings.handsFree = on; handsBtn.setAttribute('aria-pressed', String(on)); handsBtn.classList.toggle('is-on', on);
    speech?.setHandsFree(on); save(); setStatus(); renderSettings();
    if (fromUser) session?.setWorldState?.(SHELL, { handsFree: on });
  }
  function disable(btn, why) { btn.disabled = true; btn.title = why; btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')} (unavailable: ${why})`); }
  speech = createSpeech({
    getLang: speechLangTag, getVoiceName: () => settings.voice, getRate: () => settings.rate,
    onFinal: (t) => send(t), onInterim: (t) => { interim = t; setStatus(); },
    onState: (s) => { mic = s; robotUI()?.setSpeaking(s.speaking); setStatus(); },
    onError: (msg) => { note(msg); if (!speech.isListening()) { settings.handsFree = false; handsBtn.setAttribute('aria-pressed', 'false'); handsBtn.classList.remove('is-on'); } },
  });
  if (!speechSupport.recognition) {
    const why = 'Speech recognition is not supported by this browser (try Chrome or Edge)';
    disable(micBtn, why); disable(handsBtn, why);
  }
  if (!speechSupport.synthesis) disable(speakerBtn, 'Speech synthesis is not supported by this browser');
  on(micBtn, 'click', () => { if (mic.listening) speech.stopListening(); else speech.listenOnce(); });
  on(speakerBtn, 'click', () => setSpeaker(!settings.speaker));
  on(handsBtn, 'click', () => setHandsFree(!settings.handsFree));
  on(langSel, 'change', () => { settings.language = langSel.value; save(); renderSettings(); session?.setWorldState?.(SHELL, { language: settings.language }); });
  on(gearBtn, 'click', () => toggleSettings());

  if (options.pushToTalk !== false && speechSupport.recognition) {
    let held = false;
    const ignore = (e) => {
      const t = e.target;
      if (!(t === document.body || element.contains(t))) return true;
      return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName));
    };
    on(document, 'keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || ignore(e)) return;
      e.preventDefault(); held = true; speech.pushToTalkStart();
    });
    on(document, 'keyup', (e) => { if (e.code === 'Space' && held) { held = false; speech.pushToTalkStop(); } });
  }

  // ---------- settings ----------
  let browserAvail = browserTranslatorKind() ? 'checking…' : 'unsupported';
  let encoderOk = false;
  function toggleSettings(force) {
    const open = force ?? settingsEl.hidden;
    settingsEl.hidden = !open; gearBtn.setAttribute('aria-expanded', String(open));
    if (open) { renderSettings(); settingsEl.querySelector('select,input,button')?.focus(); } else gearBtn.focus();
  }
  on(chat, 'keydown', (e) => { if (e.key === 'Escape' && !settingsEl.hidden) toggleSettings(false); });
  function field(label, control, note) {
    const id = `p2-f-${Math.random().toString(36).slice(2, 8)}`;
    control.id = id;
    return h('div', { class: 'p2-field' }, h('label', { for: id }, label), control, note ? h('small', {}, note) : null);
  }
  function select(opts, value, onChange) {
    const s = h('select', { class: 'p2-select' }, opts.map(([v, l, dis]) => h('option', { value: v, disabled: dis || null }, l)));
    s.value = value; s.addEventListener('change', () => onChange(s.value)); return s;
  }
  function check(label, value, onChange, disabledWhy) {
    const c = h('input', { type: 'checkbox', disabled: disabledWhy ? true : null, title: disabledWhy || null });
    c.checked = value; c.addEventListener('change', () => onChange(c.checked));
    return h('label', { class: 'p2-check', title: disabledWhy || null }, c, ' ', label, disabledWhy ? h('small', {}, ` (${disabledWhy})`) : null);
  }
  function renderSettings() {
    if (settingsEl.hidden && settingsEl.childElementCount) return;
    const prevFocus = settingsEl.contains(document.activeElement) ? document.activeElement.id : null;
    const voices = speech?.voices() ?? [];
    const tag = speechLangTag().slice(0, 2);
    const voiceOpts = [['', 'Automatic'], ...voices.filter((v) => v.lang?.startsWith(tag)).map((v) => [v.name, `${v.name} (${v.lang})`])];
    const rateVal = h('output', {}, `${Number(settings.rate).toFixed(1)}×`);
    const rate = h('input', { type: 'range', min: '0.5', max: '1.8', step: '0.1', value: String(settings.rate), disabled: speechSupport.synthesis ? null : true });
    rate.addEventListener('input', () => { settings.rate = Number(rate.value); rateVal.textContent = `${settings.rate.toFixed(1)}×`; save(); });
    settingsEl.replaceChildren(
      h('div', { class: 'p2-settings-head' }, h('strong', {}, 'Settings'), h('button', { class: 'p2-linkbtn', type: 'button', onclick: () => toggleSettings(false) }, 'Close')),
      field('Formalizer', select([['rules', 'Rules (deterministic)'], ['encoder', encoderOk ? 'Encoder' : 'Encoder (not available)', !encoderOk]], settings.formalizer === 'encoder' && !encoderOk ? 'rules' : settings.formalizer,
        (v) => { settings.formalizer = v; applyEngineSettings(); save(); }), 'Worlds the chosen formalizer cannot read fall back to the rules.'),
      field('Translation', select([['auto', 'Automatic'], ['browser-api', 'Browser API'], ['rules', 'Rules']], settings.translation, (v) => { settings.translation = v; save(); renderSettings(); }),
        `Used when the language is not English. Browser on-device translator: ${browserAvail}. Its output is checked and falls back to the rules translator.`),
      field('Speech language', select([['follow', 'Same as language'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ro-RO', 'Română']], settings.speechLang, (v) => { settings.speechLang = v; save(); renderSettings(); })),
      field('Voice', select(voiceOpts, settings.voice, (v) => { settings.voice = v; save(); }), speechSupport.synthesis ? (voices.length ? null : 'Voices are still loading or none are installed.') : 'Speech synthesis is not supported by this browser.'),
      h('div', { class: 'p2-field' }, h('label', {}, 'Speech rate ', rateVal), rate),
      check('Hands-free mode (continuous listening)', settings.handsFree, (v) => setHandsFree(v), speechSupport.recognition ? '' : 'speech recognition is not supported'),
      check('Read answers aloud', settings.speaker, (v) => setSpeaker(v), speechSupport.synthesis ? '' : 'speech synthesis is not supported'),
      check('Show the trace of every answer', settings.showTrace, (v) => { settings.showTrace = v; save(); }),
    );
    if (prevFocus) settingsEl.querySelector(`#${CSS.escape(prevFocus)}`)?.focus();
  }
  function applyEngineSettings() {
    if (!session) return;
    session.formalizer = settings.formalizer;
    if (session.settings && typeof session.settings === 'object') session.settings.formalizer = settings.formalizer;
    session.setOption?.('formalizer', settings.formalizer);
  }
  speech.onVoicesChanged(() => renderSettings());

  // ---------- boot ----------
  langSel.value = settings.language;
  setSpeaker(settings.speaker && speechSupport.synthesis);
  showTab(view);
  renderSettings();
  setStatus();

  let lib;
  try {
    const [dialog, loaders, translate, soplang] = await Promise.all([
      import(new URL('lib/dialog/index.mjs', base).href), import(new URL('lib/loaders/bundle-loader.mjs', base).href),
      import(new URL('lib/translate/index.mjs', base).href), import(new URL('lib/soplang/index.mjs', base).href),
    ]);
    const res = await fetch(new URL('worlds/index.json', base));
    if (!res.ok) throw new Error(`worlds/index.json: HTTP ${res.status}`);
    const bundle = await res.json();
    for (const [id, w] of Object.entries(bundle.worlds)) {
      if (options.worlds && id !== 'core' && !options.worlds.includes(id)) delete bundle.worlds[id];
      else if (w.opsUrl) w.opsUrl = new URL(w.opsUrl, base).href;
    }
    lib = { serialize: soplang.serialize };
    translator = createSwitchTranslator({ rules: translate.createTranslator(), getStrategy: () => settings.translation });
    engine = await dialog.createEngine({ loader: loaders.createBundleLoader(bundle), translator });
    const problems = engine.problems?.() ?? [];
    if (problems.length) console.warn('PSys2 world problems:', problems);
    session = engine.createSession({ language: settings.language });
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Could not start';
    note(`PSys2 could not start: ${e?.message ?? e}. If you opened this page from disk, serve it over HTTP instead; if lib/ or worlds/ are missing, run "npm run build:webchat".`);
    input.disabled = sendBtn.disabled = true;
    return { settings, destroy() {} };
  }
  if (destroyed) return { settings, destroy() {} };

  const loaded = new Set(engine.worlds().map((w) => w.id));
  for (const t of tabDefs) {
    const { panel } = tabBtns[t.id];
    if (loaded.has(t.world) || options.renderAllTabs) { // renderAllTabs: development aid to test the renderers without the worlds
      const holder = h('div', { class: 'p2-tabbody' });
      panel.append(holder);
      panelUI[t.id] = { ui: t.make(holder, hostApi) };
    } else {
      panel.append(h('div', { class: 'p2-placeholder' }, h('h3', {}, `${t.label} is not in this build`),
        h('p', {}, `The world “${t.world}” was not found, so this tab has nothing to show yet. Add the world and run `, h('code', {}, 'npm run build:webchat'), ' again.')));
      tabBtns[t.id].btn.classList.add('is-soon');
    }
  }
  try { applyState(session.state?.()); } catch (e) { console.warn('session.state() failed', e); }
  for (const t of tabDefs) if (panelUI[t.id] && !states[t.world]) panelUI[t.id].ui.update(undefined);
  if (!lastShellTab) showTab(view);
  applyEngineSettings();
  setStatus();

  // optional capabilities, checked once
  const probe = engine.formalizers?.encoder ?? engine.strategies?.encoder ?? engine.formalizerStrategies?.encoder;
  Promise.resolve(probe?.available?.()).then((ok) => { encoderOk = !!ok; renderSettings(); }, () => {});
  if (browserTranslatorKind()) browserTranslatorAvailability('ro', 'en').then((a) => { browserAvail = a; renderSettings(); });
  else browserAvail = 'not supported by this browser';

  if (options.onboarding !== false) {
    const chips = h('div', { class: 'p2-chips-row' }, EXAMPLES.map((ex) => h('button', { class: 'p2-example', type: 'button', onclick: () => { send(ex); input.focus(); } }, ex)));
    addMessage('bot', 'Hi, I am PSys2. I answer with explicit rules and small knowledge worlds, with no language model. You can talk to me or type. Try one of these:', { children: chips, className: 'is-hint' });
  }
  const handle = {
    engine, session, settings, send, applyState, showTab,
    destroy() { destroyed = true; cleanups.forEach((f) => f()); robotUI()?.destroy?.(); speech.destroy(); element.replaceChildren(); element.classList.remove('p2-box'); },
  };
  if (settings.handsFree && speechSupport.recognition) setHandsFree(true, false);
  return handle;
}
