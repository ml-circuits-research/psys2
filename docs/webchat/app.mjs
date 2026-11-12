// SPDX-License-Identifier: AGPL-3.0-only
// PSys2 browser demo (spec 06 "Webchat", spec 07 §4). Runs C2 entirely in the browser: no server, no large language model.
//
//   import { mountPsys2 } from './app.mjs';
//   const psys2 = await mountPsys2(document.querySelector('#chat'), { tabs: ['robot'], worlds: ['core', 'kids.common'] });
//
// The host renders world state (`reply.state`, `session.state()`) and executes effects from an allow-list.
import { h } from './ui/util.mjs';
import { createAvatar } from './ui/avatar.mjs';
import { createEditor } from './ui/editor.mjs';
import { createTicTacToe, createGuess, createHangman } from './ui/games.mjs';
import { createSpeech, createMicLock, measureSpeed, speechSupport } from './ui/speech.mjs';
import { createLanguage, hintText, LANG_TAGS, LANG_NAMES, langName, langTag, tagOf } from './ui/language.mjs';
import { createTranslationLayer, QUALITY_GATE } from './ui/translation-ui.mjs';
import { classifyVoice } from './ui/voice-noise.mjs';
import { createSwitchTranslator, createBrowserBackend, browserTranslatorKind, browserTranslatorAvailability, browserDetectorKind, browserDetectorAvailability } from './ui/translation.mjs';
import { renderTrace } from './ui/trace.mjs';
import { findDispatcherModel, versionLabel } from './ui/dispatcher-host.mjs';
import { findNormalizerModel } from './ui/normalizer-host.mjs';
import { createEngineClient } from './ui/engine-client.mjs';
import { normalizeNxStrategy } from './lib/formalizer/nx.mjs';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from './ui/settings.mjs';
import { guard, TurnAborted, withDeadline } from './lib/formalizer/guard.mjs';
import { LIMITS, TIME_LIMIT_SPECS, TIME_LIMIT_DEFAULTS, applyTimeLimits, clampLimit } from './lib/dialog/time-limits.mjs';
import { CREDITS, ABOUT_SECTIONS, ACCURACY, TAGLINE, GREETING } from './ui/about.mjs';
import { buildRecord, completeRecord, completeStopped, createStore, filterRecords, toJSON, exportFilename, summaryStatus, summaryWorlds, hashState, buildDetail, nextFeedback, voteOf, exportRecord } from './ui/phrase-log.mjs';
import { createFeedback } from './ui/feedback.mjs';

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
  // in parallel (PERF round 2): one round trip, not one per tab
  const mods = await Promise.all((Array.isArray(list) ? list : []).map((file) => import(new URL(`ui/tabs/${file}`, base).href).catch((e) => { console.warn(`tab plugin ${file} failed to load`, e); return null; })));
  return mods.filter((m) => m?.default?.id && m.default?.make).map((m) => m.default);
}
const SHELL = 'ui.shell';
/** Turn lifecycle (spec 06): one message at a time, a hard limit from Enter, every host effect bounded. */
export const TURN_LIMITS = Object.freeze({ watchdogMs: TIME_LIMIT_DEFAULTS.watchdogMs, softFraction: 0.65, backstopMs: 1500, speakPerCharMs: 90 });   // effectMs, speakBaseMs, speakMaxMs live in LIMITS (Settings › Developer › Time limits)
export const TOO_COMPLEX = 'That was too complex for me. Try a shorter sentence.';
export const TOO_LONG = 'That took too long, I stopped it.';
export const SOURCE_URL = 'https://github.com/ml-circuits-research/psys2';
export const BUSY_HINT = 'Wait for the answer or press Stop.';
const EXAMPLES = [
  'Become a person', 'Let’s play tic tac toe', 'Open the editor and start dictation', 'How many legs does a spider have?',
  'Tom has 5 apples. He gives 2 to Ana. How many apples does Tom have?',
];
const ICON = {
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.4h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 22 12 3 3.5v6.6l11 1.9-11 1.9v6.6Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg>',
  die: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6Z"/></svg>',
};
const icon = (name) => { const s = document.createElement('span'); s.className = 'p2-icon'; s.innerHTML = ICON[name]; return s; };
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const NORMALIZER_IDLE_MS = 30000;   // idle time before the normalizer is fetched on a fast link
const QUIET_MS = 500;   // background work (rule compilation, warm-up, model loading) waits this long after a turn
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Start-up milestones for the performance harness: performance.getEntriesByName('psys2:<name>'). */
const mark = (name) => { try { performance.mark(`psys2:${name}`); } catch { /* no User Timing */ } };

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
  applyTimeLimits(settings);
  // LANG-FIXED: ONE language, owned by ui/language.mjs. settings.language mirrors it (saved); nothing else decides how a message is read, answered or heard.
  const language = createLanguage({ initial: settings.language, variant: settings.englishVariant });
  settings.language = language.get();
  const save = () => { if (options.persist !== false) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, handsFree: false })); } catch { /* storage unavailable */ } };
  const plugins = await loadTabPlugins(base);
  const builtin = TABS.map((t, i) => ({ order: (i + 1) * 10, ...t }));
  const allTabs = [...builtin.filter((t) => !plugins.some((p) => p.id === t.id)), ...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const tabDefs = allTabs.filter((t) => !options.tabs || options.tabs.includes(t.id));
  const states = {};           // world id -> latest state snapshot
  const panelUI = {};          // tab id -> { ui, present }
  let engine = null, session = null, translator = null, speech = null, engineClient = null, browserBackend = null;
  const stageLog = [], longTasks = [];   // COMPUTE-BUDGET: host stage transitions and every main-thread task over 200 ms (PerformanceObserver 'longtask')
  const hostStage = (stage, recId = null) => { stageLog.push({ at: performance.now(), stage, recId }); if (stageLog.length > 400) stageLog.splice(0, 200); };
  let view = tabDefs[0]?.id ?? null, lastShellTab = null, lastShell = {};
  const queue = [], micLog = [];   // MIC2: waiting messages { id, text, mode, voice, queuedAt }; the mic click log
  // BUSY: one source of truth. The host is busy while a turn runs (`turn`; the queue of MIC2 only holds waiting messages), while its host effects run (`effectsPending`) and while the answer is spoken (`mic.speaking`).
  // A speech that never ends must not hold the tabs forever: the veil is lifted after a cap that grows with the text (the speech itself goes on).
  let effectsPending = 0, speakCapped = false, speakCapTimer = 0, lastAnswerLen = 0, veiled = false;
  const busyListeners = new Set();
  let lastNU = null;   // the last not-understood voice reply { at, n, el, badge }
  let busy = 0, turn = null, flash = null, flashTimer = null, interim = '', mic = { listening: false, speaking: false, mode: null };
  let destroyed = false, shellSeen = false;
  const phrases = createStore(options.persist !== false ? globalThis.localStorage : null);
  let logFilter = 'all', confirmClear = false;
  const cleanups = [];
  const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); };

  // ---------- DOM ----------
  const root = h('div', { class: 'p2' });   // element is the size container (container queries), root is the grid
  element.classList.add('p2-box');
  element.replaceChildren(root);
  const log = h('div', { class: 'p2-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Conversation', tabindex: '0' });
  const statusEl = h('p', { class: 'p2-status', 'aria-live': 'off' }, 'Loading…');
  const input = h('input', { class: 'p2-text', type: 'text', id: `p2-in-${Math.random().toString(36).slice(2, 7)}`, autocomplete: 'off', enterkeyhint: 'send', placeholder: 'Type a message…', 'aria-label': 'Message' });
  // Every icon button carries a tooltip (title) with the same text as its aria-label, saying what it does and what state it is in (UI1).
  const label = (btn, text) => { if (btn._label === text) return; btn._label = text; btn.setAttribute('aria-label', text); btn.title = text; };   // SOAK-BUSY: no DOM write when nothing changed
  const micBtn = h('button', { class: 'p2-btn p2-mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Speak a message', title: 'Speak a message' }, icon('mic'));
  const ringEl = (() => { const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('class', 'p2-ring'); svg.setAttribute('aria-hidden', 'true'); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '20'); c.setAttribute('cy', '20'); c.setAttribute('r', '18'); svg.append(c); return svg; })();
  const micCount = h('span', { class: 'p2-mic-count', 'aria-hidden': 'true', hidden: true });
  micBtn.append(ringEl, micCount);
  const speakerBtn = h('button', { class: 'p2-btn p2-speaker', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Read answers aloud: off', title: 'Read answers aloud: off' }, icon('speaker'));
  const dieBtn = h('button', { class: 'p2-btn p2-die', type: 'button', 'aria-label': 'Try an example', title: 'Try an example' }, icon('die'));
  const sendBtn = h('button', { class: 'p2-btn p2-send', type: 'submit', 'aria-label': 'Send', title: 'Send' }, icon('send'));
  const queueEl = h('div', { class: 'p2-queue', role: 'list', 'aria-label': 'Waiting messages', hidden: true });   // MIC2: messages that wait for the running turn
  const dictText = h('span', { class: 'p2-dict-text' }, 'Dictating into: Untitled document');
  const dictStop = h('button', { class: 'p2-btn-text p2-dict-stop', type: 'button', 'aria-label': 'Stop dictation', title: 'Stop dictation' }, 'Stop');
  const dictBar = h('div', { class: 'p2-dictbar', role: 'status', hidden: true }, h('i', { class: 'p2-rec', 'aria-hidden': 'true' }), dictText, dictStop);
  const langSel = h('select', { class: 'p2-select', 'aria-label': 'Language' }, h('option', { value: 'en' }, 'English'), h('option', { value: 'ro' }, 'Română'));
  // MT-SERIOUS: the translation layer (browser Translator, else the on-device model downloaded lazily when a language is selected); the selector lists what it supports
  const tl = createTranslationLayer({ base, h, note: (t) => note(t), onChange: () => { renderLangSelect(); renderSettings(); } });
  globalThis.__psys2Tl = tl;   // diagnostics and the phone tests
  function renderLangSelect() {
    const cur = language.get(), list = tl.listed();
    if (!list.some((l) => l.code === cur)) list.push({ code: cur, name: langName(cur, { own: true }) });
    const sig = list.map((l) => l.code).join(',') + '|' + cur;
    if (langSel.dataset.sig === sig) return;
    langSel.dataset.sig = sig;
    langSel.replaceChildren(...list.map((l) => h('option', { value: l.code }, l.name)));
    langSel.value = cur;
  }
  const gearBtn = h('button', { class: 'p2-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Settings', title: 'Settings' }, icon('gear'));
  // Settings: a full-screen modal over the whole widget (SET). Built once; renderSettings() fills the active tab.
  const setClose = h('button', { class: 'p2-btn p2-modal-close', type: 'button', 'aria-label': 'Close settings', title: 'Close settings' }, icon('close'));
  const setTabsEl = h('div', { class: 'p2-modal-tabs', role: 'tablist', 'aria-label': 'Settings topics' });
  const setBody = h('div', { class: 'p2-modal-body', role: 'tabpanel', id: 'p2-set-panel', tabindex: '0' });
  const settingsEl = h('div', { class: 'p2-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'p2-set-title', hidden: true },
    h('div', { class: 'p2-modal-head' }, h('h2', { class: 'p2-modal-title', id: 'p2-set-title' }, 'Settings'), setClose), setTabsEl, setBody);
  const form = h('form', { class: 'p2-form' }, micBtn, speakerBtn, input, dieBtn, sendBtn);
  const chat = h('section', { class: 'p2-chat', 'aria-label': 'Chat' },
    h('header', { class: 'p2-head' },
      h('div', { class: 'p2-title' }, h('strong', {}, options.title ?? 'PSys2'), h('span', {}, TAGLINE)),
      h('div', { class: 'p2-tools' }, langSel, gearBtn)),
    statusEl, tl.banner, log, queueEl, dictBar, form,
    h('footer', { class: 'p2-foot' }, h('a', { href: SOURCE_URL, target: '_blank', rel: 'noopener', 'data-source-link': 'footer' }, 'Source code (AGPL-3.0)')));
  const tabsEl = h('div', { class: 'p2-tabs', role: 'tablist', 'aria-label': 'Tools' });
  const panelsEl = h('div', { class: 'p2-panels' });
  root.append(chat);
  // DBG: in developer mode a thin header row under the tab strip carries the Debug button of the tab that is open (one button per tab: it follows the selected tab)
  const dbgBtn = h('button', { class: 'p2-btn-text p2-dbg-open', type: 'button', id: 'p2-dbg-open', 'aria-haspopup': 'dialog' }, h('span', { class: 'p2-dbg-ico', 'aria-hidden': 'true' }, '🐞'), ' Debug');
  const dbgRow = h('div', { class: 'p2-dbgrow', hidden: true }, dbgBtn);
  const paneEl = tabDefs.length ? h('section', { class: 'p2-pane', 'aria-label': 'Tools' }, tabsEl, dbgRow, panelsEl) : null;
  if (paneEl) root.append(paneEl); else root.classList.add('p2-chat-only');
  const modalHost = h('div', { class: 'p2 p2-modal-host' }, settingsEl);   // in <body>, so that "full screen" is the viewport even when the page stacks the chat and the tools
  document.body.append(modalHost);

  const tabBtns = {};
  const VIEW_TABS = new Set(['map', 'diagram', 'charts']);   // pan / zoom / scroll stay usable while the host is busy
  for (const t of tabDefs) {
    const btn = h('button', { class: 'p2-tab', role: 'tab', type: 'button', id: `p2-tab-${t.id}`, 'aria-controls': `p2-panel-${t.id}`, onclick: () => userTab(t.id) }, t.label);
    const panel = h('div', { class: 'p2-panel', role: 'tabpanel', id: `p2-panel-${t.id}`, 'aria-labelledby': `p2-tab-${t.id}`, tabindex: '0' });
    tabBtns[t.id] = { btn, panel };
    tabsEl.append(btn); panelsEl.append(panel);
  }
  on(tabsEl, 'keydown', (e) => {
    const ids = tabDefs.map((t) => t.id), i = ids.indexOf(view);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1) : null;
    if (next) { e.preventDefault(); userTab(next); tabBtns[next].btn.focus(); }
  });
  /** The user opened a tab (click or arrow keys): the dialog engine must know it too (routing tier T, tab-bound questions), RP5b. */
  function userTab(id) {
    showTab(id);
    if (tabBtns[id] && lastShellTab !== id) { lastShellTab = id; session?.setWorldState?.(SHELL, { activeTab: id }); }
  }
  function showTab(id) {
    if (!tabBtns[id]) return;
    view = id;
    for (const [k, { btn, panel }] of Object.entries(tabBtns)) {
      const active = k === id, ui = panelUI[k]?.ui;
      if (!active && !panel.hidden) ui?.hide?.(); // before hiding: lets a tab stop drawing into a zero-size box
      btn.setAttribute('aria-selected', String(active)); btn.tabIndex = active ? 0 : -1; panel.hidden = !active;
      if (active) ui?.show?.();
    }
    syncDebugButton();
  }

  // ---------- chat ----------
  let scrollQueued = false;
  function scrollDown() { if (scrollQueued) return; scrollQueued = true; const go = () => { scrollQueued = false; log.scrollTop = log.scrollHeight; }; (typeof requestAnimationFrame === 'function' && document.visibilityState !== 'hidden') ? requestAnimationFrame(go) : go(); }   // one forced layout per frame, not one per message
  function addMessage(who, text, { children, className } = {}) {
    const bubble = h('div', { class: 'p2-bubble' }, text, children);
    const meta = h('div', { class: 'p2-meta' }, h('time', {}, time()));
    const msg = h('div', { class: `p2-msg is-${who}${className ? ` ${className}` : ''}` }, bubble, meta);
    log.append(msg); scrollDown();
    return { msg, bubble, meta };
  }
  let dispatcherStatus = { state: 'idle', message: '' };   // Encoder formalizer (lazy model load)
  let dispatcherEnc = null;
  let dispatcherVersion = null;   // meta.json `version` block of the published model
  let dispatcherLabel = '';       // 'v<date> <sha8>'
  let modelSource = null;         // 'cache' | 'network' (where the loaded model came from)
  let normalizerHost = null;      // phrasing normalizer (seq2seq fallback, spec 03 section 7.11); null when this build ships no model
  const normalizerText = () => (normalizerHost ? `model ${normalizerHost.label}, ${normalizerHost.meta.model}, int8 ${Math.round(Object.values(normalizerHost.meta.sizes_MB ?? {}).reduce((a, b) => a + b, 0))} MB; status: ${{ idle: 'not loaded yet', loading: `loading, ${normalizerHost.status.message}`, ready: `ready (${normalizerHost.status.source === 'cache' ? 'from the cache' : 'downloaded'}, ${Math.round((normalizerHost.status.ms ?? 0) / 100) / 10} s)`, error: `not available (${normalizerHost.status.message})` }[normalizerHost.status.state]}` : 'this build has no normalizer model');
  let encoderChecked = false;     // the page looked for the model (until then the Encoder option reads 'checking')
  let encoderNoticed = false;
  function encoderFailed(message) {   // model did not load (network, missing file, wasm): rules take over, one line in the chat
    if (encoderNoticed) return;
    encoderNoticed = true;
    note(`The Encoder model could not be loaded (${String(message).slice(0, 120)}); using the rules instead.`);
    if (!settingsEl.hidden) renderSettings();
  }
  /** The Send button is the Stop button while a turn runs (type 'button' then, so that Enter, which submits the form, never presses Stop). */
  const isBusy = () => !!turn || effectsPending > 0 || (!!mic.speaking && !speakCapped);
  /** Veils every tab while the host is busy (grey layer, aria-busy, inert, spinner in the header); notifies subscribers on a change. */
  function updateBusy() {
    speech?.setWorking(isBusy());   // MOBILE-VOICE: the microphone pauses from the send until the turn, its effects and the spoken answer have finished
    const b = (!!turn && turn.mode !== 'voice') || effectsPending > 0 || (!!mic.speaking && !speakCapped);   // a voice turn does not veil the tabs while it only thinks (noise must show no busy indicators)
    if (b === veiled) return;
    veiled = b;
    for (const [id, { btn, panel }] of Object.entries(tabBtns)) {
      panel.classList.toggle('is-busy', b); btn.classList.toggle('is-busy', b);
      if (b) panel.setAttribute('aria-busy', 'true'); else panel.removeAttribute('aria-busy');
      // maps, diagrams and charts keep pan/zoom/scroll (view-only), so they are not inert: CSS disables their controls instead
      panel.inert = b && !VIEW_TABS.has(id);
    }
    root.classList.toggle('is-busy', b);
    for (const fn of [...busyListeners]) { try { fn(b); } catch (e) { console.warn('busy listener failed', e); } }
  }
  function syncSendButton() {
    const stop = !!turn || (isBusy() && !input.value.trim());
    if (sendBtn._stop === stop) return;   // the icon is rebuilt only when it changes
    sendBtn._stop = stop;
    sendBtn.type = stop ? 'button' : 'submit';
    sendBtn.classList.toggle('is-stop', stop);
    label(sendBtn, stop ? 'Stop' : 'Send');
    sendBtn.replaceChildren(icon(stop ? 'stop' : 'send'));
  }
  /** A short hint in the status line (for example "Wait for the answer or press Stop." on Enter during a turn). */
  function flashHint(msg) {
    flash = msg; setStatus();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash = null; setStatus(); }, 3000);
  }
  let ringGen = 0;
  function setStatus() {
    const parts = [];
    if (flash) parts.push(flash);
    if (busy) parts.push('Thinking…');
    if (dispatcherStatus.state === 'loading') parts.push(`Model loading… ${dispatcherStatus.message} (rules answer meanwhile)`);
    if (mic.speaking) parts.push('Speaking…');
    else if (mic.listening) parts.push(interim ? `Listening: “${interim}”` : mic.mode === 'ptt' ? 'Listening (hold space)…' : 'Listening…');
    else if (mic.paused) parts.push('Microphone paused — tap to resume');
    else if (settings.handsFree && mic.working && !mic.speaking) parts.push('Working… (microphone paused)');
    else if (settings.handsFree && speech) parts.push('Microphone on: waiting…');
    const modelTail = !parts.length && dispatcherStatus.state === 'ready' ? ` · model ${dispatcherLabel}${modelSource === 'cache' ? ' (cached)' : ''}` : '';
    const statusText = (parts.join(' · ') || 'Ready') + modelTail;
    if (statusEl._text !== statusText) { statusEl._text = statusText; statusEl.textContent = statusText; }
    statusEl.classList.toggle('is-active', parts.length > 0);
    syncSendButton();
    syncMic();
    updateBusy();
  }
  /** The microphone's label, tooltip and look follow its state: idle, listening once, hands-free (keeps listening), dictating. */
  function syncMic() {
    if (micBtn.disabled) return;
    const dict = dictDoc !== null;
    const paused = !!mic.paused, q = queue.length ? `; ${queue.length} message${queue.length > 1 ? 's' : ''} waiting` : '';
    const state = paused ? `Microphone paused — tap to resume (${mic.paused.reason})`
      : settings.handsFree && mic.working && !mic.speaking ? 'Microphone on, working… it listens again when I have answered. Click to turn it off'
      : settings.handsFree && mic.hidden ? 'Microphone paused while this tab is hidden'
      : settings.handsFree ? `Microphone on, ${mic.starting ? 'starting…' : mic.listening ? 'listening' : mic.speaking ? 'waiting while I speak (click to talk now)' : 'restarting…'}. Say "stop microphone" or click to turn it off${q}`
      : mic.starting ? 'Microphone starting…; click to cancel'
      : mic.listening ? 'Microphone: listening to one message; click to stop'
      : settings.keepListening === false ? 'Microphone off: click to speak one message' : 'Microphone off: click to turn it on; it keeps listening until you say "stop microphone" or click again';
    label(micBtn, dict ? `${state}. Dictating into: ${dictDoc}` : (settings.handsFree || paused ? state : `${state}${q}`));
    const pressed = String(!!settings.handsFree || mic.listening);
    if (micBtn.getAttribute('aria-pressed') !== pressed) micBtn.setAttribute('aria-pressed', pressed);
    micBtn.classList.toggle('is-on', mic.listening);
    micBtn.classList.toggle('is-paused', paused);
    micBtn.dataset.mic = paused ? 'paused' : mic.starting ? 'starting' : settings.handsFree && mic.working && !mic.speaking ? 'working' : settings.handsFree ? (mic.listening ? 'listening' : 'waiting') : mic.listening ? 'once' : 'off';
    micBtn.classList.toggle('is-starting', !!mic.starting && !paused);
    micBtn.classList.toggle('is-handsfree', !!settings.handsFree);
    micBtn.classList.toggle('is-dictating', dict);
  }
  /** "Dictating into: <document>" with a Stop control, above the input, while the editor world is in dictation mode (UI1). */
  let dictDoc = null;
  function syncDictation() {
    const ed = states['docs.editor'];
    dictDoc = ed?.inputMode === 'dictation' ? (ed.title || 'Untitled document') : null;
    dictBar.hidden = dictDoc === null;
    form.classList.toggle('is-dictating', dictDoc !== null);
    if (dictDoc !== null) dictText.textContent = `Dictating into: ${dictDoc}`;
    syncMic();
  }
  on(dictStop, 'click', () => send('stop dictation', 'chip'));
  function note(text) { const m = addMessage('bot', text, { className: 'is-note' }); return m; }

  // ---------- state -> UI ----------
  function applyState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const changed = [];
    for (const [id, st] of Object.entries(snapshot)) { states[id] = st; changed.push(id); }
    for (const t of tabDefs) if (changed.includes(t.world)) panelUI[t.id]?.ui?.update(states[t.world]);
    if (changed.includes(SHELL)) applyShell(states[SHELL]);
    if (changed.includes('docs.editor')) syncDictation();
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
    lastShell = { ...sh };
  }

  // ---------- effects (allow-list) ----------
  const toast = (text) => { const t = h('div', { class: 'p2-toast', role: 'status' }, text); chat.append(t); setTimeout(() => t.remove(), 2600); };
  let currentBot = null; // the bot message of the reply being processed (chat.suggest adds chips to it)
  const ALLOW = {
    'speech.say': async ({ text, lang }) => {
      if (!speechSupport.synthesis || !speech) return { ok: false, detail: 'speech synthesis is not supported by this browser' };
      if (!String(text ?? '').trim()) return { ok: false, detail: 'no text' };
      speech.speak(String(text), lang ? { lang: langTag(lang) } : undefined);
      return { ok: true };
    },
    'chat.suggest': async ({ items }) => {
      const list = (Array.isArray(items) ? items : []).slice(0, 5).map(String).filter(Boolean);
      if (!list.length || !currentBot) return { ok: false, detail: 'nothing to suggest' };
      currentBot.bubble.append(h('div', { class: 'p2-chips-row' }, list.map((ex) => h('button', { class: 'p2-example', type: 'button', onclick: () => { send(ex, 'chip'); input.focus(); } }, ex))));
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
    'phraselog': async ({ what }) => {
      if (what === 'show') { openSettings('phrases'); return { ok: true }; }
      if (what === 'export') { const n = exportPhrases(); return n ? { ok: true } : { ok: false, detail: 'there are no phrases to export' }; }
      if (what === 'count') {
        if (!settings.logPhrases && !phrases.all().length) note('The phrase log is switched off, so I have not kept any phrases.');
        else { const all = phrases.all(), n = all.filter((r) => r.source !== 'chip').length; note(`You have said ${n} ${n === 1 ? 'phrase' : 'phrases'} so far (${filterRecords(all, 'voice').length} by voice).`); }
        return { ok: true };
      }
      return { ok: false, detail: `unknown phrase log command "${what}"` };
    },
    'settings': async ({ action, tab }) => { if (action === 'close') closeSettings(); else openSettings(tab); return { ok: true }; },
    'avatar.animate': async (args) => { robotUI()?.animate?.(args); return { ok: !!robotUI() }; },
    'chat.surprise': async () => {   // the voice equivalent of the die button; waits for the current turn (the one that carries this effect) to end
      let tries = 0;
      const fire = () => { if (turn && tries++ < 100) setTimeout(fire, 30); else if (!turn) dieBtn.click(); };   // not awaited: the effect must not hold its own turn
      setTimeout(fire, 0);
      return { ok: true };
    },
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
    send: (text) => send(String(text), 'chip'),   // ignored (with a hint) while a turn runs
    speak: (text) => { if (speech && speechSupport.synthesis) speech.speak(String(text), { lang: speechLangTag() }); },
    state: (worldId) => states[worldId],
    setWorldState: (worldId, patch) => session?.setWorldState?.(worldId, patch),
    asset: (path) => new URL(path, base).href,
    /** Report a later outcome (playback finished, position found) to the world that owns the tab. */
    observe: (effect, { ok = true, detail = '', data = null } = {}, world = null) => observeAndFollow(
      typeof effect === 'object' ? { ok: true, detail: '', data: null, world: null, ...effect } : { effect, ok, detail, data, world }),
    get speaking() { return !!speech?.speaking; },
    /** BUSY: true while a turn, its host effects or the spoken answer run. Tabs ignore input then (the host also veils them). */
    isBusy,
    /** Subscribe to busy changes: fn(busy). Returns the unsubscribe function. */
    onBusy: (fn) => { busyListeners.add(fn); return () => busyListeners.delete(fn); },
  };
  // Effects declared by tab plugins: the tab's UI executes them (a chess engine, a synthesizer, a map...).
  for (const t of tabDefs) for (const [name, fn] of Object.entries(t.effects ?? {})) {
    if (!Object.hasOwn(ALLOW, name)) ALLOW[name] = (args, signal) => fn(args, { ui: panelUI[t.id]?.ui, host: hostApi, signal });
  }
  /** Report an observation to the engine and render the world's reaction (vision §8: action -> effect -> observation). */
  async function observeAndFollow(obs, depth = 0) {
    let follow = null;
    try { follow = await session?.observe?.(obs); } catch (e) { console.warn('observe failed', e); }
    if (turn?.ctl.signal.aborted) return [];
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
        // every host effect is bounded: a promise that never settles (a map position, a model, a tab) must not hold the turn
        effectsPending++; updateBusy();
        try { const r = await withDeadline(Promise.resolve().then(() => fn(args, turn?.ctl.signal ?? null)), LIMITS.effectMs, { signal: turn?.ctl.signal ?? null, label: `effect ${name}` }); rec.ok = r?.ok !== false; rec.detail = r?.detail ?? ''; data = r?.data ?? null; } catch (e) { if (e instanceof TurnAborted) throw e; rec.detail = e?.message ?? String(e); } finally { effectsPending = Math.max(0, effectsPending - 1); updateBusy(); }
      }
      out.push(rec);
      out.push(...await observeAndFollow({ effect: name, ok: rec.ok, detail: rec.detail || (rec.ok ? 'executed' : 'failed'), data, world: raw?.world ?? null }, depth));
    }
    return out;
  }

  // ---------- sending ----------
  const robotUI = () => panelUI.robot?.ui;
  function serializeWires(wires) {
    const shaped = wires.map((w) => ({ ...w, entries: w.entries.map((e, i) => ({ key: w.sk?.[i] ?? e.key, value: e.value })) }));   // the engine worker adds `sk` (short keys): the legends stay there
    return lib.serialize(shaped);
  }
  /** Background work (rule compilation, warm-up) steps aside while a turn runs: the person's message always comes first (PERF round 3). */
  let lastTurnEnd = 0;
  const userFirst = async () => { while ((turn || performance.now() - lastTurnEnd < QUIET_MS) && !destroyed) await sleep(50); };   // a short quiet period after a turn: a long synchronous chunk must not start right behind an answer
  const fmtDur = (ms) => (ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);
  /** Resolves after the browser painted the current DOM (so the typed message and the thinking bubble show before the heavy work blocks the thread). */
  const afterPaint = () => new Promise((r) => { const t = setTimeout(r, 60); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 0)); });
  /**
   * One turn (spec 06 "Turn lifecycle"). Exactly one runs at a time (`turn`). It ends in one of three ways, always: an answer, "Stopped." (Stop
   * button, AbortSignal through the whole pipeline) or the watchdog answer (hard limit from Enter). Stop and the watchdog put the session back to
   * the snapshot taken before the message, so the message leaves no trace in the worlds.
   */
  /** The avatar's idle SVG animations (DiceBear styles animate inner SVG nodes: main-thread repaint every frame, ~60 ms/s at 4x CPU) rest while a turn runs and 3 s after it. */
  let restTimer = 0;
  function restAvatar(on) { clearTimeout(restTimer); if (on) root.classList.add('p2-rest'); else restTimer = setTimeout(() => root.classList.remove('p2-rest'), 3000); }
  async function process(text, mode = 'typed', user = null, recId = null, tPress = performance.now()) {
    user ??= addMessage('user', text);
    const ctl = new AbortController();
    const tn = turn = { ctl, t0: tPress, text, reason: null, undo: null, mode, recId, killsBefore: engineClient?.stats.kills.length ?? 0 };
    busy++; setStatus();
    restAvatar(true);
    const thinkingLabel = h('span', { class: 'p2-thinking-label' }, 'thinking… 0.0 s');
    const typing = addMessage('bot', h('span', { class: 'p2-thinking' }, h('span', { class: 'p2-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), thinkingLabel), { className: 'is-typing' });
    typing.msg.removeAttribute('aria-live');
    translator.resetUsage();
    hostStage('thinking', recId);
    let ticker = 0, watchdog = 0, backstopTimer = null, tStart = tPress;
    const limit = options.watchdogMs ?? LIMITS.watchdogMs;   // live: Settings › Developer › Time limits
    let reply = null;
    try {
    if (engineClient?.restarting || engineClient?.down) {   // a replacement engine worker is starting: show "restarting…", this message waits (later ones queue behind the turn); the turn clock starts when the worker is ready
      thinkingLabel.textContent = 'restarting…';
      hostStage('restarting', recId);
      const stopped = new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(new TurnAborted(tn.reason ?? 'stopped', 'restart')), { once: true }));
      stopped.catch(() => {});
      try { await Promise.race([engineClient.settled(), stopped]); } catch (e) { if (e instanceof TurnAborted) throw e; throw Object.assign(new Error(e?.message ?? 'the engine is down'), { name: 'EngineDown', reason: e?.reason ?? 'down' }); }
      hostStage('thinking', recId);
      tPress = performance.now(); tn.t0 = tPress; tStart = tPress;
    }
    {   // MT-SERIOUS: a message in a language whose on-device translation model is still downloading waits for it (visible, stoppable); the turn clock starts after
      const wl = language.get();
      if (wl !== 'en') {
        await tl.init().catch(() => {});
        if (tl.needsModel(wl) && tl.host?.state(wl).phase !== 'ready') {
          const label = () => { const st = tl.host.state(wl); thinkingLabel.textContent = st.phase === 'downloading' ? `downloading the ${langName(wl)} translation model (${Math.max(1, Math.round(st.total / 1e6))} MB)… ${st.total ? Math.round((100 * st.done) / st.total) : 0}%` : `loading the ${langName(wl)} translation model…`; };
          label();
          const poll = setInterval(label, 300);
          let r = null;
          try { r = await tl.whenReady(wl, { signal: ctl.signal }); } catch (e) { clearInterval(poll); throw new TurnAborted(tn.reason ?? 'stopped', 'download'); }
          clearInterval(poll);
          if (r && !r.ok) note(`The ${langName(wl)} translation model is not ready (${r.error}). I answer with what I have.`);
          tPress = performance.now(); tn.t0 = tPress; tStart = tPress;
        }
      }
    }
    ticker = setInterval(() => { thinkingLabel.textContent = `thinking… ${((performance.now() - tStart) / 1000).toFixed(1)} s`; }, 100);
    watchdog = setTimeout(() => { tn.reason ??= 'timeout'; ctl.abort(new DOMException('turn time limit', 'TimeoutError')); }, Math.max(0, limit - (performance.now() - tPress)));
    const backstop = new Promise((_, rej) => { backstopTimer = setTimeout(() => rej(new TurnAborted('timeout', 'host')), Math.max(0, limit + TURN_LIMITS.backstopMs - (performance.now() - tPress))); });
    backstop.catch(() => {});
      reply = await Promise.race([runTurn(tn, text, mode, user, recId, typing, ticker, tStart, limit), backstop]);
    } catch (e) {
      if (e?.name === 'EngineDown') {   // the engine could not (re)start: a distinct, visible error (not "too long"), logged
        typing.msg.remove();
        recordPhrase(text, mode, null, recId, { engineDown: { reason: e.reason ?? 'down', message: e.message, at: new Date().toISOString(), starts: engineClient?.stats.starts ?? null, startTimeouts: engineClient?.stats.startTimeouts ?? null } });
        console.warn('engine down', e.message);
        addMessage('bot', 'The engine could not restart. Please reload the page.', { className: 'is-error' }).msg.dataset.engineDown = e.reason ?? 'down';
        if (dbg) { try { dbg.record({ text, mode, tab: view, outcome: 'engineDown', stage: 'restart', ms: Math.round(performance.now() - tPress), recId, endType: voiceEnd(recId) }); } catch { /* ignore */ } }
      } else if (e instanceof TurnAborted || ctl.signal.aborted) endAborted(tn, e, { text, mode, recId, typing, ticker, tStart });
      else if (e?.name === 'BudgetExceeded') {
        typing.msg.remove();
        recordPhrase(text, mode, null, recId);
        addMessage('bot', TOO_COMPLEX, { className: 'is-stopped' });
        const d = runawayNotice('budgetExceeded', { text, stage: engineClient?.stage ?? null, site: e.site, ticks: e.ticks, bySite: e.bySite ?? null, ms: Math.round(performance.now() - tStart), recId, tStart });
        if (dbg) { try { dbg.record({ text, mode, tab: view, outcome: 'budgetExceeded', stage: engineClient?.stage ?? null, ms: Math.round(performance.now() - tStart), recId, runaway: d, endType: voiceEnd(recId) }); } catch { /* ignore */ } }
      } else {
        console.error(e);
        recordPhrase(text, mode, null, recId);
        typing.msg.remove();
        addMessage('bot', `Something went wrong while processing that: ${e?.message ?? e}`, { className: 'is-error' });
      }
    } finally {
      clearTimeout(watchdog); clearTimeout(backstopTimer); clearInterval(ticker);
      if (typing.msg.isConnected) typing.msg.remove();
      if (turn === tn) { turn = null; lastTurnEnd = performance.now(); hostStage('idle'); restAvatar(false); }
      effectsPending = 0;
      busy = Math.max(0, busy - 1); setStatus(); scrollDown();
      queueMicrotask(() => { if (!turn && !destroyed) drainQueue(); });   // the next waiting message runs now
    }
    return reply;
  }
  /**
   * A runaway computation was stopped (the watchdog killed the engine worker, or the step budget ran out): a small developer-readable notice in the chat with
   * the details copyable, and the full record in the phrase log (`watchdog` | `budgetExceeded`, in the export), the debug view and the console.
   */
  function runawayNotice(kind, { text, stage, site = null, ticks = null, bySite = null, ms, recId, tStart }) {
    const st = engineClient?.stats;
    const details = { kind, time: new Date().toISOString(), input: text, tab: view, stage, site, ticks, bySite, ms, workerStarts: st?.starts ?? null, workerKills: st?.kills?.length ?? 0, longTasks: longTasks.filter((t) => Date.parse(t.at) >= Date.now() - (performance.now() - tStart) - 50).slice(-10) };
    console.warn('runaway computation stopped', details);
    setTimeout(() => { const k = engineClient?.stats; if (recId && k) { try { phrases.update(recId, (r) => (r[kind] ? { [kind]: { ...r[kind], workerStarts: k.starts, workerKills: k.kills.length, killStage: k.kills.at(-1)?.stage ?? null } } : {})); } catch { /* ignore */ } } }, 800);   // the kill follows the grace period: complete the record afterwards
    if (recId) { try { phrases.update(recId, (r) => ({ [kind]: { ...(r[kind] ?? {}), ...details } })); } catch { /* ignore */ } }   // merged with the engine's own record (site, limit, table, stack)
    const where = kind === 'budgetExceeded' ? `site ${site ?? '?'}${ticks != null ? `, ${ticks} ticks` : ''}` : `stage ${stage ?? '?'}`;
    const copy = h('button', { class: 'p2-linkbtn', type: 'button' }, 'copy details');
    copy.addEventListener('click', () => { ALLOW['clipboard.copy']({ text: JSON.stringify(details, null, 1) }); toast('Details copied'); });
    const note = addMessage('bot', h('span', {}, `Stopped a runaway computation in ${where} after ${fmtDur(ms)}. `, copy), { className: 'is-hint is-runaway' });
    note.msg.dataset.runaway = kind;
    return details;
  }
  /** The turn ended without an answer: Stop or the watchdog. Restores the session and tells the person. */
  function endAborted(tn, e, { text, mode, recId, typing, ticker, tStart }) {
    clearInterval(ticker);
    typing.msg.remove();
    const reason = tn.reason ?? e?.reason ?? 'timeout';
    const stage = e?.stage ?? guard.trippedStage ?? engineClient?.stage ?? 'unknown';
    const ms = Math.round(performance.now() - tStart);
    console.warn('turn stopped', { reason, stage, ms, text, tab: view });   // COMPUTE-BUDGET: stage and input of every stopped turn
    hostStage('idle');
    try { if (tn.undo) session.restore(tn.undo); applyState(session.state?.()); } catch (err) { console.warn('restore after abort failed', err); }
    if (recId) {
      try { phrases.update(recId, (r) => completeStopped(r, { reason, stage, ms })); if (!settingsEl.hidden) renderPhraseLog(); } catch (err) { console.warn('phrase log failed', err); }
    }
    if (dbg) { try { dbg.record({ text, mode, tab: view, outcome: reason, stage, ms, recId, stateBefore: tn.stateBefore ?? null, stateAfter: null, endType: voiceEnd(recId) }); } catch (err) { console.warn('debug record failed', err); } }
    const msg = addMessage('bot', reason === 'stopped' ? 'Stopped.' : TOO_LONG, { className: 'is-stopped' });
    const info = h('div', { class: 'p2-trace-slot', hidden: !settings.showTrace }, h('pre', { class: 'p2-trace' }, `Turn ${reason === 'stopped' ? 'stopped by the user' : 'stopped by the time limit'} after ${fmtDur(ms)} in stage "${stage}"; the session was restored to the state before this message.`));
    const toggle = h('button', { class: 'p2-linkbtn', type: 'button', 'aria-expanded': String(!!settings.showTrace) }, 'Trace');
    toggle.addEventListener('click', () => { const open = info.hidden; info.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });
    msg.meta.append(toggle); msg.msg.append(info);
    const killed = (engineClient?.stats.kills.length ?? 0) > (tn.killsBefore ?? 0);
    if (reason === 'timeout' || killed) { const d = runawayNotice('watchdog', { text, stage, ms, recId, tStart }); if (dbg) { try { dbg.record({ text, mode, tab: view, outcome: 'watchdog', stage, ms, recId, runaway: d, endType: voiceEnd(recId) }); } catch { /* ignore */ } } }
    (globalThis.__psys2Perf ??= []).push({ text, stopped: reason, stage, totalMs: ms });
    options.onStopped?.({ text, reason, stage, ms });
  }
  async function runTurn(tn, text, mode, user, recId, typing, ticker, tStart, limit) {
    await afterPaint();
    if (tn.ctl.signal.aborted) throw new TurnAborted(tn.reason ?? 'stopped', 'start');
    tn.undo = session.snapshot?.() ?? null;
    const remaining = Math.max(1, limit - (performance.now() - tStart));
    try { tn.stateBefore = dbg ? dbg.beforeTurn() : hashState(session.state?.() ?? null); } catch { tn.stateBefore = null; }   // FB: the state hash before the turn, stored with the record
    let reply;
    const sentLang = language.get();   // LANG-FIXED: the language this turn was read in
    try {
      reply = await withDeadline(session.send(text, { mode: mode === 'voice' ? 'voice' : undefined, language: sentLang, formalizer: settings.formalizer, spell: settings.spellcheck !== false, partial: settings.partialUnderstanding !== false, bestEffort: settings.bestEffort !== false, fastPath: settings.fastPath === true, nx: settings.nxStrategy,
        signal: tn.ctl.signal, hardMs: remaining, softMs: remaining * TURN_LIMITS.softFraction, undo: tn.undo }), remaining + 300, { signal: tn.ctl.signal, label: 'turn' });
    } catch (e) {
      if (e instanceof TurnAborted && engineClient?.stage) e.stage = engineClient.stage;   // the stage the engine worker reported last (the page-side deadline only knows 'turn')
      if (e instanceof TurnAborted || tn.ctl.signal.aborted) throw e;
      if (/timed out after/.test(e?.message ?? '')) throw new TurnAborted('timeout', guard.stage ?? 'engine');
      throw e;
    }
    clearInterval(ticker);
    const engineMs = performance.now() - tStart;
    const tHost = performance.now();
    hostStage('render', recId);
    typing.msg.remove();
    const usage = translator.usage.map((u) => ({ ...u }));
    const detection = translator.detectUsage.map((u) => ({ ...u }));
    const answer = (reply.text ?? '').trim() || '(no answer)';
    const notUnderstood = mode === 'voice' && (reply.statuses ?? []).length > 0 && !(reply.statuses ?? []).includes('supported') && (reply.segments ?? []).some((sg) => sg.unparsed);
    const botMsg = addMessage('bot', answer);
    if (notUnderstood) {   // MOBILE-VOICE: repeated not-understood voice replies within 20 s are collapsed into one (the first gets a count)
      const nowT = performance.now();
      if (lastNU && nowT - lastNU.at < 20000 && lastNU.el.isConnected) { lastNU.n++; lastNU.at = nowT; lastNU.badge.textContent = ` ×${lastNU.n}`; botMsg.msg.hidden = true; botMsg.msg.classList.add('is-collapsed'); }
      else lastNU = { at: nowT, n: 1, el: botMsg.msg, badge: botMsg.meta.appendChild(h('span', { class: 'p2-took' }, '')) };
    }
    currentBot = botMsg;
    const prevAnswer = lastAnswer;   // FB: the answer a spoken "that is wrong" is about
    // LANG-FIXED: an explicit switch command ("vorbește în engleză", "switch to Romanian") is the only thing in a reply that changes the language: it moves the selector
    // visibly, and its own reply is the confirmation. Detection, the reply language and the translator never do.
    { const asked = reply.state?.[SHELL]?.language; if ((asked === 'en' || asked === 'ro') && asked !== sentLang && language.get() === sentLang) language.set(asked, 'command'); }   // not when the person moved the selector meanwhile
    if (mode === 'typed' && language.get() === sentLang && !reply.knownBad) hintLanguage(text, user);   // not after a switch command
    if (reply.lang && reply.lang !== 'en') user.meta.prepend(h('span', { class: 'p2-lang' }, `${reply.lang.toUpperCase()} → EN`));

    const avatarChanged = !!reply.state?.['ui.avatar'];
    if (!notUnderstood) applyState(reply.state);   // noise never switches the tab
    const expressions = reply.statuses ?? [];
    if (!avatarChanged && robotUI()) {
      if (expressions.includes('missing')) robotUI().express('surprised');
      else if (expressions.includes('supported')) robotUI().express('smile');
    }
    lastAnswerLen = String(answer).length;
    if (settings.speaker && speech && speechSupport.synthesis) speech.speak(answer, { lang: speechLangTag() });
    const tEffects = performance.now();
    hostStage('effects', recId);
    let effects;
    try { effects = await runEffects(reply.effects); } catch (e) { botMsg.msg.remove(); throw e; }   // stopped while the effects ran: the answer is withdrawn
    const effectsMs = performance.now() - tEffects;
    let stateAfter = null;
    try { stateAfter = hashState(session.state?.() ?? null); } catch { /* ignore */ }
    const detail = recId && settings.logPhrases ? buildDetail(reply, { serialize: serializeWires, tab: view, state: { before: tn.stateBefore ?? null, after: stateAfter } }) : null;
    recordPhrase(text, mode, reply, recId, detail);
    if (reply.budgetExceeded && !reply.knownBad) runawayNotice('budgetExceeded', { text, stage: reply.budgetExceeded.stage ?? null, site: reply.budgetExceeded.site, ticks: reply.budgetExceeded.ticks, bySite: reply.budgetExceeded.bySite ?? null, ms: Math.round(performance.now() - tStart), recId, tStart });
    if (dbg) { try { dbg.record({ text, mode, tab: view, reply, usage, detection, effects, recId, stateBefore: tn.stateBefore ?? null, stateAfter, endType: voiceEnd(recId) }); } catch (e) { console.warn('debug record failed', e); } }
    // FB: the next accepted phrasing after a thumbs-down is its correction; a spoken complaint rates the previous answer
    if (reply.feedback === 'negative') {
      if (prevAnswer) { const fb = rateAnswer(prevAnswer, { vote: 'down' }); prevAnswer.ui.set(fb, { open: true }); prevAnswer.botMsg.msg.scrollIntoView?.({ block: 'nearest' }); }
    } else if (pendingCorrection && recId && (reply.statuses ?? []).length && reply.statuses.every((x) => x === 'supported') && !(reply.segments ?? []).some((sg) => sg.unparsed)) {
      rateAnswer(pendingCorrection, { correction: recId }); pendingCorrection = null;
    }
    attachFeedback({ recId, botMsg, undo: tn.undo, track: reply.feedback !== 'negative' });

    const traceBox = h('div', { class: 'p2-trace-slot', hidden: !settings.showTrace });
    let built = false;
    const toggle = h('button', { class: 'p2-linkbtn', type: 'button', 'aria-expanded': String(!!settings.showTrace) }, 'Trace');
    const build = () => { if (!built) { built = true; traceBox.append(renderTrace(reply, { translation: usage, detection, effects, serializeWires, formalizer: settings.formalizer })); } };
    if (settings.showTrace) build();
    toggle.addEventListener('click', () => { const open = traceBox.hidden; traceBox.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) build(); });
    botMsg.meta.append(toggle);
    botMsg.msg.append(traceBox);
    // timing: engine stages come from the reply (formalizer/perf.mjs), the host adds render and effects
    const totalMs = performance.now() - tStart;
    reply.perf = { ...(reply.perf ?? { total: engineMs, stages: {} }), engineMs: Math.round(engineMs), render: Math.round((performance.now() - tHost - effectsMs) * 10) / 10, effects: Math.round(effectsMs * 10) / 10, totalMs: Math.round(totalMs) };
    botMsg.meta.append(h('span', { class: 'p2-took', title: 'Time from sending to the answer on screen' }, `answered in ${fmtDur(totalMs)}`));
    if (reply.budget && recId) { try { phrases.update(recId, (r) => ({ budget: reply.budget, ...(r.detail ? { detail: { ...r.detail, budget: reply.budget } } : {}) })); } catch { /* ignore */ } }   // ticks per site of this turn (the engine's step budget)
    if (detail && recId) { try { phrases.update(recId, (r) => ({ detail: { ...(r.detail ?? detail), perf: { ...(r.detail?.perf ?? {}), totalMs: reply.perf.totalMs, engineMs: reply.perf.engineMs, render: reply.perf.render, effects: reply.perf.effects, stages: reply.perf.stages ?? null } } })); } catch { /* ignore */ } }
    const rec = { text, ...reply.perf, formalizer: settings.formalizer };
    (globalThis.__psys2Perf ??= []).push(rec);
    showPerfOverlay(rec);
    options.onReply?.(reply);
    return reply;
  }
  /** A phrase is logged the moment it is sent (RD7), so it counts even if the answer is slow, fails or the page closes; the reply fills the outcome later. */
  function logPhraseStart(text, mode, voice = {}) {
    if (!settings.logPhrases) return null;
    try { const rec = { ...buildRecord({ text, mode, language: language.get(), recLang: mode === 'voice' ? speech?.recLang?.() ?? null : null, tab: view, reply: null, endType: voice.endType ?? null, waitMs: voice.waitMs ?? null, example: voice.example === true }), ...(voice.queueMs != null ? { queueMs: voice.queueMs } : {}) }; phrases.add(rec); if (!settingsEl.hidden) renderPhraseLog(); return rec.id; } catch (e) { console.warn('phrase log failed', e); return null; }
  }
  // ---------- developer mode and the debug view (DBG) ----------
  // Off: nothing of it is loaded, recorded or kept. On: ui/debug.mjs is imported once and keeps a ring buffer of the last 200 turns.
  let dbg = null, dbgLoading = null;
  const voiceEnd = (recId) => { try { return (recId && phrases.all().find((r) => r.id === recId)?.endType) || null; } catch { return null; } };
  async function saveFile(name, text, mime = 'application/json') {
    const download = () => {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = h('a', { href: url, download: name, hidden: true }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); toast(`Downloaded ${name}`);
    };
    let file = null;
    try { file = typeof File === 'function' ? new File([text], name, { type: mime }) : null; } catch { file = null; }
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) navigator.share({ files: [file], title: name }).then(() => toast(`Shared ${name}`), (e) => { if (e?.name !== 'AbortError') download(); });   // cancelled sheet: nothing more
    else download();
  }
  function syncDebugButton() {
    const on = settings.devMode === true && !!tabBtns[view];
    dbgRow.hidden = !on;
    if (!on) return;
    const t = tabDefs.find((x) => x.id === view);
    dbgBtn.dataset.tab = view;
    label(dbgBtn, `Debug this world (${t?.label ?? view})`);
    dbgBtn.replaceChildren(h('span', { class: 'p2-dbg-ico', 'aria-hidden': 'true' }, '🐞'), ` Debug ${t?.label ?? ''}`);
  }
  async function loadDebug() {
    if (dbg) return dbg;
    dbgLoading ??= import('./ui/debug.mjs').then((m) => {
      if (destroyed || settings.devMode !== true) return null;
      dbg = m.createDebug({
        session: () => session, engine: () => engine, tabs: tabDefs.map((t) => ({ id: t.id, label: t.label, world: t.world })), serializeWires, settings: () => settings, modalHost,
        inertOthers: (on) => { chat.inert = on; if (paneEl) paneEl.inert = on; },
        tryText: (text) => { input.value = text; try { input.focus(); } catch { /* ignore */ } syncSendButton(); },
        copy: (text) => ALLOW['clipboard.copy']({ text }), saveFile, toast, language: () => language.get(),
        fetchText: async (path) => { const r = await fetch(new URL(path, base)); return r.ok ? r.text() : null; },
        models: () => ({
          formalizer: settings.formalizer,
          dispatcher: { label: dispatcherLabel, status: { ...dispatcherStatus }, source: modelSource, version: dispatcherVersion },
          normalizer: normalizerHost ? { label: normalizerHost.label, model: normalizerHost.meta?.model ?? null, status: { ...normalizerHost.status } } : null,
          engine: { stats: engineClient ? { ...engineClient.stats } : null, badInputs: engineClient?.badInputs() ?? [] },
          longTasks: longTasks.slice(-30),
        }),
      });
      return dbg;
    }).catch((e) => { console.warn('debug view failed to load', e); dbgLoading = null; return null; });
    return dbgLoading;
  }
  async function setDevMode(on, { save: persist = true } = {}) {
    settings.devMode = on === true;
    if (persist) save();
    if (settings.devMode) await loadDebug();
    else { dbg?.close?.(); dbg?.destroy?.(); dbg = null; dbgLoading = null; }
    syncDebugButton();
    if (!settingsEl.hidden) renderSettings();
  }
  /** Developer mode only: the world and command listings of the debug view read the worlds, which live in the engine worker; a second copy (no rule compilation) is loaded here on first use. */
  async function ensureIntroEngine() {
    if (introEngine) return introEngine;
    try {
      const [dialog, loaders] = await Promise.all([import(new URL('lib/dialog/index.mjs', base).href), import(new URL('lib/loaders/bundle-loader.mjs', base).href)]);
      const bundle = await (await fetch(new URL('worlds/index.json', base))).json();
      for (const [id, w] of Object.entries(bundle.worlds)) { if (options.worlds && id !== 'core' && !options.worlds.includes(id)) delete bundle.worlds[id]; else { if (w.opsUrl) w.opsUrl = new URL(w.opsUrl, base).href; if (w.fnsUrl) w.fnsUrl = new URL(w.fnsUrl, base).href; } }
      introEngine = await dialog.createEngine({ loader: loaders.createBundleLoader(bundle), translator: null });
    } catch (e) { console.warn('debug: worlds not available', e); }
    return introEngine;
  }
  on(dbgBtn, 'click', async () => { const d = await loadDebug(); await ensureIntroEngine(); d?.open(view, dbgBtn); });

  // ---------- feedback (FB): thumbs up / down under every answer ----------
  let lastAnswer = null, pendingCorrection = null;
  /** Stores a feedback patch in the record of the answer (or locally when the log is off) and returns the new feedback object. */
  function rateAnswer(ref, patch) {
    let next = null;
    if (ref.recId && settings.logPhrases) { try { phrases.update(ref.recId, (r) => { next = nextFeedback(r.feedback, patch); return { feedback: next }; }); } catch (e) { console.warn('feedback not stored', e); } }
    if (!next) { next = ref.local = nextFeedback(ref.local, patch); if (!ref.warned) { ref.warned = true; toast('Not saved: the phrase log is off (Settings > Phrases)'); } }
    if (patch.vote === 'down') pendingCorrection = ref; else if (patch.vote !== undefined && pendingCorrection === ref) pendingCorrection = null;
    if (!settingsEl.hidden && settingsTab === 'phrases') renderPhraseLog();
    return next;
  }
  /** "Show me the right result": takes the turn back (state of the session before the message) and waits for the correction. */
  function undoAnswer(ref) {
    if (turn || !ref.undo) return;
    try { session.restore(ref.undo); applyState(session.state?.()); } catch (e) { console.warn('undo failed', e); }
    ref.undo = null;
    rateAnswer(ref, { undone: true });
    pendingCorrection = ref;
    note('Taken back. Do it by hand or say it differently.');
  }
  function attachFeedback({ recId, botMsg, undo, track = true }) {
    const ref = { recId, botMsg, undo, ui: null, local: null, warned: false };
    ref.ui = createFeedback({
      feedback: null, uid: recId ?? String(Math.random()).slice(2, 8),
      onChange: (patch) => rateAnswer(ref, patch), canUndo: () => !!ref.undo && lastAnswer === ref && !turn, onUndo: () => undoAnswer(ref),
    });
    botMsg.meta.append(ref.ui.el); botMsg.msg.append(ref.ui.form);
    if (track) { if (lastAnswer) lastAnswer.undo = null; lastAnswer = ref; }   // only the latest answer can be taken back (one snapshot is kept)
    return ref;
  }
  function recordPhrase(text, mode, reply, recId = null, detail = null) {
    if (!settings.logPhrases) return;
    try {
      if (recId) phrases.update(recId, (r) => ({ ...completeRecord(r, reply, { language: language.get() }), ...(detail ? { detail } : {}) }));
      else phrases.add(buildRecord({ text, mode, language: language.get(), recLang: mode === 'voice' ? speech?.recLang?.() ?? null : null, tab: view, reply }));
    } catch (e) { console.warn('phrase log failed', e); }
    if (!settingsEl.hidden) renderPhraseLog();
  }
  // dev overlay (add ?perf=1 to the page URL): stage timings of the last message
  let perfEl = null;
  const perfParam = (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').has('perf'); } catch { return false; } })();
  function showPerfOverlay(rec) {
    if (!perfParam && settings.showPerf !== true) return;
    perfEl ??= h('pre', { class: 'p2-perf', 'aria-hidden': 'true' });
    if (!perfEl.isConnected) document.body.append(perfEl);
    const st = Object.entries(rec.stages ?? {}).map(([k, v]) => `${k.padEnd(18)} ${String(v.n).padStart(4)}x ${String(v.ms).padStart(8)} ms`);
    perfEl.textContent = [`${rec.text}`, `total ${rec.totalMs} ms (engine ${rec.engineMs}, render ${rec.render}, effects ${rec.effects})`, ...st].join('\n');
  }
  // ---------- queue (MIC2) ----------
  // One turn runs at a time, but typing and speaking never wait: a message that arrives during a turn becomes a chip above the input and is sent when the turn ends.
  let queueSeq = 0, dropAsk = null, dropAskTimer = 0;
  const YESNO = /^(yes|yeah|yep|yup|no|nope|ok|okay|sure|da|nu|bine)[.!\s]*$/i;
  const lastBotAsks = () => { const b = [...log.querySelectorAll('.p2-msg.is-bot:not(.is-typing):not(.is-note):not(.is-hint):not(.is-collapsed) .p2-bubble')].at(-1); return /\?\s*$/.test(b?.textContent ?? ''); };
  function renderQueue() {
    const chips = queue.map((it) => h('span', { class: 'p2-qchip', role: 'listitem' },
      h('span', { class: 'p2-qtext' }, it.text),
      h('button', { class: 'p2-qdrop', type: 'button', 'aria-label': `Drop the waiting message: ${it.text}`, title: `Drop the waiting message: ${it.text}`, onclick: () => dropQueued(it.id) }, '×')));
    queueEl.replaceChildren(...chips, ...(dropAsk ? [dropAsk] : []));
    queueEl.hidden = !queue.length && !dropAsk;
    micCount.textContent = String(queue.length); micCount.hidden = !queue.length;
    syncMic();
  }
  function enqueue(text, mode, voice) {
    queue.push({ id: ++queueSeq, text, mode, voice, queuedAt: performance.now() });
    renderQueue();
  }
  function dropQueued(id) { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); renderQueue(); if (!turn) drainQueue(); }
  function clearQueue() { queue.length = 0; renderQueue(); }
  /** Stop ended the turn: ask whether the waiting messages go too (default: keep; they run after the timeout). */
  function askDrop() {
    if (!queue.length || dropAsk) return;
    const n = queue.length;
    const done = (drop) => { clearTimeout(dropAskTimer); dropAsk = null; if (drop) queue.length = 0; renderQueue(); if (!turn) drainQueue(); };
    dropAsk = h('span', { class: 'p2-qask', role: 'alert' }, `Drop the ${n} waiting message${n > 1 ? 's' : ''} too? `,
      h('button', { class: 'p2-btn-text', type: 'button', onclick: () => done(false) }, 'Keep'), h('button', { class: 'p2-btn-text p2-qdrop-all', type: 'button', onclick: () => done(true) }, 'Drop'));
    clearTimeout(dropAskTimer); dropAskTimer = setTimeout(() => done(false), 6000);
    renderQueue();
  }
  /** The turn ended: the next waiting message runs. A bare yes/no whose question the previous turn already closed is shown greyed and skipped. */
  function drainQueue() {
    while (!turn && !destroyed && !dropAsk && queue.length) {
      const it = queue.shift(); renderQueue();
      if (YESNO.test(it.text.trim()) && !lastBotAsks()) {
        addMessage('user', h('span', {}, it.text, h('small', { class: 'p2-skipped-note' }, ' skipped: the question was already answered')), { className: 'is-skipped' });
        continue;
      }
      dispatch(it.text, it.mode, { ...it.voice, queueMs: Math.round(performance.now() - it.queuedAt) });
    }
  }
  const dispatch = (t, mode, voice) => {
    const tPress = performance.now();
    const user = addMessage('user', t);
    const recId = logPhraseStart(t, mode, voice);
    return process(t, mode, user, recId, tPress);
  };
  /** Sends one message; while a turn runs (or others wait) it joins the visible queue and runs in order. */
  const send = (text, mode = 'typed', voice = {}) => {
    const t = String(text ?? '').trim();
    if (!t || !session) return Promise.resolve(null);
    if (mode === 'voice' && (turn || effectsPending > 0)) {   // MOBILE-VOICE: no voice queue; the microphone is paused while a request runs, so this is a late final: the text waits in the box
      if (!input.value.trim()) { input.value = t; syncSendButton(); }
      flashHint('Still working — the heard text is in the box; press Enter when I am done.');
      return Promise.resolve(null);
    }
    if (turn || queue.length || dropAsk) { enqueue(t, mode, voice); if (!turn) drainQueue(); return Promise.resolve(null); }
    return dispatch(t, mode, voice);
  };
  /** A spoken message (VOICE): logged with how it ended (final | pause-plausible | pause-timeout | mic-stop) and the wait in ms. */
  const sendVoice = (text, how, waitMs) => send(text, 'voice', { endType: how, waitMs: Math.round(waitMs ?? 0) });
  // NOISE: a spoken message with no complete reading, no world word and no direct address is room talk: ignored, shown greyed, one tap sends it anyway
  const slowDevice = (() => { try { const best = Math.min(measureSpeed().ms, measureSpeed().ms, measureSpeed().ms); return best > (options.slowMs ?? 45); } catch { return false; } })();   // about 10 ms on a desktop; a 6x throttle or a mid-range phone is well above 45
  const throttled = () => slowDevice;
  function showIgnored(text, how, waitMs) {
    const sendAnyway = h('button', { class: 'p2-btn-text', type: 'button', 'aria-label': `Send anyway: ${text}`, onclick: () => { wrap.msg.classList.remove('is-ignored'); btnWrap.remove(); sendVoice(text, how, waitMs); } }, 'tap to send anyway');
    const btnWrap = h('small', { class: 'p2-skipped-note' }, ' ignored (not a command) — ', sendAnyway);
    const wrap = addMessage('user', h('span', {}, text, btnWrap), { className: 'is-skipped is-ignored' });
    if (settings.logPhrases) { try { phrases.add({ ...buildRecord({ text, mode: 'voice', language: language.get(), recLang: speech?.recLang?.() ?? null, tab: view, reply: null, endType: how ?? null, waitMs: waitMs ?? null }), status: 'ignored', ignored: true }); if (!settingsEl.hidden) renderPhraseLog(); } catch (e) { console.warn('phrase log failed', e); } }
  }
  async function routeVoice(text, how, waitMs) {
    let verdict = { ignore: false };
    try {
      verdict = await classifyVoice(text, { dryRead: (t, o) => session?.dryRead?.(t, { ...o, signal: undefined }), language: language.get(), wake: settings.wakeWord === true, slow: throttled() });
    } catch { verdict = { ignore: false }; }
    if (destroyed) return;
    if (verdict.ignore) { showIgnored(text, how, waitMs); speech?.setWorking(isBusy()); return; }
    sendVoice(text, how, waitMs);
    speech?.setWorking(isBusy());
  }
  /** Stop ends everything at once: the turn (the AbortSignal reaches the effects), the speech, the veil. */
  const stopTurn = () => {
    if (turn && !turn.ctl.signal.aborted) { turn.reason = 'stopped'; turn.ctl.abort(new DOMException('stopped by the user', 'AbortError')); }
    speech?.stopSpeaking?.(); effectsPending = 0; endSpeakCap(); updateBusy();
  };
  on(form, 'submit', (e) => {
    e.preventDefault();
    const t = input.value; input.value = ''; send(t);
  });
  // typing or tapping the field cancels a pending spoken send; the text stays for editing
  on(input, 'input', () => { if (speech?.hasPending()) speech.cancelPending(input.value); });
  on(input, 'pointerdown', () => { if (speech?.hasPending()) speech.cancelPending(input.value || undefined); });
  // SURPRISE: the die button sends a canonical example as if typed (logged as a button example, not human phrasing); the tab follows through the shell state.
  let surprisePicker = null;
  on(dieBtn, 'click', () => {
    if (turn) { flashHint(BUSY_HINT); return; }
    const ex = surprisePicker?.next();
    if (!ex) { flashHint('No examples are available yet.'); return; }
    send(ex.text, 'chip', { example: true });
  });
  on(sendBtn, 'click', (e) => { if (turn) { e.preventDefault(); stopTurn(); askDrop(); } else if (sendBtn.classList.contains('is-stop')) { e.preventDefault(); stopTurn(); } });
  on(input, 'input', syncSendButton);

  // ---------- speech ----------
  function startSpeakCap() {
    clearTimeout(speakCapTimer); speakCapped = false;
    const ms = Math.min(LIMITS.speakMaxMs, LIMITS.speakBaseMs + TURN_LIMITS.speakPerCharMs * (lastAnswerLen || 80));
    speakCapTimer = setTimeout(() => { speakCapped = true; updateBusy(); }, options.speakCapMs ?? ms);
  }
  function endSpeakCap() { clearTimeout(speakCapTimer); speakCapped = false; }
  let shown = '';   // what the speech detector last wrote into the input field
  const speechLangTag = () => language.tag();   // recognition and speech: the tag of the selected language, nothing else
  function setSpeaker(on, fromUser = true) {
    settings.speaker = on; speakerBtn.setAttribute('aria-pressed', String(on)); speakerBtn.classList.toggle('is-on', on); label(speakerBtn, `Read answers aloud: ${on ? 'on' : 'off'}`);
    if (!on) speech?.stopSpeaking();
    save();
    renderSettings();
  }
  function setHandsFree(on, fromUser = true) {
    if (on && !speechSupport.recognition) return;
    settings.handsFree = on;
    speech?.setHandsFree(on); save(); setStatus(); renderSettings();
    if (fromUser) session?.setWorldState?.(SHELL, { handsFree: on });
  }
  function disable(btn, why) { btn.disabled = true; label(btn, `${btn.getAttribute('aria-label')} (unavailable: ${why})`); }
  const mobileUA = (() => { try { return navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent ?? ''); } catch { return false; } })();
  const GAME_VIEWS = new Set(['hangman', 'chess', 'tictactoe', 'games', 'guess', 'arith', 'tasks']);
  const micLock = options.micLock === false || options.persist === false && options.micLock !== true ? null : createMicLock({ onLost: () => speech?.lost() });   // FREEZE: only one tab listens; without storage (tests) no lock unless asked
  function blockedNote() {
    const m = note(h('span', {}, 'The microphone is in use in another tab — use it here? ', h('button', { class: 'p2-btn-text', type: 'button', onclick: () => { m.msg.remove(); speech.takeOver(); } }, 'Use it here')));
  }
  speech = createSpeech({
    getLang: speechLangTag, getVoiceName: () => settings.voice, getRate: () => settings.rate,
    plausible: async (t, { signal } = {}) => { if (signal?.aborted) return false; return !!(await session?.dryRead?.(t, { language: language.get(), signal }))?.complete; },   // dry run: no effects, bounded, cancellable, one in flight
    pauseWhileWorking: true, slow: () => throttled(), cumulative: mobileUA,
    lock: micLock,
    allowShort: (t) => lastBotAsks() || GAME_VIEWS.has(view) || /^\d+$/.test(String(t).trim()),   // a one-word answer to an open question or a game move is not a fragment
    onIgnored: ({ reason }) => { (globalThis.__psys2VoiceDrops ??= []).push({ reason, t: Date.now() }); },
    onBlocked: () => { settings.handsFree = false; blockedNote(); syncMic(); },
    onLost: () => { settings.handsFree = false; flashHint('The microphone moved to another tab.'); syncMic(); },
    onSend: ({ text, how, waitMs }) => { input.value = ''; shown = ''; routeVoice(text, how, waitMs); },
    onCancel: (t) => { input.value = t; shown = ''; try { input.focus(); } catch { /* ignore */ } flashHint('Cancelled. The text is in the box for editing.'); },
    onPending: ({ active, ms, phase }) => { micBtn.classList.toggle('is-pending', !!active); micBtn.style.setProperty('--ring-ms', `${Math.round(ms)}ms`); micBtn.dataset.phase = phase ?? ''; if (active) { ringEl.classList.remove('run'); const k = ++ringGen; requestAnimationFrame(() => { if (k === ringGen) ringEl.classList.add('run'); }); } else { ringGen++; ringEl.classList.remove('run'); } },   // restart the ring animation on the next frame (no forced layout)
    onInterim: (t) => {   // the heard text appears in the field, unless the person has changed the field meanwhile
      interim = t; const h0 = speech.held?.() ?? '';
      const want = `${h0} ${t}`.trim();
      if (input.value === shown || !input.value) { input.value = want; shown = want; }
      setStatus();
    },
    onStopCommand: () => {   // "stop microphone": handled here, never sent to the chat
      const ro = speechLangTag().startsWith('ro'), msg = ro ? 'Am oprit microfonul.' : 'Microphone off.';
      const before = speech.snapshot(); setHandsFree(false); speech.stopListening(); logMic('voice-command', { action: 'off', before, after: speech.snapshot() }); flashHint(msg);
      if (settings.speaker && speechSupport.synthesis) speech.speak(msg, { lang: speechLangTag() });
    },
    onState: (s) => { const was = mic.speaking; mic = s; if (s.speaking && !was) startSpeakCap(); else if (!s.speaking) endSpeakCap(); robotUI()?.setSpeaking(s.speaking); setStatus(); },
    onError: (msg) => { note(msg); if (!speech.isListening() && !speech.isPaused()) { settings.handsFree = false; syncMic(); } },
  });
  if (!speechSupport.recognition) {
    const why = 'Speech recognition is not supported by this browser (try Chrome or Edge)';
    disable(micBtn, why);
  }
  if (!speechSupport.synthesis) disable(speakerBtn, 'Speech synthesis is not supported by this browser');
  // one microphone: one click = conversation mode (listens until "stop microphone" or a second click, restarts itself). Every click acts at once (optimistic state, abort after 300 ms,
  // 250 ms debounce, barge-in during read-aloud, see speech.toggle) and is logged with the state before and after (Settings > Developer).
  const logMic = (via, r) => { micLog.push({ t: new Date().toISOString().slice(11, 23), via, action: r.action, before: r.before, after: r.after }); if (micLog.length > 100) micLog.shift(); };
  function micClick(via = 'click') {
    const r = speech.toggle({ single: settings.keepListening === false });
    if (r.after.on !== settings.handsFree) { settings.handsFree = r.after.on; save(); session?.setWorldState?.(SHELL, { handsFree: r.after.on, listening: r.after.on }); renderSettings(); }
    logMic(via, r); setStatus();
    return r;
  }
  on(micBtn, 'click', () => { if (!micBtn.disabled) micClick('click'); });
  // FREEZE: a hidden tab neither listens nor speaks; it resumes only if the microphone was on; pagehide releases everything
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') speech.pageHidden(); else speech.pageVisible(); });
  on(window, 'pagehide', () => { speech.pageHide(); settings.handsFree = false; });
  if (document.visibilityState === 'hidden') speech.pageHidden();
  on(micBtn, 'contextmenu', (e) => e.preventDefault());
  on(speakerBtn, 'click', () => setSpeaker(!settings.speaker));
  const setLanguage = (v, reason = 'selector') => language.set(v, reason);
  // Speech follows the selector: where the browser has no voice for the language this is said once and typing keeps working
  const voiceSaid = new Set();
  function voiceNotice(lang) {
    if (lang === 'en' || voiceSaid.has(lang) || !speechSupport.synthesis) return;
    const check = () => {
      const voices = speech?.voices?.() ?? [];
      if (!voices.length) return false;
      voiceSaid.add(lang);
      if (!speech.voiceFor(tagOf(lang))) note(`This device has no ${langName(lang)} voice, so answers are written but not read aloud, and speech recognition may not understand ${langName(lang)}. Typing works as usual.`);
      return true;
    };
    if (!check()) setTimeout(check, 1500);
  }
  language.onChange(({ lang, reason }) => {
    settings.language = lang; langSel.value = lang;
    speech?.refreshLang(); save(); renderSettings();
    session?.setWorldState?.(SHELL, { language: lang });   // the shell world's state follows the selector, so that "speak Romanian" is a change and not a no-op
    renderLangSelect(); tl.prepare(lang).then(() => renderSettings(), () => {}); voiceNotice(lang);   // MT-SERIOUS: the model of the language downloads now (lazily: only when it is selected)
    hintEl?.remove(); hintEl = null;
    if (reason === 'hint') note(lang === 'ro' ? 'Am trecut pe română.' : lang === 'en' ? 'Switched to English.' : `Switched to ${langName(lang)}.`);   // a switch command confirms in its own reply
  });
  on(langSel, 'change', () => setLanguage(langSel.value, 'selector'));
  // LANG-FIXED: the typed-message hint, the only use of the language detectors: "Pare engleză — schimb limba?" with a button. Never automatic, never for voice.
  let hintEl = null, hintSeq = 0;
  async function hintLanguage(text, userMsg) {
    const mine = ++hintSeq, selected = language.get();
    let suggested = null;
    try { suggested = await engineClient?.call('hint', { text, selected }); } catch { suggested = null; }
    if (mine !== hintSeq || destroyed || !suggested || suggested === language.get() || selected !== language.get()) return;
    hintEl?.remove();
    const { text: line, button } = hintText(selected, suggested);
    if (!userMsg?.msg?.isConnected) return;
    // the hint sits under the typed message it is about (a small line, not a chat message: it never becomes "the last answer")
    hintEl = h('div', { class: 'p2-lang-hint', role: 'note' }, `${line} `, h('button', { class: 'p2-btn-text', type: 'button', 'data-lang-hint': suggested, onclick: () => setLanguage(suggested, 'hint') }, button));
    userMsg.msg.append(hintEl);
  }
  on(gearBtn, 'click', () => openSettings());

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
  let detectAvail = browserDetectorKind() ? 'checking…' : 'unsupported';
  const encoderOk = () => !!dispatcherEnc && dispatcherStatus.state !== 'error';
  function dispatcherVersionText() {
    const v = dispatcherVersion;
    if (!v) return '';
    const m = v.metrics ?? {};
    const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '?');
    return `Model version: ${v.model ?? 'dispatcher'}, exported ${v.export_date ?? '?'}, sha256 ${String(v.sha256 ?? '').slice(0, 8)}, ${m.split ?? 'test'} world top-1 ${pct(m.world_top1)}, top-3 ${pct(m.world_top3)}, segmentation F1 ${pct(m.seg_f1)}. `;
  }
  // ---- the Settings modal (SET): full screen, one tab per topic, closes with x, Esc and Back; deep link #settings/<tab> ----
  const SETTINGS_TABS = [['understanding', 'Understanding'], ['language', 'Language'], ['voice', 'Voice'], ['phrases', 'Phrase log'], ['models', 'Models'], ['developer', 'Developer'], ['about', 'About']];
  const SET_TAB_KEY = 'psys2.webchat.settingsTab';
  const isSettingsTab = (id) => SETTINGS_TABS.some(([t]) => t === id);
  let settingsTab = (() => { try { const t = options.persist !== false ? localStorage.getItem(SET_TAB_KEY) : null; return isSettingsTab(t) ? t : 'understanding'; } catch { return 'understanding'; } })();
  let settingsPushed = false;
  const settingsHash = () => `#settings/${settingsTab}`;
  const hashTab = (hash) => { const m = /^#settings(?:\/([\w-]*))?$/.exec(hash ?? ''); return m ? (isSettingsTab(m[1]) ? m[1] : '') : null; };   // null: not a settings link; '' : settings without a (known) tab
  for (const [id, label] of SETTINGS_TABS) {
    setTabsEl.append(h('button', { class: 'p2-tab p2-modal-tab', role: 'tab', type: 'button', id: `p2-st-${id}`, 'aria-controls': 'p2-set-panel', 'data-tab': id, onclick: () => setSettingsTab(id) }, label));
  }
  function setSettingsTab(id, focus = false) {
    if (!isSettingsTab(id)) return;
    settingsTab = id;
    if (options.persist !== false) try { localStorage.setItem(SET_TAB_KEY, id); } catch { /* storage unavailable */ }
    if (!settingsEl.hidden) { try { history.replaceState(history.state, '', settingsHash()); } catch { /* no history */ } }
    setBody.scrollTop = 0;
    renderSettings();
    if (id === 'models') refreshModelsInfo();
    if (id === 'developer' || id === 'about') loadBuildInfo();
    if (focus) setTabsEl.querySelector(`#p2-st-${id}`)?.focus();
  }
  on(setTabsEl, 'keydown', (e) => {
    const ids = SETTINGS_TABS.map(([id]) => id), i = ids.indexOf(settingsTab);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1) : null;
    if (next) { e.preventDefault(); setSettingsTab(next, true); }
  });
  /** Opens the modal (on `tab`, else the last tab). One history entry is pushed so that the phone's Back button closes it. */
  function openSettings(tab, { push = true } = {}) {
    if (tab && isSettingsTab(tab)) settingsTab = tab;
    const wasOpen = !settingsEl.hidden;
    settingsEl.hidden = false; gearBtn.setAttribute('aria-expanded', 'true');
    chat.inert = true; if (paneEl) paneEl.inert = true;
    if (!wasOpen) {
      if (push) { try { history.pushState({ p2settings: true }, '', settingsHash()); settingsPushed = true; } catch { /* no history */ } }
      else settingsPushed = true;
    }
    setSettingsTab(settingsTab, !wasOpen);
  }
  function closeSettings({ fromPop = false } = {}) {
    if (settingsEl.hidden) return;
    settingsEl.hidden = true; gearBtn.setAttribute('aria-expanded', 'false');
    chat.inert = false; if (paneEl) paneEl.inert = false;
    if (settingsPushed) { settingsPushed = false; if (!fromPop) { try { history.back(); } catch { /* no history */ } } }
    gearBtn.focus();
  }
  on(setClose, 'click', () => closeSettings());
  on(settingsEl, 'keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettings(); return; }
    if (e.key !== 'Tab') return;
    const f = [...settingsEl.querySelectorAll('button, input, select, a[href], textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f.at(-1);
    if (e.shiftKey && (document.activeElement === first || !settingsEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !settingsEl.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  on(window, 'popstate', () => {
    const t = hashTab(location.hash);
    if (!settingsEl.hidden && t === null) closeSettings({ fromPop: true });
    else if (settingsEl.hidden && t !== null) openSettings(t || undefined, { push: false });
  });
  on(window, 'hashchange', () => { const t = hashTab(location.hash); if (t !== null && (settingsEl.hidden || (t && t !== settingsTab))) openSettings(t || undefined, { push: false }); });

  // ---- data shown in the Models, Developer and About tabs ----
  let buildInfo = null, modelsInfo = { usage: null, quota: null, cached: {}, dispatcherMB: null };
  async function loadBuildInfo() {
    if (buildInfo) return;
    try { const r = await fetch(new URL('build-info.json', base), { cache: 'no-cache' }); buildInfo = r.ok ? await r.json() : { error: `HTTP ${r.status}` }; } catch (e) { buildInfo = { error: String(e?.message ?? e) }; }
    if (!settingsEl.hidden) renderSettings();
  }
  globalThis.addEventListener?.('psys2-ort-paused', () => { toast('Models paused after repeated worker restarts; the rules answer (Settings > Models).'); if (!settingsEl.hidden) renderSettings(); });
  async function refreshModelsInfo() {
    const info = { usage: null, quota: null, cached: {}, dispatcherMB: modelsInfo.dispatcherMB };
    try { const est = await navigator.storage?.estimate?.(); info.usage = est?.usage ?? null; info.quota = est?.quota ?? null; } catch { /* not available */ }
    try { for (const [id, name] of [['dispatcher', 'psys2-dispatcher-model'], ['normalizer', 'psys2-normalizer-model']]) info.cached[id] = (await caches.has(name)) ? (await (await caches.open(name)).keys()).filter((r) => !r.url.includes('meta.json')).length > 0 : false; } catch { /* no Cache API */ }
    if (info.dispatcherMB == null && dispatcherEnc) {
      try { const r = await fetch(new URL('models/dispatcher/model.int8.onnx', base), { method: 'HEAD' }); const n = Number(r.headers.get('content-length')); if (n) info.dispatcherMB = Math.round(n / 1048576); } catch { /* unknown */ }
    }
    modelsInfo = info;
    if (!settingsEl.hidden && settingsTab === 'models') renderSettings();
  }
  async function removeModelCaches() {
    try { for (const name of ['psys2-dispatcher-model', 'psys2-normalizer-model']) await caches.delete(name); } catch { /* no Cache API */ }
    toast('Models removed from the cache. They download again when needed.');
    refreshModelsInfo();
  }
  function field(label, control, note) {
    const id = `p2-f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    control.id = id;
    return h('div', { class: 'p2-field' }, h('label', { for: id }, label), control, note ? h('small', {}, note) : null);
  }
  function select(opts, value, onChange) {
    const s = h('select', { class: 'p2-select' }, opts.map(([v, l, dis]) => h('option', { value: v, disabled: dis || null }, l)));
    s.value = value; s.addEventListener('change', () => onChange(s.value)); return s;
  }
  function check(label, value, onChange, disabledWhy) {
    const c = h('input', { type: 'checkbox', id: `p2-c-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, disabled: disabledWhy ? true : null, title: disabledWhy || null });
    c.checked = value; c.addEventListener('change', () => onChange(c.checked));
    return h('label', { class: 'p2-check', title: disabledWhy || null }, c, ' ', label, disabledWhy ? h('small', {}, ` (${disabledWhy})`) : null);
  }
  const mb = (n) => (n == null ? '?' : n >= 1024 * 1048576 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.round(n / 1048576)} MB`);
  /** One card of the Models tab: name, version, size, status, actions. */
  function modelCard({ title, model, version, sizeText, statusText, cached, actions, note: more }) {
    return h('div', { class: 'p2-model' }, h('strong', {}, title),
      h('dl', {},
        h('dt', {}, 'Model'), h('dd', {}, model),
        h('dt', {}, 'Version'), h('dd', {}, version || 'unversioned'),
        h('dt', {}, 'Size'), h('dd', {}, sizeText),
        h('dt', {}, 'Status'), h('dd', { class: 'p2-model-status' }, statusText),
        h('dt', {}, 'Cache'), h('dd', {}, cached == null ? 'checking…' : cached ? 'cached in this browser' : 'not cached')),
      more ? h('small', {}, more) : null,
      h('div', { class: 'p2-plog-actions' }, ...actions));
  }
  const textBtn = (label, fn, extra = {}) => h('button', { class: 'p2-btn-text', type: 'button', onclick: fn, ...extra }, label);
  function modelsBody() {
    const d = dispatcherStatus, nz = normalizerHost?.status;
    const src = (s) => (s === 'cache' ? 'from the cache' : 'downloaded');
    const dState = !dispatcherEnc ? (encoderChecked ? 'this build has no dispatcher model' : 'checking…')
      : d.state === 'ready' ? `loaded (${src(modelSource)}, ${Math.round((d.ms ?? 0) / 100) / 10} s)` : d.state === 'loading' ? `loading, ${d.message}` : d.state === 'error' ? `not available (${d.message})` : 'not loaded yet; the rules answer meanwhile';
    const nState = !normalizerHost ? 'this build has no normalizer model'
      : nz.state === 'ready' ? `loaded (${src(nz.source)}, ${Math.round((nz.ms ?? 0) / 100) / 10} s)` : nz.state === 'loading' ? `loading, ${nz.message}` : nz.state === 'error' ? `not available (${nz.message})`
        : settings.normalizer === false ? 'not loaded (simplifying phrasing is switched off)' : slowLink() ? 'not loaded: the helper model loads when needed (not downloaded in the background on this connection)' : 'not loaded: the helper model loads when needed (or after 30 s idle)';
    const nzMB = normalizerHost ? Math.round(Object.values(normalizerHost.meta.sizes_MB ?? {}).reduce((a, b) => a + b, 0)) : null;
    const loadBtn = (host, what) => textBtn(host.status.state === 'ready' ? 'Loaded' : host.status.state === 'loading' ? 'Loading…' : 'Load now',
      () => { host.prepare().catch(() => {}).then(refreshModelsInfo); renderSettings(); }, { disabled: host.status.state === 'ready' || host.status.state === 'loading', title: `Load the ${what} model now` });
    const ortc = globalThis.__psys2Ort;   // FREEZE 5: the models pause after 2 worker restarts in 5 minutes; the rules answer meanwhile
    const pausedNote = ortc?.paused ? h('div', { class: 'p2-model', role: 'status' }, h('strong', {}, 'Models paused'),
      h('p', {}, `The models were paused because the worker had to be restarted too often (${ortc.paused.reason}). The rules answer meanwhile; nothing else changes.`),
      h('div', { class: 'p2-plog-actions' }, textBtn('Resume models', () => { ortc.resume(); renderSettings(); toast('Models resumed.'); }))) : null;
    const speedNote = ortc ? h('small', {}, `Device speed factor for model deadlines: ${ortc.speed} (measured at load). Worker restarts: ${ortc.restarts}.`) : null;
    return [
      pausedNote,
      h('p', { class: 'p2-lead' }, 'Two small neural models run in your browser (ONNX Runtime, WASM, no server). They only propose; the rules and the worlds decide. They are cached in this browser, so they download once per version.'),
      modelCard({
        title: 'Dispatcher', model: 'DistilBERT (distilbert-base-uncased), int8: cuts a message into parts and proposes which worlds fit', version: dispatcherEnc ? dispatcherLabel : '',
        sizeText: modelsInfo.dispatcherMB ? `${modelsInfo.dispatcherMB} MB` : 'about 64 MB', statusText: dState, cached: dispatcherEnc ? modelsInfo.cached.dispatcher ?? null : false,
        actions: dispatcherEnc ? [loadBtn({ status: dispatcherStatus, prepare: () => dispatcherEnc.prepare() }, 'dispatcher')] : [],
        note: dispatcherVersionText().trim() || null,
      }),
      modelCard({
        title: 'Normalizer', model: 'FLAN-T5 small, int8: proposes a simpler wording only when nothing else reads a sentence; every rewrite is checked by the rules and the value checker', version: normalizerHost?.label ?? '',
        sizeText: nzMB ? `${nzMB} MB` : 'about 95 MB', statusText: nState, cached: normalizerHost ? modelsInfo.cached.normalizer ?? null : false,
        actions: normalizerHost ? [loadBtn(normalizerHost, 'normalizer')] : [],
      }),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Cache'),
        h('p', {}, modelsInfo.usage == null ? 'The browser did not report how much storage this site uses.' : `This site uses ${mb(modelsInfo.usage)} of browser storage${modelsInfo.quota ? ` (limit about ${mb(modelsInfo.quota)})` : ''}; the models are most of it.`),
        h('div', { class: 'p2-plog-actions' }, textBtn('Remove the models from the cache', removeModelCaches, { title: 'Delete the cached model files; they download again when needed', disabled: !(modelsInfo.cached.dispatcher || modelsInfo.cached.normalizer) }))),
      speedNote,
    ];
  }
  function buildInfoLines() {
    if (!buildInfo) return h('p', {}, 'Loading build information…');
    if (buildInfo.error) return h('p', {}, `Build information is not available (${buildInfo.error}).`);
    const files = buildInfo.files ? Object.keys(buildInfo.files).length : null;
    return h('ul', { class: 'p2-buildinfo' },
      h('li', {}, `Built: ${buildInfo.builtAt ?? 'unknown'}`),
      h('li', {}, `${(buildInfo.worlds ?? []).length} worlds${files ? `, ${files} files` : ''}`),
      h('li', {}, `Dispatcher model: ${dispatcherEnc ? dispatcherLabel : 'none in this build'}`),
      h('li', {}, `Normalizer model: ${normalizerHost ? normalizerHost.label : 'none in this build'}`));
  }
  /** Settings › Developer › Time limits: seconds, clamped to the range of each limit, applied live (the next call or turn reads them). */
  function timeLimitsGroup() {
    const rows = Object.entries(TIME_LIMIT_SPECS).map(([key, s]) => {
      const id = `p2-tl-${key}`;
      const input = h('input', { type: 'number', class: 'p2-select p2-num', id, min: s.min / 1000, max: s.max / 1000, step: 0.1, inputmode: 'decimal' });
      input.value = String((settings.timeLimits?.[key] != null ? clampLimit(key, settings.timeLimits[key]) : s.def) / 1000);
      input.addEventListener('change', () => {
        const ms = clampLimit(key, Number(input.value) * 1000);
        input.value = String(ms / 1000);
        settings.timeLimits = { ...(settings.timeLimits ?? {}), [key]: ms }; applyTimeLimits(settings); save();
      });
      return h('div', { class: 'p2-field p2-field-row' }, h('label', { for: id }, `${s.label} (s)`), input, h('small', {}, `${s.note}; ${s.min / 1000} to ${s.max / 1000} s, default ${s.def / 1000} s`));
    });
    const reset = textBtn('Reset time limits', () => { settings.timeLimits = { ...TIME_LIMIT_DEFAULTS }; applyTimeLimits(settings); save(); renderSettings(); });
    return h('div', { class: 'p2-field', 'data-group': 'time-limits' }, h('strong', {}, 'Time limits'), ...rows, reset);
  }
  /** Settings › Developer › Reasoner (spec 15): which engine answers the worlds that ship a matrix. Read when the engine starts, so a change restarts it from the last state. */
  function reasonerGroup() {
    const current = settings.reasoner === 'ops' ? 'ops' : 'matrix';
    return field('Reasoner', select([['matrix', 'Matrix where available (sopworld, default)'], ['ops', 'Operations (fallback)']], current, (v) => {
      settings.reasoner = v === 'ops' ? 'ops' : 'matrix'; save();
      Promise.resolve(engineClient?.restart?.('reasoner')).catch(() => {});
      renderSettings();
    }), 'Operations: every world answers through its own code, as always. Matrix: kids.shop, kids.arith and kids.tasks answer through the sopworld library (rules, states, aggregates, retract, explain) and gain a few things: a missing item is asked for, “three of them” revises a purchase, “undo that” takes it back, “why?” says what an answer rests on, “what did I pay?” is worked backwards. Changing it restarts the engine; what you said so far in the other worlds is kept, the shop, arithmetic and list facts are not.');
  }
  function developerBody() {
    return [
      check('Show the trace of every answer (which part was read by which rule, model and validator)', settings.showTrace, (v) => { settings.showTrace = v; save(); }),
      check('Developer mode: a Debug button on every tab (commands, last turns with their SOP Lang wires, dry run, state, world, models); records the last 200 turns while on', settings.devMode === true, (v) => { setDevMode(v); }),
      check('Show the per-stage timing overlay of the last message (also with ?perf=1 in the page address)', settings.showPerf === true, (v) => { settings.showPerf = v; save(); if (!v) perfEl?.remove(); }),
      reasonerGroup(),
      timeLimitsGroup(),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Microphone clicks'), h('pre', { class: 'p2-miclog', tabindex: '0' }, micLog.length ? micLog.slice(-40).map((e) => `${e.t} ${e.via} ${e.action}: ${JSON.stringify(e.before)} -> ${JSON.stringify(e.after)}`).join('\n') : 'No clicks yet.')),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Build'), buildInfoLines()),
    ];
  }
  /** Settings > About: the languages of the translation layer, with the quality number each had to reach (share of the machine-translated operational sample that is read right). */
  function translationAbout() {
    const q = tl.quality?.languages ?? {}, reg = tl.registry?.langs ?? {};
    const rows = Object.keys(reg).filter((c) => typeof q[c]?.right === 'number').sort((a, b) => q[b].right - q[a].right);
    return h('div', { class: 'p2-field' }, h('strong', {}, 'Translation languages'),
      h('p', {}, `Languages come from the translation engine: the browser's Translator where it has both directions with English, otherwise an on-device model (bergamot-translator, Mozilla models, downloaded when you select the language). A language is listed only when ${QUALITY_GATE}% or more of a sample of the operational set is read right after machine translation English → language → English (English itself: ${tl.quality?.englishRight ?? '?'}%). Romanian is always listed: it also has its own rules.`),
      rows.length ? h('ul', { class: 'p2-credits' }, rows.map((c) => h('li', {}, h('b', {}, langName(c, { own: true })), h('small', {}, ` ${q[c].right}% right${q[c].right >= QUALITY_GATE ? '' : ' (below the gate)'} · ${(reg[c].bytes / 1e6).toFixed(0)} MB`)))) : h('p', {}, 'No quality numbers were found in this build.'));
  }
  function aboutBody() {
    return [
      ...ABOUT_SECTIONS.map(([heading, text]) => h('div', { class: 'p2-field' }, h('strong', {}, heading), h('p', {}, text))),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Measured accuracy'), h('ul', { class: 'p2-credits' }, ACCURACY.map((t) => h('li', {}, t)))),
      translationAbout(),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Version and build'), buildInfoLines()),
      h('div', { class: 'p2-field p2-about' }, h('strong', {}, 'Licence'),
        h('p', {}, 'AGPL-3.0-only. Anyone who uses this page over a network can get the source code.'),
        h('p', {}, h('a', { href: SOURCE_URL, target: '_blank', rel: 'noopener', 'data-source-link': 'about' }, 'Source code (AGPL-3.0)'))),
      h('div', { class: 'p2-field' }, h('strong', {}, 'Credits'),
        h('p', {}, 'Libraries and models bundled with this page, with their licences (all compatible with AGPL-3.0).'),
        h('ul', { class: 'p2-credits' }, CREDITS.map(([name, version, licence, use]) => h('li', {}, h('b', {}, name), h('small', {}, ` ${version} · ${licence} · ${use}`))))),
    ];
  }
  function understandingBody() {
    return [
      field('Formalizer', select([['rules', 'Rules (deterministic)'], ['encoder', !encoderChecked ? 'Encoder (checking…)' : encoderOk() ? 'Encoder (dispatcher + rule validation)' : 'Encoder (not available)', encoderChecked && !encoderOk()]], settings.formalizer,
        (v) => { settings.formalizer = v; applyEngineSettings(); save(); renderSettings(); }),
        dispatcherVersionText() + (!encoderChecked ? 'Looking for the dispatcher model…'
          : dispatcherStatus.state === 'error' ? `The model could not be loaded (${dispatcherStatus.message}); the rules are in use. Reload the page to try again.`
          : !dispatcherEnc ? 'This build has no dispatcher model (see docs/webchat/README.md). The rules are used.'
          : `A small neural dispatcher (DistilBERT, int8, in your browser) proposes how to cut the message and which worlds fit each piece; the rules check every proposal. It is kept up to date automatically and cached in this browser. Status: ${dispatcherStatus.state === 'ready' ? `ready (${modelSource === 'cache' ? 'from the cache' : 'downloaded'}, ${Math.round((dispatcherStatus.ms ?? 0) / 100) / 10} s)` : dispatcherStatus.state === 'loading' ? `loading, ${dispatcherStatus.message}; the rules answer meanwhile` : 'not loaded (the rules are in use)'}.`)),
      ...(dispatcherEnc ? [field('Reading strategy', select([['hybrid', 'Hybrid (rules first, the model reads what they could not)'], ['neural', 'Neural (the model first, rules as fallback)'], ['rules', 'Rules only']], normalizeNxStrategy(settings.nxStrategy),
        (v) => { settings.nxStrategy = v; applyEngineSettings(); save(); renderSettings(); }),
        'Who reads a message first. Hybrid keeps today’s answers and lets a small model (the heads of the same encoder pass, no second pass) read only a part that nothing else understood, when it is very sure and the part has no negation. Neural lets the model read first; a part it cannot read, or that fails the checks, goes to the rules. Rules only never asks the model to read. In every case the rules build the wires and the validator checks them; user.profile is always read by the rules. Needs the encoder formalizer.')] : []),
      ...(dispatcherEnc ? [check('Accept parses the interpreter refuses (for example “move the piece” when no game is on)', settings.encoderAcceptRefused, (v) => { settings.encoderAcceptRefused = v; save(); })] : []),
      check('Spellcheck: correct typos and chat abbreviations against the worlds’ vocabulary (for example “yes” → “eyes”)', settings.spellcheck, (v) => { settings.spellcheck = v; applyEngineSettings(); save(); }),
      check(`Simplify phrasing (normalizer): only when nothing else reads a sentence, a small model proposes a simpler wording that the rules must read and that keeps every number, name, colour and negation (${normalizerText()})`, settings.normalizer !== false, (v) => { settings.normalizer = v; if (v) normalizerHost?.prepare().catch(() => {}); save(); renderSettings(); }, normalizerHost ? null : 'no model in this build'),
      ...(dispatcherEnc ? [check('Fast path: when the rules read the whole message and every part works, answer at once without running the model (much faster on a phone; the model still handles everything else)', settings.fastPath, (v) => { settings.fastPath = v; applyEngineSettings(); save(); })] : []),
      ...(dispatcherEnc ? [check('Edit head (experimental, off by default): also try the dispatcher’s own simplified wording of a part when nothing else reads it; it recovers few messages and misleads more', settings.editHead === true, (v) => { settings.editHead = v; save(); })] : []),
      check('Partial understanding: do what I understood and say what I ignored', settings.partialUnderstanding, (v) => { settings.partialUnderstanding = v; applyEngineSettings(); save(); }),
      check('Best effort with loose words: when words do not form a sentence, do the most sensible reading and say how I took it (for example “square eyes robot” → “make your eyes square”)', settings.bestEffort !== false, (v) => { settings.bestEffort = v; applyEngineSettings(); save(); }),
    ];
  }
  function languageOptions() {
    const list = tl.listed(), cur = language.get();
    if (!list.some((l) => l.code === cur)) list.push({ code: cur, name: langName(cur, { own: true }) });
    return list.map((l) => [l.code, l.name + (l.gated ? ` (${l.right == null ? 'not measured' : `${l.right}% right`})` : '')]);
  }
  /** Which engine serves the selected language, its size and its state: the browser Translator, the on-device model, or none. */
  function languageEngineNote() {
    const code = language.get();
    if (code === 'en') return 'English needs no translation.';
    const d = tl.describe(code);
    if (d.engine === 'translator-api') return `Translation: the browser's own Translator (${translator?.translatorState?.('en', code) ?? 'on this device'}).`;
    if (d.engine === 'on-device-model') return `Translation: on-device model (bergamot-translator, ${d.size} for both directions, cached in this browser): ${d.state === 'ready' ? 'ready' : d.state === 'error' ? `failed: ${tl.host.state(code).error}` : d.state === 'idle' ? 'not downloaded yet' : `${d.state}…`}.`;
    return 'No translation engine serves this language in this browser.';
  }
  function languageBody() {
    return [
      field('Language', select(languageOptions(), language.get(), (v) => setLanguage(v)), `The language you talk to me in and I answer in. The same as the selector in the header. ${languageEngineNote()}`),
      check(`Show every language of the translation engine, also those below the quality gate (${QUALITY_GATE}% of a machine-translated sample read right; experimental)`, tl.showAll, (v) => { tl.setShowAll(v); renderSettings(); }),
      field('Translation', select([['auto', 'Automatic'], ['browser-api', 'Browser API'], ['rules', 'Rules']], settings.translation, (v) => { settings.translation = v; save(); renderSettings(); }),
        `Used when the language is not English. Browser on-device translator: ${translator?.translatorState?.() ?? (browserAvail === 'downloadable' || browserAvail === 'downloading' ? 'downloading… the rules translator is used meanwhile' : browserAvail)}. Its output is checked and falls back to the rules translator.`),
      field('Language hint', select([['auto', 'Automatic'], ['browser-api', 'Browser API'], ['rules', 'Rules']], settings.languageDetection, (v) => { settings.languageDetection = v; save(); renderSettings(); }),
        `The selected language is the only language: every message is read and answered in it, and the microphone listens in it. The only use of language detection is a one-line hint after a typed message that is clearly in the other language (“Pare engleză — schimb limba?”, with a button; never automatic, never for voice). Browser on-device language detector: ${detectAvail}.`),
    ];
  }
  /** The note under the Voice field: the voice that reads the selected language, or an honest "none installed, the default voice is used" (LANG-FIXED item 8). */
  function voiceNote(voices) {
    if (!speechSupport.synthesis) return 'Speech synthesis is not supported by this browser.';
    if (!voices.length) return 'Voices are still loading or none are installed.';
    const tag = speechLangTag(), v = speech?.voiceFor(tag);
    if (!v) return language.get() === 'ro' ? `No Romanian voice is installed on this device: answers are read with the default voice (it may sound foreign). Install one in the system settings (text-to-speech, Romanian).` : `No ${langName(language.get())} voice is installed on this device: answers are read with the default voice.`;
    return `Reads ${langName(language.get())} with: ${v.name} (${v.lang}).`;
  }
  function voiceBody() {
    const voices = speech?.voices() ?? [];
    const tag = speechLangTag().slice(0, 2);
    const voiceOpts = [['', 'Automatic'], ...voices.filter((v) => v.lang?.startsWith(tag)).map((v) => [v.name, `${v.name} (${v.lang})`])];
    const rateVal = h('output', {}, `${Number(settings.rate).toFixed(1)}×`);
    const rate = h('input', { type: 'range', id: 'p2-f-rate', min: '0.5', max: '1.8', step: '0.1', value: String(settings.rate), disabled: speechSupport.synthesis ? null : true });
    rate.addEventListener('input', () => { settings.rate = Number(rate.value); rateVal.textContent = `${settings.rate.toFixed(1)}×`; save(); });
    return [
      ...(language.get() === 'en' ? [field('English variant', select([['en-US', 'English (US)'], ['en-GB', 'English (UK)']], language.variant, (v) => { settings.englishVariant = v; language.setVariant(v); save(); renderSettings(); speech?.refreshLang(); }), 'Speech follows the selected language; only the regional variant of English can be chosen here.')] : []),
      field('Voice', select(voiceOpts, settings.voice, (v) => { settings.voice = v; save(); }), voiceNote(voices)),
      h('div', { class: 'p2-field' }, h('label', { for: 'p2-f-rate' }, 'Speech rate ', rateVal), rate),
      check('Keep listening until I say stop (say "stop microphone")', settings.keepListening !== false, (v) => { settings.keepListening = v; save(); syncMic(); }, speechSupport.recognition ? '' : 'speech recognition is not supported'),
      check('Only respond when I say "PSys2" or "robotule" (ignore other talk)', settings.wakeWord === true, (v) => { settings.wakeWord = v; save(); }, speechSupport.recognition ? '' : 'speech recognition is not supported'),
      check('Read answers aloud', settings.speaker, (v) => setSpeaker(v), speechSupport.synthesis ? '' : 'speech synthesis is not supported'),
    ];
  }
  function renderSettings() {
    if (settingsEl.hidden) return;
    const prevFocus = setBody.contains(document.activeElement) ? document.activeElement.id : null;
    const keep = setBody.scrollTop;
    for (const btn of setTabsEl.children) { const active = btn.dataset.tab === settingsTab; btn.setAttribute('aria-selected', String(active)); btn.tabIndex = active ? 0 : -1; if (active) btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
    setBody.setAttribute('aria-labelledby', `p2-st-${settingsTab}`);
    const bodies = { understanding: understandingBody, language: languageBody, voice: voiceBody, phrases: () => [phraseLogSection()], models: modelsBody, developer: developerBody, about: aboutBody };
    setBody.replaceChildren(...bodies[settingsTab]());
    setBody.scrollTop = keep;
    if (prevFocus) setBody.querySelector(`#${CSS.escape(prevFocus)}`)?.focus();
  }
  // ---------- phrase log ----------
  const plogList = h('ul', { class: 'p2-plog-list', 'aria-label': 'Logged phrases' });
  const plogCount = h('p', { class: 'p2-plog-count', 'aria-live': 'polite' });
  const plogActions = h('div', { class: 'p2-plog-actions' });
  const MODE_ICON = { typed: '⌨', voice: '🎤', chip: '🔘' };
  const MODE_NAME = { typed: 'typed', voice: 'spoken', chip: 'button' };
  /** One click: the share sheet where the browser offers one for files (phones), else a download. Returns the number of records. */
  function exportPhrases() {
    const body = toJSON(phrases.all(), { includeChips: settings.exportButtons === true, diagnostics: diagnostics() });
    const n = JSON.parse(body).count;
    if (!n) { toast('No phrases to export yet'); return 0; }
    saveFile(exportFilename(), body);
    return n;
  }
  function renderPhraseLog() {
    const all = phrases.all(), shown = filterRecords(all, logFilter).slice().reverse();
    const human = all.filter((r) => r.source !== 'chip').length;
    plogCount.textContent = `${all.length} ${all.length === 1 ? 'entry' : 'entries'} (${human} typed or spoken by you, ${all.length - human} from buttons). ${settings.exportButtons === true ? 'Buttons are included in exports.' : 'Buttons are left out of exports unless you tick the box below.'}`;
    plogList.replaceChildren(...(shown.length ? shown : [null]).map((r) => {
      if (!r) return h('li', { class: 'p2-plog-empty' }, all.length ? 'Nothing matches this filter.' : settings.logPhrases ? 'Nothing logged yet. Say or type something.' : 'The log is switched off.');
      const status = summaryStatus(r), worlds = summaryWorlds(r).join(', '), vote = voteOf(r);
      return h('li', { class: `p2-plog-item is-${status}${vote ? ` has-vote-${vote}` : ''}` },
        h('span', { class: 'p2-plog-mode', title: MODE_NAME[r.mode], role: 'img', 'aria-label': MODE_NAME[r.mode] }, MODE_ICON[r.mode]),
        h('span', { class: 'p2-plog-body' }, h('span', { class: 'p2-plog-text' }, r.text),
          h('small', {}, vote ? h('b', { class: `p2-plog-vote v-${vote}`, title: vote === 'up' ? 'Good answer' : 'Not what I wanted', 'aria-label': vote === 'up' ? 'Good answer' : 'Not what I wanted' }, vote === 'up' ? '▲ ' : '▼ ') : null, `${worlds || 'no world'} · `, h('b', { class: `p2-plog-status s-${status}` }, status), r.lang && r.lang !== 'en' ? ` · ${r.lang}` : '', vote === 'down' && r.feedback.wanted ? ` · wanted: ${r.feedback.wanted}` : '')),
        settings.devMode === true ? h('button', { class: 'p2-linkbtn p2-plog-dump', type: 'button', 'aria-label': `Debug dump: ${r.text}`, title: 'Download a debug dump of this message', onclick: () => saveFile(`psys2-debug-dump-${r.id}.json`, `${JSON.stringify({ record: exportRecord(r), turn: dbg?.turnFor?.(r.id) ?? null }, null, 1)}\n`) }, 'debug dump') : null,
        h('button', { class: 'p2-linkbtn', type: 'button', 'aria-label': `Delete: ${r.text}`, title: `Delete: ${r.text}`, onclick: () => { phrases.remove(r.id); renderPhraseLog(); } }, 'Delete'));
    }));
    const btn = (label, fn, cls = 'p2-btn-text') => h('button', { class: cls, type: 'button', onclick: fn }, label);
    plogActions.replaceChildren(...(confirmClear
      ? [h('span', { class: 'p2-plog-confirm', role: 'alert' }, `Delete all ${all.length} entries?`), btn('Yes, clear', () => { phrases.clear(); confirmClear = false; renderPhraseLog(); }, 'p2-btn-text is-danger'), btn('Keep them', () => { confirmClear = false; renderPhraseLog(); })]
      : [btn('Export JSON', exportPhrases), btn('Clear', () => { if (all.length) { confirmClear = true; renderPhraseLog(); } })]));
  }
  function phraseLogSection() {
    const fsel = select([['all', 'All'], ['misses', 'Not understood only'], ['voice', 'Voice only'], ['down', 'Not what I wanted'], ['up', 'Good answers']], logFilter, (v) => { logFilter = v; renderPhraseLog(); });
    fsel.setAttribute('aria-label', 'Filter phrases');
    confirmClear = false;
    renderPhraseLog();
    return h('div', { class: 'p2-plog' }, h('strong', {}, 'Phrase log'),
      check('Keep a log of my phrases (stays in this browser)', settings.logPhrases, (v) => { settings.logPhrases = v; save(); renderPhraseLog(); }),
      check('Include button presses in exports', settings.exportButtons === true, (v) => { settings.exportButtons = v; save(); renderPhraseLog(); }),
      plogCount, h('div', { class: 'p2-field' }, h('label', {}, 'Show '), fsel), plogList, plogActions);
  }
  let modelsAllowed = false;   // the models load after the page is usable (PERF): the rules answer meanwhile
  function applyEngineSettings() {
    if (!session) return;
    session.applySettings(settings, { prepare: !!dispatcherEnc && modelsAllowed });   // the engine worker keeps its own copy; every turn also carries the current settings
  }
  speech.onVoicesChanged(() => renderSettings());

  // ---------- evidence from real browsers (COMPUTE-BUDGET 5) ----------
  /** The host stage a main-thread task started in: the last transition before it. */
  const stageAt = (t) => { let hit = null; for (const x of stageLog) { if (x.at <= t) hit = x; else break; } return hit ?? { stage: 'idle', recId: null }; };   // bounded: stageLog is capped at 400 entries
  try {
    if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 200) continue;
          const at = stageAt(e.startTime);
          const lt = { at: new Date(performance.timeOrigin + e.startTime).toISOString(), ms: Math.round(e.duration), stage: at.stage, engineStage: at.stage === 'thinking' ? engineClient?.stage ?? null : null, tab: view };
          longTasks.push(lt); if (longTasks.length > 200) longTasks.shift();
          if (at.recId && settings.logPhrases) { try { phrases.update(at.recId, (r) => ({ longtasks: [...(r.longtasks ?? []), lt].slice(-10) })); } catch { /* ignore */ } }
        }
      });
      po.observe({ type: 'longtask', buffered: true });
      cleanups.push(() => po.disconnect());
    }
  } catch { /* no Long Tasks API */ }
  const diagnostics = () => ({ longTasks: longTasks.slice(-100), engine: engineClient ? { ...engineClient.stats, bad: engineClient.badInputs().map(({ key, reason, stage, site, kind, at }) => ({ key, reason, stage, site, kind, at })) } : null, ort: globalThis.__psys2Ort ? { restarts: globalThis.__psys2Ort.restarts, stats: globalThis.__psys2Ort.stats } : null });

  // ---------- boot ----------
  langSel.value = settings.language;
  setSpeaker(settings.speaker && speechSupport.synthesis);
  showTab(view);
  renderSettings();
  setStatus();

  let lib, introEngine = null;
  const testHooksOn = (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('psys2test') === '1' || globalThis.__psys2TestHooks === true; } catch { return false; } })();   // fault injection (tests only): inert without it
  const engineSettings = () => { try { return { ...JSON.parse(JSON.stringify(settings)), language: language.get() }; } catch { return { language: language.get() }; } };
  // the engine worker's events: model status, ORT counters, stage
  const ortMirror = { restarts: 0, stats: {}, paused: null, speed: 1, limits: null, lanes: {}, resume() { this.paused = null; engineClient?.call('ort-resume').catch(() => {}); }, restart: (lane, why) => engineClient.call('ort-restart', { lane, why }) };   // the real ORT client lives in the engine worker; this mirror is refreshed by its events
  function onEngineEvent(name, data) {
    if (name === 'dispatcher-status') {
      if (data.state === 'error') encoderFailed(data.message); else if (data.state === 'ready') encoderNoticed = false;
      dispatcherStatus = { ...data, message: data.state === 'loading' ? dispatcherStatus.message || data.message : data.message }; setStatus(); if (!settingsEl.hidden) renderSettings();
    } else if (name === 'normalizer-status') { if (normalizerHost) normalizerHost.status = data; if (!settingsEl.hidden) renderSettings(); }
    else if (name === 'model-source') modelSource = data;
    else if (name === 'progress') { dispatcherStatus = { ...dispatcherStatus, message: data }; setStatus(); }
    else if (name === 'ort') { Object.assign(ortMirror, data); globalThis.__psys2Ort = ortMirror; }
    else if (name === 'ort-paused') { ortMirror.paused = data; try { globalThis.dispatchEvent?.(new CustomEvent('psys2-ort-paused', { detail: data })); } catch { /* no events */ } }
    else if (name === 'rules-compiled') mark('rules-compiled');
    else if (name === 'warm') mark(`warm-${data}`);
  }
  try {
    const soplang = await import(new URL('lib/soplang/index.mjs', base).href);
    lib = { serialize: soplang.serialize };
    let meta = null, nzMeta = null;
    try { [meta, nzMeta] = await Promise.all([findDispatcherModel(base), findNormalizerModel(base)]); } catch (e) { console.warn('Encoder formalizer unavailable', e); }
    encoderChecked = true;
    // Facades of the models that live in the engine worker (the page only needs their labels, status and a way to start loading them)
    browserBackend = createBrowserBackend({ mt: tl.mtProxy });
    engineClient = createEngineClient({ base, versions: globalThis.__psys2Mod ?? {}, getLanguage: () => language.get(), browserCall: (op, m) => (op === 'translate' ? browserBackend.translate(m.text, m.from, m.to) : browserBackend.detect(m.text)), getSettings: engineSettings, getTab: () => view, onEvent: onEngineEvent, testHooks: testHooksOn, limits: LIMITS, log: (...a) => { if (testHooksOn) console.debug('ENGINE', ...a); } });
    if (meta) {
      dispatcherEnc = { prepare: () => engineClient.call('prepare', { which: 'dispatcher' }) };
      dispatcherVersion = meta.version ?? null;
      dispatcherLabel = versionLabel(meta);
    }
    if (meta && nzMeta) normalizerHost = { meta: nzMeta, label: versionLabel(nzMeta), status: { state: 'idle', message: '' }, timings: [], prepare: () => engineClient.call('prepare', { which: 'normalizer' }) };
    // The browser Translation API lives on the window, not in a worker: the page answers the worker's requests for it (deadline, then the rules).
    translator = { get usage() { return engineClient.usage; }, get detectUsage() { return engineClient.detection; }, resetUsage() { engineClient.resetUsage(); },
      translatorState: (f, t) => browserBackend.state(f, t), prepareTranslator: (f, t) => browserBackend.prepare(f, t), rules: null };
    const worldsVer = globalThis.__psys2Mod?.['worlds/index.json'];
    const info = await engineClient.boot({ browser: { translator: browserBackend.translatorKind(), detector: browserDetectorKind(), mt: true }, worldsUrl: new URL('worlds/index.json', base).href + (worldsVer ? `?v=${worldsVer}` : ''), onlyWorlds: options.worlds ?? null, dispatcherMeta: meta, normalizerMeta: nzMeta, modelsWanted: () => modelsAllowed });
    engine = { worlds: () => info.worlds.map((id) => ({ id })), problems: () => info.problems ?? [], get set() { return introEngine?.set ?? { list: () => [] }; } };
    if (info.problems?.length) console.warn('PSys2 world problems:', info.problems);
    if (!settingsEl.hidden) renderSettings();
    session = engineClient.session; mark('session');
    session.setWorldState?.(SHELL, { language: language.get() });   // the shell world's language state starts as the selector (LANG-FIXED)
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Could not start';
    note(`PSys2 could not start: ${e?.message ?? e}. If you opened this page from disk, serve it over HTTP instead; if lib/ or worlds/ are missing, run "npm run build:webchat".`);
    input.disabled = sendBtn.disabled = dieBtn.disabled = true;
    return { settings, destroy() { engineClient?.destroy(); } };
  }
  if (destroyed) return { settings, destroy() {} };

  // the pool loads in the background; the die button is ready a moment after the page
  (async () => {
    try {
      const [{ createSurprisePicker }, pool] = await Promise.all([import(new URL('lib/dialog/surprise.mjs', base).href),
        fetch(new URL('surprise-pool.json', base)).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      surprisePicker = createSurprisePicker(Array.isArray(pool) && pool.length ? pool : await engineClient.call('candidates'));   // unvalidated fallback: the build writes the validated pool
    } catch (e) { console.warn('surprise pool unavailable', e); }
  })();

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

  // MT-SERIOUS: the model registry loads after the first paint; a saved non-English language starts its model now
  setTimeout(() => { tl.init().then(() => { renderLangSelect(); return tl.prepare(language.get()); }).catch((e) => console.warn('translation layer', e)); }, 0);

  // optional capabilities, checked once
  if (browserDetectorKind()) browserDetectorAvailability().then((a) => { detectAvail = a; renderSettings(); });
  if (browserTranslatorKind()) browserTranslatorAvailability('ro', 'en').then((a) => { browserAvail = a; if (a === 'downloadable' || a === 'downloading') translator.prepareTranslator?.('ro', 'en').then(renderSettings, () => {}); renderSettings(); });
  else browserAvail = 'not supported by this browser';

  if (options.onboarding !== false) {
    const chips = h('div', { class: 'p2-chips-row' }, EXAMPLES.map((ex) => h('button', { class: 'p2-example', type: 'button', onclick: () => { send(ex, 'chip'); input.focus(); } }, ex)));
    addMessage('bot', GREETING, { children: chips, className: 'is-hint' });
  }
  const handle = {
    engine, session, settings, send, stop: stopTurn, engineClient, longTasks, applyState, showTab, get busy() { return !!turn; }, get debug() { return dbg; }, isBusy, get veiled() { return veiled; },
    /** The queue of waiting messages (MIC2) and the turn state flags, in one place for other features (BUSY veil): `turnState()` says what is running and what waits. */
    queue: { list: () => queue.map((q) => ({ id: q.id, text: q.text, mode: q.mode })), drop: dropQueued, clear: clearQueue, get length() { return queue.length; } },
    turnState: () => ({ running: !!turn, queued: queue.length, speaking: !!mic.speaking, mic: micBtn.dataset.mic }),
    get micLog() { return micLog; }, micClick,
    destroy() { destroyed = true; engineClient?.destroy(); cleanups.forEach((f) => f()); modalHost.remove(); dbg?.destroy?.(); robotUI()?.destroy?.(); speech.destroy(); element.replaceChildren(); element.classList.remove('p2-box'); },
  };
  // FREEZE: the listening state is never restored; the microphone starts only with a click
  if (settings.devMode === true) { syncDebugButton(); loadDebug(); }   // DBG: developer mode is remembered
  element.dataset.ready = 'true'; mark('hint');
  { const t = hashTab(location.hash); if (t !== null) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* no history */ } openSettings(t || undefined); } }   // deep link #settings/<tab>
  // Warm-up after first paint (PERF): the first message used to pay for compiling every pattern and building the vocabularies, and the
  // first model run for the ORT start-up. A scratch session reads two sentences now, while the user is still looking at the page.
  /**
   * The ~95 MB normalizer is never fetched at page load (reviewer decision f). It loads (1) the first time a message fails validation and would use it
   * (the provider starts the load itself), (2) after 30 s of idle time on a fast link, or (3) when the person asks (Settings > Models, or switching it on).
   * Not on a metered or slow link (Save-Data, effectiveType below 4g): there it only loads when needed.
   */
  const slowLink = () => { const c = globalThis.navigator?.connection; return !!c && (c.saveData === true || (typeof c.effectiveType === 'string' && c.effectiveType !== '4g')); };
  const scheduleNormalizerIdle = () => {
    if (!normalizerHost || settings.normalizer === false || slowLink()) return;
    setTimeout(async () => {
      if (destroyed || slowLink() || settings.normalizer === false || normalizerHost.status.state !== 'idle') return;
      await userFirst();
      if (!destroyed) normalizerHost.prepare().catch(() => {});
    }, NORMALIZER_IDLE_MS);
  };
  const warm = async () => {
    mark('warm-start');
    try {
      await engineClient.warm({ phase: 'rules' });   // in the worker: the rules, the Romanian translator tables; a user turn goes first
      if (destroyed) return;
      modelsAllowed = true;   // now the models: the dispatcher first, then the normalizer (about 95 MB, cached by sha256)
      if (dispatcherEnc && settings.formalizer === 'encoder') {
        await dispatcherEnc.prepare(); mark('dispatcher-ready');
        if (!destroyed) await engineClient.warm({ phase: 'model' });
        scheduleNormalizerIdle();
      }
    } catch { /* warm-up is best effort */ }
  };
  setTimeout(() => { if (!destroyed) warm(); }, 100);
  return handle;
}
