// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Romanian MOVES read by the library's frame reader (sopworld >= 0.145 `readFrames` over the catalog's w.lang.ro frames; reviewer 2026-11-15 09:10 item 3). Browser-safe (no node:*).
 *
 * The rules translator word-maps "mută casele mai sus" to "Move the houses more up" and "mută și mai la stânga" to "Move and more at left". The catalog's language world has the
 * frames of a move with a direction and an amount (ro.place.dir.amt, .amt.it, .amt.bare, ro.place.dir.two: "mai" further, "și" the focus particle, two directions joined by "și"), and
 * the library reads them with the language's morphology. When the best frame takes the WHOLE sentence and is one of these moves, the English is realised from its roles:
 *
 *   verb (the lemma's sense: move)  +  the thing (its Romanian words between the verb and the first direction, through the rules translator; "it" when the frame has no thing)
 *   +  each direction: its English word (the English lexicon acts.dir: left, right, up, down ...), with "mai" a further step ("higher", "lower", "further to the left")
 *   and a leading "și" before "mai" an even further one.
 *
 * Anything else (no frame, another act) returns null and the rules translator reads the sentence as before. The facts are the bundled w.lang.ro (src/lang/ro.mjs), loaded with the rules (`loadFramesRo`).
 */
import { budget } from '../dialog/budget.mjs?v=00bce6e369';

let langRo = null, loading = null;
/** Loads the bundled w.lang.ro once (the translator's loadRoEn waits for it, so that a ro -> en translation stays synchronous afterwards). */
/** The bundled w.lang.ro once loaded (null before): the dictionary gloss of the candidates reads it. */
export const langRoNow = () => langRo;
export const loadFramesRo = () => (loading ??= import('../lang/ro.mjs?v=108381ea26').then((m) => m.openLangRo()).then((x) => (langRo = x), () => null));

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOVES = /^acts\.more\.place\.dir\.(?:amt|two)$/;   // the reference frames (en=) of the moves this module realises
// the English direction words a Romanian direction item may carry, found through the rules translator's lexicon (never a Romanian word here)
const EN_DIRS = { left: 'left', right: 'right', up: 'up', down: 'down', top: 'up', bottom: 'down', front: 'front', back: 'back', middle: 'middle', centre: 'middle', center: 'middle', closer: 'closer', further: 'further away', far: 'further away' };

/** The English of one direction role: `{ text }` of the frame, the amount word before it ("mai"), and whether the focus particle precedes the amount. */
function dirEnglish(relText, amount, even, rules) {
  const en = String(rules(relText)?.text ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
  const d = en.map((w) => EN_DIRS[w]).find(Boolean);
  if (!d) return null;
  const more = !!amount;
  const pre = even && more ? 'even ' : '';
  if (d === 'up') return more ? `${pre}higher` : 'up';
  if (d === 'down') return more ? `${pre}lower` : 'down';
  if (d === 'left' || d === 'right') return more ? `${pre}further to the ${d}` : `to the ${d}`;
  if (d === 'front' || d === 'back') return `${more ? `${pre}further ` : ''}to the ${d}`;
  if (d === 'middle') return 'to the middle';
  return d;
}

/**
 * The English of a Romanian move, or null. `rules(text)` is the rules translator (ro -> en) used for the thing and the direction words.
 * Returns { text, frame, notes }.
 */
export function frameMoveRoEn(text, rules) {
  const src = String(text ?? '').trim();
  if (!src || src.split(/\s+/).length > 14) return null;
  const ro = langRo;   // not loaded yet (a browser before loadRoEn): the rules read the sentence
  if (!ro?.lib?.readFrames) return null;
  let r;
  try { r = ro.lib.readFrames(ro.world, src.replace(/[.!?]+$/, ''), { lang: 'w.lang.ro', morph: ro.m, dictionary: ro.dictionary }); } catch { return null; }
  const b = r?.best;
  if (!b || b.act !== 'place' || !MOVES.test(String(b.en ?? '')) || !b.roles?.rel) return null;
  const toks = (r.tokens ?? []).map(fold);
  const verbAt = b.verb ? toks.indexOf(fold(b.verb.form)) : -1;
  // the first direction (or its amount) in the tokens: the thing is what stands between the verb and it
  const firstOf = (role) => { if (!role?.text) return -1; const w = fold(role.text).split(/\s+/); for (let i = Math.max(0, verbAt + 1); i < toks.length; i++) { budget.tick('frames-ro.find'); if (w.every((x, k) => toks[i + k] === x)) return i; } return -1; };
  const dirAt = [firstOf(b.roles.amount), firstOf(b.roles.rel)].filter((i) => i >= 0).sort((x, y) => x - y)[0] ?? toks.length;
  const focus = new Set((ro.world.ofType('w.lang.ro.phrase').find((p) => String(p.attrs.name?.[0]).replace(/"/g, '') === 'focus')?.attrs.item ?? []).map((x) => fold(String(x).replace(/^"|"$/g, ''))));
  const even = (i) => i > 0 && focus.has(toks[i - 1]);   // "și mai": the focus particle right before the amount
  let thing = null;
  if (b.roles.thing) {
    const words = toks.slice(verbAt + 1, dirAt).filter((w) => !focus.has(w));
    const said = src.split(/\s+/).slice(verbAt + 1, dirAt).filter((w) => !focus.has(fold(w))).join(' ');
    const tr = said ? rules(said) : null, en = String(tr?.text ?? '').replace(/[.!?]+$/, '').trim();
    if (!words.length || !en || tr?.unknown?.length) return null;   // a thing the rules cannot read alone ("al doilea paragraf"): the rules read the whole sentence
    thing = /^(?:the|a|an|it|them|this|that|these|those)\b/i.test(en) || /^\d/.test(en) ? en.charAt(0).toLowerCase() + en.slice(1) : `the ${en.toLowerCase()}`;
  }
  const d1 = dirEnglish(b.roles.rel.text, b.roles.amount, even(firstOf(b.roles.amount)), rules);
  if (!d1) return null;
  let dirs = d1;
  if (b.roles.rel2) {
    const amt2 = b.roles.amount2;
    const d2 = dirEnglish(b.roles.rel2.text, amt2, false, rules);   // the "și" before the second direction joins the two: no focus
    if (!d2) return null;
    dirs = `${d1} and ${d2}`;
  }
  const verb = b.verb?.en ? String(b.verb.en).replace(/_/g, ' ') : null;
  const out = verb ? [verb, thing ?? 'it', dirs] : [dirs];   // no verb (ro.place.dir.amt.bare: "și mai sus"): a fragment, continued by the dialogue layer
  const english = out.join(' ');
  return { text: english.charAt(0).toUpperCase() + english.slice(1), frame: b.frame, notes: [`frame ${b.frame} (w.lang.ro, sopworld readFrames)`] };
}
