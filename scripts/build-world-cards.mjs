#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Generates `worlds/meta.worlds/kb.sop`: one card per world (WORLD-OF-WORLDS, spec 20). Nothing in a card is written by hand.
 *
 * A card says what a world is, from what the world already declares:
 *   id, tab, kind (tab | module), run=needs (a game: nothing to take until it runs), nav=yes and navact (the world that opens tabs, and the words that open one),
 *   name   the tab id, its aliases and the last part of the world id ("drawing", "chess", "arith"),
 *   act    action words: the literal words and the alternatives of the phrase groups of the world's patterns (the verbs and the key nouns it asks for), most
 *          specific first; `actshared` when more than two worlds use the word,
 *   thing  kinds of things it holds or makes: the words of its thing and noun lexicons; `thingshared` as above,
 *   frame  question frames: the first word pairs of its canonical questions,
 *   slot   `number` / `agent` when at least a quarter of its patterns take a number or a person's name (arith, shop, time: the message has a digit or a first name),
 *   catalog=yes  the world takes any thing of the knowledge catalog (art.draw, talk: it says so in its manifest by having no closed list of things).
 * Words are lemmas (the singular), lowercase; a pair or triple of words is joined with _ (the host builds the same pairs from the message).
 *
 * Usage: node scripts/build-world-cards.mjs [--write] [--check]   (stdout by default; --check exits 1 when the file on disk is stale)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { GRAMMAR, PERSON } from '../src/dialog/continuation.mjs';
import { lemma } from '../src/dialog/meta-worlds.mjs';
import { TAB_ACTIONS } from '../src/formalizer/routing.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CARDS_FILE = join(REPO, 'worlds/meta.worlds/kb.sop');
const SKIP_WORLDS = new Set(['core', 'lang.common', 'common.sense', 'meta.worlds', 'session.conversation']);
const OTHERS_MAX = 2;   // a world's tab id or last id part is its name when the other worlds' patterns use the word at most this often
const SLOT_FROM = 0.2;   // a world whose patterns take a number (or a name) in at least a quarter of them says so: `slot=number`, `slot=agent`
const MAX_ACT = 60, MAX_THING = 48, MAX_FRAME = 10, SHARED_FROM = 3, DROP_FROM = 5, SHARE_OWN = 0.5, SHARE_SHARED = 0.2, ASKS_MOSTLY = 0.7;   // things: a word of 3 or 4 worlds is shared, of 5 or more says nothing; actions: a world with at least half of all the uses of the word owns it, with a fifth shares it
const QUESTION_WORDS = new Set(['what', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have']);
const wordOk = (w) => /^[a-z][a-z']*$/.test(w) && w.length >= 2 && !GRAMMAR.has(w) && !PERSON.has(w);   // one word (a phrase atom with _ is a lead-in or a filler, not an action)
const toks = (t) => String(t ?? '').toLowerCase().match(/[a-z][a-z']*/g) ?? [];

/** The alternatives of every phrase group, by id (all worlds). */
function phraseTable(set) {
  const m = new Map();
  for (const w of set.list()) for (const p of Object.values(w.phrases ?? {})) m.set(p.id, p.wire.entries.filter((e) => e.key === 'alt').map((e) => String(e.value.v).toLowerCase()));
  return m;
}

/** The literal words of a pattern's `match` string that the sentence must have: words, alternatives of `[a|b]` groups, and the alternatives of phrase groups that are not shared filler (`lang.*`). */
function literalsOf(match, phrases, depth = 0, locals = null) {
  const out = [];
  for (const raw of String(match).split(/\s+/)) {
    if (raw.startsWith('$') && raw.endsWith('?') && locals?.has(raw.slice(1, -1))) { for (const a of phrases.get(raw.slice(1, -1)) ?? []) out.push(...(a.startsWith('$') ? literalsOf(a, phrases, depth + 1, locals) : [a])); continue; }   // an optional group the world made for itself is its own wording
    if (!raw || raw.startsWith('{') || /\]\?$|^\$[^ ]*\?$/.test(raw)) continue;   // a slot, or an optional group (lead-ins, fillers, articles): not what the world is for
    const inner = raw.replace(/^\[/, '').replace(/\]\??$/, '');
    for (const alt of inner.split('|')) {
      if (!alt || alt.startsWith('{')) continue;
      if (alt.startsWith('$')) {
        const id = alt.slice(1).replace(/\?$/, '');
        if (depth > 2) continue;
        for (const a of phrases.get(id) ?? []) out.push(...(a.startsWith('$') ? literalsOf(a, phrases, depth + 1) : [a]));
      } else out.push(alt.replace(/\?$/, ''));
    }
  }
  return out.map((w) => w.replace(/[^a-z_']/g, '')).filter(Boolean);
}

/** The words of a thing or noun lexicon of the world, as lemmas. */
function thingWords(w) {
  const out = [];
  for (const l of w.lexicons ?? []) {
    const cls = l.wire?.entries?.find((e) => e.key === 'class')?.value?.v ?? l.class;
    if (cls !== 'thing' && cls !== 'noun') continue;
    for (const x of l.words ?? []) { const t = String(x).toLowerCase(); if (wordOk(t)) out.push(lemma(t)); }
  }
  return out;
}

/** Words that are first names (the `name` lexicons): they are names, not actions. */
function notActions(set) {
  const out = new Set();
  for (const w of set.list()) for (const l of w.lexicons ?? []) { const cls = l.wire?.entries?.find((e) => e.key === 'class')?.value?.v ?? l.class; if (cls === 'name') for (const x of l.words ?? []) out.add(lemma(String(x).toLowerCase())); }
  return out;
}

/** Words of modifier lexicons that two or more worlds have (colours, sizes, directions, units): arguments of an action, not actions. */
function modifierWords(set) {
  const seen = new Map();
  for (const w of set.list()) for (const l of w.lexicons ?? []) {
    const cls = l.wire?.entries?.find((e) => e.key === 'class')?.value?.v ?? l.class;
    if (['thing', 'noun', 'name', 'trigger'].includes(cls)) continue;
    for (const x of l.words ?? []) { const k = lemma(String(x).toLowerCase()); (seen.get(k) ?? seen.set(k, new Set()).get(k)).add(w.id); }
  }
  return new Set([...seen].filter(([, ws]) => ws.size >= 2).map(([k]) => k));
}

const readOpt = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const quoted = (text, key) => [...text.matchAll(new RegExp(`^\\s+${key}="((?:[^"\\\\]|\\\\.)*)"`, 'gm'))].map((m) => m[1].replace(/\\"/g, '"'));

/**
 * What else a world says about itself, from files it ships (spec 20): the words of its operation descriptions (`describe.sop`: the verbs and the examples), the operation names (`operations.sop`), the questions its legend asks, the
 * inputs of its tests (`tests.sop`), and the words of its `trigger` lexicons. Returns { verbs: [word], texts: [string] } where each text is one message the
 * world's authors say it takes.
 */
export function selfDescription(w) {
  const dir = join(REPO, 'worlds', w.id);
  const desc = readOpt(join(dir, 'describe.sop')), tests = readOpt(join(dir, 'tests.sop'));
  const verbs = [...desc.matchAll(/^\s+verb=\$w\.en\.([a-z_']+?)\.[a-z]/gm)].map((m) => m[1]);
  const ops = readOpt(join(dir, 'operations.sop')), legend = readOpt(join(dir, 'legend.sop'));
  for (const m of ops.matchAll(/^@op\.[\w.]*?\.?([A-Za-z]+) core\.operation/gm)) for (const part of m[1].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ')) verbs.push(part);   // currentCount -> current, count
  for (const l of w.lexicons ?? []) {
    const cls = l.wire?.entries?.find((e) => e.key === 'class')?.value?.v ?? l.class;
    if (cls === 'trigger') for (const x of l.words ?? []) verbs.push(String(x).toLowerCase());
  }
  return { verbs, texts: [...quoted(desc, 'example'), ...quoted(tests, 'input'), ...quoted(legend, 'ask')] };
}

export async function buildCards(set) {
  const phrases = phraseTable(set);
  const modifiers = modifierWords(set);
  const things = notActions(set);
  const worlds = set.list().filter((w) => !SKIP_WORLDS.has(w.id) && w.patterns?.length);
  const raw = worlds.map((w) => {
    const act = new Map(), thing = new Set(thingWords(w)), frames = new Map(), canon = new Set(), canonPatterns = new Map();
    let nCanon = 0, nQuestions = 0;
    let nav = false;
    const navact = new Set(), claim = new Set();
    const locals = new Set((w.phrases ?? []).map((p) => p.id));
    for (const p of w.patterns) {
      for (const x of literalsOf(p.match, phrases, 0, locals)) { const l = lemma(x); if (wordOk(l)) act.set(l, (act.get(l) ?? 0) + 1); }
      const action = /core\.request[^"]*?action=([\w.]+)/.exec(String(p.emit ?? ''))?.[1];
      if (p.tabClaim) for (const x of literalsOf(p.match, phrases)) { const l = lemma(x); if (wordOk(l)) claim.add(l); }   // tabClaim=true: the open tab's own pattern wins over a message that names another world
      if (action && TAB_ACTIONS.has(action)) { nav = true; for (const x of literalsOf(p.match, phrases)) { const l = lemma(x); if (wordOk(l)) navact.add(l); } }   // the words that open a tab (open, go, switch, take ...)
      const seenHere = new Set();
      for (const c of p.canonical ?? []) {
        const t = toks(c);
        nCanon++; if (/\?\s*$/.test(c) || QUESTION_WORDS.has(t[0])) nQuestions++;
        const names = new Set((String(c).match(/[A-Za-z][A-Za-z']*/g) ?? []).filter((x, i) => i > 0 && /^[A-Z]/.test(x) && x !== 'I').map((x) => x.toLowerCase()));   // Ben, Paris: names of the example, not what the world is for
        for (const x of t) { const l = lemma(x); if (wordOk(l) && !thing.has(l) && !names.has(x)) seenHere.add(l); }
        if (!(/\?\s*$/.test(c) || QUESTION_WORDS.has(t[0]))) continue;
        for (const i of [0, 1]) if (t[i + 1] && QUESTION_WORDS.has(t[i]) && !(GRAMMAR.has(t[i]) && GRAMMAR.has(t[i + 1]) && t[i] !== 'what')) { const f = `${t[i]}_${t[i + 1]}`; frames.set(f, (frames.get(f) ?? 0) + 1); }
      }
      for (const l of seenHere) canonPatterns.set(l, (canonPatterns.get(l) ?? 0) + 1);
    }
    // the world's own descriptions: the verbs of describe.sop and the trigger lexicons count as uses; the examples and test inputs count once per message, a word of two messages or more is an action of the world, a question's first word pairs are frames
    const self = selfDescription(w), inTests = new Map();
    for (const v of self.verbs) { const l = lemma(v); if (wordOk(l) || /^[a-z]+(_[a-z]+)+$/.test(l)) act.set(l, (act.get(l) ?? 0) + 1); }
    for (const c of self.texts) {
      const t = toks(c), names = new Set((String(c).match(/[A-Za-z][A-Za-z']*/g) ?? []).filter((x, i) => i > 0 && /^[A-Z]/.test(x) && x !== 'I').map((x) => x.toLowerCase()));
      for (const l of new Set(t.map(lemma))) if (wordOk(l) && !thing.has(l) && !names.has(l)) inTests.set(l, (inTests.get(l) ?? 0) + 1);
      if (/\?\s*$/.test(c) || QUESTION_WORDS.has(t[0])) for (const i of [0, 1]) if (t[i + 1] && QUESTION_WORDS.has(t[i]) && !(GRAMMAR.has(t[i]) && GRAMMAR.has(t[i + 1]) && t[i] !== 'what')) { const f = `${t[i]}_${t[i + 1]}`; frames.set(f, (frames.get(f) ?? 0) + 1); }
    }
    for (const [l, k] of inTests) if (k >= 2) act.set(l, (act.get(l) ?? 0) + Math.min(k, 6));
    for (const [l, k] of canonPatterns) if (k >= 2) { act.set(l, (act.get(l) ?? 0) + 2 * k); canon.add(l); }   // the words of the canonical examples of two patterns or more come first: they are what the world's authors say it is for
    for (const t of [...thing, ...things, ...modifiers]) act.delete(t);   // a thing word, a name or a modifier (a colour, a size) is an argument, not an action
    const tab = w.tab ?? null;
    const last = w.id.split('.').at(-1);
    const norm = (n) => lemma(String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    const aliases = (tab?.aliases ?? []).map(norm), tabId = tab?.id ? norm(tab.id) : null, lastSeg = norm(last);
    const names = [...new Set([tab?.id, ...(tab?.aliases ?? []), last].filter(Boolean).map((n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).map(lemma).filter((n) => n.length >= 3 && !GRAMMAR.has(n)))];
    const slots = ['number', 'agent'].filter((k) => w.patterns.filter((p) => new RegExp(`:${k}\\}`).test(p.match)).length >= SLOT_FROM * w.patterns.length);
    return { id: w.id, slots, asks: nCanon ? nQuestions / nCanon : 0, canon, aliases, tabId, lastSeg, tab: tab?.id ?? null, navact: [...navact].sort(), claim: [...claim].sort(), kind: tab ? 'tab' : 'module', needs: tab?.kind === 'game' || w.id.startsWith('games.'), nav, names, act, thing, frames };
  });
  // shared = used by SHARED_FROM or more worlds (counted over every candidate word, before the cap)
  const spread = (key) => { const m = new Map(); for (const r of raw) for (const x of (r[key] instanceof Map ? r[key].keys() : r[key])) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const actSpread = spread('act'), thingSpread = spread('thing'), frameSpread = spread('frames');
  // an action word belongs to the world that uses it most: its share of all the uses of the word (patterns, canonical examples)
  const total = new Map();
  for (const r of raw) for (const [x, n] of r.act) total.set(x, (total.get(x) ?? 0) + n);
  const share = (r, x) => (r.act.get(x) ?? 0) / (total.get(x) || 1);
  // the words a world uses most and few others use come first (uses / worlds), then the lexicon's own order
  const take = (words, spreadMap, cap, uses, canon) => { const ws = [...words]; return (uses ? ws.sort((a, b) => (canon.has(b) - canon.has(a)) || (uses.get(b) / spreadMap.get(b)) - (uses.get(a) / spreadMap.get(a)) || a.localeCompare(b)) : ws).slice(0, cap); };
  const cards = raw.map((r) => {
    const act = [...r.act.keys()].filter((x) => share(r, x) >= SHARE_SHARED).sort((a, b) => (r.canon.has(b) - r.canon.has(a)) || share(r, b) * r.act.get(b) - share(r, a) * r.act.get(a) || a.localeCompare(b)).slice(0, MAX_ACT), thing = take([...r.thing].filter((x) => thingSpread.get(x) < DROP_FROM), thingSpread, MAX_THING);
    const frame = take([...r.frames.keys()].filter((f) => frameSpread.get(f) < SHARED_FROM), frameSpread, MAX_FRAME, r.frames, new Set());
    // a world whose canonical examples are mostly questions answers the plain frames (what is X, how many X) that many worlds share: it keeps them as shared frames
    const frameshared = r.asks >= ASKS_MOSTLY ? take([...r.frames.keys()].filter((f) => frameSpread.get(f) >= SHARED_FROM), frameSpread, MAX_FRAME, r.frames, new Set()) : [];
    const catalog = r.id === 'art.draw' || r.id === 'talk';
    // the aliases a world declares are its names; its tab id and the last part of its id too, unless other worlds use the word as an action ("draw")
    const names = r.names.filter((n) => r.aliases.includes(n) || (n === r.tabId || n === r.lastSeg) && (total.get(n) ?? 0) === 0 || (n === r.tabId || n === r.lastSeg) && (total.get(n) ?? 0) - (r.act.get(n) ?? 0) <= OTHERS_MAX);   // a verb that is the tab id ("draw", used by several worlds) is an action word, not a name; a word that other worlds mention at most twice ("hangman", "chess") is its name
    const nameSet = new Set(names);
    return { ...r, names, act: act.filter((x) => share(r, x) >= SHARE_OWN && !nameSet.has(x)), actshared: act.filter((x) => share(r, x) < SHARE_OWN && !nameSet.has(x)), thing: thing.filter((x) => thingSpread.get(x) < SHARED_FROM), thingshared: thing.filter((x) => thingSpread.get(x) >= SHARED_FROM), frame, frameshared, catalog };
  });
  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

export function cardsText(cards) {
  const line = (k, xs) => (xs.length ? `    ${xs.map((x) => `${k}=${x}`).join(' ')}\n` : '');
  const chunks = (k, xs, n = 8) => { let s = ''; for (let i = 0; i < xs.length; i += n) s += line(k, xs.slice(i, i + n)); return s; };
  let out = '# GENERATED by scripts/build-world-cards.mjs from the worlds (patterns, lexicons, manifests). Do not edit: change the world and regenerate.\n# `npm test` fails when this file is stale (tests/meta-worlds.test.mjs).\n';
  for (const c of cards) {
    out += `\n@card.${c.id} meta.worlds.card\n    core.source="generated:meta.worlds/cards"\n    id=${c.id} kind=${c.kind} run=${c.needs ? 'needs' : 'none'}${c.tab ? ` tab=${c.tab}` : ''}${c.nav ? ' nav=yes' : ''}${c.catalog ? ' catalog=yes' : ''}\n`;
    out += chunks('slot', c.slots ?? []) + chunks('name', c.names) + chunks('navact', c.navact) + chunks('claim', c.claim) + chunks('act', c.act) + chunks('actshared', c.actshared) + chunks('thing', c.thing) + chunks('thingshared', c.thingshared) + chunks('frame', c.frame) + chunks('frameshared', c.frameshared);
  }
  return out;
}

export async function generate() {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  return cardsText(await buildCards(engine.set));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await generate();
  if (process.argv.includes('--write')) { writeFileSync(CARDS_FILE, text); console.error(`wrote ${CARDS_FILE} (${text.length} bytes)`); }
  else if (process.argv.includes('--check')) {
    const disk = existsSync(CARDS_FILE) ? readFileSync(CARDS_FILE, 'utf8') : '';
    if (disk !== text) { console.error('worlds/meta.worlds/kb.sop is stale: run node scripts/build-world-cards.mjs --write'); process.exit(1); }
  } else process.stdout.write(text);
}
