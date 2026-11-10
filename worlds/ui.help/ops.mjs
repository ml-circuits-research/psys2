// SPDX-License-Identifier: AGPL-3.0-only
// Operations of ui.help: contextual help (spec 07 section 8). Browser-safe: no imports.
//
// State (ctx.state): { pos, lastUnparsed, lastHelp }
//   pos: { <world id>: n }     index of the next example to show for that world (rotates on every help request)
//   lastUnparsed: { text, world, suggestions } | null     written by the dialog layer when a sentence is not understood
//   lastHelp: { world, tab } | null
// Reads the application state of other worlds with ctx.peek (ui.shell: activeTab, activeGame; the game worlds).
// Effect: chat.suggest { items } asks the host to show the examples as clickable chips.
//
// didYouMean({ text, worlds, tabWorld, recentWorlds, limit }) is a pure helper that the dialog layer calls after a
// failed sentence: the pattern examples of all worlds closest to the text (word overlap with typo tolerance), the tab
// world and recent worlds preferred.

const BUILTIN_TABS = {
  robot: { title: 'Avatar', world: 'ui.avatar' },
  avatar: { title: 'Avatar', world: 'ui.avatar' },
  editor: { title: 'Editor', world: 'docs.editor' },
  tictactoe: { title: 'Tic-tac-toe', world: 'games.tictactoe', game: true },
  guess: { title: 'Guess the animal', world: 'games.guess', game: true },
  hangman: { title: 'Hangman', world: 'games.hangman', game: true },
};
const BATCH = 5;

export function initialState() { return { pos: {}, lastUnparsed: null, lastHelp: null }; }

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const quote = (e) => `"${String(e).replace(/[.!?]$/, '')}"`;
const joinOr = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a.at(-1));
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------- tabs and games
function tabInfo(ctx) {
  const shell = ctx.peek?.('ui.shell') ?? {};
  const id = shell.activeTab ?? 'robot';
  const worlds = ctx.worlds?.() ?? [];
  const declared = worlds.find((w) => w.tab?.id === id);
  let info;
  if (declared) info = { id, title: declared.tab.title ?? declared.title, world: declared.id, game: declared.tab.kind === 'game', summary: declared.summary };
  else if (BUILTIN_TABS[id]) info = { id, ...BUILTIN_TABS[id], summary: worlds.find((w) => w.id === BUILTIN_TABS[id].world)?.summary };
  else info = { id, title: id, world: 'ui.shell', game: false };
  info.activeGame = shell.activeGame ?? null;
  return info;
}

/** The pattern examples of a world: one per pattern first (spread over the pattern kinds), then the further examples. */
function exampleList(ctx, worldId) {
  const pats = ctx.patterns(worldId).map((p) => ({ ...p, examples: p.canonical ?? [] })).filter((p) => p.examples.length);   // canonical examples only (RD6)
  const kinds = [...new Set(pats.map((p) => p.kind))];
  const firsts = [];
  const byKind = kinds.map((k) => pats.filter((p) => p.kind === k));
  for (let i = 0; byKind.some((l) => i < l.length); i++) for (const l of byKind) if (l[i]) firsts.push(l[i].examples[0]);
  const rest = [];
  for (let n = 1; n < 4; n++) for (const p of pats) if (p.examples[n]) rest.push(p.examples[n]);
  return [...new Set([...firsts, ...rest])];
}

/** The next `n` examples of a world, advancing the rotation cursor. `wrapped` is true when the list started again. */
function nextExamples(ctx, worldId, n = BATCH) {
  const all = exampleList(ctx, worldId);
  if (!all.length) return { items: [], total: 0, wrapped: false };
  const pos = ctx.state.pos ?? (ctx.state.pos = {});
  const start = (pos[worldId] ?? 0) % all.length;
  const take = Math.min(n, all.length);
  const items = [];
  for (let i = 0; i < take; i++) items.push(all[(start + i) % all.length]);
  pos[worldId] = (start + take) % all.length;
  return { items, total: all.length, wrapped: start + take > all.length, first: start === 0 };
}

function describeTab(t) {
  const s = String(t.summary ?? '').trim();
  return s ? `The ${t.title} tab lets you ${s}.` : `You are on the ${t.title} tab.`;
}

const GAMES = {
  hangman: {
    name: 'hangman', tab: 'hangman', world: 'games.hangman',
    rules: 'I pick a secret word and show one blank for each letter. Guess a letter ("is there an E?") or the whole word ("is it elephant?"). You can make six wrong guesses. Ask for "a hint" if you are stuck, say "new game" to start again, or "I give up" to see the word.',
    status: (s) => {
      if (!s || s.status === 'idle') return 'No game is running yet. Say "play hangman" to start one.';
      if (s.status === 'won') return `You won! The word was ${s.word}. Say "new game" to play again.`;
      if (s.status === 'lost') return `You lost this one. The word was ${s.word}. Say "new game" to play again.`;
      const guessed = (s.guessed ?? []).length ? ` Letters tried so far: ${s.guessed.join(', ')}.` : '';
      return `Right now the word looks like ${String(s.masked).replace(/_/g, '-')}, and you have ${s.wrongLeft} wrong ${s.wrongLeft === 1 ? 'guess' : 'guesses'} left.${guessed}`;
    },
  },
  tictactoe: {
    name: 'tic-tac-toe', tab: 'tictactoe', world: 'games.tictactoe',
    rules: 'You play X and move first; I play O. Say where to put your mark by name ("top left", "center", "bottom right", "middle row left") or by coordinates ("B2"). Three in a row wins. Say "new game" to restart or "give me a hint" for a good move.',
    status: (s) => {
      if (!s) return 'No game is running yet. Say "play tic tac toe" to start one.';
      const marks = (s.board ?? []).filter(Boolean).length;
      if (s.winner === 'draw') return 'The last game was a draw. Say "new game" to play again.';
      if (s.winner) return `${s.winner === s.user ? 'You won' : 'I won'} the last game. Say "new game" to play again.`;
      if (!marks) return 'The board is empty. Make your first move.';
      return `There are ${marks} ${marks === 1 ? 'mark' : 'marks'} on the board, and it is ${s.turn === s.user ? 'your' : 'my'} turn.`;
    },
  },
  guess: {
    name: 'twenty questions', tab: 'guess', world: 'games.guess',
    rules: 'Think of an animal and keep it secret. I ask up to twenty yes/no questions and then name my guess. Answer "yes", "no" or "I don\'t know". If I fail, you can teach me: "it was a zebra".',
    status: (s) => {
      if (!s || s.phase === 'idle') return 'No game is running yet. Say "play twenty questions" to start one.';
      if (s.phase === 'done') return 'The last game is over. Say "new game" to play again.';
      return `I have asked ${s.count ?? 0} of ${s.max ?? 20} questions so far.`;
    },
  },
  chess: {
    name: 'chess', tab: 'chess', world: 'games.chess',
    rules: 'You play White against me. Say your moves in plain English ("knight to f3", "e2 to e4", "bishop takes c6", "castle kingside"). Ask "what is the best move?" for a hint, "undo" to take a move back, or "resign" to give up.',
    status: () => 'Say "new game" to start a fresh game.',
  },
};
const GAME_OF_WORD = {
  hangman: 'hangman', tic_tac_toe: 'tictactoe', tictactoe: 'tictactoe', 'tic-tac-toe': 'tictactoe', noughts_and_crosses: 'tictactoe', chess: 'chess',
  twenty_questions: 'guess', guess_the_animal: 'guess', guessing_game: 'guess', animal_game: 'guess',
};

/** The game a help request is about: named, the active game of the app, or the game of the open tab. */
function gameKey(ctx, named) {
  if (named) return GAME_OF_WORD[String(named).toLowerCase().replace(/[\s]+/g, '_')] ?? null;
  const t = tabInfo(ctx);
  const byWorld = Object.entries(GAMES).find(([, g]) => g.world === t.activeGame)?.[0];
  if (t.game) return Object.entries(GAMES).find(([, g]) => g.world === t.world)?.[0] ?? (t.world ? `declared:${t.world}` : null);
  return byWorld ?? null;
}

// ---------------------------------------------------------------- operations
export function capabilities(ctx) {
  const phrases = [];
  for (const w of ctx.worlds()) {
    if (w.id === 'core') continue;
    const p = String(w.summary ?? w.title ?? '').trim();
    if (p && !phrases.includes(p)) phrases.push(p);
  }
  const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1));
  const groups = [];
  for (const p of phrases) {
    const words = p.split(/\s+/);
    const g = groups.find((x) => x.first === words[0] && words.length > 1);
    if (g) g.items.push(words); else groups.push({ first: words[0], items: [words] });
  }
  const parts = groups.map((g) => {
    if (g.items.length === 1) return g.items[0].join(' ');
    let n = 0; // longest common word prefix, leaving at least one word to each phrase
    // bounded: n grows each pass and every item is at most that long
    while (g.items.every((w) => w.length > n + 1 && w[n] === g.items[0][n])) n++;
    return g.items[0].slice(0, n).join(' ') + ' ' + joinAnd(g.items.map((w) => w.slice(n).join(' ')));
  });
  const value = parts.length > 2 ? parts.slice(0, -1).join(', ') + ', and ' + parts.at(-1) : joinAnd(parts);
  return { status: 'supported', value, values: phrases };
}

function suggest(ctx, items) { if (items.length) ctx.effect('chat.suggest', { items }); }

/** Five varied examples for the active tab (rotating on repeat); `count=1` gives a single example. */
export function help(ctx, { count } = {}) {
  const t = tabInfo(ctx);
  const n = Number(count) === 1 ? 1 : BATCH;
  const r = nextExamples(ctx, t.world, n);
  if (!r.items.length) return no('missing', `I have no examples for the ${t.title} tab yet.`);
  ctx.state.lastHelp = { world: t.world, tab: t.id };
  suggest(ctx, r.items);
  if (n === 1) return ok(`On the ${t.title} tab you can say, for example: ${quote(r.items[0])}.`, { values: r.items });
  const q = r.items.map(quote);
  const tail = r.total > BATCH ? ' Say "more examples" for others.' : '';
  return ok(`On the ${t.title} tab you can say, for example: ${q.slice(0, -1).join(', ')} or ${q.at(-1)}.${tail}`, { values: r.items });
}

/** SURPRISE: the host picks a random canonical example and sends it (effect chat.surprise). */
export function surprise(ctx) {
  ctx.effect('chat.surprise', {});
  return ok('Here is an example to try.', { values: [] });
}

/** The next five examples. */
export function helpMore(ctx) {
  const t = tabInfo(ctx);
  const r = nextExamples(ctx, t.world, BATCH);
  if (!r.items.length) return no('missing', `I have no examples for the ${t.title} tab yet.`);
  ctx.state.lastHelp = { world: t.world, tab: t.id };
  suggest(ctx, r.items);
  const q = r.items.map(quote);
  const intro = r.wrapped ? `That was everything I know for the ${t.title} tab, so here are some again:` : `Here are more things you can say on the ${t.title} tab:`;
  return ok(`${intro} ${q.slice(0, -1).join(', ')} or ${q.at(-1)}.`, { values: r.items });
}

/** Orientation: the open tab, what it is for, and three examples. */
export function helpMe(ctx) {
  const t = tabInfo(ctx);
  const r = nextExamples(ctx, t.world, 3);
  ctx.state.lastHelp = { world: t.world, tab: t.id };
  suggest(ctx, r.items);
  const ex = r.items.length ? ` You can say, for example: ${joinOr(r.items.map(quote))}.` : '';
  return ok(`${describeTab(t)}${ex} Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.`, { values: r.items });
}

/** What the open tab is for, and the state of its game. */
export function helpAbout(ctx) {
  const t = tabInfo(ctx);
  const key = gameKey(ctx, null);
  let extra = '';
  if (key && GAMES[key]) extra = ` ${GAMES[key].status(ctx.peek?.(GAMES[key].world))}`;
  return ok(`${describeTab(t)}${extra} Ask "what can I say here?" for examples.`);
}

/** Rules and current state of a game. */
export function helpGame(ctx, { game } = {}) {
  const key = gameKey(ctx, game);
  if (key && GAMES[key]) {
    const g = GAMES[key];
    return ok(`${g.name.charAt(0).toUpperCase() + g.name.slice(1)}: ${g.rules} ${g.status(ctx.peek?.(g.world))}`);
  }
  const t = tabInfo(ctx);
  if (key?.startsWith('declared:')) {
    const w = (ctx.worlds?.() ?? []).find((x) => x.id === key.slice(9));
    return ok(`${describeTab(t)} Say "new game" to start, "give me a hint" if you are stuck, or "what can I say here?" for examples.${w ? '' : ''}`);
  }
  if (game) return no('unsupported', `I do not know a game called ${game}. I can play tic-tac-toe, twenty questions, hangman and chess.`);
  const names = ['tic-tac-toe', 'twenty questions', 'hangman'];
  for (const w of ctx.worlds?.() ?? []) if (w.tab?.kind === 'game' && !GAME_OF_WORD[w.tab.id]) names.push(w.tab.title ?? w.title);
  if ((ctx.worlds?.() ?? []).some((w) => w.id === 'games.chess')) names.push('chess');
  return ok(`There is no game open on the ${t.title} tab. I can play ${[...new Set(names)].join(', ').replace(/, ([^,]*)$/, ' and $1')}. Say "let's play hangman", for example, and then ask "how do I play?" again.`);
}

// ---------------------------------------------------------------- search over examples ("how do I ...?")
const STOP = new Set(['the', 'a', 'an', 'my', 'your', 'our', 'i', 'you', 'we', 'me', 'it', 'this', 'that', 'these', 'those', 'to', 'of', 'in', 'on', 'for', 'with', 'please', 'can', 'could', 'do', 'does', 'did', 'how', 'would', 'should', 'will', 'is', 'are', 'am', 'be', 'some', 'something', 'one', 'so', 'and', 'or', 'at', 'up', 'from']);
const GENERIC = new Set(['change', 'make', 'set', 'use', 'get', 'put', 'add', 'turn', 'give', 'show', 'open', 'go', 'take', 'start', 'want', 'need', 'try', 'say', 'tell', 'let', 'have', 'play', 'draw', 'create', 'build', 'new', 'more', 'what', 'which', 'where']);
const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
const stem = (w) => {
  let x = w.replace(/'s$/, '');
  if (x.length > 4 && x.endsWith('ies')) x = x.slice(0, -3) + 'y';
  else if (x.length > 4 && /(ches|shes|sses|xes)$/.test(x)) x = x.slice(0, -2);
  else if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss')) x = x.slice(0, -1);
  if (x.length > 5 && x.endsWith('ing')) x = x.slice(0, -3);
  else if (x.length > 4 && x.endsWith('ed')) x = x.slice(0, -2);
  return x;
};
const meaningful = (s) => words(s).filter((w) => !STOP.has(w)).map(stem);
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const sameWord = (a, b, typo) => a === b || (typo && a.length >= 4 && b.length >= 4 && editDistance(a, b, a.length >= 7 ? 2 : 1) <= (a.length >= 7 ? 2 : 1));

/**
 * Closest pattern examples of all worlds to `text`: [{ example, worldId, score }], best first, at most `limit`
 * (default 2), the world of the open tab and the recent worlds preferred. Only examples that share a meaningful word
 * with the text and score at least `min` are returned.
 */
export function didYouMean({ text, worlds = [], tabWorld = null, recentWorlds = [], limit = 2, min = 0.4, detail = false } = {}) {
  const q = meaningful(text);
  if (!q.length) return [];
  const norm = words(text).join(' ');
  const scored = [];
  const seen = new Set();
  for (const w of worlds) {
    if (w.id === 'ui.help' || w.id === 'core') continue;
    const bonus = w.id === tabWorld ? 0.2 : recentWorlds.includes(w.id) ? 0.1 : 0;
    for (const p of w.patterns ?? []) for (const ex of p.canonical ?? []) {
      if (seen.has(ex) || words(ex).join(' ') === norm) continue;
      seen.add(ex);
      const e = meaningful(ex);
      if (!e.length) continue;
      const left = [...e];
      let m = 0;
      for (const t of q) { const k = left.findIndex((x) => sameWord(t, x, true)); if (k >= 0) { m++; left.splice(k, 1); } }
      if (m < Math.min(2, q.length)) continue;
      const score = (2 * m) / (q.length + e.length);
      if (score < min) continue;
      scored.push({ example: ex, worldId: w.id, score: score + bonus });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.example.length - b.example.length);
  const out = [];
  for (const s of scored) {
    if (out.length >= limit) break;
    out.push(s);
  }
  return detail ? out : out.map((s) => s.example);
}

/** "How do I <X>?": best matching examples over all worlds. */
export function helpHow(ctx, { what } = {}) {
  const q = meaningful(what);
  if (!q.length) return no('missing', 'Tell me what you want to do, for example "how do I change the eyes?".');
  const t = tabInfo(ctx);
  const recent = [];
  const scored = [];
  const seen = new Set();
  const worlds = ctx.worlds?.() ?? [];
  for (const w of worlds) {
    if (w.id === 'ui.help' || w.id === 'core') continue;
    const bonus = w.id === t.world ? 0.15 : 0;
    for (const p of ctx.patterns(w.id)) for (const ex of p.canonical ?? []) {
      if (seen.has(ex)) continue;
      seen.add(ex);
      const e = meaningful(ex);
      let got = 0, total = 0;
      const left = [...e];
      for (const x of q) {
        const wt = GENERIC.has(x) ? 0.4 : 1;
        total += wt;
        const k = left.findIndex((y) => sameWord(x, y, false));
        if (k >= 0) { got += wt; left.splice(k, 1); }
      }
      if (!got) continue;
      const nouns = q.filter((x) => !GENERIC.has(x));
      const nounHit = nouns.some((x) => e.some((y) => sameWord(x, y, false)));
      if (nouns.length && !nounHit) continue;
      scored.push({ ex, world: w, score: got / total - 0.02 * Math.max(0, e.length - q.length) + bonus });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.ex.length - b.ex.length);
  const best = scored.filter((s) => s.score >= Math.max(0.3, scored[0]?.score - 0.35)).slice(0, 3);
  if (!best.length) return no('missing', `I could not find a command for that. Say "what can I say here?" for examples, or "what can you do?" for the whole list.`);
  const items = best.map((b) => b.ex);
  ctx.state.lastHelp = { world: best[0].world.id, tab: t.id };
  suggest(ctx, items);
  const where = best[0].world.id !== t.world && best[0].world.tab?.title ? ` (on the ${best[0].world.tab.title} tab)` : best[0].world.id === 'ui.avatar' && t.world !== 'ui.avatar' ? ' (on the Avatar tab)' : '';
  void recent;
  return ok(`You can try, for example: ${joinOr(items.map(quote))}${where}.`, { values: items });
}

/** Why the last sentence was not understood. */
export function helpWhy(ctx) {
  const u = ctx.state.lastUnparsed;
  if (!u) return ok('I have understood everything you said so far. If something did not work as you expected, ask "what can I say here?" and I will show you examples.');
  const sugg = (u.suggestions ?? []).filter(Boolean);
  const why = 'none of the commands I know matches that whole sentence, so I did not guess';
  if (sugg.length) {
    suggest(ctx, sugg);
    return ok(`I did not understand ${quote(u.text)} because ${why}. Did you mean ${joinOr(sugg.map(quote))}?`, { values: sugg });
  }
  const t = tabInfo(ctx);
  const r = nextExamples(ctx, t.world, 3);
  suggest(ctx, r.items);
  const ex = r.items.length ? ` On the ${t.title} tab you can say, for example: ${joinOr(r.items.map(quote))}.` : '';
  return ok(`I did not understand ${quote(u.text)} because ${why}, and I found nothing close to it.${ex} You can also rephrase it with simpler words.`, { values: r.items });
}
void lowerFirst;

/**
 * Who and what PSys2 is (DOC): short, accurate answers for "what are you?", "how do you work?", "are you an AI?", "do you use ChatGPT?".
 * Wording rules: neurosymbolic, small neural models, formal rules and symbolic worlds; no server and no large language model; never claim
 * more than we have (no "understands everything"). The same story is in the README, Settings > About and the docs.
 */
const IDENTITY = {
  what: 'I am PSys2, a neurosymbolic assistant that runs entirely in your browser. Small neural models split what you say and propose meanings; symbolic worlds check every meaning against formal rules before anything happens, so I do what I understood and tell you what I did not. There is no server and no large language model. Ask "what can you do?" to see what I know.',
  how: 'In four steps, all in your browser. 1) A small neural dispatcher (DistilBERT) cuts your message into parts and proposes which world each part belongs to. 2) Formal rules read each part into SOP Lang wires, with spell checking and best-effort reading; when nothing reads a part, a small normalizer model (FLAN-T5 small) may propose a simpler wording, which the rules and a value checker (numbers, names, negation) must accept. 3) The interpreter runs the wires on the world; nothing happens unless a world validates it. 4) The answer is written from templates, so every value comes from a world. Settings, About has the details.',
  ai: 'Yes, in the sense that two small neural models help me read what you say. But I am not a chatbot built on a large language model: I am neurosymbolic. The neural models only propose; formal rules and symbolic worlds decide what happens, and I only answer from what my worlds know. When no world validates a meaning, I say that I did not understand.',
  llm: 'No. I do not use ChatGPT or any other large language model, and I do not call a server: everything runs in your browser. I use two small neural models (a DistilBERT dispatcher and a FLAN-T5 small normalizer, about 160 MB together, cached in your browser) with formal rules and symbolic worlds. I only know what my worlds know, so I will sometimes tell you that I did not understand.',
};
export function helpIdentity(ctx, { what } = {}) {
  const key = Object.hasOwn(IDENTITY, what) ? what : 'what';
  ctx.state.lastHelp = ctx.state.lastHelp ?? null;
  return ok(IDENTITY[key]);
}
