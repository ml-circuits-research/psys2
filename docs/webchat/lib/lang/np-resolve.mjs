// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The ONE host resolver of noun phrases over `en.nounPhrase` (handover/lang.en np.sop): every world that names things (the schema worlds' executor `worlds/acts`, the drawing's `worlds/art.draw`)
 * reads a phrase the same way and differs only in how a PLAIN phrase is looked up in its own things. Until the library's `std.grammar` ships `resolve(phrase) -> ids + tier`
 * (the ask is in handover/lang.en/std-grammar.md, section 8) this is the single place: no world has its own copy of "choice / part of a set / the other one / relative clause".
 * Browser-safe, no `node:*`.
 *
 *   readNounPhrase(text, dom, opts) -> { done } | { text }
 *     { done }  the phrase was a choice ("table 1 or table 2": never both, never the last; the system asks which), a part of a set ("some of the tables": the whole set when the count covers it, else asked)
 *               or "the other one" (only when the domain has `other`), and `done` is the domain's own result shape
 *     { text }  a plain phrase (a relative clause folded: "the table that is red" -> "red table"): the domain looks it up itself
 *   The domain `dom` supplies:
 *     rec(text, opts)           resolve a sub-phrase completely (the domain's full resolver, which comes back through here)
 *     refs(r)                   the referents of a result as an array, or null when the result is a failure (no ids / an error / a special)
 *     kind(r)                   the kind word of a result, or null (a bare "2" then takes the kind of the part before it: "tables 1 and 2")
 *     made(refs, kind, tier)    a successful result; tier is 'said' here (said > focus > scene > default are the tiers of std.fill)
 *     asked(message, refs)      a result that asks the user which referent
 *     tick?()                   a compute-budget tick per part of a choice
 *     sayAll(refs)              the names of the referents for a question, as an array of strings
 *     partitive(part, refs)     the question text for a part of a set (the wording is the domain's)
 *     other?(np, opts)          "the other one"; the domain knows its focus
 */
import { en } from './en.mjs?v=ac07f761ec';

export function readNounPhrase(text, dom, opts = {}) {
  const np = en.nounPhrase(text);
  if (np.choice) return { done: choice(np.choice, dom, opts) };
  if (np.partitive) return { done: partitive(np, dom, opts) };
  if (np.other && dom.other) return { done: dom.other(np, opts) };
  return { text: np.relative ? np.text : text };
}

/** "the house that is red" is "the red house": the reading a parser that has its own noun-phrase grammar applies first. */
export const foldRelative = (text) => { const x = en.nounPhrase(text); return x.relative ? x.text : text; };

function choice(parts, dom, opts) {
  const refs = []; let kind = null;
  for (const part of parts) {
    dom.tick?.();
    let p = part.text;
    if (kind && en.bareDistributes(p)) p = `${kind} ${p}`;
    let r = dom.rec(p, opts);
    if (!dom.refs(r) && part.alt) { const r2 = dom.rec(part.alt, opts); if (dom.refs(r2)) r = r2; }
    const rs = dom.refs(r);
    if (!rs) return r;
    kind ??= dom.kind(r);
    for (const x of rs) if (!refs.includes(x)) refs.push(x);
  }
  if (refs.length === 1) return dom.made(refs, kind, 'said');
  return dom.asked(`Which do you mean: ${dom.sayAll(refs).join(' or ')}?`, refs);
}

function partitive(np, dom, opts) {
  const r = dom.rec(np.text, { ...opts, many: true });
  const rs = dom.refs(r);
  if (!rs || rs.length < 2 || np.partitive.mode === 'all' || (np.partitive.mode === 'count' && np.partitive.n >= rs.length)) return r;
  return dom.asked(dom.partitive(np.partitive, rs), rs);
}
