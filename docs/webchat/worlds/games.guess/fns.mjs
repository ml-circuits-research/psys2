// SPDX-License-Identifier: AGPL-3.0-only
// games.guess on the matrix reasoner (spec 15). The rules (the phase of the game, which animals are still possible, how many questions are left, what may be
// answered) are in matrix.sop; this file is what the library cannot say: the best question (the split that is the most even), how an answer narrows the
// animals (`truth`, shared with ops.mjs), reading a clue, what is learned, the words of the replies (the same sentences ops.mjs says) and the state the tab
// reads (derived from the wires after every change). Browser-safe; it imports its sibling ops.mjs for the tables. The registered names are prefixed (gs*).
import { readAnimals, truth, pickQuestion, an, slug, factOf } from './ops.mjs?v=c710cc602a';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '').replace(/\\"/g, '"');
const val = (w, k) => un(w?.attrs?.[k]?.[0]);
const vals = (w, k) => (w?.attrs?.[k] ?? []).map(un);
const q = JSON.stringify;
const MAX = 20;
const NOT_PLAYING = 'We are not playing twenty questions. Say "guess my animal" to start.';
const num = (w, k) => Number(val(w, k));

/** The animals the game was taught, as ops.mjs keeps them: [{ name, traits: { feature: [values] }, not: ['feature=value'] }]. */
function learnedOf(find) {
  return find('guess.learned').map((w) => {
    const traits = {};
    for (const t of vals(w, 'trait')) { const i = t.indexOf('='); (traits[t.slice(0, i)] ??= []).push(t.slice(i + 1)); }
    return { name: val(w, 'name'), traits, not: vals(w, 'not'), k: Number(String(w.id).replace(/\D+/g, '')) || 0 };
  }).sort((a, b) => a.k - b.k).map(({ k, ...l }) => l);
}

/**
 * The state ops.mjs keeps (and the tab reads), derived from the wires: { phase, candidates, asked, count, max, current, guess, rejected, solved, learned, evidence }.
 */
export function toState({ find }) {
  const learned = learnedOf(find);
  const g = find('guess.game')[0];
  if (!g) return { phase: 'idle', candidates: [], asked: [], count: 0, max: MAX, current: null, guess: null, rejected: [], solved: null, learned, evidence: [] };
  const byN = (k) => (a, b) => Number(val(a, k)) - Number(val(b, k));
  const entry = (w) => ({ feature: val(w, 'feature'), value: val(w, 'value'), text: val(w, 'text'), answer: val(w, 'answer') });
  const asked = find('guess.ans').sort(byN('n')).map(entry);
  const evidence = find('guess.ev').sort(byN('k')).map(entry);
  const qw = find('guess.q')[0], tw = find('guess.try')[0], sw = find('guess.solved')[0];
  return {
    phase: val(find('guess.phase')[0], 'p') || 'idle',
    candidates: find('guess.cand').sort(byN('i')).map((w) => val(w, 'name')),
    asked, count: asked.length, max: num(g, 'max') || MAX,
    current: qw ? { feature: val(qw, 'feature'), value: val(qw, 'value'), text: val(qw, 'text'), yes: num(qw, 'yes'), no: num(qw, 'no'), of: num(qw, 'of') } : null,
    guess: tw ? val(tw, 'name') : null,
    rejected: find('guess.out').filter((w) => val(w, 'how') === 'rej').sort(byN('k')).map((w) => val(w, 'name')),
    solved: sw ? val(sw, 'name') : null,
    learned, evidence,
  };
}

const stateOf = (ctx) => toState({ find: ctx.find });
const ok = (value, extra = {}) => ({ value, ...extra });
const missing = (note) => ({ status: 'missing', note });
const ofFeature = (f, v) => (f === 'fly' || f === 'swim' ? 'yes' : v);
const retractAll = (ctx, types) => { for (const t of types) for (const w of ctx.find(t)) ctx.retract(w.id); };

/** The refusal the rules gave, as the answer: the deny's own words, status `missing` (the status ops.mjs gives). */
const refusal = (v) => missing(String(v?.why ?? 'That does not help right now.'));

/** The profiles of the animals now possible (and all of them, by name). */
function profiles(ctx, st) {
  const all = readAnimals(ctx.host.view(ctx), st.learned);
  const byName = new Map(all.map((p) => [p.name, p]));
  return { all, byName, cur: st.candidates.map((n) => byName.get(n)).filter(Boolean) };
}

/** Takes out the animals of `cur` that are not in `keep` (how = ans|ev|rej), as guess.out wires. Returns the text to tell. */
function outs(ctx, cur, keep, how) {
  const kept = new Set(keep);
  const k0 = Math.max(0, ...ctx.find('guess.out').map((w) => num(w, 'k') || 0));
  return cur.filter((p) => !kept.has(p.name)).map((p, i) => `@gs.o_${p.name}_${how} guess.out name=${p.name} how=${how} k=${k0 + i + 1}`).join('\n');
}

/** The computer's guess, or the wait for the name of the animal when every guess was wrong. */
function makeGuess(ctx, st) {
  const name = st.candidates.find((n) => !st.rejected.includes(n));
  if (!name) { ctx.tell('@gs.learn guess.learn'); return 'I give up! What animal were you thinking of? You can teach me, for example: "it was a zebra".'; }
  ctx.tell(`@gs.try guess.try name=${name} label=${q(an(name))}`);
  return `I think it is ${an(name)}. Am I right?`;
}

/** What comes next: a guess when one animal is left or the questions are used up, else the question that splits the animals most evenly. */
function next(ctx) {
  const st = stateOf(ctx);
  if (st.candidates.length === 0) { ctx.tell('@gs.learn guess.learn'); return 'I give up! None of the animals I know fits your answers. What animal were you thinking of? Teach me, for example: "it was a zebra".'; }
  if (st.candidates.length === 1 || st.count >= st.max) return makeGuess(ctx, st);
  const { cur } = profiles(ctx, st);
  const pick = pickQuestion(cur, [...st.asked, ...st.evidence]);
  if (!pick) return makeGuess(ctx, st);
  ctx.tell(`@gs.q guess.q feature=${pick.feature} value=${q(pick.value)} text=${q(pick.text)} yes=${pick.yes} no=${pick.no} of=${pick.of}`);
  return `Question ${st.count + 1}: ${pick.text}`;
}

/** Asks the rules whether a probe wire may be told (`type` has the deny); returns the first violation or null. */
const refused = (ctx, text) => { const c = ctx.world.check({ wires: text }); return c.ok ? null : (c.violations ?? []).find((v) => v.why) ?? c.violations?.[0] ?? { why: '' }; };

/** The one answer logic of ops.mjs `answer`, on wires. */
function answerIt(ctx, a) {
  const bad = refused(ctx, `@gs.p guess.reply answer=${a}`);
  if (bad) return refusal(bad);
  const st = stateOf(ctx);
  if (st.phase === 'guessing') {
    if (a === 'yes') {
      const g = st.guess;   // (the guess stays on the state, as in ops.mjs: the phase rules say a guess with a solution is no open guess)
      ctx.tell(`@gs.solved guess.solved name=${g}`);
      return ok(`I got it! It was ${an(g)}, and I needed ${st.count} ${st.count === 1 ? 'question' : 'questions'}. Say "new game" to play again.`);
    }
    const g = st.guess, { cur } = profiles(ctx, st);
    retractAll(ctx, ['guess.try']);
    const o = outs(ctx, cur, st.candidates.filter((n) => n !== g), 'rej');
    if (o) ctx.tell(o);
    return ok(`Oh, not ${an(g)}. ${next(ctx)}`);
  }
  const cq = st.current;
  const { cur } = profiles(ctx, st);
  const keepsYes = (p) => truth(p, cq.feature, ofFeature(cq.feature, cq.value));
  const kept = a === 'yes' ? cur.filter((p) => keepsYes(p) === true) : a === 'no' ? cur.filter((p) => keepsYes(p) !== true) : cur;
  retractAll(ctx, ['guess.q']);
  ctx.tell(`@gs.a${st.count} guess.ans n=${st.count} feature=${cq.feature} value=${q(cq.value)} text=${q(cq.text)} answer=${a}\n${outs(ctx, cur, kept.map((p) => p.name), 'ans')}`);
  const lead = a === 'yes' ? 'Good.' : a === 'no' ? 'OK.' : a === 'maybe' ? 'Hmm, then I will not count on that one.' : 'No problem, I will ask something else.';
  return ok(`${lead} ${next(ctx)}`);
}

export const fns = {
  gsStart(ctx) {
    const st = stateOf(ctx);
    const all = readAnimals(ctx.host.view(ctx), st.learned);
    if (!all.length) return { ...missing('I do not know any animals yet, so I cannot play.'), openTab: 'guess' };
    retractAll(ctx, ['guess.game', 'guess.animal', 'guess.out', 'guess.ans', 'guess.ev', 'guess.q', 'guess.try', 'guess.learn', 'guess.solved']);
    ctx.tell(`@gs.g guess.game max=${MAX}\n${all.map((p, i) => `@gs.n${i} guess.animal name=${p.name} i=${i}`).join('\n')}`);
    const first = next(ctx);
    return ok(`Think of an animal and I will try to guess it. Answer with yes, no, I don't know or maybe. ${first}`, { openTab: 'guess' });
  },

  gsAnswer(ctx, { answer }) { return answerIt(ctx, un(answer)); },

  /** "wait, I meant yes": the player changes the answer of the question before the current one. */
  gsCorrect(ctx, { answer }) {
    const a = un(answer);
    const st = stateOf(ctx);
    if (st.phase !== 'asking' || !st.asked.length) return answerIt(ctx, a);   // nothing to correct: it is an ordinary answer
    const last = st.asked.at(-1), was = last.answer, n = st.asked.length - 1;
    const old = ctx.find('guess.ans').find((w) => num(w, 'n') === n);
    ctx.retract(old.id);
    for (const w of ctx.find('guess.out')) if (val(w, 'how') !== 'rej') ctx.retract(w.id);
    ctx.tell(`@gs.a${n} guess.ans n=${n} feature=${last.feature} value=${q(last.value)} text=${q(last.text)} answer=${a}`);
    // the animals are recomputed from every answer given so far, with the corrected one
    const now = stateOf(ctx), rejected = new Set(now.rejected);
    const all = readAnimals(ctx.host.view(ctx), now.learned).filter((p) => !rejected.has(p.name));
    let cur = all;
    for (const e of [...now.asked, ...now.evidence]) {
      const keeps = (p) => truth(p, e.feature, ofFeature(e.feature, e.value));
      if (e.answer === 'yes') cur = cur.filter((p) => keeps(p) === true);
      else if (e.answer === 'no') cur = cur.filter((p) => keeps(p) !== true);
    }
    const universe = ctx.find('guess.animal').map((w) => val(w, 'name'));
    const keep = new Set(cur.map((p) => p.name));
    const out = universe.filter((nm) => !keep.has(nm) && !rejected.has(nm)).map((nm, i) => `@gs.o_${nm}_ans guess.out name=${nm} how=ans k=${100 + i}`).join('\n');
    if (out) ctx.tell(out);
    const said = { yes: 'yes', no: 'no', maybe: 'maybe', dontknow: "I don't know" };
    retractAll(ctx, ['guess.q']);
    return ok(`OK, I changed my note of "${last.text}" from ${said[was] ?? was} to ${said[a] ?? a}. ${next(ctx)}`);
  },

  gsReveal(ctx, { animal }) {
    const name = slug(un(animal));
    if (!name || name === 'animal') return { status: 'unsupported', note: 'Which animal was it?' };
    const bad = refused(ctx, '@gs.p guess.named');
    if (bad) return refusal(bad);
    const st = stateOf(ctx);
    const known = readAnimals(ctx.host.view(ctx), st.learned).some((p) => p.name === name);
    const traits = {}, not = [];
    for (const a of [...st.asked, ...st.evidence.filter((e) => !String(e.value).includes('|'))]) {
      const f = a.feature, v = ofFeature(f, a.value);
      if (a.answer === 'yes') (traits[f] ??= []).push(v);
      else if (a.answer === 'no') not.push(`${f}=${v}`);
    }
    retractAll(ctx, ['guess.q', 'guess.try', 'guess.learn', 'guess.solved']);
    ctx.tell(`@gs.solved guess.solved name=${name}`);
    if (known) return ok(`Ah, ${an(name)}! I know that animal, but my questions did not lead me to it. Next time I will do better. Say "new game" to play again.`);
    const traitText = Object.entries(traits).flatMap(([f, vs]) => vs.map((v) => `trait=${q(`${f}=${v}`)}`));
    const learned = ctx.find('guess.learned');
    const had = learned.find((w) => val(w, 'name') === name);
    const lw = `@${had ? had.id : `gs.l${Math.max(0, ...learned.map((w) => Number(String(w.id).replace(/\D+/g, '')) || 0)) + 1}`} guess.learned name=${name} ${traitText.join(' ')} ${not.map((x) => `not=${q(x)}`).join(' ')}`;
    if (had) ctx.replace(had.id, lw); else ctx.tell(lw);
    const facts = [];
    if (traits.class) facts.push(`class=${traits.class[0]}`);
    if (traits.legs) facts.push(`legs=${traits.legs[0]}`);
    if (traits.fly) facts.push('can_fly=true');
    if (traits.swim) facts.push('can_swim=true');
    for (const h of traits.habitat ?? []) facts.push(`habitat=${h}`);
    if (traits.diet) facts.push(`diet=${traits.diet[0]}`);
    for (const c of traits.covering ?? []) facts.push(`covering=${c}`);
    const wire = `@gs.kb_${name} kids.animals.animal name=${name} ${facts.join(' ')} core.source="games.guess: taught by the player"`;
    if (ctx.world.check({ wires: wire }).ok) ctx.tell(wire);
    const said = facts.length ? ` From your answers I know it has these traits: ${facts.map((f) => f.replace('=', ' ').replace(/_/g, ' ')).join(', ')}.` : '';
    return ok(`Thank you! I learned about ${an(name)}.${said} I will remember it in the next game.`);
  },

  gsGiveUp(ctx) {
    const bad = refused(ctx, '@gs.p guess.quit');
    if (bad) return refusal(bad);
    retractAll(ctx, ['guess.q', 'guess.try']);
    ctx.tell('@gs.learn guess.learn');
    return ok('OK, I give up. What was it? You can teach me, for example: "it was a zebra".');
  },

  /** "it eats meat", "it can swim", "it has 4 legs": a fact the player volunteers narrows the animals like an answer, without counting as a question. */
  gsEvidence(ctx, { kind, value }) {
    const bad = refused(ctx, '@gs.p guess.clue');
    if (bad) return refusal(bad);
    const f = factOf(un(kind), un(value));   // (the arguments of the library are tokens: a string keeps its quotes)
    if (!f) return { status: 'unsupported', note: 'I do not know how to use that as a clue.' };
    const st = stateOf(ctx), { cur } = profiles(ctx, st);
    const holds = (p) => truth(p, f.feature, f.value);
    let keep = cur.filter((p) => (f.no ? holds(p) !== true : holds(p) === true));
    if (!keep.length) keep = cur.filter((p) => holds(p) === undefined);
    if (!keep.length) return ok(`Hmm, none of the animals I know fits that, so I will not use "${f.say}".`);
    const k = Math.max(0, ...ctx.find('guess.ev').map((w) => num(w, 'k') || 0)) + 1;
    retractAll(ctx, ['guess.q']);
    ctx.tell(`@gs.e${k} guess.ev k=${k} feature=${f.feature} value=${q(f.value)} text=${q(f.say)} answer=${f.no ? 'no' : 'yes'}\n${outs(ctx, cur, keep.map((p) => p.name), 'ev')}`);
    return ok(`Noted: ${f.say}. ${next(ctx)}`);
  },
};

/** What "undo" says (the host layer rewound the library to before the last turn that changed it); `before` is null when there was nothing to take back. */
export function undoWords({ before, after }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet: we have not played.' };
  const asking = after.phase === 'asking' && after.current ? ` I am asking that question again: ${after.current.text}` : '';
  const value = after.asked.length < before.asked.length ? `OK, I took back your last answer.${asking}`
    : after.learned.length < before.learned.length ? 'OK, I forgot the animal you taught me.'
    : after.phase === 'idle' && before.phase !== 'idle' ? 'OK, I took back the start of the game.'
    : null;   // a change the state cannot tell: the host's generic words quote what the user said
  return { value, openTab: 'guess' };
}
