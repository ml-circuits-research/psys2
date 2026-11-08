// Operations of ui.shell: app control and voice settings (spec 07 section 3). Browser-safe: no imports.
//
// State (ctx.state): { activeTab, previousTab, speaker, listening, handsFree, rate, language }
//   activeTab: 'robot' | 'editor' | 'tictactoe' | 'guess' | 'hangman'   (previousTab: the tab before, or null)
//   rate: speech rate 0.5 .. 2 (1 = normal); language: 'en' | 'ro'
// Effects: speech.cancel (when the speaker is turned off).
//
// Cross-world request used by the other tool worlds to bring their tab forward:
//   ctx.request('ui.openTab', { tab: 'editor' })

const TABS = {
  robot: { title: 'Robot', world: 'ui.avatar' },
  editor: { title: 'Editor', world: 'docs.editor' },
  tictactoe: { title: 'Tic-tac-toe', world: 'games.tictactoe' },
  guess: { title: 'Guess the animal', world: 'games.guess' },
  hangman: { title: 'Hangman', world: 'games.hangman' },
};
const TAB_OF_WORD = {
  robot: 'robot', face: 'robot', avatar: 'robot', editor: 'editor', document: 'editor', doc: 'editor',
  tic_tac_toe: 'tictactoe', tictactoe: 'tictactoe', noughts_and_cross: 'tictactoe',
  guess: 'guess', guess_the_animal: 'guess', guessing_game: 'guess', twenty_question: 'guess', animal_game: 'guess',
  hangman: 'hangman',
};
const GAME_ACTIONS = {
  new: { tictactoe: 'ttt.new', guess: 'guess.start', hangman: 'hm.new' },
  giveUp: { tictactoe: 'ttt.giveup', guess: 'guess.giveup', hangman: 'hm.giveup' },
  hint: { tictactoe: 'ttt.hint', guess: 'guess.hint', hangman: 'hm.hint' },
};
/**
 * Tabs declared by other worlds in their manifests (spec 07 §6: tab, tabTitle, tabAlias, tabNew, tabHint, tabGiveUp)
 * are merged into the tables above, so a new tool world gets voice navigation without editing this world.
 */
const norm = (w) => String(w ?? '').toLowerCase().trim().replace(/^(the|a|an|my|your)\s+/, '').replace(/[\s-]+/g, '_');
function refresh(ctx) {
  for (const w of ctx.worlds?.() ?? []) {
    const t = w.tab;
    if (!t?.id) continue;
    TABS[t.id] ??= { title: t.title, world: w.id };
    for (const a of [t.id, t.title, ...(t.aliases ?? [])]) TAB_OF_WORD[norm(a)] ??= t.id;
    if (t.new) GAME_ACTIONS.new[t.id] ??= t.new;
    if (t.hint) GAME_ACTIONS.hint[t.id] ??= t.hint;
    if (t.giveUp) GAME_ACTIONS.giveUp[t.id] ??= t.giveUp;
  }
}
const resolveTab = (tab) => (TABS[tab] ? tab : TAB_OF_WORD[tab] ?? TAB_OF_WORD[norm(tab)] ?? TAB_OF_WORD[norm(tab).replace(/s$/, '')]);

const RATE_MIN = 0.5, RATE_MAX = 2, RATE_STEP = 0.25;

export function initialState() {
  return { activeTab: 'robot', previousTab: null, speaker: false, listening: false, handsFree: false, rate: 1, language: 'en' };
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const text = (r) => r.value ?? r.note ?? '';

function show(ctx, tab) {
  const s = ctx.state;
  if (s.activeTab === tab) return false;
  s.previousTab = s.activeTab;
  s.activeTab = tab;
  return true;
}

export function openTab(ctx, { tab }) {
  refresh(ctx);
  const id = resolveTab(tab);
  if (!id) return no('unsupported', `I do not know a tab called ${tab}.`);
  if (!show(ctx, id)) return ok(`You are already on the ${TABS[id].title} tab.`);
  return ok(`OK, here is the ${TABS[id].title} tab.`);
}

export function playGame(ctx, { tab }) {
  refresh(ctx);
  const id = resolveTab(tab) ?? tab;
  if (!TABS[id]) return no('unsupported', `I do not know a game called ${tab}.`);
  if (!GAME_ACTIONS.new[id]) return openTab(ctx, { tab: id });
  show(ctx, id);
  const r = ctx.request(GAME_ACTIONS.new[id], { keep: 'true' });
  return ok(`OK, let's play ${TABS[id].title === 'Tic-tac-toe' ? 'tic-tac-toe' : TABS[id].title.toLowerCase()}! ${text(r)}`.trim());
  // (a declared game whose start action fails still opens its tab: see openTab)
}

export function chooseGame() {
  return ok('I can play tic-tac-toe, twenty questions (I guess your animal) or hangman. Which one would you like?');
}

export function back(ctx) {
  refresh(ctx);
  const s = ctx.state;
  if (!s.previousTab) return no('missing', 'There is no previous tab to go back to.');
  const target = s.previousTab;
  s.previousTab = s.activeTab;
  s.activeTab = target;
  return ok(`OK, back to the ${TABS[target].title} tab.`);
}

export function whichTab(ctx) {
  refresh(ctx);
  return ok(`You are on the ${TABS[ctx.state.activeTab].title} tab.`);
}

/** 4-6 example commands for the active tab, from the pattern examples of the world that owns the tab. */
export function help(ctx) {
  refresh(ctx);
  const tab = ctx.state.activeTab;
  const seen = new Set();
  const all = [];
  for (const p of ctx.patterns(TABS[tab].world)) {
    const ex = p.examples[0];
    if (ex && !seen.has(ex)) { seen.add(ex); all.push(ex); }
  }
  if (!all.length) return no('missing', `I have no examples for the ${TABS[tab].title} tab yet.`);
  const n = Math.min(5, all.length);
  const picked = [];
  for (let i = 0; i < n; i++) picked.push(all[Math.floor((i * all.length) / n)]);
  const quoted = picked.map((e) => `"${e.replace(/\.$/, '')}"`);
  return ok(`On the ${TABS[tab].title} tab you can say, for example: ${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}.`, { values: picked });
}

export function speaker(ctx, { on }) {
  const s = ctx.state;
  s.speaker = on === 'true';
  if (!s.speaker) { ctx.effect('speech.cancel', {}); return ok('OK, the speaker is off. I will only write my answers.'); }
  return ok('OK, the speaker is on. I will read my answers aloud.');
}

export function listening(ctx, { on }) {
  const s = ctx.state;
  s.listening = on === 'true';
  if (!s.listening) s.handsFree = false;
  return ok(s.listening ? 'OK, I am listening.' : 'OK, I stopped listening.');
}

export function handsFree(ctx, { on }) {
  const s = ctx.state;
  s.handsFree = on === 'true';
  s.listening = s.handsFree;
  return ok(s.handsFree ? 'OK, hands-free mode is on. I keep listening, and I pause while I am speaking.' : 'OK, hands-free mode is off and I stopped listening.');
}

export function rate(ctx, { dir, value }) {
  const s = ctx.state;
  const round = (x) => Math.round(x * 100) / 100;
  let next;
  if (value !== undefined) next = Number(value);
  else if (dir === 'slower') next = s.rate - RATE_STEP;
  else next = s.rate + RATE_STEP;
  if (!Number.isFinite(next)) return no('unsupported', 'I need a number for the speech rate.');
  next = round(Math.min(RATE_MAX, Math.max(RATE_MIN, next)));
  if (next === s.rate) return ok(`I am already speaking as ${dir === 'slower' ? 'slowly' : 'fast'} as I can (rate ${s.rate}).`);
  const word = value !== undefined ? 'set to' : dir === 'slower' ? 'slower:' : 'faster:';
  s.rate = next;
  return ok(`OK, my speech rate is ${word} ${next}.`.replace('is set to', 'is now').replace(/: (\d)/, ' now, $1').replace(/ now, /, ': '));
}

export function language(ctx, { lang }) {
  const code = { english: 'en', romanian: 'ro', en: 'en', ro: 'ro' }[lang];
  if (!code) return no('unsupported', `I do not speak ${lang} yet.`);
  ctx.state.language = code;
  return ok(code === 'ro' ? 'OK, I switched to Romanian.' : 'OK, I switched to English.');
}

function gameAction(ctx, which, args = {}) {
  refresh(ctx);
  const tab = ctx.state.activeTab;
  const action = GAME_ACTIONS[which][tab];
  if (!action) return no('missing', `There is no game open on the ${TABS[tab].title} tab. You can say, for example, "let's play hangman".`);
  return ctx.request(action, args);
}
const relay = (r) => (r.status === 'supported' ? ok(text(r)) : no(r.status, text(r)));
export const newGame = (ctx) => relay(gameAction(ctx, 'new'));
export const giveUp = (ctx) => relay(gameAction(ctx, 'giveUp'));
export const hint = (ctx) => relay(gameAction(ctx, 'hint'));
