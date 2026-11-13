#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// P3 (spec 21 section 6, worker-tasks 19:35): training data for the act + roles tagger, generated from every schema.sop x the act grammar (FORMS of worlds/acts/acts.mjs,
// verbs of k.actions through ACT_VERBS) x knowledge words (k.objects / k.attributes things, k.values colours, scale steps, comparatives, numbers, shapes, directions, set words,
// k.feelings, k.geo cities, k.people roles). Labels: the act (14 classes) and BIO spans of the six roles thing, set, attribute, value, place, amount; world independent.
//   node scripts/gen-act-tagger-data.mjs [--out training/data/act-tagger] [--kw <docs/worlds of the knowledge repo>] [--seed 1] [--train 200000] [--test 6000]
//        [--hold diagram.sketch,ui.avatar] [--synth 60]
// Re-runnable: schemas are discovered (every directory with a schema.sop that has an acts.schema wire under worlds, worlds-pilot, tests/fixtures/worlds), the knowledge pools are cached in
// <out>/knowledge-pools.json (committed, small) so a run without --kw reuses them. The data files (*.jsonl) are not committed (training/data/*.jsonl is ignored).
// Held-out worlds: their sentences never enter train/dev; their own kind and attribute words are removed from the knowledge pools used to build the training worlds, so the test words are new.
// Outputs: train.jsonl dev.jsonl test-seen.jsonl test-held.jsonl (one {text, words, tags, act, world, form} per line), stats.json.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/soplang/index.mjs';
import * as A from '../worlds/acts/acts.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(REPO, arg('out', 'training/data/act-tagger'));
const SEED = Number(arg('seed', 1));
const N_TRAIN = Number(arg('train', 200000)), N_TEST = Number(arg('test', 6000)), N_SYNTH = Number(arg('synth', 60));
const HOLD = new Set(arg('hold', 'diagram.sketch,ui.avatar').split(','));
mkdirSync(OUT, { recursive: true });

// ---- rng -------------------------------------------------------------------------------------------------------------------------------------------------
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let R = rngOf(SEED);
const pick = (a) => a[Math.floor(R() * a.length)];
const chance = (p) => R() < p;
const wpick = (pairs) => { let t = pairs.reduce((s, [, w]) => s + w, 0), x = R() * t; for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; };

// ---- knowledge pools ---------------------------------------------------------------------------------------------------------------------------------------
const attrsOf = (s) => { const o = {}; for (const m of s.matchAll(/([\w.]+)=("(?:[^"\\]|\\.)*"|\S+)/g)) { const v = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2]; (o[m[1]] ??= []).push(v); } return o; };
function* sopFiles(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* sopFiles(p); else if (e.name.endsWith('.sop')) yield p; } }
function buildPools(kwDirs) {
  const P = { objects: new Set(), things: new Set(), colours: new Set(), steps: new Set(), comparatives: new Set(), shapes: new Set(), directions: new Set(), setWords: new Set(), feelings: new Set(), cities: new Set(), roles: new Set(), attributes: new Set(), numbers: new Set() };
  const into = { 'k.objects.object': ['objects', 'name'], 'k.attributes.thing': ['things', 'name'], 'k.animals.animal': ['things', 'name'], 'k.food.food': ['things', 'name'], 'k.values.colour': ['colours', 'name'], 'k.colours.colour': ['colours', 'name'], 'k.faces.colour': ['colours', 'name'],
    'k.values.step': ['steps', 'name'], 'k.values.comparative': ['comparatives', 'text'], 'k.values.shape': ['shapes', 'name'], 'k.shapes.shape': ['shapes', 'name'], 'k.values.direction': ['directions', 'name'], 'k.values.set_word': ['setWords', 'name'],
    'k.feelings.feeling': ['feelings', 'name'], 'k.geo.city': ['cities', 'name'], 'k.people.role': ['roles', 'name'], 'k.attributes.attribute': ['attributes', 'name'], 'k.values.number': ['numbers', 'text'], 'k.body.part': ['things', 'name'], 'k.commonsense.thing': ['things', 'name'] };
  for (const d of kwDirs) for (const f of sopFiles(d)) for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (line[0] !== '@') continue;
    const m = /^@\S+ (\S+) (.*)$/.exec(line);
    const spec = m && into[m[1]];
    if (!spec) continue;
    const v = attrsOf(m[2])[spec[1]]?.[0];
    if (v && /^[A-Za-z][A-Za-z '-]{1,24}$/.test(v)) P[spec[0]].add(v.toLowerCase());
  }
  return Object.fromEntries(Object.entries(P).map(([k, s]) => [k, [...s].sort()]));
}
const POOLS_FILE = path.join(OUT, 'knowledge-pools.json');
let pools;
const kwArg = arg('kw');
if (kwArg || !existsSync(POOLS_FILE)) {
  pools = buildPools([...(kwArg ? kwArg.split(',') : []), path.join(REPO, 'tests/fixtures/catalog')].filter(existsSync));
  writeFileSync(POOLS_FILE, `${JSON.stringify(pools)}\n`);
} else pools = JSON.parse(readFileSync(POOLS_FILE, 'utf8'));

const NAMES = ['Ann', 'Max', 'Zoe', 'Tom', 'Eva', 'Leo', 'Mia', 'Sam', 'Ivy', 'Dan', 'Kim', 'Raj', 'Lena', 'Omar', 'Nina', 'Paul', 'Rosa', 'Ben', 'Ida', 'Hugo', 'Anya', 'Luca', 'Yara', 'Felix', 'Maya', 'Noah', 'Jade', 'Otto'].map((n) => n.toLowerCase());
const LEADS = ['', '', '', '', '', 'please', 'can you', 'could you', 'would you', 'i want you to', 'i would like to', 'now', 'ok', 'hey', 'just', 'go ahead and', 'i need you to', 'let us'];
const FALLBACK_COLOURS = A.COLOURS;
const SAVE_NAMES = ['lunch', 'draft', 'version two', 'my plan', 'backup', 'start', 'before', 'party', 'test', 'final', 'first try', 'monday'];
const WORLD_NOUNS = ['the diagram', 'the avatar', 'the drawing', 'the map', 'the chart', 'the editor', 'the seating plan', 'the talk', 'the face'];
const NUMW = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'twelve'];
const ORDW = ['first', 'second', 'third', 'last', 'next', 'previous'];
const PRON_ONE = ['it', 'that', 'this one', 'that one'];
const PRON_SET = ['them', 'those', 'these', 'all of them', 'everything'];

// ---- schemas -------------------------------------------------------------------------------------------------------------------------------------------------
function discoverSchemas() {
  const out = [];
  for (const root of ['worlds', 'worlds-pilot', 'tests/fixtures/worlds']) {
    const dir = path.join(REPO, root);
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir)) {
      const f = path.join(dir, d, 'schema.sop');
      if (!existsSync(f) || !statSync(f).isFile()) continue;
      try { const wires = parse(readFileSync(f, 'utf8')).wires; if (wires.some((w) => w.type === 'acts.schema')) out.push({ id: d, schema: A.parseSchema(wires), file: path.relative(REPO, f) }); } catch (e) { console.error(`skip ${f}: ${e.message}`); }
    }
  }
  return out;
}
const SYN_ATTRS = [
  { name: 'colour', type: 'colour', words: ['color', 'shade'] }, { name: 'size', type: 'enum', values: ['tiny', 'small', 'medium', 'large', 'huge'], more: ['bigger', 'larger'], less: ['smaller'] },
  { name: 'speed', type: 'enum', values: ['slow', 'normal', 'fast'], more: ['faster'], less: ['slower'] }, { name: 'weight', type: 'number', min: 1, max: 50, more: ['heavier'], less: ['lighter'], words: ['mass'] },
  { name: 'legs', type: 'number', min: 0, max: 8, more: [], less: [], words: [] }, { name: 'age', type: 'number', min: 0, max: 99, more: ['older'], less: ['younger'], words: ['years'] },
  { name: 'label', type: 'text', words: ['title', 'caption'] }, { name: 'material', type: 'enum', values: ['wood', 'metal', 'glass', 'paper', 'stone'], words: [] },
  { name: 'volume', type: 'number', min: 0, max: 10, more: ['louder'], less: ['quieter'], words: ['loudness'] }, { name: 'height', type: 'number', min: 1, max: 30, more: ['taller'], less: ['shorter'], words: [] },
  { name: 'mood', type: 'enum', values: ['happy', 'sad', 'calm', 'angry'], words: ['feeling'] }, { name: 'visible', type: 'bool', words: ['shown'] },
];
function synthSchema(i, bad) {
  const ban = (w) => bad.has(w);
  const pool = [...pools.objects, ...pools.things].filter((w) => !ban(w) && !w.includes(' '));
  const nk = 2 + Math.floor(R() * 5);
  const kinds = {};
  const id = `synth.${i}`;
  for (let k = 0; k < nk; k++) {
    const name = pick(pool);
    if (kinds[name]) continue;
    kinds[name] = { name, plural: /s$/.test(name) ? name : /y$/.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`, numbered: chance(0.35), named: chance(0.25), max: null, in: null, capacity: null, acts: [], any: false, words: chance(0.3) ? [pick(pool)] : [] };
  }
  const ks = Object.values(kinds);
  if (ks.length > 1 && chance(0.5)) { const c = pick(ks); const inn = pick(ks.filter((x) => x !== c)); c.in = inn.name; }
  const attrs = {};
  const na = 1 + Math.floor(R() * 3);
  for (let a = 0; a < na; a++) {
    const t = pick(SYN_ATTRS);
    if (attrs[t.name] || ban(t.name)) continue;
    attrs[t.name] = { name: t.name, of: ks.filter(() => chance(0.7)).map((k) => k.name), type: t.type, values: t.values ?? [], min: t.min ?? null, max: t.max ?? null, def: null, more: t.more ?? [], less: t.less ?? [], words: t.words ?? [], step: 1 };
    if (!attrs[t.name].of.length) attrs[t.name].of = [ks[0].name];
  }
  const flags = {};
  for (const f of ['self', 'dir', 'be', 'has', 'bare', 'name', 'layout']) if (chance(f === 'layout' || f === 'dir' ? 0.3 : 0.2)) flags[f] = true;
  const acts = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'pick', 'ask', 'copy', 'send', 'undo', 'redo', 'save', 'load']);
  return { id, schema: { id, noun: id, acts, limits: {}, kinds, attrs, doc: '', tabOnly: false, ...(Object.keys(flags).length ? { flags } : {}) }, synthetic: true };
}
const vocabOf = (s) => new Set(Object.values(s.kinds).flatMap((k) => [k.name, k.plural, ...k.words]).concat(Object.values(s.attrs).flatMap((a) => [a.name, ...a.words, ...a.values])).map((w) => w.toLowerCase().replace(/_/g, ' ')));

// ---- values and things of a schema -------------------------------------------------------------------------------------------------------------------
const numWord = (n) => (n >= 1 && n <= 10 && chance(0.4) ? NUMW[n - 1] : n === 12 && chance(0.4) ? 'twelve' : String(n));
function ctxOf(entry, bad) {
  const s = entry.schema;
  const kinds = Object.values(s.kinds);
  // knowledge kinds: schema kinds with `any` take things from knowledge; every world gets some knowledge words as extra things (a world does not list every thing it can show)
  const know = [...pools.objects, ...pools.things].filter((w) => !bad.has(w));
  return { entry, s, kinds, know, colours: [...new Set([...(pools.colours.filter((c) => !bad.has(c))), ...FALLBACK_COLOURS])] };
}
const nounOf = (k) => pick([k.name.replace(/_/g, ' '), ...k.words.filter((w) => !/s$/.test(w) || k.name.endsWith('s')).map((w) => w.replace(/_/g, ' '))]);
const pluralOf = (k) => (chance(0.8) ? k.plural.replace(/_/g, ' ') : `${nounOf(k)}s`);
/** A thing phrase: { toks: [[word, role]], plural, pron } */
function thingPhrase(c, kind, { allowSet = true, asPlace = false } = {}) {
  const k = kind ?? (chance(0.12) ? { name: pick(c.know), plural: `${pick(c.know)}s`, numbered: false, named: false, words: [], synthetic: true } : pick(c.kinds));
  const role = asPlace ? 'place' : 'thing';
  const mk = (words, r = role) => words.split(' ').map((w) => [w, r]);
  const x = R();
  if (allowSet && !asPlace && x < 0.16) {
    const pl = k.synthetic ? `${k.name}s` : pluralOf(k);
    return { toks: wpick([[mk(pl, 'set'), 5], [[['all', 'set'], ...mk(pl, 'set')], 3], [[['every', 'set'], ...mk(k.name, 'set')], 1], [[['both', 'set'], ...mk(pl, 'set')], 1], [mk(pick(PRON_SET), 'set'), 2], [[['all', 'set'], ['the', 'set'], ...mk(pl, 'set')], 2]]), isSet: true, kind: k };
  }
  if (!asPlace && x < 0.24) return { toks: mk(pick(PRON_ONE), 'thing'), pron: true, kind: k };
  const base = k.synthetic ? k.name : nounOf(k);
  let toks;
  if (k.named && !k.synthetic && chance(0.55)) toks = chance(0.5) ? mk(`${base} ${pick(NAMES)}`) : mk(pick(NAMES));
  else if (k.numbered && chance(0.7)) toks = mk(`${base} ${1 + Math.floor(R() * 9)}`);
  else if (chance(0.12)) toks = mk(`${pick(ORDW)} ${base}`);
  else if (chance(0.10) && !asPlace) toks = mk(`${pick(c.colours.slice(0, 40))} ${base}`);
  else toks = mk(base);
  return { toks, kind: k };
}
/** The value for an attribute (or a loose one). */
function valuePhrase(c, attr, form) {
  const mk = (w) => w.split(' ').map((x) => [x, 'value']);
  if (form === 'name') return mk(pick(NAMES));
  if (form === 'save') return mk(pick(SAVE_NAMES));
  if (form === 'kind') return mk(pick(c.know));
  if (form === 'feeling') return mk(pick(pools.feelings.length ? pools.feelings : ['happy', 'sad', 'angry']));
  if (form === 'colour') return mk(pick(c.colours));
  const t = attr?.type;
  if (t === 'number') { const lo = attr.min ?? 1, hi = Math.min(attr.max ?? 9, 12); return mk(numWord(lo + Math.floor(R() * (hi - lo + 1)))); }
  if (t === 'enum') return mk(pick(attr.values));
  if (t === 'bool') return mk(pick(['on', 'off', 'yes', 'no']));
  if (t === 'text') return mk(chance(0.5) ? pick(NAMES) : pick(c.know));
  return mk(chance(0.7) ? pick(c.colours) : pick(NAMES));
}

// ---- the template expander ------------------------------------------------------------------------------------------------------------------------------
let bad0 = new Set();
const TOKEN = /\[[^\]]*\]\??|\{[^}]*\}|\S+/g;
function expandForm(c, f) {
  const s = c.s;
  const els = f.match.match(TOKEN);
  // pick the main thing's kind first so that attribute and value agree with it
  const mainKind = pick(c.kinds);
  const attrChoices = Object.values(s.attrs).filter((a) => a.of.includes(mainKind.name));
  const attr = attrChoices.length ? pick(attrChoices) : Object.values(s.attrs).length ? pick(Object.values(s.attrs)) : null;
  const sentence = [];
  const emit = (text, role = null) => { for (const w of String(text).replace(/_/g, ' ').split(/\s+/).filter(Boolean)) sentence.push([w.toLowerCase(), role]); };
  const emitToks = (toks) => { for (const [w, r] of toks) sentence.push([w.toLowerCase(), r]); };
    const slotAhead = (i) => { for (let j = i + 1; j < els.length; j++) { const m = /^\{(\w+):/.exec(els[j]); if (m) return m[1]; } return null; };
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e === 'L') { emit(pick(LEADS)); continue; }
    if (e === 'D') { const ahead = slotAhead(i); if (ahead === 'place' || ahead === 'thing') emit(wpick([['the', 4], ['', 3], ['a', 2], ['my', 1], ['this', 1], ['that', 0.5]])); continue; }
    if (/^V\./.test(e)) { const vs = (A.ACT_VERBS[e.slice(2)] ?? ['make']).filter((v) => v.split('_').length <= 2); emit(chance(0.5) ? pick(vs.slice(0, 6)) : pick(vs)); continue; }
    if (e === 'REL') { const rel = pick(A.REL_WORDS); const nx = els[i + 1]; const placeAhead = slotAhead(i) === 'place' || /place/.test(nx ?? ''); emit(rel, placeAhead ? 'place' : null); continue; }
    if (e[0] === '[') {
      const opt = e.endsWith('?');
      if (opt && chance(0.5)) continue;
      const alts = e.replace(/\]\??$/, '').slice(1).split('|');
      emit(pick(alts));
      continue;
    }
    if (e[0] === '{') {
      const m = /^\{(\w+):([^}]*)\}$/.exec(e);
      const [, role, src] = m;
      if (role === 'thing') { const t = thingPhrase(c, src === 'KIND' ? mainKind : (chance(0.8) ? mainKind : null), { allowSet: f.act !== 'make' && f.mode !== 'be' }); emitToks(t.toks); continue; }
      if (role === 'attribute') { const a = attr ?? { name: 'colour', words: [] }; emitToks(mk2((chance(0.75) ? a.name : pick([a.name, ...a.words])).replace(/_/g, ' '), 'attribute')); continue; }
      if (role === 'value') {
        if (src === 'MORE' || src === 'LESS') { const own = Object.values(s.attrs).flatMap((a) => a[src === 'MORE' ? 'more' : 'less']).filter((w) => !w.includes(' ')); const gen = pools.comparatives.length ? pools.comparatives : ['bigger', 'smaller']; emitToks([[chance(0.6) && own.length ? pick(own) : pick(gen), 'value']]); continue; }
        const kindOfForm = /swap/.test(f.id) ? 'kind' : /^change\.(be|self)/.test(f.id) ? (f.id === 'change.self' ? 'colour' : 'feeling') : /call|name\./.test(f.id) || f.id === 'make.name' || f.id === 'make.name.place' ? 'name' : /^(save|load)$/.test(f.id) ? 'save' : null;
        emitToks(valuePhrase(c, kindOfForm ? null : attr, kindOfForm)); continue;
      }
      if (role === 'amount') { emitToks([[numWord(1 + Math.floor(R() * 9)), 'amount']]); continue; }
      if (role === 'place') {
        let t;
        if (f.act === 'send') t = { toks: pick(WORLD_NOUNS).split(' ').map((w) => [w, 'place']) };
        else if (f.act === 'connect') t = thingPhrase(c, chance(0.7) ? mainKind : null, { allowSet: false, asPlace: true });
        else {
          const holder = c.kinds.find((k) => c.kinds.some((x) => x.in === k.name)) ?? pick(c.kinds);
          t = chance(0.2) ? { toks: mk2(pick([...pools.cities.slice(0, 80), ...pools.objects.slice(0, 200)].filter((w) => !w.includes(' ') && !bad0.has(w))), 'place') } : thingPhrase(c, chance(0.8) ? holder : null, { allowSet: false, asPlace: true });
        }
        emitToks(t.toks); continue;
      }
      if (role === 'rel') { const lst = src.includes('dir') ? A.DIR_WORDS : src.includes('layout') ? A.LAYOUT_ADVERBS : A.REL_WORDS; const w = pick(lst).replace(/_/g, ' '); emitToks(w.split(' ').map((x) => [x, 'place'])); continue; }
      if (role === 'rest') {
        if (f.id === 'ask.why') { emitToks(thingPhrase(c, mainKind, { allowSet: false }).toks); emit(pick(['is', 'are', 'did you make', 'is now'])); emitToks(valuePhrase(c, attr, null)); }
        else emitToks(valuePhrase(c, null, 'name'));
        continue;
      }
      continue;
    }
    emit(e);
  }
  return { sentence, attr };
}
function mk2(w, r) { return w.split(' ').map((x) => [x, r]); }
/** BIO tags over words from (word, role) pairs: a run of the same role is one span; a place span may start with its relation word. */
function toTags(pairs) {
  const words = pairs.map((p) => p[0]);
  const tags = [];
  let prev = null;
  for (const [, r] of pairs) { tags.push(r ? `${prev === r ? 'I' : 'B'}-${r}` : 'O'); prev = r; }
  return { words, tags };
}
const typo = (w) => { if (w.length < 4) return w; const i = 1 + Math.floor(R() * (w.length - 2)); const k = R(); if (k < 0.4) return w.slice(0, i) + w.slice(i + 1); if (k < 0.7) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); return w.slice(0, i) + w[i] + w[i] + w.slice(i + 1); };
function render(pairs) {
  let ps = pairs.filter((p) => p[0]);
  if (chance(0.12)) { const at = Math.floor(R() * ps.length); ps = ps.map(([w, r], i) => (i === at ? [typo(w), r] : [w, r])); }
  if (chance(0.5) && ps.length) { const q = chance(0.5) ? '?' : '.'; ps = [...ps, [q, null]]; }
  const { words, tags } = toTags(ps);
  return { text: words.join(' ').replace(/ ([?.])$/, '$1'), words, tags };
}

// ---- build ----------------------------------------------------------------------------------------------------------------------------------------------
const real = discoverSchemas();
const heldEntries = real.filter((e) => HOLD.has(e.id));
const bad = new Set(heldEntries.flatMap((e) => [...vocabOf(e.schema)]));   // the held-out worlds' own words are removed from the pools of the training worlds
const trainReal = real.filter((e) => !HOLD.has(e.id));
bad0 = bad;
const synth = Array.from({ length: N_SYNTH }, (_, i) => synthSchema(i, bad));
const trainWorlds = [...trainReal, ...synth].map((e) => ctxOf(e, bad));
const heldWorlds = heldEntries.map((e) => ctxOf(e, new Set()));
const seenTestWorlds = [...trainReal.map((e) => ctxOf(e, bad)), ...synth.map((e) => ctxOf(e, bad))];
if (heldWorlds.length < HOLD.size) console.error(`warning: held-out worlds missing: ${[...HOLD].filter((h) => !heldEntries.some((e) => e.id === h)).join(', ')}`);

function sample(c, n, seen, rowsOut, tag) {
  const forms = A.formsFor(c.s);
  const weight = (f) => (f.priority < 6 ? 0.5 : 1);
  let tries = 0, made = 0;
  while (made < n && tries < n * 30) {
    tries++;
    const f = wpick(forms.map((x) => [x, weight(x)]));
    let r;
    try { r = expandForm(c, f); } catch { continue; }
    if (!r.sentence.length || r.sentence.length > 30) continue;
    const row = render(r.sentence);
    if (!row.words.length || seen.has(row.text)) continue;
    seen.add(row.text);
    rowsOut.push({ ...row, act: f.act, world: c.entry.id, form: f.id, ...(tag ? { split: tag } : {}) });
    made++;
  }
  return made;
}
const seen = new Set();
const out = { train: [], dev: [], 'test-seen': [], 'test-held': [] };
// test sets first (own seed) so that train sentences colliding with them are dropped rather than the test shrinking
R = rngOf(SEED * 7919 + 13);
for (const c of heldWorlds) sample(c, Math.ceil(N_TEST / heldWorlds.length), seen, out['test-held']);
for (const c of seenTestWorlds) sample(c, Math.ceil(N_TEST / seenTestWorlds.length), seen, out['test-seen']);
R = rngOf(SEED);
const perTrain = Math.ceil(N_TRAIN / trainWorlds.length);
for (const c of trainWorlds) sample(c, c.entry.synthetic ? perTrain : perTrain * 2, seen, out.train);
const nDev = Math.min(5000, Math.floor(out.train.length * 0.025));
for (let i = out.train.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [out.train[i], out.train[j]] = [out.train[j], out.train[i]]; }
out.dev = out.train.splice(0, nDev);
const stats = { seed: SEED, generated: new Date().toISOString(), hold: [...HOLD], realWorlds: real.map((e) => ({ id: e.id, file: e.file, held: HOLD.has(e.id) })), synthetic: synth.length, poolSizes: Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])), heldVocabRemovedFromPools: bad.size };
for (const [name, rows] of Object.entries(out)) {
  writeFileSync(path.join(OUT, `${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const byAct = {}, byWorld = {};
  for (const r of rows) { byAct[r.act] = (byAct[r.act] ?? 0) + 1; byWorld[r.world.startsWith('synth.') ? 'synth.*' : r.world] = (byWorld[r.world.startsWith('synth.') ? 'synth.*' : r.world] ?? 0) + 1; }
  stats[name] = { n: rows.length, byAct, byWorld };
}
writeFileSync(path.join(OUT, 'stats.json'), `${JSON.stringify(stats, null, 1)}\n`);
console.log(JSON.stringify({ train: stats.train.n, dev: stats.dev.n, 'test-seen': stats['test-seen'].n, 'test-held': stats['test-held'].n, byWorldHeld: stats['test-held'].byWorld, byActTrain: stats.train.byAct }, null, 1));
