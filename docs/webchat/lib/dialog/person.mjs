// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE PERSON OF THE SESSION (questions.md Q19, reviewer 2026-11-15 05:10; spec 23 "The person of the session"). What the user says about themselves ("my name is Ana", "I am 45",
 * "I have two kids", "I like cats, dogs and horses", "I am a teacher", "I speak English and Romanian") and asks about themselves ("what do you know about me", "how many kids do I
 * have", "how old am I") is kept as facts of the catalog's world schema `w.person` (a person with `user=true`, relatives with relation and count, tastes typed by the catalog type),
 * held by the session (the state of session.things, key `person`): private to the session, shown in Settings › Privacy, cleared with the session. Browser-safe: no `node:*`.
 *
 * Nothing here is phrasing of our own: the sentences are read by the catalog's w.lang.en frames of the shard person-frames (8 statements, mood declarative; 8 questions, mood
 * interrogative) with the library's `readFrames`; the facts are told to a library World loaded with the w.person schema (so the schema checks them: an enum relation, a count of at
 * least 1, an age in 0..130); "what do you know about me" is the library's `describeThing` (L5 of sopworld 0.129); a name or an age goes through the library's `tellStatement`.
 * The list after "I like" is split into things (the frame's items), each made singular (en.singular) and typed by the catalog (the type of the catalog's records of the word).
 * The interview ("get to know me", "stop", "coming back to knowing me") asks the person's keys in the schema's order; its phrasing is the core.phrase groups person.* of lang.common.
 *
 *   personTurn(dialog, english)   -> null (not about the person) | { reply, status, info: { kind: 'person', frame }, segment }
 *   personView(state)             -> { name, age, occupation, language: [], relatives: [{ relation, count }], likes: [{ thing, type }], dislikes: [...] } of a session.things state
 */
import { BUNDLED_PERSON } from '../knowledge/bundled-person.mjs?v=a3a13dc352';
import { en } from '../lang/en.mjs?v=185de688b8';
import { numberWords, numberValue } from '../knowledge/values.mjs?v=c3d5c59521';
import { ACT_VERBS } from '../../worlds/acts/verbs.generated.mjs?v=8fbdca66b6';
import { personView } from './person-view.mjs?v=ceeabdb255';
import { guard } from '../formalizer/guard.mjs?v=82a55329d9';
import { within, TIMED_OUT } from './knowledge-lookup.mjs?v=d6fae21c97';

export { personView };

const HOME = 'session.things';
const NAME_HOME = 'kids.common';   // the home of the user's name (its own reader of introductions, state `userName`)
/** The order the interview asks the person's keys in (the schema's slots of w.person.person, then the tastes). */
const ASK_ORDER = ['name', 'occupation', 'age', 'language', 'likes'];
const QUESTION = { name: 'What is your name?', occupation: 'What do you do for a living?', age: 'How old are you?', language: 'Which languages do you speak?', likes: 'What do you like?' };
/** The catalog types a taste is typed by, most telling first (a cat is an animal before it is a drawable object). */
const TYPE_ORDER = ['k.animals.animal', 'k.food.food', 'k.genres.genre', 'k.music.instrument', 'k.objects.object', 'k.actions.action', 'k.attributes.thing', 'k.commonsense.thing', 'k.words.sense'];
/** Pronouns and demonstratives are not things one likes ("I like it", "I love you"): such a statement is about something else. */
const NOT_A_THING = new Set(['it', 'this', 'that', 'them', 'these', 'those', 'you', 'him', 'her', 'me', 'myself', 'everything', 'nothing', 'something', 'anything', 'to', 'when', 'how', 'what']);
const PLURAL_OF = { child: 'children', person: 'people' };
const NAME_FRAMES = new Set(['person.state.name', 'person.state.called', 'person.ask.name']);
const PRIVATE = 'It stays in this conversation. Nothing leaves this device.';
/** The answer to a question about the speaker when nothing is known (fresh, or after "Forget what you know about me"): a composed reply (`person.know.none`, w.lang.ro.reply). */
export const NOTHING_YET = 'I do not know anything about you yet.';
/** The user's name: kids.common keeps it (`userName`); the interview's answer is kept there too. */
const nameOf = (dialog, person) => dialog.isession.state['kids.common']?.userName ?? person.me.name ?? null;
const verbs = new Set(Object.values(ACT_VERBS).flat().map((v) => v.split('_')[0]));
const cap = (s) => String(s).replace(/(^|[\s-])(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const plain = (t) => String(t ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}\s,-]+/gu, ' ').replace(/\s+/g, ' ').trim();
const q = (v) => JSON.stringify(String(v));

let base = null;   // the library World with the schema and the frames (built once; each turn forks a World with the session's facts)
function reader(lib) {
  if (base?.lib === lib) return base;
  const world = new lib.World();
  world.load(BUNDLED_PERSON.schema);
  world.load(BUNDLED_PERSON.frames);
  // ADAPTER (asked of the library, questions.md [LIB]): readFrames reads a determiner, a numeral and the list particle of a language world by `form=`; w.lang.en writes `text=` and has no
  // list particle. The closed words the frames need are given in the library's shape, from the same catalog words (the articles and number words of the session's readers).
  const dets = ['a', 'an', 'the', 'my', 'some'];
  const nums = numberWords('cardinal').filter((w) => /^[a-z]+$/.test(w) && numberValue(w, 'cardinal') >= 1 && numberValue(w, 'cardinal') <= 100);
  world.load([...dets.map((d) => `@adapt.det.${d} w.lang.en.det form=${d}`), ...nums.map((n) => `@adapt.num.${n} w.lang.en.numeral form=${n} value=${numberValue(n, 'cardinal')}`), '@adapt.and w.lang.en.particle kind=conjunction meaning=and form=and'].join('\n'));
  base = { lib, world };
  return base;
}

/**
 * The session's person in the state of session.things (made on first use): `me` the user's own keys (name, age, occupation, language), `lines` the other w.person facts told
 * (relatives, tastes) as SOP lines, `said` the words the user used for a thing (cats for cat), `asking` the interview's open question, `paused`.
 */
function stateOf(dialog) {
  const st = dialog.isession.state[HOME];
  if (!st) return null;
  st.person ??= { me: {}, lines: [], said: {}, asking: null, paused: false };
  return st.person;
}
const meLine = (me) => `@me w.person.person user=true${Object.entries(me).flatMap(([k, v]) => [].concat(v).map((x) => ` ${k}=${typeof x === 'number' ? x : q(x)}`)).join('')}`;

/** A World with the schema and the session's facts. */
function worldOf(lib, person) {
  const r = reader(lib);
  const w = new lib.World();
  w.load(BUNDLED_PERSON.schema);
  w.load([meLine(person.me), ...person.lines].join('\n'));   // the user's own thing first: every relative and taste refers to it
  return { w, frames: r.world };
}

const relWord = (rel, n) => (n === 1 ? rel : PLURAL_OF[rel] ?? `${rel}s`);
const countText = (r) => (r.count === 1 ? `${/^[aeiou]/.test(r.relation) ? 'an' : 'a'} ${r.relation}` : `${r.count} ${relWord(r.relation, r.count)}`);
const things = (xs, said = {}) => list(xs.map((x) => said[x.thing] ?? x.thing));

/** "Here is what I know about you: ..." from the view (the library's describeThing gives the person's own keys; relatives and tastes are their own facts). */
function describe(v) {   // v.said: the user's words for the things
  const said = [];
  if (v.name) said.push(`your name is ${v.name}`);
  if (v.age != null) said.push(`you are ${v.age}`);
  if (v.occupation) said.push(`you are ${/^[aeiou]/i.test(v.occupation) ? 'an' : 'a'} ${v.occupation.toLowerCase()}`);
  if (v.language.length) said.push(`you speak ${list(v.language.map(cap))}`);
  if (v.relatives.length) said.push(`you have ${list(v.relatives.map(countText))}`);
  if (v.likes.length) said.push(`you like ${things(v.likes, v.said)}`);
  if (v.dislikes.length) said.push(`you do not like ${things(v.dislikes, v.said)}`);
  return said;
}

/**
 * The catalog types of the things one likes: the type of the catalog's records of each word, the most telling first (null when the catalog does not know it, is not attached or did
 * not answer in time). The records of all the things are asked together, and the wait is the catalog's, not the turn's (guard.untimed, bounded by the lookup deadline: a catalog
 * that hangs delays the turn once and only leaves the taste untyped; first-run evidence 2026-11-15: 4.7 s live, 385 shard reads asked one thing after another inside the turn clock).
 */
async function typesOf(dialog, things) {
  const k = dialog.engine.knowledge;
  if (!k?.thing) return things.map(() => null);
  const ask = (t) => { try { return Promise.resolve(k.peek?.(t) ?? k.thing(t)).catch(() => null); } catch { return Promise.resolve(null); } };
  const got = await guard.untimed(() => within(dialog, Promise.all(things.map(ask))));
  const ths = got === TIMED_OUT ? things.map((t) => k.peek?.(t) ?? null) : got;
  return things.map((thing, i) => {
    const types = new Set((ths[i]?.wires ?? []).filter((x) => [...(x.f?.name ?? []), ...(x.f?.word ?? [])].some((n) => String(n).toLowerCase() === thing)).map((x) => x.type));
    return TYPE_ORDER.find((t) => types.has(t)) ?? null;   // a record that only counts the word (k.words.frequency) or tags a drawing does not type it
  });
}

/** Tell lines to the World; a refusal (the schema's check) is said, nothing is kept. */
function tell(w, person, lines) {
  const r = w.tell(lines.join('\n'));
  if (!r.ok) return { ok: false, why: r.violations?.[0]?.why ?? r.violations?.[0]?.kind ?? 'not accepted' };
  person.lines.push(...lines);
  return { ok: true };
}

/** One fact about the person's own key (name, age, occupation, language): a single value replaces the old one, a language adds to the list. The World (the schema) checks it first. */
function setKey(lib, w, person, key, value) {
  let r;
  if (key === 'name' || key === 'age') r = lib.tellStatement(w, key === 'name' ? `my name is ${value}` : `my age is ${value}`, { type: 'w.person.person' }).told;   // the library's L5: a statement told as a fact on the user's thing
  if (!r) r = w.applyPatch(key === 'language' ? { fills: [{ id: 'me', key, value: q(value) }] } : { sets: [{ id: 'me', key, value: typeof value === 'number' ? String(value) : q(value) }] });
  if (!r?.ok) return { ok: false, why: r?.violations?.[0]?.why ?? r?.violations?.[0]?.kind ?? 'not accepted' };
  if (key === 'language') { const l = (person.me.language ??= []); if (!l.includes(value)) l.push(value); }
  else person.me[key] = key === 'age' ? Number(value) : value;
  return { ok: true };
}

/** The original spelling of a value the reader lowercased ("ana" -> "Ana" as typed). */
const asTyped = (english, v) => { const m = new RegExp(`\\b${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'iu').exec(english); return m ? m[0] : cap(v); };
const itemsOf = (role) => (role?.items?.length ? role.items.map((x) => x.text) : String(role?.text ?? '').split(/\s*(?:,|\band\b)\s*/)).map((x) => x.trim().replace(/^(?:a|an|the|some)\s+/, '')).filter(Boolean);

async function state(dialog, lib, person, frame, roles, english) {
  const { w } = worldOf(lib, person);
  const value = roles.value, attr = roles.attribute;
  if (frame === 'person.state.name' || frame === 'person.state.called') {
    const name = asTyped(english, value.text);
    const r = setKey(lib, w, person, 'name', name);
    return r.ok ? `Nice to meet you, ${name}. I will remember your name for this conversation.` : `I could not keep that name: ${r.why}.`;
  }
  if (frame === 'person.state.age') {
    const r = setKey(lib, w, person, 'age', value.value);
    return r.ok ? `OK, you are ${value.value}. I will remember that for this conversation.` : `I could not keep that age: ${r.why}.`;
  }
  if (frame === 'person.state.occupation') {
    const r = setKey(lib, w, person, 'occupation', value.item ?? value.text);
    return r.ok ? `OK, you are ${/^[aeiou]/.test(value.text) ? 'an' : 'a'} ${value.text}. I will remember that.` : `I could not keep that: ${r.why}.`;
  }
  if (frame === 'person.state.language') {
    const langs = itemsOf(value).map(cap);
    for (const l of langs) setKey(lib, w, person, 'language', l);
    return `OK, you speak ${list(langs)}. I will remember that.`;
  }
  if (frame === 'person.state.relatives') {
    const relation = relationOf(attr.item ?? attr.text), count = value?.value ?? 1;
    if (!relation) return null;
    person.lines = person.lines.filter((l) => !(l.includes(' w.person.relative ') && l.includes(` relation=${relation} `)));
    const r = tell(w, person, [`@me.rel.${relation} w.person.relative of=$me relation=${relation} count=${count}`]);
    return r.ok ? `OK, you have ${countText({ relation, count })}. I will remember that.` : `I could not keep that: ${r.why}.`;
  }
  if (frame === 'person.state.likes' || frame === 'person.state.dislikes') {
    const stance = frame.endsWith('dislikes') ? 'dislikes' : 'likes';
    const items = itemsOf(value);
    if (!items.length || items.some((x) => x.split(' ').some((t) => NOT_A_THING.has(t)))) return null;   // "I like it", "I like to draw": not a list of things
    const kept = [];
    const thingOf = (it) => it.split(' ').map((t, i, a) => (i === a.length - 1 ? en.singular(t, 'lemma') : t)).join(' ');
    const types = await typesOf(dialog, items.map(thingOf));
    for (const [n, it] of items.entries()) {
      const thing = thingOf(it), type = types[n];
      const id = `me.taste.${thing.replace(/[^\p{L}\p{N}]+/gu, '_')}`;
      person.lines = person.lines.filter((l) => !l.startsWith(`@${id} `));
      const r = tell(w, person, [`@${id} w.person.taste of=$me thing=${q(thing)}${type ? ` type=${type}` : ''} stance=${stance}`]);
      if (r.ok) { kept.push(it); person.said[thing] = it; }
    }
    if (!kept.length) return null;
    return stance === 'likes' ? `OK, you like ${list(kept)}. I will remember that.` : `OK, you do not like ${list(kept)}. I will remember that.`;
  }
  return null;
}

/** The relation value of a word of the lexicon (kids -> child, mum -> mother), by the schema's core.word facts. */
function relationOf(word) {
  const w = String(word).toLowerCase();
  const rels = /enum=child[^\n]*/.exec(BUNDLED_PERSON.schema)?.[0].match(/enum=(\w+)/g).map((x) => x.slice(5)) ?? [];
  if (rels.includes(w)) return w;
  for (const line of BUNDLED_PERSON.schema.split('\n')) {
    if (!/ core\.word /.test(line) || !/of=w\.person\.relative\.relation/.test(line)) continue;
    const texts = [...line.matchAll(/text=("(?:[^"\\]|\\.)*"|\S+)/g)].map((m) => (m[1].startsWith('"') ? JSON.parse(m[1]) : m[1]).toLowerCase());
    const means = /means=(\S+)/.exec(line)?.[1];
    if (texts.includes(w) && rels.includes(means)) return means;
  }
  const s = en.singular(w, 'lemma');
  return rels.includes(s) ? s : null;
}

function ask(lib, person, frame, roles, name = null) {
  const v = personView({ person });
  if (frame === 'person.ask.all') {
    // the person's own keys as the library describes the user's thing (L5 describeThing: name, age, occupation, language); relatives and tastes are facts of their own
    const own = Object.fromEntries(lib.describeThing(worldOf(lib, person).w, 'me').filter((x) => x.key !== 'user').map((x) => [x.key, x.values]));
    const said = describe({ ...v, name: name ?? own.name?.[0] ?? null, age: own.age ? Number(own.age[0]) : null, occupation: own.occupation?.[0] ?? null, language: own.language ?? [], said: v.said });
    return said.length ? `Here is what I know about you: ${said.join('; ')}. ${PRIVATE}` : { text: NOTHING_YET, say: { act: 'person.know.none', roles: {} } };   // composed: said from the language world's reply in another language
  }
  if (frame === 'person.ask.count') {
    const rel = relationOf(roles.attribute?.item ?? roles.attribute?.text ?? '');
    const r = v.relatives.find((x) => x.relation === rel);
    return r ? `You have ${countText(r)}.` : `You have not told me about your ${relWord(rel ?? 'relative', 2)}.`;
  }
  const said = {
    'person.ask.age': () => (v.age != null ? `You are ${v.age}.` : 'You have not told me your age.'),
    'person.ask.name': () => (v.name ? `Your name is ${v.name}.` : 'You have not told me your name.'),
    'person.ask.likes': () => (v.likes.length ? `You like ${things(v.likes, v.said)}.` : 'You have not told me what you like.'),
    'person.ask.dislikes': () => (v.dislikes.length ? `You do not like ${things(v.dislikes, v.said)}.` : 'You have not told me what you do not like.'),
    'person.ask.occupation': () => (v.occupation ? `You are ${/^[aeiou]/i.test(v.occupation) ? 'an' : 'a'} ${v.occupation.toLowerCase()}.` : 'You have not told me your job.'),
    'person.ask.language': () => (v.language.length ? `You speak ${list(v.language.map(cap))}.` : 'You have not told me which languages you speak.'),
  }[frame];
  return said ? said() : null;
}

/** The next key the interview asks (the first one not known yet), or null. */
function nextKey(person, name = null) {
  const v = { ...personView({ person }), name: name ?? person.me.name ?? null };
  return ASK_ORDER.find((k) => (k === 'likes' ? !v.likes.length : k === 'language' ? !v.language.length : v[k] == null)) ?? null;
}

const phrases = (dialog, id) => [...new Set(dialog.engine.interp?.lang?.phrase?.(id) ?? [])].map((p) => plain(p.replace(/_/g, ' '))).filter(Boolean).sort((a, b) => b.length - a.length);
const startsWithAny = (t, ps) => ps.find((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`)) ?? null;

/** An answer to the interview's open question: the value for the key asked, or null when the turn is something else. */
async function answer(dialog, lib, person, english) {
  const key = person.asking, t = plain(english), ws = t.split(' ').filter(Boolean);
  if (!ws.length || ws.length > 5 || verbs.has(ws[0]) || /\?\s*$/.test(english)) return null;   // a request or a question of its own is not the answer
  const { w } = worldOf(lib, person);
  let said = null;
  if (key === 'name' || key === 'occupation') {
    const value = String(english).trim().replace(/[.!]+$/, '').replace(/^(?:i am|i'm|im|my name is|it is|it's)\s+/i, '').replace(/^(?:a|an)\s+/i, '');
    const r = setKey(lib, w, person, key, value);
    if (!r.ok) return null;
    if (key === 'name' && dialog.isession.state['kids.common']) dialog.isession.state['kids.common'].userName = value;   // the one home of the user's name ("what is my name")
    said = key === 'name' ? `Nice to meet you, ${value}.` : `OK, you are ${/^[aeiou]/i.test(value) ? 'an' : 'a'} ${value.toLowerCase()}.`;
  } else if (key === 'age') {
    const n = ws.map((x) => (/^\d+$/.test(x) ? Number(x) : numberValue(x, 'cardinal'))).find((x) => x != null);
    if (n == null) return null;
    const r = setKey(lib, w, person, 'age', n);
    if (!r.ok) return null;
    said = `OK, you are ${n}.`;
  } else if (key === 'language' || key === 'likes') {
    const items = itemsOf({ text: t });
    if (key === 'language') { for (const l of items) setKey(lib, w, person, 'language', cap(l)); said = `OK, you speak ${list(items.map(cap))}.`; }
    else { const r = await state(dialog, lib, person, 'person.state.likes', { value: { text: t } }, english); if (!r) return null; said = r.replace(/ I will remember that\.$/, '.'); }
  }
  if (!said) return null;
  const next = nextKey(person, nameOf(dialog, person));
  person.asking = next;
  return `${said} ${next ? QUESTION[next] : 'Thank you, that is all my questions. You can see what I know about you in Settings › Privacy.'}`;
}

/** Does the name's home (kids.common) read the whole sentence as its name question, with no repair? A rules probe of the sentence (no effect: nothing runs). */
async function nameHomeReads(dialog, english) {
  const { set, formalizers } = dialog.engine;
  if (!set?.get?.(NAME_HOME) || !formalizers?.rules) return false;
  try {
    const probe = await formalizers.rules.formalize(english, { worlds: set, session: dialog.isession, source: 'probe', context: dialog.context(), router: dialog._router });
    const sg = probe.segments;
    if (sg.length !== 1 || sg[0].unparsed || sg[0].partial || sg[0].ignored?.length || sg[0].corrections?.length) return false;
    const reqs = (probe.wires ?? []).filter((x) => x.type === 'core.request');
    const val = (w, key) => w.entries?.find((e) => e.key === key)?.value?.v;
    return reqs.length === 1 && val(reqs[0], 'core.in') === NAME_HOME && val(reqs[0], 'core.request.action') === 'chat.myname';
  } catch { return false; }
}

/**
 * A turn about the person: a statement or a question of the person frames, or the interview. Returns null when the turn is not about the person (the worlds read it as before).
 */
export async function personTurn(dialog, english) {
  const lib = dialog.engine.sopworld;
  if (!lib?.readFrames || !lib.World) return null;
  const person = stateOf(dialog);
  if (!person) return null;
  const t = plain(english);
  if (!t) return null;
  const done = (said, frame, extra = {}) => ({ reply: said?.text ?? said, ...(said?.say ? { say: said.say } : {}), status: 'supported', info: { kind: 'person', frame, ...extra }, segment: { text: String(english), world: HOME, worlds: [HOME], wires: [], match: { worldId: HOME, patternId: frame, kind: 'request' }, strategy: 'person' } });
  // the interview: start, resume, stop, and the answer to its open question
  const asking = person.asking;
  person.asking = null;   // an interview question lives for one turn unless it is answered
  if (asking && startsWithAny(t, phrases(dialog, 'person.interview.stop'))) { person.paused = true; return done('OK, I will stop asking. Say "get to know me" when you want to go on.', 'person.interview.stop'); }
  if (startsWithAny(t, phrases(dialog, 'person.interview.resume'))) {
    const next = nextKey(person, nameOf(dialog, person)); person.asking = next; person.paused = false;
    return done(`Welcome back! ${next ? QUESTION[next] : 'I have no more questions: you can see what I know about you in Settings › Privacy.'}`, 'person.interview.resume');
  }
  if (startsWithAny(t, phrases(dialog, 'person.interview'))) {
    const next = nextKey(person, nameOf(dialog, person)); person.asking = next; person.paused = false;
    return done(next ? `I would like to know you better. ${QUESTION[next]} (Say "stop" to end the questions.)` : 'I have no more questions: you can see what I know about you in Settings › Privacy.', 'person.interview');
  }
  if (startsWithAny(t, phrases(dialog, 'person.profile'))) {
    const said = describe({ ...personView({ person }), name: nameOf(dialog, person) });
    return done(`Profile: ${said.length ? said.join('; ') : 'nothing yet'}. ${PRIVATE} You can see it in Settings › Privacy.`, 'person.profile');
  }
  // a statement or a question of the catalog's person frames (the whole sentence read by one frame)
  const r = reader(lib);
  const read = lib.readFrames(r.world, t.replace(/,/g, ' , '), { lang: 'w.lang.en' });
  const best = read.best;
  // the user's NAME has its home in kids.common (its own reader of introductions: trailing words, run-ons, "my name is" alone asks back; state `userName`): those frames are left to it
  // OWNERSHIP (live check 2026-11-15, ledger: an empty profile let "what do you know about me" fall through and be respelled as the place "Me", Maine): a frame that reads the whole
  // sentence owns it whether or not the profile has facts; an empty world answers "nothing yet", it never hands the sentence on to a respelled or place reading
  // The one exception keeps the name's home: with nothing kept but (at most) a name, a describe question the name's home reads whole, unrepaired, as its own name question
  // ("who am i": kids.common chat.myname) is the name's home's to answer; that world being absent or reading it any other way changes nothing (the frame answers)
  if (best?.frame === 'person.ask.all' && !person.lines.length && !Object.keys(person.me).some((k) => k !== 'name') && await nameHomeReads(dialog, english)) return null;
  if (best?.frame?.startsWith('person.') && !NAME_FRAMES.has(best.frame)) {
    const said = best.frame.startsWith('person.state.') ? await state(dialog, lib, person, best.frame, best.roles, english) : ask(lib, person, best.frame, best.roles, nameOf(dialog, person));
    if (said) { if (asking && best.frame.startsWith('person.state.')) { const next = nextKey(person, nameOf(dialog, person)); person.asking = next; return done(`${said}${next ? ` ${QUESTION[next]}` : ''}`, best.frame); } return done(said, best.frame); }
  }
  if (asking) { person.asking = asking; const said = await answer(dialog, lib, person, english); if (said) return done(said, `person.answer.${asking}`); person.asking = null; }
  return null;
}
