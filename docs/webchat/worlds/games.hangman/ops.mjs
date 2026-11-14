// Operations of games.hangman (spec 07 section 3). Browser-safe: no imports.
//
// State (ctx.state): { word, masked, guessed: [every letter tried], wrong: [wrong letters and words], wrongLeft: 6, status: 'idle'|'playing'|'won'|'lost', hints, seed }
//   The host must render `masked` ("_ e _ _ _") and show `word` only when status is 'won' or 'lost'.
// Words: the single alphabetic names of the animals of the knowledge catalog (k.animals, read by lookup from the bundle generated from it at build time: src/knowledge/animals.mjs) and of the
// animals the dialogue taught (ctx.find), 3 to 12 letters. The word is chosen with a seeded pseudo-random generator whose seed lives in the state, so games are reproducible; arg word chooses it explicitly.
// Hints are the facts of the catalog about the animal (class, legs, habitat, covering, diet, what it can and cannot do, the sound).
// Cross-world: ctx.request('ui.openTab', { tab: 'hangman' }).

export const MAX_WRONG = 6;
import { animals as catalogAnimals, animalNames } from '../../lib/knowledge/animals.mjs?v=7ef6dd8b71';

// where an animal lives, said as a child says it: the habitat word as the catalog has it, with the preposition of the few that take "on" ("on a farm", "on the ice"); no table of habitats
const ON = new Set(['farm', 'savanna', 'ice', 'beach', 'tundra', 'cliff', 'island']);
export const habitatPhrase = (h) => (ON.has(h) ? `on ${h === 'farm' ? 'a farm' : `the ${h}`}` : h === 'house' ? 'in a house' : `in the ${String(h).replace(/_/g, ' ')}`);
const COVER = { fur: 'It has fur.', hair: 'It has hair.', feather: 'It has feathers.', feathers: 'It has feathers.', scales: 'It has scales.', spines: 'It has spines.', scale: 'It has scales.', skin: 'It has bare skin.', shell: 'It has a shell.', wool: 'It has wool.', spine: 'It has spines.' };
const DIET = { herbivore: 'It eats only plants.', carnivore: 'It eats only meat.', omnivore: 'It eats both plants and meat.' };

export function initialState() {
  return { word: '', masked: '', guessed: [], wrong: [], wrongLeft: MAX_WRONG, status: 'idle', hints: 0, seed: 987654 };
}

const ok = (value) => ({ status: 'supported', value });
const no = (status, note) => ({ status, note });
export const NOT_PLAYING = 'We are not playing hangman. Say "play hangman" to start.';
const show = (ctx) => ctx.request('ui.openTab', { tab: 'hangman' });

export function wordList(ctx) {
  const names = new Set(animalNames());
  for (const w of ctx.find('kids.animals.animal')) { const n = ctx.val(w, 'name'); if (n) names.add(n); }
  return [...names].filter((n) => /^[a-z]{3,12}$/.test(n)).sort();
}

// Replies show blanks as '-' because the renderer turns '_' into a space; the state keeps '_'.
const shown = (s) => s.masked.replace(/_/g, '-');

function mask(s) { return [...s.word].map((c) => (s.guessed.includes(c) || s.status === 'lost' || s.status === 'won' ? c : '_')).join(' '); }

function begin(ctx, word) {
  const s = ctx.state;
  let w = word;
  if (!w) {
    const list = wordList(ctx);
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    w = list[s.seed % list.length];
  }
  Object.assign(s, { word: w, guessed: [], wrong: [], wrongLeft: MAX_WRONG, status: 'playing', hints: 0 });
  s.masked = mask(s);
}

export function newGame(ctx, { word, keep } = {}) {
  const s = ctx.state;
  show(ctx);
  if (keep === 'true' && s.status === 'playing') return ok(`We are already playing hangman: ${shown(s)}. Guess a letter or the whole word.`);
  if (word !== undefined && !/^[a-z]{2,20}$/.test(word)) return no('unsupported', 'The word must be made of letters only.');
  begin(ctx, word);
  return ok(`Hangman! I have chosen a word of ${s.word.length} letters: ${shown(s)}. You can make ${MAX_WRONG} wrong guesses. Guess a letter, or the whole word.`);
}

function wrongGuess(s, what) {
  s.wrong.push(what);
  s.wrongLeft--;
  if (s.wrongLeft <= 0) { s.status = 'lost'; s.masked = mask(s); return true; }
  return false;
}

export function letter(ctx, { letter: l }) {
  const s = ctx.state;
  if (s.status !== 'playing') return no('missing', NOT_PLAYING);
  show(ctx);
  const c = String(l).toLowerCase();
  const L = c.toUpperCase();
  if (s.guessed.includes(c) || s.wrong.includes(c)) return ok(`You already tried ${L}. ${shown(s)}`);
  if (s.word.includes(c)) {
    s.guessed.push(c);
    const n = [...s.word].filter((x) => x === c).length;
    if ([...s.word].every((x) => s.guessed.includes(x))) { s.status = 'won'; s.masked = mask(s); return ok(`Yes, ${n === 1 ? 'one' : n} ${L}${n === 1 ? '' : 's'}! You got it! The word was ${s.word}.`); }
    s.masked = mask(s);
    return ok(`Yes, there ${n === 1 ? 'is one' : `are ${n}`} ${L}${n === 1 ? '' : 's'}! ${shown(s)}`);
  }
  s.guessed.push(c);
  if (wrongGuess(s, c)) return ok(`No, there is no ${L}. Oh no, you ran out of guesses. The word was ${s.word}. Say "new game" to try again.`);
  return ok(`No, there is no ${L}. ${s.wrongLeft} wrong ${s.wrongLeft === 1 ? 'guess' : 'guesses'} left. ${shown(s)}`);
}

export function word(ctx, { word: w }) {
  const s = ctx.state;
  if (s.status !== 'playing') return no('missing', NOT_PLAYING);
  show(ctx);
  const g = String(w).toLowerCase();
  if (g === s.word) {
    for (const c of s.word) if (!s.guessed.includes(c)) s.guessed.push(c);
    s.status = 'won'; s.masked = mask(s);
    return ok(`Yes! The word is ${s.word}. You won!`);
  }
  if (wrongGuess(s, g)) return ok(`No, it is not ${g}. Oh no, you ran out of guesses. The word was ${s.word}. Say "new game" to try again.`);
  return ok(`No, it is not ${g}. ${s.wrongLeft} wrong ${s.wrongLeft === 1 ? 'guess' : 'guesses'} left. ${shown(s)}`);
}

/** Facts about the animal, in a fixed order: the catalog's (k.animals) and what the dialogue taught. */
export function facts(ctx, name) {
  const a = catalogAnimals().get(name);
  const ws = ctx.find('kids.animals.animal', { name });
  if (!a && !ws.length) return [];
  const vals = (k) => [...new Set(ws.flatMap((w) => ctx.vals(w, k)))];
  const out = [];
  const cls = a?.class[0] ?? vals('class')[0];
  if (cls) out.push(`It is ${/^[aeiou]/.test(cls) ? 'an' : 'a'} ${cls}.`);
  const legs = a?.legs[0] !== undefined ? Number(a.legs[0]) : vals('legs')[0];
  if (legs !== undefined) out.push(legs === 0 ? 'It has no legs.' : `It has ${legs} ${legs === 1 ? 'leg' : 'legs'}.`);
  const hab = [...(a?.habitat ?? []), ...vals('habitat')];
  if (hab.length) out.push(`It lives ${habitatPhrase(hab[0])}.`);
  const cov = [...(a?.covering ?? []), ...vals('covering')];
  if (cov.length) out.push(COVER[cov[0]] ?? `It is covered with ${cov[0]}.`);
  const diet = a?.diet[0] ?? vals('diet')[0];
  if (diet) out.push(DIET[diet] ?? `It is ${diet}.`);
  const fly = a?.can.includes('fly') ? [true] : a?.cannot.includes('fly') ? [false] : vals('can_fly');
  const swim = a?.can.includes('swim') ? [true] : a?.cannot.includes('swim') ? [false] : vals('can_swim');
  if (fly.length) out.push(fly.includes(true) ? 'It can fly.' : 'It cannot fly.');
  if (swim.length) out.push(swim.includes(true) ? 'It can swim.' : 'It cannot swim.');
  const sound = a?.sound[0] ?? vals('sound')[0];
  if (sound) out.push(`It says "${sound}".`);
  return out;
}

export function hint(ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return no('missing', NOT_PLAYING);
  const all = facts(ctx, s.word);
  if (!all.length) return ok('I know nothing about this animal to tell you.');
  if (s.hints >= all.length) return ok('I have no more hints. Guess a letter or the whole word!');
  const h = all[s.hints++];
  return ok(`Here is a hint: ${h}`);
}

export function giveUp(ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return no('missing', NOT_PLAYING);
  s.status = 'lost'; s.masked = mask(s);
  return ok(`OK. The word was ${s.word}. Say "new game" to try again.`);
}

export function status(ctx) {
  const s = ctx.state;
  if (s.status === 'idle') return no('missing', NOT_PLAYING);
  const letters = s.guessed.filter((x) => x.length === 1);
  const tried = letters.length ? ` Letters tried: ${letters.join(', ')}.` : '';
  if (s.status !== 'playing') return ok(`The game is over: the word was ${s.word}.${tried} ${s.wrongLeft} wrong ${s.wrongLeft === 1 ? 'guess' : 'guesses'} left.`);
  return ok(`${shown(s)} (${s.word.length} letters). ${s.wrongLeft} wrong ${s.wrongLeft === 1 ? 'guess' : 'guesses'} left.${tried}`);
}

// ---- the declared schema (schema.sop, declare=yes): the letters not asked yet while a game is on; the start when there is none
import { declaredExecutor } from '../acts/acts.mjs?v=6736c5ab88';
import { SCHEMA } from './schema.declared.mjs?v=e511a0dc30';
export const executor = declaredExecutor(SCHEMA, {
  sampleKnowledge: ({ state }) => {
    if (state?.status !== 'playing') return { letters: ["Let's play hangman."] };
    const tried = new Set([...(state.guessed ?? []), ...(state.wrong ?? [])].map((x) => String(x).toLowerCase()));
    return { letters: [...'abcdefghijklmnopqrstuvwxyz'].filter((c) => !tried.has(c)).map((c) => `Is there ${/[aefhilmnorsx]/.test(c) ? 'an' : 'a'} ${c.toUpperCase()}?`) };
  },
});
