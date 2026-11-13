// SPDX-License-Identifier: AGPL-3.0-only
// M4 (WORLDS-AS-MODULES): the English of a foreign-language message is CHOSEN BY UNDERSTANDING, for every language, with nothing per language here.
//
//   candidates   every available translator (browser Translator, on-device model, rules translator of the language pack) plus ONE candidate made after
//                source-side spelling repair (missing diacritics, a near word of the pack's own vocabulary: `rules.sourceVocabulary(lang)`);
//   rejection    a candidate that still has a source-language word (a token of the input kept in the candidate that is not English) is out;
//   choice       among the rest the first one (browser translator, model, rules, repaired) that the reader understands completely in the active tab;
//                when none is complete, the one with the fewest points of trouble (ties go to the earlier one, the browser translator).
//
// Browser-safe (no node:*); every loop ticks the compute budget; the candidate loop has its own step limit.
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

export const MAX_CANDIDATES = 6;       // candidates kept per message
export const MAX_REPAIR_STEPS = 60000; // vocabulary comparisons one repair may make

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const WORD = /\p{L}[\p{L}'’-]*/gu;
const wordsOf = (text) => [...String(text ?? '').matchAll(WORD)].map((m) => ({ raw: m[0], at: m.index }));
const unquoted = (text) => String(text ?? '').replace(/"[^"]*"|„[^”]*”|«[^»]*»/g, ' ');

/** A regular form of an English word the reader knows ("goats", "moving", "bigger"). */
function stemsOf(w) {
  const out = [];
  for (const suf of ['es', 's', 'ed', 'd', 'ing', 'er', 'est', 'ly']) if (w.endsWith(suf) && w.length - suf.length >= 3) {
    const s = w.slice(0, -suf.length);
    out.push(s, `${s}e`);
    if (/(.)\1$/.test(s)) out.push(s.slice(0, -1));
    if (s.endsWith('i')) out.push(`${s.slice(0, -1)}y`);
  }
  return out;
}

/** `known(word)` tells whether the reader (the worlds' vocabulary, the translator's English lexicon) has the word: this wraps it with regular forms. */
export function englishTest(known) {
  return (word) => {
    const w = fold(word).replace(/['’]s$/, '');
    if (w.length < 3 || /\d/.test(w)) return true;
    if (known(w)) return true;
    return stemsOf(w).some((s) => known(s));
  };
}

/**
 * Source-language words a candidate keeps: a word of the input that is in the candidate as it was typed (diacritics ignored) and is not English. Quoted text is
 * the user's own; a capitalised word in the middle of the candidate is a name; words of fewer than 3 letters are never counted.
 */
export function sourceResidue(candidate, input, isEnglish) {
  const seen = new Set();
  for (const w of wordsOf(unquoted(input))) { budget.tick('candidates.residue'); if (w.raw.length >= 3) seen.add(fold(w.raw)); }
  const out = [];
  for (const w of wordsOf(unquoted(candidate))) {
    budget.tick('candidates.residue');
    if (w.raw.length < 3) continue;
    const k = fold(w.raw);
    if (!seen.has(k)) continue;
    if (w.at > 0 && /^\p{Lu}/u.test(w.raw)) continue;   // a name in the middle of the sentence
    if (!isEnglish(k)) out.push(w.raw);
  }
  return out;
}

// ---- source-side spelling repair --------------------------------------------------------------------------------------------------------------------

/** Optimal-string-alignment distance, stopping above `max` (insert, delete, replace, swap). */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let p2 = null, p1 = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p1[j] + 1, row[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      row[j] = v; if (v < best) best = v;
    }
    if (best > max) return Infinity;
    p2 = p1; p1 = row;
  }
  return p1[b.length] <= max ? p1[b.length] : Infinity;
}

/** Index of a Map<folded, forms[]> by length, built once per vocabulary. */
const BY_LENGTH = new WeakMap();
function byLength(vocab) {
  let idx = BY_LENGTH.get(vocab);
  if (!idx) {
    idx = new Map();
    for (const k of vocab.keys()) { if (k.length < 3) continue; let l = idx.get(k.length); if (!l) idx.set(k.length, l = []); l.push(k); }
    BY_LENGTH.set(vocab, idx);
  }
  return idx;
}

const matchCase = (raw, form) => (/^\p{Lu}/u.test(raw) ? form.charAt(0).toUpperCase() + form.slice(1) : form);

/**
 * One repaired copy of `text` in the source language. `vocab` is the language pack's Map<folded, surface forms[]>. A word the pack does not know is replaced
 * by the one known word that is one edit away (two for words of 7 letters or more) when exactly one is nearest; a known word typed without its
 * diacritics gets its surface form back. Words that are English, short, numbers or capitalised names are left alone.
 * Returns { text, changes: [{ from, to, kind }] }.
 */
export function repairSource(text, vocab, isEnglish = () => false) {
  const src = String(text ?? '');
  if (!vocab || !vocab.size) return { text: src, changes: [] };
  const idx = byLength(vocab);
  let steps = 0;
  const changes = [];
  const out = src.replace(WORD, (raw, offset) => {
    budget.tick('candidates.repair');
    const k = fold(raw);
    if (k.length < 4 || /\d/.test(k) || (offset > 0 && /^\p{Lu}/u.test(raw)) || isEnglish(k)) return raw;
    const forms = vocab.get(k);
    if (forms) {   // known: diacritics typed away
      const surface = forms.length === 1 ? forms[0] : null;
      if (surface && raw.toLowerCase() === k && surface !== k) { changes.push({ from: raw, to: surface, kind: 'diacritics' }); return matchCase(raw, surface); }
      return raw;
    }
    const max = k.length >= 7 ? 2 : 1;
    let best = Infinity, bestKeys = [];
    for (let l = k.length - max; l <= k.length + max; l++) {
      for (const cand of idx.get(l) ?? []) {
        budget.tick('candidates.repair');
        if (++steps > MAX_REPAIR_STEPS) break;
        if (cand[0] !== k[0] && cand[1] !== k[1]) continue;
        const d = within(k, cand, Math.min(max, best));
        if (d < best) { best = d; bestKeys = [cand]; } else if (d === best && d !== Infinity) bestKeys.push(cand);
      }
    }
    if (best === Infinity) return raw;
    const forms2 = [...new Set(bestKeys.flatMap((c) => vocab.get(c) ?? []))];
    const keys = new Set(bestKeys.map((c) => fold(vocab.get(c)?.[0] ?? c)));
    if (keys.size !== 1 || !forms2.length) return raw;   // several nearest words: no guess
    const surface = forms2.length === 1 ? forms2[0] : (forms2.find((f) => f === fold(f)) ?? forms2[0]);
    changes.push({ from: raw, to: surface, kind: 'near' });
    return matchCase(raw, surface);
  });
  return { text: out, changes };
}

// ---- candidates ---------------------------------------------------------------------------------------------------------------------------------

const textOf = (r) => (typeof r === 'string' ? r : r?.text ?? '');
const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * All candidate Englishes of `text`, in the order of preference: the browser Translator, the on-device model, the rules translator, then one repaired candidate
 * (translated by the first machine translator that answered, else by the rules). Each: { source, text, translation, rejected? }.
 * `translator` is the switch translator of the host (`candidatesViaMT`, `rules`); anything missing is skipped. Never throws.
 */
export async function gatherCandidates(text, { from, to = 'en', translator, abortable = (p) => p }) {
  const out = [], seen = new Set();
  const add = (source, translation, extra = {}) => {
    const t = textOf(translation).trim();
    if (!t || out.length >= MAX_CANDIDATES) return null;
    const key = norm(t);
    if (seen.has(key)) return null;
    seen.add(key);
    const c = { source, text: t, translation: typeof translation === 'string' ? { text: translation, alignment: [], unknown: [], confidence: 1 } : translation, ...extra };
    out.push(c);
    return c;
  };
  const rules = translator?.rules, hasRules = !!rules && (rules.supports?.(from, to) ?? true);
  const viaMT = async (s) => { try { return (await abortable(translator?.candidatesViaMT?.(s, { from, to }) ?? [], 'translate')) ?? []; } catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded') throw e; return []; } };
  const viaRules = async (s) => { if (!hasRules) return null; try { const r = await abortable(rules.translate(s, { from, to }), 'translate'); return textOf(r) && !r?.untranslatable?.length ? r : null; } catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded') throw e; return null; } };
  budget.tick('candidates.gather');
  const mt = await viaMT(text);
  for (const m of mt) add(m.source, m.translation ?? m.text, m.rejected ? { rejected: m.rejected } : {});
  const r = await viaRules(text);
  if (r) add('rules', r);
  // one candidate after the spelling repair, by the first translator that is available
  const vocab = rules?.sourceVocabulary?.(from);
  if (vocab) {
    const known = rules.knownEnglish ? englishTest((w) => rules.knownEnglish(w)) : () => false;
    const rep = repairSource(text, vocab, known);
    if (rep.changes.length) {
      const mt2 = mt.length ? await viaMT(rep.text) : [];
      const first = mt2.find((m) => !m.rejected);
      const via = first ? first : null;
      const rr = via ? null : await viaRules(rep.text);
      if (via) add(`repaired-${via.source}`, via.translation ?? via.text, { repaired: rep.text, changes: rep.changes });
      else if (rr) add('repaired-rules', rr, { repaired: rep.text, changes: rep.changes });
    }
  }
  return out;
}

/**
 * Chooses one candidate. `understand(english)` -> { issues } (0 = understood completely in the active tab) is the reader's dry reading; `isEnglish(word)` is the
 * reader's vocabulary test. Returns { chosen, log } where `log` has one record per candidate (source, text, rejected, residue, issues) for the phrase export.
 */
export async function chooseCandidate(cands, input, { understand, isEnglish, soft = () => false }) {
  const log = cands.map((c) => ({ source: c.source, text: c.text, ...(c.rejected ? { rejected: c.rejected } : {}), ...(c.repaired ? { repaired: c.repaired } : {}) }));
  let pool = [];
  cands.forEach((c, i) => {
    budget.tick('candidates.residue');
    if (c.rejected) return;
    c.residue = sourceResidue(c.text, input, isEnglish);
    if (c.residue.length) { log[i].rejected = `source words: ${c.residue.slice(0, 4).join(', ')}`; return; }
    pool.push(i);
  });
  if (!pool.length) {   // every candidate keeps source words (or failed the checker): the least bad is still read, so that the person gets an answer
    pool = cands.map((c, i) => i).filter((i) => !cands[i].rejected).sort((a, b) => (cands[a].residue?.length ?? 0) - (cands[b].residue?.length ?? 0));
    for (const i of pool) log[i].fallback = true;
  }
  if (!pool.length) return { chosen: null, log };
  if (pool.length === 1) { log[pool[0]].chosen = true; return { chosen: cands[pool[0]], log }; }
  let best = -1, bestIssues = Infinity;
  for (const i of pool.slice(0, MAX_CANDIDATES)) {
    budget.tick('candidates.choose');
    if (best >= 0 && soft()) break;
    let issues = 9;
    try { issues = (await understand(cands[i].text))?.issues ?? 9; } catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded') throw e; }
    log[i].issues = issues;
    if (issues < bestIssues) { best = i; bestIssues = issues; }
    if (issues === 0) break;   // understood completely: the earlier candidates win ties, so the first complete one is the choice
  }
  if (best < 0) best = pool[0];
  log[best].chosen = true;
  return { chosen: cands[best], log };
}
