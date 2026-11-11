// SPDX-License-Identifier: AGPL-3.0-only
// ui.shell on the matrix reasoner (spec 15). The operations (ops.mjs: tabs, games, speaker, microphone, speech rate, language, Settings) are unchanged and keep
// working on the session state; the tab the app shows and the settings the chat can change are also one wire of the library (matrix.sop): one ui.shell.view.
// The library is the record: `toState` derives the state ops.mjs keeps (and the host renders) from the wire, `adopt` says which values to set for a state the
// operations (or the host: a click on a tab, a toggle) changed, `guard` asks the rules whether the tab, the game, the language or the Settings tab a request
// names exists, `undoWords` says what an undo took back in the world's words. What the app has (tabs, words, games, languages) is the knowledge base kb.sop,
// generated from the manifests by scripts/gen-ui-kb.mjs. Browser-safe; it imports its sibling ops.mjs only for the initial state and the word normalizer.
import { initialState, norm } from './ops.mjs?v=509dcced7c';

const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const first = (w, k) => w?.attrs?.[k]?.[0];
const atom = (x) => String(x).replace(/[^\w.-]/g, '_');   // a word as the wires of kb.sop write it
const KNOWN = new Set(['activeTab', 'previousTab', 'speaker', 'listening', 'handsFree', 'rate', 'language']);   // one attribute each; everything else the host keeps (the game it says is active ...) is one JSON
const restOf = (s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => !KNOWN.has(k) && v !== undefined));

/** The state ops.mjs keeps (the host renders it), derived from the wire; the titles of the tabs (the kb) ride along unseen, for the words of an undo. */
export function toState({ find }) {
  const v = find('ui.shell.view')[0];
  const s = initialState();
  if (v) {
    s.activeTab = dec(first(v, 'tab'));
    s.previousTab = first(v, 'prev') === 'none' ? null : dec(first(v, 'prev'));
    s.speaker = first(v, 'speaker') === 'true';
    s.listening = first(v, 'listening') === 'true';
    s.handsFree = first(v, 'handsfree') === 'true';
    s.rate = Number(first(v, 'rate')) / 100;
    s.language = dec(first(v, 'lang'));
    Object.assign(s, JSON.parse(dec(first(v, 'rest'))));
  }
  Object.defineProperty(s, '_titles', { value: Object.fromEntries(find('ui.shell.known').map((w) => [dec(first(w, 'id')), dec(first(w, 'title'))])), enumerable: false });
  return s;
}

const isInitial = (s) => {
  const i = initialState();
  return Object.keys(i).every((k) => s[k] === i[k]) && !Object.keys(restOf(s)).length;
};

/** The wire a state asks for: attrs of the one ui.shell.view, or null for the initial state (nothing told yet). */
function viewOf(s) {
  const attrs = {
    tab: [atom(s.activeTab ?? 'robot')], prev: [s.previousTab ? atom(s.previousTab) : 'none'], speaker: [String(!!s.speaker)], listening: [String(!!s.listening)], handsfree: [String(!!s.handsFree)],
    rate: [String(Math.round((s.rate ?? 1) * 100))], lang: [s.language === 'ro' ? 'ro' : 'en'], rest: [str(JSON.stringify(restOf(s)))],
  };
  return attrs;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }] }. There is one wire; it is told when the state
 * first leaves the initial one and its values are set in place after that (an update is one step the library can take back).
 */
export function adopt({ state, find }) {
  const have = find('ui.shell.view')[0];
  if (!have) {
    if (isInitial(state)) return { retract: [], tell: '', sets: [] };
    const a = viewOf(state);
    return { retract: [], tell: `@sh.view ui.shell.view ${Object.entries(a).map(([k, vs]) => `${k}=${vs[0]}`).join(' ')}`, sets: [] };
  }
  const a = viewOf(state), sets = [];
  for (const [k, vs] of Object.entries(a)) if (first(have, k) !== vs[0]) sets.push({ id: have.id, key: k, value: vs[0] });
  return { retract: [], tell: '', sets };
}

// ---- guard: do the tab, the game, the language and the Settings tab exist? (asked to the rules) ------------------------------------------------------------------
const GAME_OF = { 'ui.newGame': 'new', 'ui.giveUp': 'giveup', 'ui.hint': 'hint' };
const lc = (a) => String(a ?? '').trim().toLowerCase();

/** Refuses a request that names a tab, a game, a language or a Settings tab the app does not have, or asks for what there is none of: { status, reason, note }, or null. */
export function guard({ action, args, state, check, find }) {
  let want = null;
  if (action === 'ui.openTab' || action === 'ui.playGame') {
    const t = String(args?.tab ?? '');
    const n = norm(t);
    want = `@sh.q ui.shell.want kind=${action === 'ui.openTab' ? 'tab' : 'play'} a=${atom(t)} b=${atom(n)} c=${atom(n.replace(/s$/, ''))} word=${str(t)}`;
  } else if (GAME_OF[action]) want = `@sh.q ui.shell.want kind=game which=${GAME_OF[action]}`;
  else if (action === 'ui.back') want = '@sh.q ui.shell.want kind=back';
  else if (action === 'ui.language') want = `@sh.q ui.shell.want kind=lang a=${atom(args?.lang ?? '')} word=${str(args?.lang ?? '')}`;
  else if (action === 'ui.settings' && args?.tab !== undefined && args?.what !== 'close') want = `@sh.q ui.shell.want kind=settab a=${atom(norm(args.tab))} word=${str(args.tab)}`;
  if (!want) return null;
  const v = find('ui.shell.view')[0];
  const facts = v ? '' : `\n@sh.fv ui.shell.view ${Object.entries(viewOf(state)).map(([k, vs]) => `${k}=${vs[0]}`).join(' ')}`;   // the initial state has no wire yet: the rules are asked about the state as it is
  const r = check({ wires: `${want}${facts}` });
  if (r.ok) return null;
  const x = (r.violations ?? []).find((q) => q.why);
  if (!x) return null;
  const why = unquote(String(x.why));
  const unknown = /^(?:There is no .* (?:tab|game)\.|I do not (?:speak|have))/.test(why) && !/^There is no game open/.test(why);
  return { status: unknown ? 'unsupported' : 'missing', reason: unknown ? 'unknown_argument' : 'precondition_failed', note: why, why };
}
const unquote = (s) => s.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');

// ---- undo, words -------------------------------------------------------------------------------------------------------------------------------------------
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const titleOf = (s, id) => s?._titles?.[id] ?? id;

/** What "undo" says once the library went back, from the states before and after: the tab it is on again, the setting that is as it was. */
export function undoWords({ before, after, said }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  const parts = [];
  if (before.activeTab !== after.activeTab) parts.push(`I am back on the ${titleOf(after, after.activeTab)} tab`);
  if (before.speaker !== after.speaker) parts.push(`the speaker is ${after.speaker ? 'on' : 'off'} again`);
  if (before.listening !== after.listening && before.handsFree === after.handsFree) parts.push(`I ${after.listening ? 'am listening' : 'am not listening'} again`);
  if (before.handsFree !== after.handsFree) parts.push(`hands-free mode is ${after.handsFree ? 'on' : 'off'} again`);
  if (before.rate !== after.rate) parts.push(`my speech rate is ${after.rate} again`);
  if (before.language !== after.language) parts.push(`I speak ${after.language === 'ro' ? 'Romanian' : 'English'} again`);
  if (!parts.length) return { value: `OK, I took that back${said ? `: "${said}"` : ''}.` };
  return { value: `OK, ${joinAnd(parts)}.` };
}

