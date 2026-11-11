// SPDX-License-Identifier: AGPL-3.0-only
// games.hangman on the matrix reasoner (spec 15). The rules (hits and misses, lives, the letters still hidden, how the game ends, the refusals) are in
// matrix.sop; this file is what the library cannot say: the choice of the word (seeded, from the kids.animals names), the hints, the words of the replies
// (the same sentences ops.mjs says) and the state the tab reads (derived from the wires after every change). Browser-safe; it imports its sibling ops.mjs
// for the tables (a world is plain files). The registered names are prefixed (hm*): the library keeps one function registry for all worlds.
import { MAX_WRONG, NOT_PLAYING, initialState, wordList, facts } from './ops.mjs';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const val = (w, k) => un(w?.attrs?.[k]?.[0]);
const q = JSON.stringify;
const plural = (n, one, many) => (n === 1 ? one : many);

/** The state ops.mjs keeps (and the tab reads), derived from the wires: { word, masked, guessed, wrong, wrongLeft, status, hints, seed }. */
export function toState({ find }) {
  const g = find('hm.game')[0];
  if (!g) return initialState();
  const word = val(g, 'word');
  const hit = new Set(find('hm.hit').map((h) => Number(val(h, 'n'))));
  const guesses = find('hm.guess').map((w) => ({ n: Number(val(w, 'n')), kind: val(w, 'kind'), what: val(w, 'what') })).sort((a, b) => a.n - b.n);
  const guessed = [], wrong = [];
  for (const x of guesses) {
    if (x.kind === 'letter') { guessed.push(x.what); if (!hit.has(x.n)) wrong.push(x.what); }
    else if (hit.has(x.n)) { for (const c of word) if (!guessed.includes(c)) guessed.push(c); }
    else wrong.push(x.what);
  }
  const over = find('hm.over')[0];
  const status = !over ? 'playing' : val(over, 'how') === 'won' ? 'won' : 'lost';
  const masked = [...word].map((c) => (guessed.includes(c) || status !== 'playing' ? c : '_')).join(' ');
  return { word, masked, guessed, wrong, wrongLeft: MAX_WRONG - wrong.length, status, hints: find('hm.hint').length, seed: Number(val(g, 'seed')) };
}

const stateOf = (ctx) => toState({ find: ctx.find });
const shown = (s) => s.masked.replace(/_/g, '-');   // replies show blanks as '-' (the renderer turns '_' into a space)
const ok = (value) => ({ value, openTab: 'hangman' });
const notPlaying = { status: 'missing', note: NOT_PLAYING };
const left = (s) => `${s.wrongLeft} wrong ${plural(s.wrongLeft, 'guess', 'guesses')} left.`;

/** The refusal the rules gave: a game that is not on is `missing` (as in ops.mjs); a letter tried twice is answered, not refused. */
function refused(violations, st, L) {
  if (violations.some((v) => /\.(over|nogame)$/.test(String(v.rule)))) return notPlaying;
  const dup = violations.find((v) => /\.dup$/.test(String(v.rule)));
  if (dup) return { value: `You already tried ${L}. ${shown(st)}`, openTab: 'hangman', why: dup.why };
  const v = violations.find((x) => x.why) ?? violations[0];
  return { status: 'unsupported', note: String(v?.why ?? 'That guess is not allowed.'), why: v?.why };
}

/** Tells the guess (the rules decide what it is: hit, miss, won, lost); returns the guess number and the state after it. */
function guess(ctx, kind, what, st, L) {
  const n = ctx.find('hm.guess').length;
  const text = `@hm.g${n} hm.guess n=${n} kind=${kind} what=${q(what)}`;
  const check = ctx.world.check({ wires: text });
  if (!check.ok) return { refusal: refused(check.violations ?? [], st, L) };
  ctx.tell(text);
  return { n, hit: ctx.find('hm.hit').some((h) => Number(val(h, 'n')) === n), now: stateOf(ctx) };
}

export const fns = {
  hmNew(ctx, { word, keep } = {}) {
    const st = stateOf(ctx);
    if (keep === 'true' && st.status === 'playing') return ok(`We are already playing hangman: ${shown(st)}. Guess a letter or the whole word.`);
    if (word !== undefined && !/^[a-z]{2,20}$/.test(word)) return { status: 'unsupported', note: 'The word must be made of letters only.', openTab: 'hangman' };
    let w = word, seed = st.seed;
    if (!w) {
      const list = wordList(ctx.host.view(ctx));
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      w = list[seed % list.length];
    }
    for (const t of ['hm.guess', 'hm.hint', 'hm.giveup', 'hm.game', 'hm.ch']) for (const x of ctx.find(t)) ctx.retract(x.id);
    const letters = [...new Set(w)].map((c, i) => `@hm.c${i} hm.ch ch=${q(c)}`).join('\n');
    ctx.tell(`@hm.g hm.game word=${q(w)} seed=${seed}\n${letters}`);
    const now = stateOf(ctx);
    return ok(`Hangman! I have chosen a word of ${w.length} letters: ${shown(now)}. You can make ${MAX_WRONG} wrong guesses. Guess a letter, or the whole word.`);
  },

  hmLetter(ctx, { letter }) {
    const st = stateOf(ctx);
    const c = String(letter).toLowerCase(), L = c.toUpperCase();
    const r = guess(ctx, 'letter', c, st, L);
    if (r.refusal) return r.refusal;
    const { now } = r;
    if (r.hit) {
      const n = [...now.word].filter((x) => x === c).length;
      if (now.status === 'won') return ok(`Yes, ${n === 1 ? 'one' : n} ${L}${n === 1 ? '' : 's'}! You got it! The word was ${now.word}.`);
      return ok(`Yes, there ${n === 1 ? 'is one' : `are ${n}`} ${L}${n === 1 ? '' : 's'}! ${shown(now)}`);
    }
    if (now.status === 'lost') return ok(`No, there is no ${L}. Oh no, you ran out of guesses. The word was ${now.word}. Say "new game" to try again.`);
    return ok(`No, there is no ${L}. ${left(now)} ${shown(now)}`);
  },

  hmWord(ctx, { word }) {
    const st = stateOf(ctx);
    const g = String(word).toLowerCase();
    const r = guess(ctx, 'word', g, st, g);
    if (r.refusal) return r.refusal;
    const { now } = r;
    if (r.hit) return ok(`Yes! The word is ${now.word}. You won!`);
    if (now.status === 'lost') return ok(`No, it is not ${g}. Oh no, you ran out of guesses. The word was ${now.word}. Say "new game" to try again.`);
    return ok(`No, it is not ${g}. ${left(now)} ${shown(now)}`);
  },

  hmHint(ctx) {
    const st = stateOf(ctx);
    if (st.status !== 'playing') return notPlaying;
    const all = facts(ctx.host.view(ctx), st.word);
    if (!all.length) return { value: 'I know nothing about this animal to tell you.' };
    if (st.hints >= all.length) return { value: 'I have no more hints. Guess a letter or the whole word!' };
    ctx.tell(`@hm.h${st.hints} hm.hint n=${st.hints}`);
    return { value: `Here is a hint: ${all[st.hints]}` };
  },

  hmGiveUp(ctx) {
    const st = stateOf(ctx);
    if (st.status !== 'playing') return notPlaying;
    ctx.tell('@hm.gv hm.giveup');
    return { value: `OK. The word was ${st.word}. Say "new game" to try again.` };
  },
};

/** What "undo" says (the host layer rewound the library to before the last turn that changed it); `before` is null when there was nothing to take back. */
export function undoWords({ before, after }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet: no guess has been made.' };
  const tried = (s) => s.guessed.length + s.wrong.length;
  // every undo names what it took back; a change the state cannot tell is left to the host's generic words, which quote what the user said
  const value = after.word !== before.word ? (after.word ? 'OK, I took back the new game. The game before it is back.' : 'OK, I took back the new game.')
    : after.hints < before.hints ? 'OK, I took back the last hint.'
    : tried(after) < tried(before) ? 'OK, I took back your last guess. The word is as it was before.'
    : after.status !== before.status ? 'OK, I took back the end of the game. We are playing again.'
    : null;
  return { value, openTab: 'hangman' };
}
