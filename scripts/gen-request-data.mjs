#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * DATA OF THE REQUEST PROPOSER (questions.md Q48 proposal 1; owner GO 2026-11-15 late): pairs `words -> w.request` for a small encoder that PROPOSES a reading of a request;
 * the rules decide (src/dialog/proposer.mjs). Every label is the library's own reading (readRequest over the open world's request.sop), never a hand label:
 *
 *   generated   requests composed from the DECLARED worlds alone: each world's acts and kinds (capabilitiesOf: std.schema.honours, std.schema.kind), the verbs of each act
 *               (k.actions.verb, kept only when the rules read that verb as that act in this world), the language world's cues (w.lang.en.cue: negation, counts, ranges,
 *               amounts, sizes, places, manners, layouts, with, about, length, reactions, questions), number words, determiners, anaphors. A composed sentence is kept only
 *               when the rules read it fully (no unread word); its reading is the label.
 *   framed      phrasing variety: frames (a prefix / suffix around a request, or a prefix in place of its verb) MINED from the paraphrase corpora (training/paraphrases/{out,heldout/out}:
 *               human-like commands per goal, written by small LLM agents) by aligning each variant with its goal's canonical sentence. A frame is used only when the rules give
 *               its words no meaning (no act, reaction, constraint or thing): the frame's words are tagged DROP and the label stays the reading of the request inside it.
 *   unread      honesty rows: a pseudo-word (random letters) or a kind the open world does not declare (a catalog part) inserted into a request; the rules leave it unread, and so
 *               must the proposer (tag UNREAD: kept, so that the reply names it).
 *   real        every real English turn the repository holds (the real set, the owner sessions, phrase-log exports and their recorded English) on a declared tab, labelled by the
 *               rules where they read it fully (industrial data principle: real rows train too).
 *   noise       a small share (owner 2026-11-15: spelling stays symbolic and runs before the proposer) of framed rows with one slip in a frame word, for robustness only.
 *
 * Output: training/data/request-proposer/{train,dev}.jsonl and report.json; one row: { id, world, source, words, tags, act, reaction, refers, question, render, sig }.
 * `tags` per word: O (kept, no role) | DROP | ACT | REF | REACT | UNREAD | <constraint on>[.no|.not_all] (kind, kind.no, count, size, place, attribute, ...).
 * `render` is the phrasing the rules read for this label (the words without DROP, the act's verb in front when the act has no word): sig(rules(render)) === sig.
 *
 *   node scripts/gen-request-data.mjs [--per-world 3000] [--seed 7] [--out training/data/request-proposer]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { requestLanguage, liveWorld, readTurn } from '../src/dialog/request.mjs';
import { requestTokens, signatureOf, labelOf, renderOf } from '../src/dialog/proposer.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PER_WORLD = Number(arg('per-world', 3000));
const OUT = resolve(REPO, arg('out', 'training/data/request-proposer'));
let seed = Number(arg('seed', 7));
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l)) : []);

const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const language = requestLanguage(lib);
const WORLDS = { 'art.draw': ['draw', 'drawing'], 'diagram.sketch': ['diagram'], 'docs.editor': ['editor', 'documents', 'docs'] };   // the declared tabs (request.sop + planRequest or std.tool bindings)
const TAB = Object.fromEntries(Object.entries(WORLDS).flatMap(([w, ts]) => ts.map((t) => [t, w])));
const lives = Object.fromEntries(Object.keys(WORLDS).map((w) => [w, liveWorld(lib, engine.set.get(w))]));

// ---- the language world's words (facts, not lists) --------------------------------------------------------------------------------------------------
const facts = (type) => { try { return language.ofType(type).map((x) => x.attrs ?? {}); } catch { return []; } };
const s = (v) => (v == null ? null : String(v).replace(/^"|"$/g, ''));
const all = (r, k) => (r?.[k] ?? []).map(s);
const one = (r, k) => s(r?.[k]?.[0]);
const cues = facts('w.lang.en.cue').map((r) => ({ name: one(r, 'name'), on: one(r, 'on'), want: one(r, 'want'), takes: one(r, 'takes'), lead: all(r, 'lead'), trail: all(r, 'trail'), between: all(r, 'between'), bound: one(r, 'bound'), amount: one(r, 'amount') }));
const cueOn = (pred) => cues.filter(pred);
const numbers = facts('w.lang.en.number').filter((r) => one(r, 'kind') === 'cardinal' && Number(one(r, 'value')) >= 2 && Number(one(r, 'value')) <= 12).map((r) => one(r, 'text'));
const verbsOf = {};
for (const r of facts('k.actions.verb')) { const a = one(r, 'act'); const t = one(r, 'text'); if (a && t && /^[a-z][a-z ]*$/.test(t)) (verbsOf[a] ??= new Set()).add(t); }
const irregular = new Map(facts('w.lang.en.irregular').map((r) => [one(r, 'singular'), one(r, 'plural')]));
const plural = (k) => irregular.get(k) ?? (/(s|sh|ch|x|z)$/.test(k) ? `${k}es` : /[^aeiou]y$/.test(k) ? `${k.slice(0, -1)}ies` : `${k}s`);
const colours = facts('k.colours.basic').map((r) => one(r, 'name') ?? one(r, 'text') ?? one(r, 'colour')).filter(Boolean);
const COLOURS = colours.length ? colours : facts('k.colours.colour').slice(0, 12).map((r) => one(r, 'name') ?? one(r, 'text')).filter(Boolean);
const whWords = new Set(facts('w.lang.en.wh').map((r) => one(r, 'text')));
const catalogParts = [...new Set(facts('k.expect.part').map((r) => one(r, 'part')).filter((p) => p && /^[a-z]+$/.test(p)))];
const wordsOfKind = (live) => { const m = new Map(); try { for (const r of live.ofType('core.word')) for (const t of r.attrs.text ?? []) for (const x of r.attrs.means ?? []) m.set(s(t), s(x)); } catch { /* none */ } return m; };

// ---- reading -----------------------------------------------------------------------------------------------------------------------------------------
// readRequest costs tens of ms per call over the catalog's language: readings of lowercase texts are cached by their words (the reader sees only the words)
const cache = new Map();
const readAs = (world, text) => {
  if (/[A-Z"“]/.test(String(text))) return readTurn(lib, lives[world], language, text, {});
  const k = `${world}|${requestTokens(text).join(' ')}`;
  if (!cache.has(k)) cache.set(k, readTurn(lib, lives[world], language, text, {}));
  return cache.get(k);
};
const full = (q) => !q.unread.length && !!(q.act || q.reaction || q.target || q.request.constraints?.length || q.request.refers);

const rows = [];
const seen = new Set();
const counts = {};
function add(world, source, words, q, extra = {}) {
  const corr = new Map((q.corrections ?? []).map((c) => [String(c.said ?? '').toLowerCase(), String(c.as ?? '').toLowerCase()]));
  if (corr.size) words = words.map((w) => corr.get(w) ?? w);   // the proposer reads the spell-repaired words (spelling stays symbolic and runs first)
  const lab = labelOf(q.request, words, extra.drop ?? new Set(), extra.unread ?? new Set());
  if (!lab) { counts[`${source}.unaligned`] = (counts[`${source}.unaligned`] ?? 0) + 1; return false; }
  const render = renderOf(words, lab.tags, lab.act, verbFor(world));
  const back = readAs(world, render);
  if (signatureOf(back.request) !== signatureOf(q.request) || back.unread.length !== (extra.unread?.size ? 1 : 0)) { counts[`${source}.render-differs`] = (counts[`${source}.render-differs`] ?? 0) + 1; return false; }
  const key = `${world}|${words.join(' ')}`;
  if (seen.has(key)) return false;
  seen.add(key);
  rows.push({ id: createHash('sha1').update(key).digest('hex').slice(0, 12), world, source, group: extra.group ?? key, words, ...lab, render, sig: signatureOf(q.request) });
  counts[source] = (counts[source] ?? 0) + 1;
  return true;
}

// the verb the proposal puts in front when the act has no word: the act's commonest verb in this world's fully read rows (filled while generating)
const verbCount = {};
const verbFor = (world) => (act) => { const c = verbCount[world]?.[act]; if (!c) return null; if (c[act]) return act; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };   // the act's own name when it is a verb read so here
const noteVerb = (world, act, words, tags) => { const i = tags.indexOf('ACT'); if (i < 0 || !act) return; const v = words.slice(i, tags.lastIndexOf('ACT') + 1).join(' '); ((verbCount[world] ??= {})[act] ??= {})[v] = (verbCount[world][act][v] ?? 0) + 1; };

// ---- 1. generated requests from the declarations ---------------------------------------------------------------------------------------------------------
const lead = (c) => pick(c.lead.length ? c.lead : c.trail);
const negCues = cueOn((c) => c.on === 'kind' && c.want === 'no' && c.takes === 'kind');
const notAllCues = cueOn((c) => c.on === 'kind' && c.want === 'not_all' && c.takes === 'kind');
const countBound = cueOn((c) => c.on === 'count' && c.takes === 'number');
const countRange = cueOn((c) => c.on === 'count' && c.takes === 'range');
const amounts = cueOn((c) => c.on === 'count' && c.takes === 'none');
const sizes = cueOn((c) => c.on === 'size' && !c.name.startsWith('size.up') && !c.name.startsWith('size.down'));
const sizeSteps = cueOn((c) => c.on === 'size' && (c.name.startsWith('size.up') || c.name.startsWith('size.down')));
const places = cueOn((c) => c.on === 'place' && c.takes === 'none');
const nearPlaces = cueOn((c) => c.on === 'place' && c.takes === 'thing');
const manners = cueOn((c) => c.on === 'manner');
const layouts = cueOn((c) => c.on === 'layout' && c.takes === 'none');
const extents = cueOn((c) => c.on === 'extent');
const lengths = cueOn((c) => c.on === 'length' && c.takes === 'none');
const lengthUnits = cueOn((c) => c.on === 'length' && c.takes === 'number');
const withCue = cueOn((c) => c.on === 'with');
const aboutCue = cueOn((c) => c.on === 'about');
const reactions = cueOn((c) => c.on === 'reaction');
const anaphors = facts('w.lang.en.anaphor').map((r) => one(r, 'text')).filter((t) => t && /^[a-z ]+$/.test(t));
const TOPICS = [...new Set(facts('k.expect.make').map((r) => one(r, 'thing')).filter((t) => t && /^[a-z]+$/.test(t)))];

function worldSpec(world) {
  const live = lives[world];
  const cap = lib.capabilitiesOf(live);
  const kinds = new Set(cap.kinds?.map?.((k) => k.of ?? k) ?? []);
  const makes = [...new Set(cap.honours.filter((h) => h.act === 'make').flatMap((h) => h.of))].filter((k) => /^[a-z][a-z ]*$/.test(k) && !['thing', 'node', 'page'].includes(k));
  const acts = {};
  for (const h of cap.honours) (acts[h.act] ??= new Set()).add(...(h.on.size ? h.on : ['kind']));
  for (const h of cap.honours) for (const o of h.on) acts[h.act].add(o);
  // verbs of an act this world reads as that act (the rules decide which k.actions verbs count)
  const verbs = {};
  for (const [act, vs] of Object.entries(verbsOf)) if (acts[act]) for (const v of vs) {
    const k = pick(makes);
    const q = readAs(world, `${v} a ${k}`);
    if (q.act === act && !q.unread.length) (verbs[act] ??= []).push(v);
  }
  for (const a of ['undo', 'redo']) for (const v of verbsOf[a] ?? []) if (readAs(world, v).act === a) (verbs[a] ??= []).push(v);
  return { live, cap, kinds, makes, acts, verbs, aliases: wordsOfKind(live) };
}

/** A verb of an act: the act's own name when the rules read it so in this world (the plain word), else any verb of the act k.actions has and the rules read so. */
const verbOf = (spec, act) => { const vs = spec.verbs[act] ?? [act]; return vs.includes(act) && chance(0.4) ? act : pick(vs); };

function nounPhrase(spec, kind, honours, { count = true } = {}) {
  const parts = [];
  let pl = false;
  if (count && chance(0.55)) {
    const f = rnd();
    if (f < 0.35) { parts.push(chance(0.5) ? String(2 + Math.floor(rnd() * 9)) : pick(numbers)); pl = true; }
    else if (f < 0.5 && countRange.length) { const c = pick(countRange); const a = 2 + Math.floor(rnd() * 4); const b = a + 1 + Math.floor(rnd() * 4); parts.push(c.lead.length ? `${pick(c.lead)} ${a} ${pick(c.between)} ${b}` : `${a} ${pick(c.between)} ${b}`); pl = true; }
    else if (f < 0.65 && countBound.length) { parts.push(`${lead(pick(countBound))} ${chance(0.5) ? 2 + Math.floor(rnd() * 8) : pick(numbers)}`); pl = true; }
    else if (f < 0.8 && amounts.length) { const a = pick(amounts); parts.push(lead(a)); pl = !['count.one'].includes(a.name); }
    else parts.push(chance(0.8) ? 'a' : 'one');
  } else if (count) parts.push(pick(['a', 'a', 'the', '']));
  if (honours.has('size') && chance(0.25)) parts.push(lead(pick(sizes)));
  if (honours.has('attribute') && chance(0.3) && COLOURS.length) parts.push(pick(COLOURS));
  if (honours.has('manner') && chance(0.15)) parts.push(lead(pick(manners)));
  if (honours.has('length') && chance(0.3)) parts.push(lead(pick(lengths)));
  parts.push(pl ? plural(kind) : kind);
  return parts.filter(Boolean).join(' ').replace(/^a ([aeiou])/, 'an $1');
}

function generate(world, spec, n) {
  const made = [];
  const verbsMake = spec.verbs.make ?? ['make'];
  const H = (act) => spec.acts[act] ?? new Set();
  const items = spec.makes;
  const tries = n * 4;
  for (let t = 0; t < tries && made.length < n; t++) {
    const f = rnd();
    let text;
    if (f < 0.42) {   // a new thing: act + noun phrase + modifiers
      const h = H('make');
      const k = pick(items);
      const bits = [verbOf(spec, 'make'), chance(0.12) ? 'me' : '', nounPhrase(spec, k, h)];
      if (h.has('kind') && chance(0.25)) bits.push(`${chance(0.4) ? ', ' : ''}${lead(pick(chance(0.8) ? negCues : notAllCues))} ${plural(pick(items))}`);
      if (h.has('place') && chance(0.25)) bits.push(lead(pick(places)));
      if (h.has('place') && chance(0.08) && nearPlaces.length) bits.push(`${lead(pick(nearPlaces))} the ${pick(items)}`);
      if (h.has('extent') && chance(0.08)) bits.push(lead(pick(extents)));
      if (h.has('layout') && chance(0.15)) bits.push(lead(pick(layouts)));
      if (h.has('with') && chance(0.2)) bits.push(`${lead(pick(withCue))} ${nounPhrase(spec, pick(items), h)}`);
      if (h.has('about') && chance(0.4)) bits.push(`${lead(pick(aboutCue))} ${pick(TOPICS)}`);
      if (h.has('length') && chance(0.25) && lengthUnits.length) { const c = pick(lengthUnits); bits.push(`with ${2 + Math.floor(rnd() * 5)} ${pick(c.trail)}`); }
      if (h.has('manner') && chance(0.08)) bits.push(lead(pick(manners)));
      if (chance(0.15)) bits.push(`and ${nounPhrase(spec, pick(items), h)}`);
      text = bits.filter(Boolean).join(' ');
    } else if (f < 0.6) {   // acts on things there: remove / place / change on the X, it, them, everything
      const acts = ['remove', 'place', 'change'].filter((a) => spec.verbs[a]?.length && spec.acts[a]);
      if (!acts.length) continue;
      const act = pick(acts);
      const ref = rnd();
      const obj = ref < 0.45 ? `the ${pick(items)}` : ref < 0.6 ? `all the ${plural(pick(items))}` : ref < 0.75 ? pick(['it', 'them', 'that', 'this']) : ref < 0.85 ? pick(['everything', 'all', 'it all']) : `the ${pick(COLOURS)} ${pick(items)}`;
      const tail = act === 'place' ? lead(pick(places)) : act === 'change' ? (chance(0.5) ? pick(COLOURS) : lead(pick(sizeSteps.length ? sizeSteps : sizes))) : '';
      text = `${verbOf(spec, act)} ${obj} ${tail}`;
    } else if (f < 0.72) {   // reactions to the last result, alone or with a constraint
      const r = pick(reactions);
      text = lead(r);
      if (chance(0.3)) text = `${text}${chance(0.5) ? ',' : ''} ${pick([`${lead(pick(negCues))} ${plural(pick(items))}`, plural(pick(items)), lead(pick(places)), lead(pick(sizes))])}`;
    } else if (f < 0.8) {   // continuing fragments: a thing with no verb
      text = `${pick(['', '', 'and', 'also', 'now'])} ${nounPhrase(spec, pick(items), H('make'))}`;
    } else if (f < 0.87) {   // questions about the state and about what the world can do
      const q = cueOn((c) => c.name?.startsWith('ask.'));
      text = chance(0.5) && q.length ? `${lead(pick(q))}${chance(0.5) ? '?' : ''}` : `how many ${plural(pick(items))} are there${chance(0.6) ? '?' : ''}`;
    } else if (f < 0.92) {   // the timeline's acts
      const a = pick(['undo', 'redo'].filter((x) => spec.verbs[x]?.length));
      if (!a) continue;
      text = `${verbOf(spec, a)}${chance(0.3) ? pick([' that', ' it', ` the ${pick(items)}`]) : ''}`;
    } else {   // arrange / layout on the open thing
      if (!spec.verbs.arrange?.length && !layouts.length) continue;
      text = chance(0.5) && spec.verbs.arrange?.length ? `${pick(spec.verbs.arrange)} ${pick(['it', 'them', 'everything', `the ${pick(items)}`])} ${lead(pick(layouts))}` : lead(pick(layouts));
    }
    text = text.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
    if (!text) continue;
    const q = readAs(world, text);
    if (!full(q)) continue;
    const words = requestTokens(text);
    made.push({ text, words, q });
  }
  return made;
}

// ---- 2. frames mined from the paraphrase corpora --------------------------------------------------------------------------------------------------------
function lcs(a, b) {
  const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
  return pairs;
}
function mineFrames() {
  const files = [];
  for (const dir of ['training/paraphrases/out', 'training/paraphrases/heldout/out']) { const p = join(REPO, dir); if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith('.jsonl')) files.push(join(p, f)); }
  const groups = new Map();
  for (const f of files) for (const r of jl(f)) { if (r.language && r.language !== 'en') continue; const g = groups.get(r.group) ?? { canon: null, vars: [] }; if (r.lineage?.role === 'canonical') g.canon = r.text; else g.vars.push(r.text); groups.set(r.group, g); }
  const frames = new Map();
  const bump = (k) => frames.set(k, (frames.get(k) ?? 0) + 1);
  for (const g of groups.values()) {
    if (!g.canon) continue;
    const C = requestTokens(g.canon).filter((w) => w !== ',');
    if (C.length < 2) continue;
    for (const v of g.vars) {
      const P = requestTokens(v).filter((w) => w !== ',');
      const al = lcs(P, C);
      const covered = al.length / C.length;
      if (covered < 0.75) continue;
      const first = al[0], last = al.at(-1);
      const pre = P.slice(0, first[0]).join(' '), suf = P.slice(last[0] + 1).join(' ');
      const dropsVerb = first[1] === 1 && al.length === C.length - 1 && Object.values(verbsOf).some((vs) => vs.has(C[0]));   // the variant has every word but the canonical's first, a verb of k.actions
      if (al.length === C.length || dropsVerb) {
        if (pre) bump(JSON.stringify({ pre, suf: '', verb: !dropsVerb }));
        if (suf) bump(JSON.stringify({ pre: '', suf, verb: true }));
        if (dropsVerb && !pre && !suf) bump(JSON.stringify({ pre: '', suf: '', verb: false }));
      }
    }
  }
  // a frame is phrasing the rules give no meaning to: read alone in every declared world, it has no act, reaction, constraint, thing or reference
  const ok = [];
  for (const [k, n] of [...frames].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 300)) {
    const f = JSON.parse(k);
    const text = `${f.pre} ${f.suf}`.trim();
    if (text && Object.keys(lives).some((w) => { const q = readAs(w, text); return q.act || q.reaction || q.target || q.request.constraints?.length || q.request.refers || q.request.question; })) continue;
    if (text.split(' ').length > 6) continue;
    if (text.split(' ').some((w) => whWords.has(w))) continue;   // a question word of the language makes a question, not phrasing
    ok.push({ ...f, n });
  }
  return { frames: ok.sort((a, b) => b.n - a.n), groups: groups.size };
}

// ---- 3. real rows ---------------------------------------------------------------------------------------------------------------------------------------
async function realRows() {
  const out = [];
  for (const r of jl(join(REPO, 'training/eval/real-2026-11-15.jsonl'))) if (TAB[r.tab]) { if (r.lang === 'en') out.push({ world: TAB[r.tab], text: r.text, source: 'real.set' }); }
  for (const f of ['owner-2026-11-15T1143-checks.jsonl', 'owner-2026-11-15T0734-checks.jsonl', 'owner-2026-11-15T0734-variants.jsonl']) for (const r of jl(join(REPO, 'training/eval', f))) if (TAB[r.tab] && r.lang === 'en') out.push({ world: TAB[r.tab], text: r.text, source: 'real.owner' });
  const dir = join(REPO, 'training/eval/owner-exports');
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    let j; try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    const recs = Array.isArray(j) ? j : Object.values(j).find(Array.isArray) ?? [];
    for (const r of recs) if (TAB[r.tab]) { if (r.lang === 'en') out.push({ world: TAB[r.tab], text: r.text, source: 'real.phraselog' }); if (r.english) out.push({ world: TAB[r.tab], text: r.english, source: 'real.phraselog.english' }); }
  }
  // Romanian real rows through the rules translator (cheap; the door reads the English of the turn)
  const tr = createTranslator();
  for (const r of jl(join(REPO, 'training/eval/real-2026-11-15.jsonl'))) if (TAB[r.tab] && r.lang === 'ro') {
    let en = null; try { en = (await tr.translate(r.text, { from: 'ro', to: 'en' }))?.text; } catch { en = null; }
    if (en) out.push({ world: TAB[r.tab], text: en, source: 'real.ro-rules-en' });
  }
  return out;
}

// ---- run --------------------------------------------------------------------------------------------------------------------------------------------
const t0 = Date.now();
const specs = Object.fromEntries(Object.keys(lives).map((w) => [w, worldSpec(w)]));
const base = {};
for (const w of Object.keys(lives)) {
  base[w] = generate(w, specs[w], PER_WORLD);
  for (const g of base[w]) { const lab = labelOf(g.q.request, g.words, new Set(), new Set()); if (lab) noteVerb(w, lab.act, g.words, lab.tags); }
}
for (const w of Object.keys(lives)) for (const g of base[w]) add(w, 'generated', g.words, g.q, { group: `${w}|${g.text}` });
console.error(`generated ${counts.generated ?? 0} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

const { frames, groups } = mineFrames();
console.error(`frames: ${frames.length} from ${groups} paraphrase groups`);
const weighted = frames.flatMap((f) => new Array(Math.min(20, f.n)).fill(f));
const slip = (w) => { if (w.length < 4) return w; const i = 1 + Math.floor(rnd() * (w.length - 2)); return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); };
for (const w of Object.keys(lives)) for (const g of base[w]) {
  for (let k = 0; k < 3; k++) {
    if (!weighted.length) break;
    const f = pick(weighted);
    const lab0 = labelOf(g.q.request, g.words, new Set(), new Set());
    if (!lab0) continue;
    const actAt = lab0.tags.indexOf('ACT');
    let core = g.words;
    let dropAct = false;
    if (!f.verb) { if (actAt !== 0) continue; const n = lab0.tags.filter((t) => t === 'ACT').length; core = g.words.slice(n); dropAct = true; }
    let pre = f.pre ? requestTokens(f.pre) : [], suf = f.suf ? requestTokens(f.suf) : [];
    const noisy = chance(0.04);
    if (noisy) { if (pre.length) pre = pre.map((x, i) => (i === 0 ? slip(x) : x)); else if (suf.length) suf = suf.map((x, i) => (i === 0 ? slip(x) : x)); }
    const words = [...pre, ...core, ...suf];
    const drop = new Set([...pre.map((_, i) => i), ...suf.map((_, i) => pre.length + core.length + i)]);
    // the label of a framed row: the reading of the request inside the frame (its words shifted), with the act said by the frame when the verb was dropped
    const q = { request: shiftRequest(g.q.request, dropAct ? -lab0.tags.filter((t) => t === 'ACT').length : 0, pre.length) };
    add(w, noisy ? 'noise' : dropAct ? 'framed.verb' : 'framed', words, q, { drop, group: `${w}|${g.words.join(' ')}`, actFromFrame: dropAct });
  }
}
console.error(`framed ${counts.framed ?? 0}, framed.verb ${counts['framed.verb'] ?? 0}, noise ${counts.noise ?? 0}`);

// honesty rows: a word no world knows (random letters) or a kind the open world does not declare, put into a request; the rules leave it unread and so must the proposal
const pseudo = () => { const c = 'bcdfghjklmnprstvwz', v = 'aeiou'; let w = ''; const n = 2 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) w += c[Math.floor(rnd() * c.length)] + v[Math.floor(rnd() * v.length)]; return w + (chance(0.5) ? c[Math.floor(rnd() * c.length)] : ''); };
for (const w of Object.keys(lives)) {
  const foreign = catalogParts.filter((p) => !specs[w].makes.includes(p) && !specs[w].aliases.has(p));
  for (const g of base[w].slice(0, Math.floor(base[w].length * 0.25))) {
    const x = chance(0.5) ? pseudo() : pick(foreign);
    if (!x) continue;
    const at = Math.floor(rnd() * (g.words.length + 1));
    const words = [...g.words.slice(0, at), x, ...g.words.slice(at)];
    const q = readAs(w, words.join(' '));
    if (!q.unread.includes(x) || q.unread.length !== 1) continue;
    add(w, 'unread', words, q, { unread: new Set([at]), group: `${w}|${g.words.join(' ')}` });
  }
}
console.error(`unread ${counts.unread ?? 0}`);

const real = await realRows();
let realFull = 0, realPart = 0;
for (const r of real) { const q = readAs(r.world, r.text); if (full(q)) { if (add(r.world, r.source, requestTokens(r.text), q, { group: `real|${r.text}` })) realFull++; } else realPart++; }
console.error(`real: ${real.length} turns, ${realFull} labelled (read fully by the rules), ${realPart} not read fully (no label)`);

/** A request read over a sentence, its word positions moved: `cut` words removed from the front (a dropped verb), then `shift` words of a prefix put in front. */
function shiftRequest(req, cut, shift) {
  const mv = (at) => (at == null ? at : at + cut + shift);
  const out = { ...req, constraints: (req.constraints ?? []).map((c) => ({ ...c, at: mv(c.at) })), reactions: (req.reactions ?? []).map((r) => ({ ...r, at: mv(r.at) })), named: (req.named ?? []).map((n) => ({ ...n, at: mv(n.at) })), refersAt: mv(req.refersAt), _actAt: req.act && cut < 0 ? -1 : undefined };
  Object.defineProperty(out, 'facts', { value: req.facts, enumerable: false });
  return out;
}

// ---- split and write -----------------------------------------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const dev = (g) => parseInt(createHash('sha1').update(g).digest('hex').slice(0, 6), 16) % 100 < 5;
const tr = rows.filter((r) => !dev(r.group) || r.source.startsWith('real')), dv = rows.filter((r) => dev(r.group) && !r.source.startsWith('real'));   // real rows always train (industrial data principle); the fresh probe set tests
writeFileSync(join(OUT, 'train.jsonl'), tr.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(join(OUT, 'dev.jsonl'), dv.map((r) => JSON.stringify(r)).join('\n') + '\n');
const label = (k) => { const m = {}; for (const r of rows) { const v = String(r[k]); m[v] = (m[v] ?? 0) + 1; } return m; };
const tagc = {}; for (const r of rows) for (const t of r.tags) tagc[t] = (tagc[t] ?? 0) + 1;
const verbs = Object.fromEntries(Object.keys(lives).map((w) => [w, Object.fromEntries(Object.keys(verbCount[w] ?? {}).map((a) => [a, verbFor(w)(a)]))]));
const report = { date: new Date().toISOString(), seed: Number(arg('seed', 7)), per_world: PER_WORLD, rows: rows.length, train: tr.length, dev: dv.length, by_source: counts, by_world: label('world'), acts: label('act'), reactions: label('reaction'), refers: label('refers'), questions: label('question'), tags: tagc, frames: frames.length, top_frames: frames.slice(0, 40), verbs, real: { turns: real.length, labelled: realFull, not_read: realPart }, seconds: (Date.now() - t0) / 1000 };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
writeFileSync(join(OUT, 'verbs.json'), JSON.stringify(verbs, null, 1));
console.log(JSON.stringify({ rows: rows.length, train: tr.length, dev: dv.length, by_source: counts, seconds: report.seconds }));
