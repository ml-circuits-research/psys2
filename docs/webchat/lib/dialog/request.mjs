// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WHAT WAS ASKED IS A WORLD (spec 28; owner GO 2026-11-15 14:00). Browser-safe: no `node:*` imports.
 *
 * Host side of three live worlds:
 *   w.request    one instance per turn: { act, target, facts: [{ key, value, neg?, all?, min?, max?, n?, unit?, step? }], used, unread, reaction }
 *   w.dialogue   one instance per session (RequestDialogue): per tab world the last request, its result, the state before it, what was assumed and not honoured
 *   honour       per tab world, `worlds/<world>/request.sop`: the keys each act honours (`w.honour`) and the defaults of the things it makes (`w.expect`, until k.expect is in the pin)
 *
 * The library's `readRequest` / `reviseRequest` / `sayRequest` (soplang-words-lib, spec 28 section 7) are used when the vendored library has them. Until then this file is the BRIDGE:
 * it reads cue words of the `lang.request.*` phrase groups (worlds/lang.common) and the kind words of the open world into the same shapes. It reads; the open world plans and does.
 */
import { budget } from './budget.mjs?v=00bce6e369';

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const STOP = new Set('a an the of to in on at for with and or but is are was were be been being it its this that these those there here i you he she we they me my your our his her their them us do does did please just also so then very some any can could would should will shall may might must have has had am get got make made let lets want like one'.split(' '));
const ACT = { draw: 'make', make: 'make', create: 'make', add: 'make', build: 'make', generate: 'make', give: 'make', put: 'make', paint: 'make', design: 'make', sketch: 'make', produce: 'make',
  write: 'write', compose: 'write', type: 'write', tell: 'write', play: 'play', sing: 'play', show: 'show', find: 'show', open: 'show',
  arrange: 'arrange', break: 'arrange', split: 'arrange', divide: 'arrange', organise: 'arrange', organize: 'arrange', lay: 'arrange', order: 'arrange', sort: 'arrange' };
const LENGTH_UNITS = /^(?:chapters?|paragraphs?|sections?|words?|pages?|parts?|verses?)$/;
const WITH_STOP = /^(?:and|with|about|in|on|that|which|not|but|without)$/;

const tokensOf = (t) => String(t ?? '').toLowerCase().replace(/n't\b/g, ' not').replace(/[’']/g, '').match(/\d+|[a-z]+|[-–,]/g) ?? [];
export const singular = (w) => (/(?:ss|us)$/.test(w) ? w : /ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ches|shes|xes|sses|oes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) ? w.slice(0, -1) : w);

/** The declarations of a world (parsed by src/worlds/index.mjs from request.sop): { honour: [{ act, keys:Set, target }], expect: Map(of -> {...}) } or null. */
export const declOf = (world) => world?.requestDecl ?? null;

/** The phrase groups of the request reader, as token arrays, longest first. */
function groups(lang) {
  const out = {};
  for (const g of ['not', 'notall', 'small', 'big', 'few', 'many', 'random', 'nice', 'reduce', 'enlarge', 'reject', 'redo', 'thanks', 'frustration', 'expect']) {
    out[g] = [...new Set(lang?.phrase?.(`lang.request.${g}`) ?? [])].map((a) => String(a).toLowerCase().split(/[\s_]+/).filter(Boolean)).filter((a) => a.length).sort((a, b) => b.length - a.length);
  }
  return out;
}
const at = (ws, i, a) => a.every((w, k) => ws[i + k] === w);
const findAll = (ws, alts) => { const out = []; for (let i = 0; i < ws.length; i++) for (const a of alts) if (at(ws, i, a)) { out.push({ i, n: a.length, alt: a.join(' ') }); break; } return out; };

/**
 * Read one request (the bridge reader). `english` the English of the turn; `world` the open tab's world (its schema kinds and request.sop); `first` the first reading
 * ({ complete, act }); `last` the last request of the tab (for reactions). Returns a w.request instance.
 */
export function readRequest(english, { lang, world, kindWords = new Set(), first = null, lib = null, last = null, known = null } = {}) {
  if (typeof lib?.readRequest === 'function') {
    try { const r = lib.readRequest(world, english, { dialogue: last }); if (r && Array.isArray(r.facts)) return { ...r, source: 'lib' }; } catch { /* the bridge reads */ }
  }
  const ws = tokensOf(english);
  const used = new Set();
  const use = (i, n = 1) => { for (let k = i; k < i + n; k++) if (ws[k]) used.add(k); };
  const G = groups(lang);
  const decl = declOf(world);
  // slips of the reader's own words ("ndes", "arraws", "eiagram", "expectatiom", "creare"): a word no dictionary has, one edit from a word of this reader (two for long words), is that word
  const corrections = [];
  {
    const vocab = new Set([...Object.keys(ACT), ...kindWords, ...[...kindWords].map((k) => `${k}s`), ...(decl ? [...decl.expect.keys()] : []), ...(decl?.layouts ?? []), 'nodes', 'arrows', 'layout', 'chapters', 'words', 'paragraphs',
      ...Object.values(G).flat().flat()].filter((w) => w.length >= 4));
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.length < 4 || vocab.has(w) || STOP.has(w) || /\d/.test(w) || (typeof known === 'function' && known(w))) continue;
      let best = null;
      for (const v of vocab) { if (Math.abs(v.length - w.length) > 2) continue; const d = editDistance(w, v, 2); if (d <= (w.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { v, d }; }
      if (best) { corrections.push({ said: w, as: best.v }); ws[i] = best.v; }
    }
  }
  const facts = [];
  const fact = (f) => { if (!facts.some((x) => x.key === f.key && x.value === f.value && !!x.neg === !!f.neg)) facts.push(f); };
  const targets = new Set(decl ? [...decl.expect.keys()] : []);
  // act: the first verb the table knows (an imperative or after "to"/"please"/"can you")
  let act = null;
  for (let i = 0; i < ws.length && i < 8; i++) { budget.tick('request.act'); if (Object.hasOwn(ACT, ws[i]) && ACT[ws[i]] && (i === 0 || /^(?:please|,|you|to|and|then|now|lets|us|me|just|also|i|want|wanted)$/.test(ws[i - 1]))) { act = ACT[ws[i]]; use(i); break; } }   // a verb of the request leads its clause (an imperative); "a nice layout" is a noun
  // reactions (a turn about the last result)
  const hit = (g) => findAll(ws, G[g] ?? []);
  const reaction = (() => {
    const exp = hit('expect'), red = hit('reduce'), enl = hit('enlarge'), rej = hit('reject'), redo = hit('redo'), thx = hit('thanks'), fr = hit('frustration');
    for (const h of [...exp, ...red, ...enl, ...redo, ...thx, ...fr]) use(h.i, h.n);
    if (exp.length) return 'refine';
    if (red.length && (!act || ws.length <= 4)) return 'reduce';
    if (enl.length && !act && ws.length <= 4) return 'enlarge';
    if (redo.length && !act) return 'redo';
    if (rej.length && rej[0].i === 0 && !act && ws.slice(rej[0].n).every((w) => w === ',' || STOP.has(w) || kindWords.has(singular(w)))) { use(rej[0].i, rej[0].n); return 'reject'; }   // "no", "wrong", "no, squares"; "no, I meant the tree" is a correction of the dialogue
    if (thx.length && !act && ws.length <= 4) return 'thanks';
    if (fr.length && !act && !targets.size) return 'frustration';
    return fr.length && !act ? 'frustration' : null;
  })();
  // counts and ranges
  for (let i = 0; i < ws.length; i++) {
    budget.tick('request.count');
    const n = /^\d+$/.test(ws[i]) ? Number(ws[i]) : NUM[ws[i]];
    if (n == null) continue;
    const j = i + 1;
    const m = (ws[j] === '-' || ws[j] === '–' || ws[j] === 'to') ? (/^\d+$/.test(ws[j + 1] ?? '') ? Number(ws[j + 1]) : NUM[ws[j + 1]]) : null;
    let unitAt = m != null ? j + 2 : j;
    // adjectives between the number and its noun ("5 random nodes", "3 small red squares"): the noun is the first kind or unit word within three words
    for (let k = unitAt; k < Math.min(ws.length, unitAt + 3); k++) { const u = singular(ws[k]); if (kindWords.has(u) || LENGTH_UNITS.test(ws[k]) || /^(?:nodes?|items?|bars?|things?|boxes?|elements?|shapes?|points?|slices?)$/.test(ws[k])) { unitAt = k; break; } if (STOP.has(ws[k]) || /^\d+$/.test(ws[k])) break; }
    const unitWord = ws[unitAt] ?? '';
    if (LENGTH_UNITS.test(unitWord) && !/^parts?$/.test(unitWord)) { fact({ key: 'length', n, unit: singular(unitWord) }); use(i, unitAt - i + 1); i = unitAt; continue; }
    if (m != null) { fact({ key: 'count', min: Math.min(n, m), max: Math.max(n, m), of: unitWord ? singular(unitWord) : null }); use(i, 3); i += 2; continue; }
    if (ws[i - 1] === 'with' || kindWords.has(singular(unitWord)) || /^(?:nodes?|items?|bars?|things?|boxes?|elements?|shapes?|points?|slices?)$/.test(unitWord)) { fact({ key: 'count', n, of: unitWord ? singular(unitWord) : null }); use(i); }
  }
  for (const h of hit('few')) { fact({ key: 'count', step: 'few' }); use(h.i, h.n); }
  for (const h of hit('many')) { fact({ key: 'count', step: 'many' }); use(h.i, h.n); }
  // negation: a not-cue before a kind word ("not a circle", "no flowers", "without ducks"); "not all X": more than one kind
  const notAll = hit('notall'), nots = hit('not');
  const kindAt = (i) => { for (let k = i; k < Math.min(ws.length, i + 4); k++) { if (/^(?:and|but|,)$/.test(ws[k])) return -1; const s = singular(ws[k]); if (kindWords.has(s) || kindWords.has(ws[k])) return k; } return -1; };
  const negated = new Set();
  for (const h of notAll) { const k = kindAt(h.i + h.n); if (k >= 0) { fact({ key: 'kind', value: singular(ws[k]), neg: true, all: true }); use(h.i, k - h.i + 1); negated.add(k); } }
  for (const h of nots) {
    if (notAll.some((x) => x.i === h.i)) continue;
    const k = kindAt(h.i + h.n);
    if (k >= 0 && !negated.has(k)) { fact({ key: 'kind', value: singular(ws[k]), neg: true }); use(h.i, k - h.i + 1); negated.add(k); }
  }
  // targets (the whole things a world makes: diagram, pond, story ...) and kinds wanted
  let target = null;
  for (let i = 0; i < ws.length; i++) {
    budget.tick('request.kind');
    const s = singular(ws[i]);
    const afterPrep = /^(?:in|into|on|onto|under|near|by|to|from|above|below|behind|beside|of)$/.test(ws[i - 1] ?? '') || /^(?:in|into|on|onto|under|near|by|to|from|above|below|behind|beside)$/.test(ws[i - 2] ?? '') && /^(?:a|an|the|this|that)$/.test(ws[i - 1] ?? '');
    if (!target && (targets.has(s) || targets.has(ws[i])) && !afterPrep) {
      target = targets.has(s) ? s : ws[i]; use(i);
      // "make the diagram more beautiful": the thing that is there, changed; only a thing said with a / an / no article is a new one
      if (/^(?:the|this|that|my|our|your|it)$/.test(ws[i - 1] ?? '') && act === 'make' && !/^(?:draw|create|add|build|generate|paint|sketch|design|produce)$/.test(ws.find((w) => Object.hasOwn(ACT, w)) ?? '')) act = 'change';
      continue;
    }   // "put the houses in the pond": a place, not the thing made
    if (negated.has(i)) continue;
    if (kindWords.has(s) && !facts.some((f) => f.key === 'count' && f.of === s && !kindWords.has(s))) {
      const generic = decl?.generic?.has(s);
      if (!generic) fact({ key: 'kind', value: s });
      use(i);
    }
  }
  // scale (small / big): of the target, else of the request as a whole
  for (const h of hit('small')) { fact({ key: 'size', step: 'small' }); use(h.i, h.n); }
  for (const h of hit('big')) { fact({ key: 'size', step: 'big' }); use(h.i, h.n); }
  for (const h of hit('random')) { fact({ key: 'manner', value: 'random' }); use(h.i, h.n); }
  for (const h of hit('nice')) { fact({ key: 'manner', value: 'nice' }); use(h.i, h.n); }
  const negatedWord = (i) => negated.has(i);
  // layout words the world declares ("layout", "tree", "grid", "layers: water, land and sky")
  const layouts = decl?.layouts ?? new Set();
  for (let i = 0; i < ws.length; i++) {
    if (ws[i] === 'layout' || ws[i] === 'layouts' || ws[i] === 'arrangement') { use(i); continue; }
    if (layouts.has(ws[i]) && (/^(?:as|in|into|like)$/.test(ws[i - 1]) || (/^(?:a|an|the)$/.test(ws[i - 1]) && /^(?:as|in|into|like)$/.test(ws[i - 2])) || ws[i] === 'layers') && !negatedWord(i)) {
      if (ws[i] === 'layers') {
        const regions = []; let k = i + 1;
        while (k < ws.length) { if (/^(?:and|of)$/.test(ws[k]) || ws[k] === '-') { k++; continue; } if (STOP.has(ws[k]) && ws[k] !== 'land') break; regions.push(ws[k]); k++; }
        fact({ key: 'layout', value: 'layers', regions }); use(i, k - i);
      } else { fact({ key: 'layout', value: ws[i] }); use(i); }
    }
  }
  // with-parts ("with arrows", "with water plants and a duck") and arrows said as a bare noun
  for (let i = 0; i < ws.length; i++) {
    if (/^(?:arrows?|links?|connections?|edges?|connected|lines)$/.test(ws[i]) && decl?.honoursKey?.('make', 'with')) { fact({ key: 'with', value: 'arrow' }); use(i); continue; }
    if (ws[i] !== 'with' || ws[i - 1] === 'start' ) continue;
    let k = i + 1; const part = [];
    while (k < ws.length && !/^(?:about|that|which|in|on|not|but|without)$/.test(ws[k])) {
      if (ws[k] === 'and' || ws[k] === ',') { if (part.length) { addWith(part); part.length = 0; } k++; continue; }
      if (/^\d+$/.test(ws[k]) || NUM[ws[k]] != null) break;   // "with 5 nodes": a count, read above
      if (!STOP.has(ws[k])) part.push(k);
      k++;
    }
    if (part.length) addWith(part);
    use(i);
  }
  function addWith(idx) {
    const words = idx.map((k) => ws[k]);
    const s = singular(words.at(-1));
    if (facts.some((f) => f.key === 'kind' && f.value === s && f.neg)) return;
    if (/^(?:arrows?|links?|connections?)$/.test(words.at(-1))) { fact({ key: 'with', value: 'arrow' }); idx.forEach((k) => use(k)); return; }
    if (facts.some((f) => f.key === 'count' && idx.includes(-1))) return;
    fact({ key: 'with', value: words.join(' ') }); idx.forEach((k) => use(k));
  }
  // about a topic: the words after "about" up to a with / comma / end
  const ab = ws.indexOf('about');
  if (ab >= 0) {
    let k = ab + 1; const topic = [];
    while (k < ws.length && !/^(?:with|in|that|which|not|but)$/.test(ws[k]) && !/^\d+$/.test(ws[k])) { topic.push(ws[k]); k++; }
    if (topic.length) { fact({ key: 'about', value: topic.join(' ') }); use(ab, k - ab); }
  }
  // place ("in the corner" is read as a small extent above; "in Tenerife" is the map's): a capitalised name after in / at / of
  // the first reading: a complete reading uses every word it read
  if (first?.complete) for (let i = 0; i < ws.length; i++) use(i);
  const unread = [];
  for (let i = 0; i < ws.length; i++) {
    if (used.has(i) || STOP.has(ws[i]) || /^\d+$/.test(ws[i]) || ws[i] === '-' || ws[i].length < 3) continue;
    if (first?.words?.has?.(ws[i])) continue;
    if (Object.hasOwn(ACT, ws[i])) continue;
    unread.push(ws[i]);
  }
  return { corrections, act: act ?? first?.act ?? null, target, facts, reaction, used: [...used].map((i) => ws[i]).concat((first?.complete ? [] : [])), unread: [...new Set(unread)], english, source: 'bridge' };
}

/** Edit distance with a cap (above the cap: cap + 1). */
function editDistance(a, b, cap) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), j > 1 && i > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? prev[j - 2] + 1 : Infinity); low = Math.min(low, cur[j]); }
    if (low > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

const STEP_FACTOR = { tiny: 0.5, small: 0.6, default: 1, big: 1.6, huge: 2.2 };
/** The range of parts a request asks for: an explicit count or range, else the expectation of the target scaled by the size step and the count step. */
export function wantedRange(q, exp) {
  const c = q.facts.find((f) => f.key === 'count' && (f.n != null || f.min != null));
  if (c) return c.n != null ? [c.n, c.n] : [c.min, c.max];
  if (!exp?.count) return null;
  let [lo, hi] = exp.count;
  const size = q.facts.find((f) => f.key === 'size')?.step;
  const step = q.facts.find((f) => f.key === 'count' && f.step)?.step;
  if (size === 'small' || step === 'few') { const k = exp.small ?? STEP_FACTOR.small; hi = Math.max(1, Math.min(lo - 1, Math.round(hi * k))); lo = Math.max(1, Math.round(lo * k)); if (hi < lo) hi = lo; }
  if (size === 'big' || step === 'many') { const k = exp.big ?? STEP_FACTOR.big; lo = hi + 1; hi = Math.round(hi * k) + 1; }
  return [lo, hi];
}

/**
 * Check a result against a request: the violations, [{ key, words }]. `res` the open world's measure of what the turn made ({ parts, kinds: {k: n}, links, words, chapters }),
 * `exp` the expectation of the request's target (or null).
 */
export function violations(q, res, exp) {
  const out = [];
  if (!res) return out;
  const kinds = res.kinds ?? {};
  const kindN = Object.values(kinds).filter((n) => n > 0).length;
  for (const f of q.facts) {
    if (f.key === 'kind' && f.neg && !f.all && (kinds[f.value] ?? 0) > 0) out.push({ key: 'kind', fact: f });
    if (f.key === 'kind' && f.neg && f.all && kindN < 2) out.push({ key: 'kind', fact: f });
    if (f.key === 'length' && f.unit === 'chapter' && res.chapters != null && res.chapters !== f.n) out.push({ key: 'length', fact: f });
  }
  const r = q.target || q.facts.some((f) => f.key === 'count' && (f.n != null || f.min != null) && !f.of) || q.facts.some((f) => f.key === 'count' && f.min != null) ? wantedRange(q, exp) : null;
  const wantedKind = q.facts.find((f) => f.key === 'kind' && !f.neg)?.value;
  const parts = wantedKind && !q.target ? (kinds[wantedKind] ?? 0) : res.parts;
  if (r && parts != null && (parts < r[0] || parts > r[1])) out.push({ key: 'count', range: r });
  if (q.target && exp) {
    // the kinds of a whole thing are its own (a flowchart of process steps is all rectangles): only a kind said ("not all circles") or "random" (below) asks for variety
    if ((exp.with ?? []).includes('arrow') && !res.composed && res.links === 0 && (res.parts ?? 0) > 1) out.push({ key: 'with', value: 'arrow' });   // a composed diagram's links are its kind's
    for (const w of exp.parts ?? []) if (!q.facts.some((f) => f.key === 'kind' && f.neg && f.value === w) && res.kinds && !(kinds[w] > 0) && (res.parts ?? 0) > 0 && exp.must?.includes(w)) out.push({ key: 'with', value: w });
  }
  if (q.facts.some((f) => f.key === 'manner' && f.value === 'random') && !res.composed && !q.facts.some((f) => f.key === 'kind' && !f.neg && !f.generic) && kindN < 2 && (res.parts ?? 0) > 2) out.push({ key: 'manner', value: 'random' });   // random is varied, never all of one kind
  if (q.facts.some((f) => f.key === 'with' && f.value === 'arrow') && res.links === 0 && (res.parts ?? 0) > 1) out.push({ key: 'with', value: 'arrow' });
  const len = q.facts.find((f) => f.key === 'size' || (f.key === 'length' && f.step));
  if (len && exp?.words && res.words != null) {
    const [lo, hi] = exp.words;
    if (len.step === 'small' && res.words > Math.round(lo * (exp.small ?? 0.6))) out.push({ key: 'length', step: 'small' });   // short: below the small step of the usual length
    if (len.step === 'big' && res.words <= hi) out.push({ key: 'length', step: 'big' });
  }
  return out;
}

/** The keys of a request the world does not honour for this act: [{ key, words }] (the reply names them). */
export function notHonoured(q, decl) {
  if (!decl) return [];
  const act = q.act ?? 'make';
  const keys = decl.keysOf(act);
  if (!keys) return [];
  const out = [];
  for (const f of q.facts) {
    if (keys.has(f.key)) continue;
    out.push({ key: f.key, words: f.key === 'length' ? `${f.n ?? ''} ${f.unit ?? f.step ?? ''}${f.n > 1 ? 's' : ''}`.trim() : f.key === 'with' ? `with ${f.value}` : f.key === 'about' ? `about ${f.value}` : f.value ?? f.step ?? f.key });
  }
  return out;
}

/** A reaction revises the last request (library `reviseRequest` when present): constraints added or flipped, the size step moved. */
export function reviseRequest(last, q, { lib = null, result = null } = {}) {
  if (typeof lib?.reviseRequest === 'function') { try { const r = lib.reviseRequest({ last, result }, q); if (r?.request) return r.request; } catch { /* the bridge revises */ } }
  const facts = last.facts.map((f) => ({ ...f }));
  const drop = (pred) => { for (let i = facts.length - 1; i >= 0; i--) if (pred(facts[i])) facts.splice(i, 1); };
  for (const f of q.facts) {
    if (f.key === 'kind') { drop((x) => x.key === 'kind' && x.value === f.value); if (!f.neg) drop((x) => x.key === 'kind' && !x.neg); }
    if (f.key === 'count' && (f.n != null || f.min != null)) drop((x) => x.key === 'count');
    if (f.key === 'size') drop((x) => x.key === 'size');
    if (f.key === 'manner' || f.key === 'layout') drop((x) => x.key === f.key && x.value === f.value);
    facts.push({ ...f });
  }
  const parts = result?.parts ?? null;
  const wasBig = facts.some((x) => x.key === 'size' && x.step === 'big'), wasSmall = facts.some((x) => x.key === 'size' && x.step === 'small');
  if (q.reaction === 'reduce') {   // one step down the scale: big -> default -> small
    drop((x) => x.key === 'size' && x.step === 'big');
    if (parts != null && parts > 1) { drop((x) => x.key === 'count'); const n = Math.max(1, Math.round(parts * 0.6)); facts.push({ key: 'count', min: Math.max(1, Math.min(n, parts - 1)), max: parts - 1 }); }
    if (!wasBig && !facts.some((x) => x.key === 'size')) facts.push({ key: 'size', step: 'small' });
  }
  if (q.reaction === 'enlarge') {   // one step up: small -> default -> big
    drop((x) => x.key === 'size' && x.step === 'small');
    drop((x) => x.key === 'count' && x.max != null && parts != null && x.max < parts);
    if (!wasSmall && !facts.some((x) => x.key === 'size')) facts.push({ key: 'size', step: 'big' });
  }
  if (q.reaction === 'reject' && result?.kinds) {
    const main = Object.entries(result.kinds).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (main && !q.facts.some((f) => f.key === 'kind') && !facts.some((x) => x.key === 'kind' && x.neg)) facts.push({ key: 'kind', value: main, neg: true, all: true });
  }
  return { ...last, facts, reaction: q.reaction, revisedFrom: last.english, english: q.english, unread: q.unread, used: q.used, corrections: q.corrections ?? [] };
}

/** The live w.dialogue of a session: per tab world { request, result, before, assumed, cannot, viaPlan }. JSON in the memory and the snapshot. */
export class RequestDialogue {
  constructor() { this.byWorld = {}; }
  last(world) { return this.byWorld[world] ?? null; }
  record(world, rec) { this.byWorld[world] = rec; }
  toJSON() { return { v: 1, byWorld: structuredClone(this.byWorld) }; }
  load(j) { this.byWorld = j?.v === 1 ? structuredClone(j.byWorld ?? {}) : {}; return this; }
}

const factWords = (f) => (f.key === 'count' ? (f.n != null ? `${f.n}` : f.min != null ? `${f.min} to ${f.max}` : f.step) : f.key === 'kind' ? `${f.neg ? (f.all ? 'not all ' : 'not ') : ''}${f.value}` : f.key === 'size' ? f.step : f.key === 'length' ? `${f.n ?? f.step} ${f.unit ?? ''}`.trim() : f.key === 'layout' ? (f.regions?.length ? `layers: ${f.regions.join(', ')}` : f.value) : f.key === 'with' ? `with ${f.value}` : f.key === 'about' ? `about ${f.value}` : f.value ?? f.key);

/** The reply of a planned request (library `sayRequest` when present): what was made, what was assumed, what could not be honoured, what was not read. */
export function sayRequest(q, plan, { lib = null, cannot = [], revised = false } = {}) {
  if (typeof lib?.sayRequest === 'function') { try { const t = lib.sayRequest(q, plan); if (typeof t === 'string' && t) return t; } catch { /* the bridge says it */ } }
  const out = [];
  if (q.corrections?.length) out.push(`I read ${q.corrections.map((c) => `"${c.said}" as "${c.as}"`).join(', ')}.`);
  if (revised) out.push('I changed the last result.');   // short plain sentences with a subject: they survive the translation of the reply
  if (plan?.value) out.push(String(plan.value).trim());
  if (plan?.assumed?.length) out.push(...plan.assumed);
  const no = [...cannot, ...(plan?.cannot ?? [])];
  if (no.length) out.push(`I cannot do this here: ${no.map((c) => `"${c.words ?? c}"`).join(', ')}.`);
  if (q.unread?.length) out.push(`I did not use these words: ${q.unread.map((w) => `"${w}"`).join(', ')}.`);
  return out.join(' ');
}

/** Parse the request.sop wires of a world into its declarations. `wires` the parsed wires (types w.honour, w.expect). */
export function parseDecl(wires, txt, getAll) {
  if (!wires?.length) return null;
  const honour = [], expect = new Map();
  let layouts = new Set(), generic = new Set(), kinds = new Set();
  const split = (w, k) => getAll(w, k).flatMap((v) => String(v.v).split(',')).map((x) => x.trim()).filter(Boolean);
  for (const w of wires) {
    if (w.type === 'w.honour') honour.push({ act: txt(w, 'act'), keys: new Set(String(txt(w, 'keys') ?? '').split(',').map((s) => s.trim()).filter(Boolean)), target: txt(w, 'target') });
    if (w.type === 'w.expect') {
      const range = (v) => { const m = /^(\d+)\.\.(\d+)$/.exec(String(v ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };
      const list = (k) => getAll(w, k).flatMap((v) => String(v.v).split(',')).map((s) => s.trim()).filter(Boolean);
      expect.set(txt(w, 'of'), { of: txt(w, 'of'), count: range(txt(w, 'count')), words: range(txt(w, 'words')), chapters: range(txt(w, 'chapters')), kinds: Number(txt(w, 'kinds') ?? 1), shapes: list('shapes'), with: list('with'), parts: list('parts'), must: list('must'), small: txt(w, 'small') == null ? null : Number(txt(w, 'small')), big: txt(w, 'big') == null ? null : Number(txt(w, 'big')), source: txt(w, 'source') });
    }
    if (w.type === 'w.words') { for (const x of split(w, 'layout')) layouts.add(x); for (const x of split(w, 'generic')) generic.add(x); for (const x of split(w, 'kind')) kinds.add(x); }
  }
  const keysOf = (act) => { const h = honour.filter((x) => x.act === act); return h.length ? new Set(h.flatMap((x) => [...x.keys])) : null; };
  return { honour, expect, layouts, generic, kinds, keysOf, honoursKey: (act, key) => !!keysOf(act)?.has(key) };
}
