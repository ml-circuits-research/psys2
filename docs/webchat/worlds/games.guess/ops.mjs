// Operations of games.guess: twenty questions where the system guesses the user's animal (spec 07 section 3).
// Browser-safe: no imports.
//
// State (ctx.state): { phase: 'idle'|'asking'|'guessing'|'learning'|'done', candidates: [names], asked: [{feature, value, text, answer}],
//   count, max: 20, current: { feature, value, text, yes, no, of } | null, guess, rejected: [names], solved, learned: [{ name, traits, not }] }
// The animals are the knowledge catalog's (k.animals), read by lookup at question time from the bundle generated from the catalog at build time (src/knowledge/animals.mjs: the library's
// build-bundle, read synchronously); what the player taught the game ("it was a zebra") is added from the wires of type kids.animals.animal and from `learned`. No animal is listed here.
//
// Question choice: every (feature, value) pair among the candidates is a possible yes/no question; the one whose
// "yes" and "no" groups are the most even is asked (ties: feature order, then value). Unknown facts count as "no"
// for the split and survive a "no" answer but not a "yes".
// Effects: none. Cross-world: ctx.request('ui.openTab', { tab: 'guess' }).

import { animals as catalogAnimals } from '../../lib/knowledge/animals.mjs?v=7ef6dd8b71';

export const FEATURES = ['class', 'legs', 'fly', 'swim', 'habitat', 'diet', 'covering'];
// where an animal lives, said as a child says it: the habitat word as the catalog has it, with the preposition of the few that take "on" ("on a farm", "on the ice"); no table of habitats
const ON = new Set(['farm', 'savanna', 'ice', 'beach', 'tundra', 'cliff', 'island']);
export const habitatPhrase = (h) => (ON.has(h) ? `on ${h === 'farm' ? 'a farm' : `the ${h}`}` : h === 'house' ? 'in a house' : `in the ${String(h).replace(/_/g, ' ')}`);
const COVER = { fur: 'Does it have fur?', hair: 'Does it have hair?', feather: 'Does it have feathers?', feathers: 'Does it have feathers?', scale: 'Does it have scales?', scales: 'Does it have scales?', skin: 'Does it have bare skin?', shell: 'Does it have a shell?', wool: 'Does it have wool?', spine: 'Does it have spines?', spines: 'Does it have spines?' };
const DIET = { herbivore: 'Does it eat only plants?', carnivore: 'Does it eat only meat?', omnivore: 'Does it eat both plants and meat?' };

export function initialState() {
  return { phase: 'idle', candidates: [], asked: [], count: 0, max: 20, current: null, guess: null, rejected: [], solved: null, learned: [], evidence: [] };
}

const ok = (value) => ({ status: 'supported', value });
const no = (status, note) => ({ status, note });
export const words = (s) => String(s).replace(/_/g, ' ');
export const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + words(w);
const uniq = (a) => [...new Set(a)];

/** Merged animal profiles: [{ name, class, legs, fly, swim, habitat, diet, covering }]; values are arrays (unknown = empty). The catalog's animals, then what the dialogue taught, then what the player taught the game. */
export function readAnimals(ctx, learned) {
  const map = new Map();
  const blank = (name) => ({ name, class: [], legs: [], fly: [], swim: [], habitat: [], diet: [], covering: [], not: [] });
  for (const a of catalogAnimals().values()) {   // k.animals: `can` / `cannot` hold the verbs (fly, swim); a verb left out says nothing
    const p = blank(a.name.replace(/ /g, '_'));   // a name with a space is told as a word (polar_bear), as the old knowledge base wrote it
    p.class.push(...a.class); p.legs.push(...a.legs); p.habitat.push(...a.habitat); p.diet.push(...a.diet); p.covering.push(...a.covering);
    if (a.can.includes('fly')) p.fly.push(true);
    if (a.cannot.includes('fly')) p.fly.push(false);
    if (a.can.includes('swim')) p.swim.push(true);
    if (a.cannot.includes('swim')) p.swim.push(false);
    map.set(p.name, p);
  }
  for (const w of ctx.find('kids.animals.animal')) {   // the animals the dialogue taught (wires of the session)
    const name = ctx.val(w, 'name');
    if (!name) continue;
    if (!map.has(name)) map.set(name, blank(name));
    const p = map.get(name);
    p.class.push(...ctx.vals(w, 'class'));
    p.legs.push(...ctx.vals(w, 'legs').map(String));
    p.fly.push(...ctx.vals(w, 'can_fly'));
    p.swim.push(...ctx.vals(w, 'can_swim'));
    p.habitat.push(...ctx.vals(w, 'habitat'));
    p.diet.push(...ctx.vals(w, 'diet'));
    p.covering.push(...ctx.vals(w, 'covering'));
  }
  for (const l of learned ?? []) {
    if (!map.has(l.name)) map.set(l.name, blank(l.name));
    const p = map.get(l.name);
    p.not.push(...(l.not ?? []));
    for (const [f, vs] of Object.entries(l.traits ?? {})) for (const v of vs) {
      if (f === 'fly' || f === 'swim') p[f].push(v === 'yes'); else p[f].push(String(v));
    }
  }
  for (const p of map.values()) for (const f of FEATURES) p[f] = uniq(p[f]);
  return [...map.values()];
}

/** true / false / undefined (unknown) */
export function truth(p, f, v) {
  if (p.not.includes(`${f}=${v}`)) return false;
  const vals = p[f];
  if (f === 'fly' || f === 'swim') return vals.includes(true) ? true : vals.includes(false) ? false : undefined;
  if (!vals.length) return undefined;
  return String(v).includes('|') ? String(v).split('|').some((x) => vals.includes(x)) : vals.includes(v);   // 'carnivore|omnivore': evidence "it eats meat"
}

function questionText(f, v) {
  switch (f) {
    case 'class': return `Is it ${an(v)}?`;
    case 'legs': return v === '0' ? 'Does it have no legs?' : `Does it have ${v} ${v === '1' ? 'leg' : 'legs'}?`;
    case 'fly': return 'Can it fly?';
    case 'swim': return 'Can it swim?';
    case 'habitat': return `Does it live ${habitatPhrase(v)}?`;
    case 'diet': return DIET[v] ?? `Is it ${an(v)}?`;
    default: return COVER[v] ?? `Is its body covered with ${words(v)}?`;
  }
}

/** The best question for the candidate profiles (not yet asked), or null when none splits them. */
export function pickQuestion(profiles, asked) {
  const done = new Set(asked.map((a) => `${a.feature}=${a.value}`));
  let best = null;
  for (const f of FEATURES) {
    const values = f === 'fly' || f === 'swim' ? ['yes'] : uniq(profiles.flatMap((p) => p[f]).map(String)).sort();
    for (const v of values) {
      if (done.has(`${f}=${v}`)) continue;
      const t = (p) => truth(p, f, f === 'fly' || f === 'swim' ? 'yes' : v);
      const yes = profiles.filter((p) => t(p) === true).length;
      const noo = profiles.length - yes;
      if (!yes || !noo) continue;
      const diff = Math.abs(yes - noo);
      if (!best || diff < best.diff) best = { feature: f, value: v, yes, no: noo, of: profiles.length, diff, text: questionText(f, v) };
    }
  }
  return best;
}

const profilesOf = (ctx) => { const s = ctx.state; const all = readAnimals(ctx, s.learned); const byName = new Map(all.map((p) => [p.name, p])); return { all, byName, cur: s.candidates.map((n) => byName.get(n)).filter(Boolean) }; };

function makeGuess(ctx) {
  const s = ctx.state;
  const name = s.candidates.find((n) => !s.rejected.includes(n));
  if (!name) { s.phase = 'learning'; s.current = null; s.guess = null; return `I give up! What animal were you thinking of? You can teach me, for example: "it was a zebra".`; }
  s.phase = 'guessing'; s.current = null; s.guess = name;
  return `I think it is ${an(name)}. Am I right?`;
}

function next(ctx) {
  const s = ctx.state;
  if (s.candidates.length === 0) { s.phase = 'learning'; s.current = null; return `I give up! None of the animals I know fits your answers. What animal were you thinking of? Teach me, for example: "it was a zebra".`; }
  if (s.candidates.length === 1 || s.count >= s.max) return makeGuess(ctx);
  const { cur } = profilesOf(ctx);
  const q = pickQuestion(cur, [...s.asked, ...(s.evidence ?? [])]);
  if (!q) return makeGuess(ctx);
  s.phase = 'asking';
  s.current = { feature: q.feature, value: q.value, text: q.text, yes: q.yes, no: q.no, of: q.of };
  return `Question ${s.count + 1}: ${q.text}`;
}

export function start(ctx) {
  const s = ctx.state;
  ctx.request('ui.openTab', { tab: 'guess' });
  const all = readAnimals(ctx, s.learned);
  if (!all.length) return no('missing', 'I do not know any animals yet, so I cannot play.');
  Object.assign(s, { phase: 'asking', candidates: all.map((p) => p.name), asked: [], evidence: [], count: 0, current: null, guess: null, rejected: [], solved: null });
  const q = next(ctx);
  return ok(`Think of an animal and I will try to guess it. Answer with yes, no, I don't know or maybe. ${q}`);
}

export function answer(ctx, { answer: a }) {
  const s = ctx.state;
  if (s.phase === 'idle' || s.phase === 'done') return no('missing', s.phase === 'idle' ? 'We are not playing twenty questions. Say "guess my animal" to start.' : 'The game is over. Say "new game" to play again.');
  if (s.phase === 'learning') return no('missing', 'I am waiting to learn the animal. Tell me, for example: "it was a zebra".');
  if (s.phase === 'guessing') {
    if (a === 'yes') { s.phase = 'done'; s.solved = s.guess; return ok(`I got it! It was ${an(s.guess)}, and I needed ${s.count} ${s.count === 1 ? 'question' : 'questions'}. Say "new game" to play again.`); }
    if (a === 'no') {
      s.rejected.push(s.guess);
      s.candidates = s.candidates.filter((n) => n !== s.guess);
      const g = s.guess; s.guess = null;
      return ok(`Oh, not ${an(g)}. ${next(ctx)}`);
    }
    return no('missing', `Please answer yes or no: is it ${an(s.guess)}?`);
  }
  const q = s.current;
  s.asked.push({ feature: q.feature, value: q.value, text: q.text, answer: a });
  s.count++;
  const keepsYes = (p) => truth(p, q.feature, q.feature === 'fly' || q.feature === 'swim' ? 'yes' : q.value);
  const { cur } = profilesOf(ctx);
  if (a === 'yes') s.candidates = cur.filter((p) => keepsYes(p) === true).map((p) => p.name);
  else if (a === 'no') s.candidates = cur.filter((p) => keepsYes(p) !== true).map((p) => p.name);
  const lead = a === 'yes' ? 'Good.' : a === 'no' ? 'OK.' : a === 'maybe' ? 'Hmm, then I will not count on that one.' : 'No problem, I will ask something else.';
  return ok(`${lead} ${next(ctx)}`);
}

/** "wait, I meant yes": the player changes the answer of the question before the current one (modal answer scope: only while asking). */
export function correct(ctx, { answer: a }) {
  const s = ctx.state;
  if (s.phase !== 'asking' || !s.asked.length) return answer(ctx, { answer: a });   // nothing to correct: it is an ordinary answer
  const last = s.asked.at(-1);
  const was = last.answer;
  last.answer = a;
  // the candidates are recomputed from every answer given so far, with the corrected one
  let cur = readAnimals(ctx, s.learned).filter((p) => !s.rejected.includes(p.name));
  for (const e of [...s.asked, ...(s.evidence ?? [])]) {
    const keeps = (p) => truth(p, e.feature, e.feature === 'fly' || e.feature === 'swim' ? 'yes' : e.value);
    if (e.answer === 'yes') cur = cur.filter((p) => keeps(p) === true);
    else if (e.answer === 'no') cur = cur.filter((p) => keeps(p) !== true);
  }
  s.candidates = cur.map((p) => p.name);
  const said = { yes: 'yes', no: 'no', maybe: 'maybe', dontknow: "I don't know" };
  return ok(`OK, I changed my note of "${last.text}" from ${said[was] ?? was} to ${said[a] ?? a}. ${next(ctx)}`);
}

export const slug = (t) => {
  let n = String(t).toLowerCase().trim().replace(/[^a-z ]/g, '').replace(/\s+/g, '_');
  if (n.length > 3 && n.endsWith('ies')) n = n.slice(0, -3) + 'y';
  else if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) n = n.slice(0, -1);
  return n;
};

export function reveal(ctx, { animal }) {
  const s = ctx.state;
  const name = slug(animal);
  if (!name || name === 'animal') return no('unsupported', 'Which animal was it?');
  if (s.phase === 'idle') return no('missing', 'We are not playing twenty questions. Say "guess my animal" to start.');
  const known = readAnimals(ctx, s.learned).some((p) => p.name === name);
  const wasAsking = s.phase !== 'done' || s.solved === null;
  const traits = {}, not = [];
  for (const a of [...s.asked, ...(s.evidence ?? []).filter((e) => !String(e.value).includes('|'))]) {
    const f = a.feature, v = f === 'fly' || f === 'swim' ? 'yes' : a.value;
    if (a.answer === 'yes') (traits[f] ??= []).push(v);
    else if (a.answer === 'no') not.push(`${f}=${v}`);
  }
  s.phase = 'done'; s.solved = name; s.current = null; s.guess = null;
  if (known) return ok(`Ah, ${an(name)}! I know that animal, but my questions did not lead me to it. Next time I will do better. Say "new game" to play again.`);
  void wasAsking;
  const learned = s.learned.find((l) => l.name === name);
  if (learned) { learned.traits = traits; learned.not = not; } else s.learned.push({ name, traits, not });
  const facts = [];
  if (traits.class) facts.push(`class=${traits.class[0]}`);
  if (traits.legs) facts.push(`legs=${traits.legs[0]}`);
  if (traits.fly) facts.push('can_fly=true');
  if (traits.swim) facts.push('can_swim=true');
  for (const h of traits.habitat ?? []) facts.push(`habitat=${h}`);
  if (traits.diet) facts.push(`diet=${traits.diet[0]}`);
  for (const c of traits.covering ?? []) facts.push(`covering=${c}`);
  try {
    ctx.emit(`@{_} kids.animals.animal name=${name} ${facts.join(' ')} core.source="games.guess: taught by the player"`);
  } catch {
    ctx.emit(`@{_} games.guess.learned animal=${name}${facts.map((f) => ` trait="${f}"`).join('')}`);
  }
  const said = facts.length ? ` From your answers I know it ${facts.length === 1 ? 'has' : 'has'} these traits: ${facts.map((f) => f.replace('=', ' ').replace(/_/g, ' ')).join(', ')}.` : '';
  return ok(`Thank you! I learned about ${an(name)}.${said} I will remember it in the next game.`);
}

export function giveUp(ctx) {
  const s = ctx.state;
  if (s.phase !== 'asking' && s.phase !== 'guessing') return no('missing', 'We are not in the middle of a game of twenty questions.');
  s.phase = 'learning'; s.current = null; s.guess = null;
  return ok('OK, I give up. What was it? You can teach me, for example: "it was a zebra".');
}

export function hint() { return ok('I am the one who is guessing, so no hints for me! Think of your animal and answer my questions.'); }

export function why(ctx) {
  const c = ctx.state.current;
  if (!c) return no('missing', 'I have not asked a question right now.');
  return ok(`I asked "${c.text}" because it splits the ${c.of} animals I still think of into ${c.yes} that would say yes and ${c.no} that would not, which is as even as I can get.`);
}

export function remaining(ctx) {
  const s = ctx.state;
  if (s.phase === 'idle') return no('missing', 'We have not started a game yet.');
  const n = s.candidates.length;
  if (!n) return ok('No animal is left.');
  const shown = s.candidates.slice(0, 12).map(words);
  return ok(`I am still thinking of ${n} ${n === 1 ? 'animal' : 'animals'}: ${shown.slice(0, -1).join(', ')}${shown.length > 1 ? ' and ' : ''}${shown.at(-1)}${n > shown.length ? ' and more' : ''}.`);
}

export function count(ctx) {
  const s = ctx.state;
  if (s.phase === 'idle') return no('missing', 'We have not started a game yet.');
  return ok(`I have asked ${s.count} ${s.count === 1 ? 'question' : 'questions'} so far, so I have ${Math.max(0, s.max - s.count)} left.`);
}

export function repeat(ctx) {
  const s = ctx.state;
  if (s.phase === 'asking' && s.current) return ok(`Question ${s.count + 1}: ${s.current.text}`);
  if (s.phase === 'guessing') return ok(`I think it is ${an(s.guess)}. Am I right?`);
  return no('missing', 'There is no question to repeat.');
}

/** What a fact the player volunteers means: feature, the values that satisfy it ('a|b' = either), and how it is said. */
const FOOD_MEAT = new Set(['meat', 'flesh', 'fish', 'insects', 'mice', 'rats', 'birds', 'animals', 'prey']);
const FOOD_PLANT = new Set(['plants', 'plant', 'grass', 'leaves', 'vegetables', 'fruit', 'fruits', 'seeds', 'nuts', 'hay', 'herbs']);
export function factOf(kind, value) {
  const v = String(value).toLowerCase().replace(/_/g, ' ').trim();
  switch (kind) {
    case 'eats':
      if (FOOD_MEAT.has(v)) return { feature: 'diet', value: 'carnivore|omnivore', say: `it eats ${v}` };
      if (FOOD_PLANT.has(v)) return { feature: 'diet', value: 'herbivore|omnivore', say: `it eats ${v}` };
      if (v === 'everything' || v === 'both' || v === 'anything') return { feature: 'diet', value: 'omnivore', say: 'it eats everything' };
      return null;
    case 'can': return v === 'fly' || v === 'swim' ? { feature: v, value: 'yes', say: `it can ${v}` } : null;
    case 'cannot': return v === 'fly' || v === 'swim' ? { feature: v, value: 'yes', no: true, say: `it cannot ${v}` } : null;
    case 'has': {
      const cover = { fur: 'fur', feathers: 'feather', feather: 'feather', scales: 'scale', scale: 'scale', shell: 'shell', wool: 'wool', spines: 'spine', spine: 'spine', skin: 'skin' }[v.replace(/^an? /, '')];
      if (cover) return { feature: 'covering', value: cover, say: `it has ${v}` };
      const legs = /^(\d+) legs?$/.exec(v);
      return legs ? { feature: 'legs', value: legs[1], say: `it has ${v}` } : null;
    }
    case 'lives': return { feature: 'habitat', value: v.replace(/^the /, '').replace(/\s+/g, '_'), say: `it lives in the ${v.replace(/^the /, '')}` };
    case 'is': return { feature: 'class', value: v.replace(/^an? /, ''), say: `it is ${/^[aeiou]/.test(v) ? 'an' : 'a'} ${v}` };
    default: return null;
  }
}

/** "it eats meat", "it can swim", "it has 4 legs" (RP3): a fact the player volunteers narrows the candidates like an answer, without counting as a question. */
export function evidence(ctx, { kind, value }) {
  const s = ctx.state;
  if (s.phase !== 'asking') return no('missing', s.phase === 'idle' || s.phase === 'done' ? 'We are not playing twenty questions. Say "guess my animal" to start.' : 'That does not help right now.');
  const f = factOf(kind, value);
  if (!f) return no('unsupported', 'I do not know how to use that as a clue.');
  const { cur } = profilesOf(ctx);
  const holds = (p) => truth(p, f.feature, f.value);
  let keep = cur.filter((p) => (f.no ? holds(p) !== true : holds(p) === true));
  if (!keep.length) keep = cur.filter((p) => holds(p) === undefined);
  if (!keep.length) return ok(`Hmm, none of the animals I know fits that, so I will not use "${f.say}".`);
  s.candidates = keep.map((p) => p.name);
  (s.evidence ??= []).push({ feature: f.feature, value: f.value, text: f.say, answer: f.no ? 'no' : 'yes' });
  return ok(`Noted: ${f.say}. ${next(ctx)}`);
}

// ---- the declared schema (schema.sop, declare=yes): the answers to the question that is asked; the start when no game is on
import { declaredExecutor } from '../acts/acts.mjs?v=a8ee8a4618';
import { SCHEMA } from './schema.declared.mjs?v=2c6e484dad';
export const executor = declaredExecutor(SCHEMA, {
  sampleKnowledge: ({ state }) => ({ answers: state?.phase === 'asking' || state?.phase === 'guessing' ? ['Yes.', 'No.', "I don't know."] : ['Guess my animal.'] }),
});
