// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapter (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize`. Without it in the library,
// `available` is false, every call returns null and the UI hides what needs it: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

import { languageWorld } from './compose-world.mjs?v=b4fef6d9a5';
import { englishOf } from '../lang/en-generate.mjs?v=84a99c355e';

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => { const v = Math.round(Number(n)); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// ---- std.summarize (sopworld >= 0.61): `summarizeLog(entries, { parentOf, length })` returns FRAMES { act, kind, count, kinds?, failed?, salience }; `summarizeText(text, { n })`
// returns { sentences: [{ text, score, at }], picked: [text] } (extractive). The library does not write English: a frame is said through the language world's generation templates
// (w.lang.en.template: "add {number} {kind:num=pl}.", filled by the library, plurals and articles by src/lang/en-generate.mjs). There is no verb table here. What a frame says is what
// the person asked ("You asked me to add 3 trees and remove a house"); a frame of an act with no template that fits (a place with no spot named) is counted, not worded.

const isBad = (t) => ['refused', 'not-understood', 'question-back'].includes(t.outcome);
/** The entries `summarizeLog` aggregates, from the turn records of `turnRecord`: the acts the worlds executed (`acts`: [{ world, act, kind }], from the formalized reading). Failed turns have none and are only counted. */
export function logEntries(turns) {
  const out = [];
  for (const t of turns) if (!isBad(t)) for (const a of t.acts ?? []) out.push({ act: a.act, kind: a.kind ?? null, changed: 1 });
  return out;
}

export function createSummarizer(lib, world) {
  let en0 = null;
  const list = (a) => lib.joinList(a);   // the library's (0.102)
  const english = () => (en0 ??= (typeof lib?.World === 'function' ? englishOf(lib, languageWorld(lib)) : null));
  const log = pick(lib, 'summarizeLog'), txt = pick(lib, 'summarizeText');
  return {
    available: Boolean(log && txt),
    /**
     * "What you did", at most `maxSentences` (3): the acts aggregated by `summarizeLog` and rendered as one sentence, the worlds used (every one, by id), what was taught.
     * `labelOf(id)`: a readable world name (optional); `parentOf(kind)`: the kind above a kind (optional, generalises siblings).
     */
    turns({ turns = [], taught = [], labelOf = (id) => id, parentOf = () => null, maxSentences = 3 } = {}) {
      if (!log || !turns.length) return null;
      const entries = logEntries(turns);
      const all = entries.length ? log(entries, { parentOf, length: 'bullets' }) : [];   // failed frames carry a salience bonus and would fill the top three: the failures are counted in the sentence, the frames shown are the best three that worked
      const frames = (Array.isArray(all) ? all : []).filter((f) => !f.failed).slice(0, 3);
      const failed = turns.filter(isBad).length;
      const used = [...new Set(turns.flatMap((t) => t.worlds ?? []))];
      const sentences = [];
      const did = lib.renderFrames(Array.isArray(frames) ? frames : [], { world: languageWorld(lib), failed });   // the library's (0.102)
      if (did) sentences.push({ text: did, source: 'std.summarizeLog' });
      if (used.length) sentences.push({ text: `I worked in ${list(used.map((id) => { const l = labelOf(id); return l && l !== id ? `${l} (${id})` : id; }))}.`, source: 'turn log' });
      if (taught.length) sentences.push({ text: `You taught me that ${list(taught)}.`, source: 'session.things' });
      const kept = sentences.slice(0, clip(maxSentences, 1, 6, 3));
      return kept.length ? { text: kept.map((x) => x.text).join(' '), sentences: kept } : null;
    },
    /** An extractive summary of a text (the open document or pasted text): `maxSentences` sentences in the text's order; `sentences[i].at` is the position in the text. */
    text({ text = '', maxSentences = 3, doc = null } = {}) {
      if (!txt || !String(text).trim()) return null;
      const r = txt(String(text), { n: clip(maxSentences, 1, 12, 3) });
      const picked = new Set(r?.picked ?? []);
      const sentences = (r?.sentences ?? []).filter((s) => picked.has(s.text)).sort((x, y) => x.at - y.at).map((s) => ({ text: s.text, at: s.at, source: doc ? `${doc}.s${s.at + 1}` : null }));
      const out = sentences.map((s) => s.text).join(' ');
      return out ? { text: out, sentences } : null;
    },
  };
}
