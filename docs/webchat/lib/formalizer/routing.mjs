// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Routing policy (spec 03 section 4, ADR-004). Browser-safe, deterministic and explainable.
 *
 * A router decides which world's formalization wins when several worlds match the same sentence. Interface (the seam
 * for a future learned router, for instance a ModernBERT/LoRA head trained on application state + text):
 *
 *   router = { id, route({ matches, context, scores, tokens }) -> { matches, decision } }
 *
 *   matches   candidate full matches of every world: { pattern, order, slots, literals, skips, score }
 *   context   what the dialog session knows about the application (see `emptyContext`)
 *   scores    word-overlap router scores [{ id, score }] (spec 03 section 5)
 *   returns   `matches` best first, and a `decision` that explains the choice (kept in the trace).
 *
 * Tiers (smaller wins; see ADR-004):
 *   1  modal intercept     a world with an open modal input consumes the sentence before formalization (dialog layer)
 *   2  navigation / meta   ui.shell requests (wildcard captures excluded). 2a: naming a tab (open <tab>, play <tab>)
 *                          always wins. 2b: app settings and meta (speech, listening, hands-free, rate, language,
 *                          phrase log, help, which tab, go back) win over every other world's match of equal or
 *                          lower priority, so "Hurry up" or "Where am I?" still go to a world that claims them
 *                          with a higher priority.
 *   3a named world        (RD2) a message that NAMES a world's object or tab (avatar, chart, map, drawing, document, chess ...) routes to that world
 *                          whatever the active tab is: a match of the named world that is not a catch-all beats the active tab's matches, unless the
 *                          active tab's own world is named too ("put a map on the picture" on the drawing tab stays there). Names come from the tab
 *                          manifests (`tab`, `tabAlias`, `tabTitle`) and the built-in tabs (`worldNames`).
 *   3b bare words          (RD2) a pattern with `tabFollow=true` (bare coordinates: "b1", "e4") is read only by the world of the active tab, the
 *                          active game or a recently used world; from tier 5 it is dropped. Bare follow-ups of the music world and the document
 *                          reader ("next", "another one") gate themselves with `needsState` (a song plays, a search is open).
 *   3  active tab          a match from the world that owns the active tab wins over every other world, unless another
 *                          world's match is clearly more specific: the tab's match is a catch-all (its wildcard
 *                          captures, `rest`, `words`, `...`, are more tokens than its literal words), the other match
 *                          has no wildcard capture and at least two more literal words. The tab's game controls
 *                          (new game, give up, hint of `ui.shell`) count as matches of the tab's world when the tab
 *                          belongs to a games.* world.
 *   4  recent worlds       the world with an active game, then the worlds that answered last (most recent first)
 *   5  everything else     by pattern priority, literal words, fewer captures, word-overlap score, pattern order
 * Inside a tier the order is always: priority, literals, fewer wildcard tokens, router score, pattern order.
 */

import { en } from '../lang/en.mjs?v=eeaa2a6b1f';
export function emptyContext() {
  return { activeTab: null, tabWorld: null, modalWorld: null, gameWorld: null, recentWorlds: [], lastWorld: null };
}

/** Normalize a context object (missing fields default; lastWorld defaults to the first recent world). */
export function normalizeContext(c) {
  const ctx = { ...emptyContext(), ...(c ?? {}) };
  ctx.recentWorlds = [...(ctx.recentWorlds ?? [])];
  if (!ctx.lastWorld) ctx.lastWorld = ctx.recentWorlds[0] ?? null;
  return ctx;
}

/** Legacy `focus` map ({ world: bonus }, +3 tab, +1 recent) to a context. */
export function contextFromFocus(focus = {}) {
  const entries = Object.entries(focus);
  return normalizeContext({
    tabWorld: entries.find(([, n]) => n >= 3)?.[0] ?? null,
    recentWorlds: entries.filter(([, n]) => n % 3 === 1).sort((a, b) => b[1] - a[1]).map(([w]) => w),
  });
}

/** Tabs of worlds without a `tab=` manifest key (the host's built-in tabs). */
export const BUILTIN_TAB_WORLDS = { 'ui.avatar': ['avatar', 'robot'], 'docs.editor': ['editor', 'document', 'doc'], 'games.tictactoe': ['tic tac toe', 'tictactoe', 'tic-tac-toe', 'noughts and crosses'], 'games.guess': ['twenty questions', '20 questions', 'guess the animal'], 'games.hangman': ['hangman'] };

/**
 * Naming tables of a world set (memoized): `names` world id -> phrases (lowercase) that name the world's object or tab, and `tabWorlds` the ids
 * of the worlds that own a tab. A phrase gets its plural ("charts"). Phrases come from the manifest (`tab`, `tabAlias`, `tabTitle`) and
 * `BUILTIN_TAB_WORLDS`.
 */
export function namingTables(set) {
  const make = () => {
    const names = new Map(), tabWorlds = new Set();
    for (const w of set.list()) {
      const tab = w.tab;
      const phrases = new Set(BUILTIN_TAB_WORLDS[w.id] ?? []);
      if (tab) {
        tabWorlds.add(w.id);
        phrases.add(tab.id);
        for (const a of tab.aliases ?? []) phrases.add(a);
        if (tab.title) phrases.add(tab.title);
      } else if (BUILTIN_TAB_WORLDS[w.id]) tabWorlds.add(w.id);
      const all = new Set();
      for (const ph of phrases) { const l = String(ph).toLowerCase().replace(/_/g, ' ').trim(); if (l.length >= 3) { all.add(l); if (!/s$/.test(l)) all.add(`${l}s`); } }
      if (all.size) names.set(w.id, [...all]);
    }
    return { names, tabWorlds };
  };
  return typeof set.memo === 'function' ? set.memo('routing-names', make) : make();
}

/** Words that introduce a noun: a name counts as naming a world only after one ("the avatar", "my chart"); a verb use ("paint yourself green") never names. */
const DETERMINERS = en.words('det', 'routing');

/** "as a picture", "like a chart": the name is a format or a comparison, not the object of the command. */
const FORMAT_PREPOSITIONS = en.words('prep', 'routing.format');

/** Worlds named in a token list (see `namingTables`): a name phrase right after a determiner (and not after "as", "like"). */
export function namedWorlds(tokens, names) {
  const words = tokens.filter((t) => t.kind === 'word' || t.kind === 'number').map((t) => t.lower ?? String(t.raw).toLowerCase());
  const out = new Set();
  for (const [w, list] of names ?? []) {
    for (const n of list) {
      const parts = n.split(' ');
      for (let i = 1; i + parts.length <= words.length; i++) {
        if (DETERMINERS.has(words[i - 1]) && !FORMAT_PREPOSITIONS.has(words[i - 2]) && parts.every((p, k) => words[i + k] === p)) { out.add(w); break; }
      }
      if (out.has(w)) break;
    }
  }
  return out;
}

/** `ui.shell` actions that name a tab (tier 2a: always win). */
export const TAB_ACTIONS = new Set(['ui.openTab', 'ui.playGame']);
/** `ui.shell` actions that change an application setting or ask about the app (tier 2b). */
/** `ui.shell` game controls: handled by whichever game the active tab shows. */
export const GAME_CONTROL_KEYS = { 'ui.newGame': 'new', 'ui.giveUp': 'giveUp', 'ui.hint': 'hint', 'ui.undo': 'undo' };
export const GAME_CONTROL_ACTIONS = new Set(Object.keys(GAME_CONTROL_KEYS));

/** The active game's own action for a ui.shell game-control pattern, from the game's tab manifest (tabNew, tabGiveUp, tabHint, tabUndo); null when it has none. */
export function gameControlAction(pattern, tab) {
  const shellAction = /action=([\w.]+)/.exec(pattern.emit ?? '')?.[1];
  return tab?.[GAME_CONTROL_KEYS[shellAction]] ?? null;
}
export const SETTING_ACTIONS = new Set([
  'ui.back', 'ui.whichTab', 'ui.help', 'ui.helpMe', 'ui.helpMore', 'ui.surprise', 'ui.helpAbout', 'ui.helpGame', 'ui.helpWhy', 'ui.speaker', 'ui.listening', 'ui.handsFree', 'ui.rate', 'ui.language', 'ui.phraseLog',
]);

/**
 * Bare tempo/volume words ("faster", "slower", "slow down": at most BARE_MAX_LITERALS literal words) of a tier 2b setting give way
 * to the music world when it owns the tab or answered recently and has a reading of its own; priorities stay as they are.
 */
export const BARE_SETTING_YIELDS = { 'ui.rate': ['media.music'] };
export const BARE_MAX_LITERALS = 2;
const actionOf = (m) => /action=([\w.]+)/.exec(m.pattern.emit ?? '')?.[1];

/** Is this a `ui.shell` game-control match (new game, give up, hint)? */
export function isGameControl(m) {
  return m.pattern.worldId === 'ui.shell' && GAME_CONTROL_ACTIONS.has(/action=([\w.]+)/.exec(m.pattern.emit ?? '')?.[1]);
}

/** Number of tokens a match captured with wildcards (`rest`, `words`, `...` skips, loose captures). */
export function wildTokens(m) {
  let n = 0;
  for (const s of Object.values(m.slots ?? {})) if ((s.class === 'rest' || s.class === 'words') && s.tokens) n += s.tokens[1] - s.tokens[0];
  return Math.max(n, m.skips ?? 0);
}

/** Navigation class of a match: 'tab' (2a), 'setting' (2b) or null. Wildcard captures never count as explicit. */
export function navigationKind(m) {
  if ((m.pattern.worldId !== 'ui.shell' && m.pattern.worldId !== 'ui.help') || wildTokens(m) > 0) return null;
  const action = /action=([\w.]+)/.exec(m.pattern.emit ?? '')?.[1];
  return TAB_ACTIONS.has(action) ? 'tab' : SETTING_ACTIONS.has(action) ? 'setting' : null;
}

const TIER_NAMES = { 2: 'navigation', 3: 'active-tab', 4: 'recent', 5: 'priority' };

/** Priority of a match in `ctx`: `tabPriority` replaces `priority` while the pattern's world owns the active tab. */
export function effectivePriority(m, ctx) {
  const tp = m.pattern.tabPriority;
  return tp != null && ctx?.tabWorld && m.pattern.worldId === ctx.tabWorld ? tp : m.pattern.priority;
}

/**
 * `needsState=<path>` routing key: a catch-all phrasing about the contents of a world ("how many legs?" for a chart) is considered only while
 * that world has contents (the state path is non-empty) or owns the active tab. Without the session states in the context it always holds.
 */
export function populated(pattern, ctx) {
  // `onlyWhile=<path>`: a request that only makes sense in a state of its world (a part of the drawn face) is read only while that state holds,
  // even on the world's own tab, so that "top right" on the avatar tab is still a tic-tac-toe move while no face is drawn
  if (pattern.onlyWhile && ctx?.states) {
    let s = ctx.states[pattern.worldId];
    for (const k of pattern.onlyWhile.split('.')) s = s?.[k];
    if (Array.isArray(s) ? !s.length : !s) return false;
  }
  const p = pattern.needsState;
  if (!p || !ctx?.states || pattern.worldId === ctx.tabWorld) return true;
  let v = ctx.states[pattern.worldId];
  for (const k of p.split('.')) v = v?.[k];
  return Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v;
}

/** Specificity of a match: literal words minus wildcard span (a catch-all is negative). */
export const specificity = (m) => m.literals - wildTokens(m);

/** A catch-all that swallows at least this many tokens gives way to any specific higher-priority match of another world. */
export const BIG_CATCH_ALL = 3;

/**
 * `a` (another world's match) is clearly more specific than the tab's match `t` (tier 3 exception): `t` is a catch-all
 * (its wildcard tokens outnumber its literal words), `a` has no wildcard and is not of lower priority, and `a` has at
 * least two more literal words, or a higher priority and two literal words when the catch-all swallows at least BIG_CATCH_ALL
 * tokens (a name or free-text sink such as "let us {rest}"). A catch-all `a` never qualifies, so a catch-all of another world
 * never beats a specific match of the tab, and a lower-priority literal match does not steal from the tab either.
 */
export function clearlyMoreSpecific(a, t, ctx = null) {
  if (!(wildTokens(t) > t.literals && wildTokens(a) === 0)) return false;
  const pa = effectivePriority(a, ctx), pt = effectivePriority(t, ctx);
  return pa >= pt && (a.literals >= t.literals + 2 || (pa > pt && a.literals >= 2 && wildTokens(t) >= BIG_CATCH_ALL));
}

const brief = (m) => (m ? { patternId: m.pattern.id, worldId: m.pattern.worldId, priority: m.rank ?? m.pattern.priority } : null);

/** Deterministic routing policy. `model(features) -> { worldId: number }` optionally orders tier 5 (learned head). */
export function createRouter({ id = 'policy', model = null } = {}) {
  return {
    id,
    route({ matches, context, scores = [], tokens = [] } = {}) {
      const ctx = normalizeContext(context);
      const named = ctx.names ? namedWorlds(tokens, ctx.names) : new Set();
      // tabOnly patterns apply only while their world's tab is active
      // GAPS-1: advice about the move ("best move for me?", "give me a hint") belongs to the game on the active tab; another game's hint is read
      // only when the message names that game ("a chess hint")
      const foreignHint = (m) => !!ctx.tabWorld?.startsWith('games.') && m.pattern.worldId.startsWith('games.') && m.pattern.worldId !== ctx.tabWorld
        && /action=[a-z]+\.hint\b/.test(m.pattern.emit ?? '') && !named.has(m.pattern.worldId);
      const list = matches.filter((m) => (!m.pattern.tabOnly || m.pattern.worldId === ctx.tabWorld) && populated(m.pattern, ctx) && !foreignHint(m));
      for (const m of list) m.rank = effectivePriority(m, ctx);
      const prio = (m) => m.rank;
      const wscore = (w) => scores.find((s) => s.id === w)?.score ?? 0;
      const learned = model ? (model({ text: tokens.map((t) => t.raw).join(' '), context: ctx, worlds: [...new Set(list.map((m) => m.pattern.worldId))] }) ?? {}) : {};
      const maxOther = Math.max(-Infinity, ...list.filter((o) => !navigationKind(o)).map(prio));
      // a bare setting word ("faster") yields to the world named in its `yieldsTo` when that world is the tab or a recent world
      const yields = (m) => [...(m.pattern.yieldsTo ?? []), ...(m.literals <= BARE_MAX_LITERALS ? BARE_SETTING_YIELDS[actionOf(m)] ?? [] : [])].some((w) => (w === ctx.tabWorld || ctx.recentWorlds.includes(w)) && list.some((o) => o.pattern.worldId === w));
      const isNav = (m) => {
        const k = navigationKind(m);
        return k === 'tab' || (k === 'setting' && prio(m) >= maxOther && !yields(m));
      };
      const gameTab = !!ctx.tabWorld && ctx.tabWorld.startsWith('games.');
      const ofTab = (m) => m.pattern.worldId === ctx.tabWorld || (gameTab && isGameControl(m));
      const tabMatches = ctx.tabWorld ? list.filter((m) => ofTab(m) && !isNav(m)) : [];
      const bestTab = [...tabMatches].sort(inTier(wscore))[0] ?? null;
      const tabClaimed = tabMatches.some((m) => m.pattern.tabClaim);   // a pattern of the tab's world that claims its phrase even when the message names another world
      const overriding = bestTab ? list.filter((m) => !isNav(m) && !ofTab(m) && clearlyMoreSpecific(m, bestTab, ctx)) : [];
      // an ambient world (an always-visible view that is not a tab: the avatar) is on every tab. Its own fully read sentence (less free text than the tab's reading) beats the
      // tab world's generic frame ("put on a hat" is the face's, not Talk's "put ... on a hat" send); a specific reading of the tab world (at least as many literals, no catch-all) still wins
      const ambients = ctx.ambientWorlds ?? [];
      const stepKind = (m) => { const a = actionOf(m) ?? ''; return /\.undo$/.test(a) ? 'undo' : /\.redo$/.test(a) ? 'redo' : null; };
      // "undo" / "redo" follow the timeline: the world that made the newest step (or whose step was undone last) takes it back, whichever tab is open, unless the tab's world made it too
      const followsStep = (m) => { const k = stepKind(m), ws = k === 'undo' ? ctx.stepWorlds : k === 'redo' ? ctx.redoWorlds : null; return !!ws?.length && ws.includes(m.pattern.worldId) && m.pattern.worldId !== ctx.tabWorld && !(ctx.tabWorld && ws.includes(ctx.tabWorld)); };
      const ambientWins = (m) => ambients.includes(m.pattern.worldId) && m.pattern.worldId !== ctx.tabWorld && !stepKind(m) && wildTokens(m) <= m.literals
        && (!bestTab || wildTokens(m) < wildTokens(bestTab));   // it reads the sentence with strictly less free text than the tab's reading (a tie, a game control or a command of the tab without free text is not displaced)
      const reasons = new Map();
      for (const m of list) {
        const w = m.pattern.worldId;
        if (followsStep(m)) { m.tier = 2; m.sub = 1; reasons.set(m, 'undo / redo of the world that made the newest step of the timeline (whichever tab is open)'); }
        else if (isNav(m)) { m.tier = 2; m.sub = 0; reasons.set(m, 'explicit navigation or settings command'); }
        else if (named.has(w) && w !== ctx.tabWorld && !(ctx.tabWorld && named.has(ctx.tabWorld)) && !tabClaimed && w !== 'ui.shell' && w !== 'ui.help' && wildTokens(m) <= m.literals) { m.tier = 3; m.sub = -1; reasons.set(m, 'the message names this world (RD2: naming a world wins over the active tab)'); }
        else if (m.pattern.signal && !ofTab(m) && !tabClaimed && ctx.tabWorld && wildTokens(m) <= m.literals + 1) { m.tier = 3; m.sub = 0; reasons.set(m, 'the sentence carries an explicit signal of this world (named shape, arrow between names, diagram form) that the active tab does not claim'); }
        else if (ambientWins(m)) { m.tier = 3; m.sub = 0; reasons.set(m, `the world of an always-visible view (${w}) read the whole sentence: it is present on every tab`); }
        else if (overriding.includes(m)) { m.tier = 3; m.sub = 0; reasons.set(m, `more specific than the active tab's ${bestTab.pattern.id} (no wildcard, ${m.literals} vs ${bestTab.literals} literal words, tab match is a catch-all)`); }
        else if (ofTab(m)) { m.tier = 3; m.sub = 1; reasons.set(m, `match from the world of the active tab (${ctx.activeTab ?? w})`); }
        else if (w === ctx.gameWorld) { m.tier = 4; m.sub = 0; reasons.set(m, 'world with an active game'); }
        else if (ctx.recentWorlds.includes(w)) { m.tier = 4; m.sub = 1 + ctx.recentWorlds.indexOf(w); reasons.set(m, w === ctx.lastWorld ? 'world that answered last' : 'recently used world'); }
        else { m.tier = 5; m.sub = -(learned[w] ?? 0); reasons.set(m, 'best pattern priority'); }
      }
      // a `short` form of a request shape (spec 03 section 2b: "blue eyes", "sunglasses") is understood only inside a world the user is already in
      // (tiers 3 and 4); among everything else (tier 5) it would steal sentences from the long forms of other worlds
      for (let k = list.length - 1; k >= 0; k--) if (list[k].pattern.form === 'short' && list[k].tier === 5) list.splice(k, 1);
      // bare readings follow the active tab (RD2, `tabFollow=true`): a bare coordinate ("b1", "e4") belongs to the active tab, the active game or a recently
      // used world; from tier 5 (a world of another tab) it is dropped when the sentence has no literal word beside the coordinate ("Play B3" stays a candidate), so it never becomes a move of a game the user is not playing
      if (ctx.tabWorld) for (let k = list.length - 1; k >= 0; k--) if (list[k].pattern.tabFollow && list[k].tier === 5 && list[k].literals === 0) list.splice(k, 1);
      list.sort((a, b) => a.tier - b.tier || a.sub - b.sub || inTier(wscore)(a, b));
      const win = list[0] ?? null;
      const runner = list.find((m) => m !== win && m.pattern.worldId !== win?.pattern.worldId) ?? list[1] ?? null;
      const decision = win ? {
        router: id, tier: win.tier, tierName: TIER_NAMES[win.tier], reason: reasons.get(win),
        contested: list.some((m) => m !== win && m.pattern.worldId !== win.pattern.worldId),
        winner: brief(win), runnerUp: runner ? { ...brief(runner), tier: runner.tier, reason: reasons.get(runner) } : null,
        context: { activeTab: ctx.activeTab, tabWorld: ctx.tabWorld, gameWorld: ctx.gameWorld, recentWorlds: ctx.recentWorlds },
      } : null;
      return { matches: list, decision };
    },
  };
}

/** Order inside a tier: priority, literal words, fewer wildcard tokens, word-overlap score, pattern order. */
/** L9 flag: rank by content literals first, then by frame (phrase macro) literals. Off by default; globalThis.PSYS_FRAME_RANK = true / env PSYS_FRAME_RANK=1 turns it on. */
const frameRank = () => globalThis.PSYS_FRAME_RANK === true || (typeof process !== 'undefined' && process.env?.PSYS_FRAME_RANK === '1');
const content = (m) => m.literals - (m.frameLiterals ?? 0);
function inTier(wscore) {
  const byLiterals = frameRank()
    ? (a, b) => content(b) - content(a) || (b.frameLiterals ?? 0) - (a.frameLiterals ?? 0)
    : (a, b) => b.literals - a.literals;
  return (a, b) => (b.rank ?? b.pattern.priority) - (a.rank ?? a.pattern.priority) || byLiterals(a, b) || a.skips - b.skips
    || wscore(b.pattern.worldId) - wscore(a.pattern.worldId) || a.order - b.order;
}

/** The context-free default order of earlier versions: priority only (no tiers). Kept for comparisons. */
export function createPriorityRouter() {
  return {
    id: 'priority',
    route({ matches, scores = [] }) {
      const wscore = (w) => scores.find((s) => s.id === w)?.score ?? 0;
      const list = [...matches];
      for (const m of list) { m.tier = 5; m.sub = 0; }
      list.sort(inTier(wscore));
      return { matches: list, decision: list[0] ? { router: 'priority', tier: 5, tierName: 'priority', reason: 'best pattern priority', contested: false, winner: brief(list[0]), runnerUp: brief(list[1]) } : null };
    },
  };
}

export const defaultRouter = createRouter();
