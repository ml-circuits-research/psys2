// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The thin local `lang.en` module (first slice of "English as a world", questions.md Q10): what PSys2 knows about English noun phrases, coordination, ellipsis and anaphora is read from FACTS
 * (the shards of handover/lang.en, in the format of the knowledge repository's `w.lang.en`) instead of being written again in every module that needs a determiner list. The few algorithms that apply
 * the facts (split a coordination, copy a shared argument, expand a one-anaphora) live here until the library's `std.grammar` reads the same facts as a chart grammar (handover/lang.en/std-grammar.md).
 * Browser-safe: no `node:*`; the facts come from a generated module (scripts/build-lang-en.mjs) or are passed in as texts / wires (`createLangEn`), so a host can load the catalog's version of the same world.
 *
 *   words(type, view)        the words of facts `lang.en.<type>` that belong to a view: words('det', 'dialogue'); a view is one list some module used (the `in=` entries of the shard)
 *   ordinals(view)           { first: 1, ... last: -1 }            numerals(view)  { zero: 0, ... }
 *   refers(view)             { he: 'm', they: 'any', i: 'user' ... } the agent a pronoun stands for (view session.agent)
 *   anaphorRegex(view)       /\b(it|that one|...)\b/i in the order of the facts (the dialogue module's pronoun and "back to" patterns)
 *   singular(w, set)         the singular of a plural by the rules of a set (act: schema-world reader; lemma: the formalizer's lemmatizer, with `irregular` first)
 *   leads() trails() repeats() starters()     the ellipsis markers of a fragment ("and what about", "too", "again")
 *   splitList(text)          "a, b and c" -> ["a", "b", "c"] (the separators of coordination)
 *   splitThings(text)        coordinated noun phrases in the head of a role, each part with the shared tail ("a sun, a cloud and a man next to the house")
 *   bareDistributes(part)    a part that is only a number or an ordinal takes the kind of the part before it ("tables 1 and 2")
 *   sharedArgument(tokens)   shared leading verb phrase / trailing argument of a coordination ("make your eyes and body blue")
 *   ellipsisPrefixes(tokens) the 1-2 first words of an anchor clause that a verb ellipsis copies
 *   cutWords(also) cardJoiners() sequenceWords(also)   the clause joiners (the splitter's cut words, the card-driven cutter's, "then"/"also" that may follow "and"), frameLeads() leads that keep their comma
 *   corrections() leadOnly() answers() answerRegex() answerWords()   self-correction markers [[words], needsComma], words of a lead-only clause, bare answers
 *   questionWords(view)      question-start (first word of a question), wh-lead (fuzzy wh), question-tail (a question after a connective)
 *   frames(set?)             the argument frames of the acts [{ id, act, mode, match, args, priority, if, lit, tabOnly, tabPriority, example }] in the order of the facts (sets: acts, acts.more, acts.data)
 *   nounPhrase(text)         the readings of a noun phrase beyond its head noun: { text, choice?: [{ text, alt }], partitive?: { mode: 'ask' | 'all' | 'count', n? }, other?: { plural }, relative?: true }
 *   timeRelation(word)       a temporal preposition as a relation: { rel: 'before', order: 'earlier' | 'later' | 'within', span? }, null for any other word (prepositions.sop in=time)
 *   timeComparison(text)     "is Monday before Friday" -> { a, b, rel: 'before' | 'after', kinds: ['day'] }: a yes / no question that puts two moments in order (null for anything else; `during` and distances are no order)
 *   negatedRequest(text)     "do not remove table 3" -> { rest: 'remove table 3', leadEnd } (a request that must not be carried out), null for anything else
 *   oneAnaphora(ct, anchor, env)  "and a yellow one" repeats the previous command with its noun and the new modifiers
 */
import { parse } from '../soplang/index.mjs?v=c57881f705';
import { LANG_EN_FACTS } from './en.facts.generated.mjs?v=c251a9087c';

const all = (w, k) => w.attrs[k] ?? [];
const one = (w, k) => all(w, k)[0];
const isWord = (t) => t.kind === 'word' || t.kind === 'number';
const span = (toks) => [Math.min(...toks.map((t) => t.start)), Math.max(...toks.map((t) => t.end))];

/** Reads wires from SOP texts ({ name: text }) or from wires already parsed. The attrs of a wire are { key: [values] }; a value is a string. */
export function createLangEn(source = LANG_EN_FACTS) {
  const wires = Array.isArray(source) ? source : Object.values(source).flatMap((text) => parse(text).wires);
  const norm = wires.map((w) => { const attrs = {}; for (const e of w.entries ?? []) (attrs[e.key] ??= []).push(e.value.v); return { id: w.id, type: w.type, attrs }; });
  const byType = new Map();
  for (const w of norm) (byType.get(w.type) ?? byType.set(w.type, []).get(w.type)).push(w);
  const of = (type) => byType.get(`lang.en.${type}`) ?? [];
  const viewOf = (type, view) => of(type).filter((w) => !view || all(w, 'in').includes(view));
  const memo = new Map();
  const cached = (key, fn) => (memo.has(key) ? memo.get(key) : (memo.set(key, fn()), memo.get(key)));

  const words = (type, view) => cached(`w:${type}:${view}`, () => new Set(viewOf(type, view).map((w) => one(w, 'text').toLowerCase())));
  const ordinals = (view) => cached(`o:${view}`, () => Object.fromEntries(viewOf('ordinal', view).map((w) => [one(w, 'text'), Number(one(w, 'value'))])));
  const numerals = (view) => cached(`n:${view}`, () => Object.fromEntries(viewOf('numeral', view).map((w) => [one(w, 'text'), Number(one(w, 'value'))])));
  const AGENT = new Set(['m', 'f', 'any', 'user', 'assistant']);
  const refers = (view) => cached(`r:${view}`, () => Object.fromEntries(viewOf('pron', view).map((w) => [one(w, 'text'), all(w, 'refers').find((r) => AGENT.has(r))]).filter(([, r]) => r)));
  const anaphorRegex = (view) => cached(`a:${view}`, () => {
    const ws = viewOf('anaphor', view).sort((a, b) => Number(one(a, 'order')) - Number(one(b, 'order'))).map((w) => one(w, 'text'));
    return new RegExp(`\\b(${ws.join('|')})\\b`, 'i');
  });

  // ---- morphology ----
  const rulesOf = (set) => cached(`i:${set}`, () => of('inflect').filter((w) => one(w, 'set') === set && one(w, 'op') === 'singular').sort((a, b) => Number(one(a, 'order')) - Number(one(b, 'order'))));
  const exceptions = (kind, key) => cached(`x:${kind}:${key}`, () => of('noun.exception').filter((w) => one(w, 'kind') === kind).map((w) => one(w, key)));
  const irregular = () => cached('irr', () => new Map(of('irregular').map((w) => [one(w, 'plural'), one(w, 'singular')])));
  /** The singular of a lowercase word by the rules of a set; the word itself when no rule applies. `irregular` (a Map plural -> singular) of the lexicon takes precedence in the lemma set. */
  function singular(word, set = 'act', lexIrregular = null) {
    const w = set === 'lemma' ? String(word).toLowerCase() : String(word);
    if (set === 'lemma') { if (lexIrregular?.has(w)) return lexIrregular.get(w); if (irregular().has(w)) return irregular().get(w); }
    for (const r of rulesOf(set)) {
      if (r.attrs['min-length'] && !(w.length >= Number(one(r, 'min-length')))) continue;
      const sfx = all(r, 'suffix');
      let hit = sfx.length ? sfx.find((s) => w.endsWith(s)) : null;
      if (one(r, 'pattern') === 'us-plural') hit = w === 'buses' || exceptions('us-plural-suffix', 'stem').some((s) => w.endsWith(`${s}es`)) ? 'es' : null;
      if (!hit) continue;
      if (all(r, 'unless-suffix').some((s) => w.endsWith(s))) continue;
      if (one(r, 'unless-is-singular') === 'yes' && w.endsWith('is') && !exceptions('is-plural', 'stem').some((s) => w.endsWith(`${s}s`))) continue;
      if (one(r, 'replace') != null) return w.slice(0, w.length - hit.length) + one(r, 'replace');
      return w.slice(0, w.length - Number(one(r, 'drop') ?? 0));
    }
    return w;
  }

  // ---- ellipsis markers ----
  const ordered = (type) => cached(`e:${type}`, () => of(type).sort((a, b) => Number(one(a, 'order') ?? 0) - Number(one(b, 'order') ?? 0)).map((w) => one(w, 'text').split(' ')));
  const leads = () => ordered('ellipsis.lead');
  const trails = () => ordered('ellipsis.trail');
  const repeats = () => cached('e:repeat', () => new Set(of('ellipsis.repeat').map((w) => one(w, 'text'))));
  const starters = () => cached('e:starter', () => new Set(of('ellipsis.starter').map((w) => one(w, 'text'))));
  const param = (name) => of('ellipsis.param').find((w) => one(w, 'name') === name) && one(of('ellipsis.param').find((w) => one(w, 'name') === name), 'value');

  // ---- coordination ----
  const sepWords = (view) => cached(`s:${view}`, () => of('coord.sep').filter((w) => all(w, 'in').includes(view)).map((w) => one(w, 'text')));
  const coordParam = (name) => one(of('coord.param').find((w) => one(w, 'name') === name), 'value');
  const sepRe = (view) => cached(`sr:${view}`, () => {
    const ws = sepWords(view).filter((s) => s !== ','), afterComma = of('coord.sep').filter((w) => all(w, 'in').includes(view) && all(w, 'after-comma').includes(view)).map((w) => one(w, 'text'));
    const comma = sepWords(view).includes(',') ? `\\s*,\\s*${afterComma.length ? `(?:${afterComma.join('|')}\\s+)?` : ''}` : null;
    return new RegExp([comma, ws.length ? `\\s+(?:${ws.join('|')})\\s+` : null].filter(Boolean).join('|'), 'i');
  });
  /** "a, b and c" -> ["a", "b", "c"] by the list separators of `view` (things: also "&"; resolve: "," and "and"). */
  const splitList = (text, view = 'resolve') => String(text ?? '').split(sepRe(view)).map((x) => x.trim()).filter(Boolean);
  const startRe = () => cached('start', () => new RegExp(`^(?:${coordParam('numeral-part-start')}|${[...words('det', 'acts.number-start')].join('|')})$`, 'i'));
  const bareRe = () => cached('bare', () => new RegExp(coordParam('bare-ordinal-part'), 'i'));
  const bareDistributes = (part) => bareRe().test(part);
  /** Coordinated noun phrases in the head of a role: [{ head, tail }] (empty when there are fewer than two). `tick` is an optional budget hook. */
  function splitThings(text, tick = () => {}) {
    const w = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    if (w.length < Number(coordParam('min-words'))) return [];
    const bound = words('prep', 'np.boundary');
    let cut = w.findIndex((x, i) => i > 0 && bound.has(x.toLowerCase().replace(/[,]/g, '')));
    if (cut < 0) cut = w.length;
    const head = w.slice(0, cut).join(' '), tail = w.slice(cut).join(' ');
    const raw = head.split(sepRe('things')).map((x) => x.trim()).filter(Boolean);
    const parts = [];
    for (const piece of raw) { tick('acts.split'); if (parts.length && !startRe().test(piece.split(/\s+/)[0])) parts[parts.length - 1] += ` and ${piece}`; else parts.push(piece); }
    return parts.length < 2 ? [] : parts.map((x) => ({ head: x, tail }));
  }

  // ---- clauses (handover/lang.en/shards/clauses.sop) ----
  const joiners = () => of('joiner');
  /** The words the clause splitter cuts at; `also` off (the ablation switch) drops "also". */
  const cutWords = (also = true) => cached(`cw:${also}`, () => new Set(joiners().filter((w) => one(w, 'cut') === 'yes' && (also || one(w, 'kind') !== 'addition')).map((w) => one(w, 'text'))));
  /** The sequence words ("then", "also") that may follow "and" or a comma without a new cut. */
  const sequenceWords = (also = true) => cached(`sw:${also}`, () => joiners().filter((w) => ['sequence', 'addition'].includes(one(w, 'kind')) && (also || one(w, 'kind') !== 'addition')).map((w) => one(w, 'text')));
  const cardJoiners = () => cached('cj', () => new Set(joiners().filter((w) => one(w, 'card-cut') === 'yes').map((w) => one(w, 'text'))));
  const frameLeads = () => cached('fl', () => new Set(of('frame-lead').map((w) => one(w, 'text'))));
  const corrections = () => cached('co', () => of('correction').map((w) => [one(w, 'text').split(' '), one(w, 'comma') === 'yes']));
  const leadOnly = () => cached('lo', () => new Set(of('correction.lead').flatMap((w) => all(w, 'text'))));
  const answers = () => cached('an', () => of('answer').flatMap((w) => all(w, 'text')));
  const answerRegex = () => cached('ar', () => new RegExp(`^(${answers().join('|')})$`));
  const answerWords = () => cached('aw', () => [...answers()].sort((a, b) => b.split(' ').length - a.split(' ').length));
  const questionWords = (view) => cached(`q:${view}`, () => new Set([...words('wh', view), ...words('aux', view)]));

  // ---- argument frames of the acts (handover/lang.en/shards/frames-acts.sop) ----
  const frames = (set) => cached(`f:${set}`, () => of('frame').filter((w) => !set || one(w, 'set') === set).map((w) => {
    const f = { id: w.id.slice(`lang.en.frame.${one(w, 'set')}.`.length), act: one(w, 'act'), match: one(w, 'pattern'), args: all(w, 'role'), priority: Number(one(w, 'priority')), example: one(w, 'example') };
    if (one(w, 'mode')) f.mode = one(w, 'mode');
    if (one(w, 'needs')) f.if = one(w, 'needs');
    const lit = Object.keys(w.attrs).filter((k) => k.startsWith('lit.'));
    if (lit.length) f.lit = Object.fromEntries(lit.map((k) => [k.slice(4), one(w, k)]));
    if (one(w, 'tab-only')) f.tabOnly = one(w, 'tab-only') === 'yes';
    if (one(w, 'tab-priority')) f.tabPriority = Number(one(w, 'tab-priority'));
    return f;
  }));

  // ---- noun-phrase readings: relative clauses, "some of", "the other one", "or" (np.sop, slice 2) ----
  const wordList = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lowerOf = (w) => w.toLowerCase().replace(/[,.;:!?]+$/g, '');
  const mw = (type) => cached(`mw:${type}`, () => of(type).filter((w) => one(w, 'text')).map((w) => [one(w, 'text').split(' '), w]).sort((a, b) => b[0].length - a[0].length));
  const startsWithWords = (ws, seq) => seq.every((x, i) => ws[i] != null && lowerOf(ws[i]) === x);
  /**
   * What a noun phrase says besides its head: a choice ("table 1 or table 2": each part may lack its noun, "the red or the blue house", so a part carries `alt`, itself plus the last word of the last part),
   * a part of a set ("some of the tables", "two of them": `text` is the set; mode ask = which ones, all = the whole set, count = n of them), "the other table" / "the others" / "another one" (`text` without the word "one"),
   * a relative clause with be ("the table that is red" -> text "red table"). One level: a part of a choice is read again by the caller. Plain noun phrases come back unchanged ({ text }).
   */
  function nounPhrase(text) {
    const raw = String(text ?? '').trim();
    const out = { text: raw };
    const ws = wordList(raw);
    const choiceWords = cached('choice', () => new Set(of('choice').map((w) => one(w, 'text'))));
    if (ws.some((w, i) => i > 0 && i < ws.length - 1 && choiceWords.has(lowerOf(w)))) {
      const parts = []; let cur = [];
      for (const w of ws) {
        if (choiceWords.has(lowerOf(w)) && cur.length) { parts.push(cur); cur = []; }
        else if (/,$/.test(w)) { cur.push(w.replace(/,$/, '')); parts.push(cur); cur = []; }
        else cur.push(w);
      }
      if (cur.length) parts.push(cur);
      if (parts.length >= 2) { const lastWord = parts[parts.length - 1].at(-1); out.choice = parts.map((p, i) => ({ text: p.join(' '), alt: i < parts.length - 1 ? `${p.join(' ')} ${lastWord}` : null })); return out; }
    }
    for (const [seq, w] of mw('partitive')) {
      if (!startsWithWords(ws, seq)) continue;
      const mode = one(w, 'mode');
      if (mode === 'count') continue;
      if (lowerOf(ws[seq.length] ?? '') === 'of' && ws.length > seq.length + 1) {
        const rest = ws.slice(seq.length + 1).join(' ');
        return mode === 'all' ? { text: `${seq.join(' ')} ${rest}`, partitive: { mode: 'all' } } : { text: rest, partitive: { mode: 'ask' } };
      }
    }
    if (lowerOf(ws[0] ?? '') === 'of' && ws.length > 1 && of('partitive').some((w) => one(w, 'mode') === 'bare')) return { text: ws.slice(1).join(' '), partitive: { mode: 'ask' } };
    const nums = numerals('acts');
    if (ws.length > 2 && lowerOf(ws[1]) === 'of' && (/^\d+$/.test(ws[0]) || Object.hasOwn(nums, lowerOf(ws[0])))) return { text: ws.slice(2).join(' '), partitive: { mode: 'count', n: /^\d+$/.test(ws[0]) ? Number(ws[0]) : nums[lowerOf(ws[0])] } };
    for (const [seq, w] of mw('other')) {
      if (!startsWithWords(ws, seq)) continue;
      const rest = ws.slice(seq.length).filter((x) => !/^ones?$/i.test(x));
      return { text: rest.join(' '), other: { plural: one(w, 'plural') === 'yes' } };
    }
    const rel = cached('relpron', () => new Set(of('relpron').map((w) => one(w, 'text')))), cop = cached('copula', () => new Set(of('copula').map((w) => one(w, 'text'))));
    const r = ws.findIndex((w, i) => i > 0 && rel.has(lowerOf(w)));
    if (r > 0 && cop.has(lowerOf(ws[r + 1] ?? '')) && ws.length > r + 2) {
      const mods = ws.slice(r + 2), prep = words('prep', 'acts.rel');
      if (!mods.some((m) => prep.has(lowerOf(m)) || lowerOf(m) === 'not' || lowerOf(m) === 'no')) return { text: [...mods, ...ws.slice(0, r)].join(' '), relative: true };
    }
    return out;
  }

  const timeRelation = (word) => cached(`tr:${word}`, () => { const w = of('prep').find((x) => all(x, 'in').includes('time') && one(x, 'text') === String(word).toLowerCase()); return w ? { rel: one(w, 'rel'), order: one(w, 'order'), ...(one(w, 'span') ? { span: one(w, 'span') } : {}) } : null; });

  /** What kind of moment a phrase names ("the summer", "3 o'clock", "Monday"): a kind of the `lang.en.timeword` facts, null for anything else. */
  function timeKind(words) {
    const ws = words.filter((x) => !['the', 'a', 'an', 'this', 'next', 'last'].includes(x));
    const phrase = ws.join(' ');
    if (ws.length === 1) { const w = of('timeword').find((x) => one(x, 'text') === phrase); if (w) return one(w, 'kind'); }
    const c = of('timeword').find((x) => one(x, 'pattern') && new RegExp(one(x, 'pattern')).test(phrase.replace(/(\d) (am|pm)$/, '$1$2')));
    return c ? one(c, 'kind') : null;
  }
  function timeComparison(text) {
    const raw = wordList(String(text ?? '').replace(/[?.!,]+$/g, ''));
    const ws = raw.map((x) => x.toLowerCase().replace(/’/g, "'"));
    const aux = cached('tcaux', () => new Set(['is', 'are', 'was', 'were', 'does', 'do', 'did', 'will', 'would'].filter((x) => of('aux').some((w) => one(w, 'text') === x))));
    if (ws.length < 4 || !aux.has(ws[0])) return null;
    for (let i = 2; i < ws.length - 1; i++) {
      let rel = timeRelation(ws[i]), len = 1;
      if (!rel && ws[i + 1] === 'than') { rel = timeRelation(`${ws[i]}_than`); len = 2; }
      if (!rel || !['before', 'after'].includes(rel.rel)) continue;
      let left = ws.slice(1, i);
      if (['come', 'comes', 'fall', 'falls', 'happen', 'happens'].includes(left.at(-1))) left = left.slice(0, -1);
      const right = ws.slice(i + len);
      const ka = timeKind(left), kb = timeKind(right);
      if (ka && kb) return { a: raw.slice(1, 1 + left.length).join(' '), b: raw.slice(i + len).join(' '), rel: rel.rel, kinds: [...new Set([ka, kb])] };
    }
    return null;
  }

  // ---- negated requests: "do not remove table 3" is no request (clauses.sop lang.en.neg.imperative) ----
  function negatedRequest(text) {
    const src = String(text ?? '').replace(/[.!]+$/, '');
    const ws = wordList(src), starts = [...src.matchAll(/\S+/g)].map((m) => m.index);
    const lead = cached('negreq', () => of('neg.imperative').flatMap((w) => all(w, 'text').map((t) => t.split(' '))).sort((a, b) => b.length - a.length));
    const skip = cached('negskip', () => new Set(of('neg.imperative.skip').flatMap((w) => all(w, 'text'))));
    let at = 0;
    if (ws[0] && ['please', 'pls', 'plz'].includes(lowerOf(ws[0]))) at = 1;
    for (const seq of lead) {
      if (!startsWithWords(ws.slice(at), seq)) continue;
      const rest = ws.slice(at + seq.length);
      if (rest.length < 2 || skip.has(lowerOf(rest[0])) || rest.some((w) => cutWords().has(lowerOf(w)) || /[,;]$/.test(w))) return null;   // a message with several clauses is cut first
      return { rest: rest.join(' '), leadEnd: starts[at + seq.length] };   // leadEnd: the offset in `text` where the rest starts (the lead is [0, leadEnd))
    }
    return null;
  }

  const dets = (view) => words('det', view);
  const isSep = (t) => sepWords('resolve').includes(t.lower);
  /**
   * Shared argument: "make your eyes and body blue", "the tree and the house blue", "eyes, body and mouth blue".
   * Proposes, in order of preference, `prefix head_i suffix` for each coordinated head; the suffix is the shared trailing argument (1 or 2 words), the prefix the shared leading verb phrase.
   */
  function* sharedArgument(tokens) {
    if (tokens.some((t) => t.lower === 'then' || t.lower === 'but')) return;
    const D = dets('expand');
    const parts = [[]];
    for (const t of tokens) { if (isSep(t)) parts.push([]); else parts[parts.length - 1].push(t); }
    const P = parts.map((p) => p.filter(isWord));
    if (P.length < 2 || P.length > 5 || P.some((p) => !p.length)) return;
    const last = P[P.length - 1];
    for (let s = 1; s <= 2; s++) {
      if (last.length - s < 1 || last.length - s > 3) continue;
      const suffix = last.slice(last.length - s);
      for (let h0 = 1; h0 <= Math.min(3, P[0].length); h0++) {
        const prefix = P[0].slice(0, P[0].length - h0);
        const heads = [P[0].slice(P[0].length - h0), ...P.slice(1, -1), last.slice(0, last.length - s)];
        if (heads.some((h) => !h.length || h.length > 3)) continue;
        const pl = prefix[prefix.length - 1]?.lower;
        if (pl && D.has(pl) && heads.some((h, i) => i > 0 && D.has(h[0].lower))) continue;
        yield { clauses: heads.map((h) => ({ tokens: [...prefix, ...h, ...suffix], own: span(h), copied: [...(prefix.length ? [span(prefix)] : []), span(suffix)] })) };
      }
    }
  }

  /** Verb ellipsis: prefixes (1 then 2 words) of the anchor clause to put before an elliptic clause. */
  function* ellipsisPrefixes(anchorTokens) {
    const D = dets('expand');
    const w = anchorTokens.filter(isWord);
    const max = Number(param('verb-prefix-max'));
    for (let len = 1; len <= max && len < w.length; len++) {
      const pre = w.slice(0, len);
      if (pre.some((t) => t.kind === 'number')) return;
      if (len === 2 && D.has(pre[1].lower)) return;
      yield pre;
    }
  }

  /**
   * One-anaphora (spec 03 section 1c): an elliptic noun phrase after a command, "and a yellow one" / "and another yellow one" / "and one yellow" / "and two big ones", repeats the previous command with its noun and
   * the new modifiers. `ct` is the elliptic clause, `anchor` the earlier clause it continues. Returns `null` when `ct` is not such a phrase, else `{ mods, lead, bare, candidates }`: candidate token lists for the new clause
   * (verb and determiner of the anchor, the new modifiers, then the anchor's noun; anchor modifiers of another class than a new one are kept: "a big green house and a yellow one" -> big yellow).
   * Phrasing comes from the caller (phrase groups `lang.elide.*` of lang.common): `leads` (a, an, another, one), `nouns` (one, ones), `sameClass(a, b)` (two words of one lexicon), `isModifier(w)`, `singular(w)`.
   */
  function oneAnaphora(ct, anchor, { leads: LEADS, nouns, sameClass = () => false, isModifier = () => false, singular: sing = (w) => w }) {
    const D = dets('expand');
    const countWord = cached('countw', () => new RegExp(`^(${Object.entries(numerals('acts')).filter(([, v]) => v >= 2 && v <= 10).map(([k]) => k).join('|')})$`));
    const maxMods = Number(param('one-modifiers-max'));
    const w = ct.filter(isWord).map((t) => (t.kind === 'number' && t.alt === 'one' ? { ...t, kind: 'word', lower: 'one' } : t));   // the tokenizer reads "one" as the number 1
    const wa = anchor.filter(isWord);
    if (w.length < 2 || w.length > 5 || wa.length < 2) return null;
    const count = (t) => t.kind === 'number' || countWord.test(t.lower);
    let lead = null, mods, plural = false, bare = false;
    const last = w[w.length - 1].lower;
    if (nouns.has(last)) {   // [lead]? mods* one|ones
      plural = /s$/.test(last);
      const first = w[0];
      const hasLead = LEADS.has(first.lower) || (count(first) && plural);
      if (hasLead) lead = first;
      mods = w.slice(hasLead ? 1 : 0, -1);
      if (!hasLead && !mods.length) return null;
    } else if (w[0].lower === 'one' && w.length <= 3 && w.slice(1).every((t) => isModifier(t.lower))) {   // one mods+
      lead = w[0]; mods = w.slice(1); bare = true;
    } else return null;
    if (mods.length > maxMods || mods.some((t) => count(t) || nouns.has(t.lower) || D.has(t.lower))) return null;
    // the anchor: verb words, then the noun phrase (determiner or number, modifiers, noun tail of 1 or 2 words)
    const out = [];
    const newDet = () => {
      if (lead && count(lead)) return [lead];
      const nxt = (mods[0] ?? wa[wa.length - 1]).lower;
      const base = lead && /^an?$/.test(lead.lower) ? lead.lower : (/^[aeiou]/.test(nxt) ? 'an' : 'a');
      return [{ kind: 'word', raw: base, lower: base, start: ct[0].start, end: ct[0].start, synth: true }];
    };
    for (let t = 1; t <= Number(param('anchor-noun-tail-max')); t++) {
      if (wa.length - t < 1) break;
      const tail = wa.slice(wa.length - t);
      const body = wa.slice(0, wa.length - t);
      // noun phrase start: the last determiner or number of the body, else right after its first word (the verb)
      let s = -1;
      for (let i = body.length - 1; i >= 1; i--) if (D.has(body[i].lower) || count(body[i])) { s = i; break; }
      const hasDet = s >= 0;
      if (!hasDet) s = 1;
      const det = hasDet ? body[s] : null;
      const kept = body.slice(hasDet ? s + 1 : s).filter((m) => !mods.some((n) => sameClass(m.lower, n.lower)));
      const variants = kept.length ? [kept, []] : [[]];
      for (const k of variants) {
        let nounTail = tail;
        const singNP = !plural && (!lead || !count(lead));
        if (singNP && tail.length) {
          const lw = tail[tail.length - 1];
          const sg = sing(lw.lower);
          if (sg !== lw.lower) nounTail = [...tail.slice(0, -1), { ...lw, raw: sg, lower: sg, textOverride: sg }];
        }
        const dets2 = hasDet ? (D.has(det.lower) && !/^(a|an|the)$/.test(det.lower) ? [det] : newDet()) : (lead && count(lead) ? [lead] : []);
        out.push([...body.slice(0, s), ...dets2, ...k, ...mods, ...nounTail]);
      }
    }
    return { mods, lead, bare, candidates: out };
  }

  return { words, ordinals, numerals, refers, anaphorRegex, singular, leads, trails, repeats, starters, splitList, splitThings, bareDistributes, sharedArgument, ellipsisPrefixes, oneAnaphora, frames, nounPhrase, negatedRequest, timeRelation, timeComparison, cutWords, sequenceWords, cardJoiners, frameLeads, corrections, leadOnly, answers, answerRegex, answerWords, questionWords, facts: () => norm };
}

/** The English of this build: the facts of handover/lang.en as shipped in en.facts.generated.mjs. */
export const en = createLangEn();
