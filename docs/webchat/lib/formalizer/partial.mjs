// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Partial understanding (spec 03 section 7.10). Browser-safe.
 *
 * `findPartialWindow(text, tryParse)` looks for the longest run of consecutive words of `text` that `tryParse` accepts completely, so the
 * words before and after it can be reported as ignored ("hey could u tell me whats seven times six pls" -> "seven times six").
 * Never ignores a negation: dropping "not" would turn the request into its opposite.
 */

import { QUESTION_WORDS } from './rules/normalize.mjs?v=f77a3f29d4';
import { guard } from './guard.mjs?v=eb1a66f556';

/** True when `text` has a question cue (a question mark or a question word anywhere). */
export const looksLikeQuestion = (text) => /\?/.test(text) || text.split(/\s+/).some((w) => QUESTION_WORDS.has(norm(w)));

/** A window that turns a statement or request into a bare question ("body color should be red" -> "body color?") is not accepted. */
export const changesIntoQuestion = (original, slice, kinds) => kinds.length > 0 && kinds.every((k) => k === 'question') && !looksLikeQuestion(original) && slice.length / Math.max(1, original.trim().length) < 0.6;

export const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'dont', "don't", 'don’t', 'cannot', "can't", 'cant', "won't", 'wont', "isn't", "doesn't", "didn't", 'nothing', 'none', 'nobody', 'neither', 'nor', 'stop', 'undo', 'cancel']);

/** A window that ends in a determiner or a preposition while words follow it leaves the noun it was waiting for in the ignored part ("what is a" + glimbus): never a reading. */
const DANGLING = new Set(['a', 'an', 'the', 'my', 'your', 'some', 'any', 'this', 'that', 'of', 'to', 'for', 'with', 'in', 'on', 'at', 'by', 'from']);
const norm = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * @param {string} text
 * @param {(slice: string) => Promise<any>|any} tryParse  returns a truthy result when `slice` is understood completely
 * @param {{ minCoverage?: number, maxTokens?: number, maxTries?: number }} opts
 * @returns {Promise<{ text: string, ignored: {text:string,start:number,end:number}[], coverage: number, result: any } | null>}
 */
export async function findPartialWindow(text, tryParse, { minCoverage = 0.25, maxTokens = 18, maxTries = 80, minTokens = 3, canIgnore = () => true, stop = () => false } = {}) {
  const toks = [...text.matchAll(/\S+/g)].map((m) => ({ s: m.index, e: m.index + m[0].length, w: norm(m[0]) }));
  if (toks.length < 2 || toks.length > maxTokens) return null;
  const total = text.trim().length || 1;
  const tailPunct = /[?!.]\s*$/.test(text) ? text.trim().slice(-1) : '';
  const windows = [];
  for (let i = 0; i < toks.length; i++) for (let j = i; j < toks.length; j++) {
    if (i === 0 && j === toks.length - 1) continue;   // the whole text: the caller already tried it
    windows.push([i, j]);
  }
  windows.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0]);
  let tries = 0;
  for (const [i, j] of windows) {
    const ignoredToks = [...toks.slice(0, i), ...toks.slice(j + 1)];
    if (j - i + 1 < minTokens || ignoredToks.some((t) => NEGATIONS.has(t.w) || !canIgnore(t.w))) continue;
    if (j < toks.length - 1 && DANGLING.has(toks[j].w)) continue;
    let slice = text.slice(toks[i].s, toks[j].e);
    const coverage = slice.length / total;
    if (coverage < minCoverage) continue;
    if (j < toks.length - 1 && tailPunct && !/[?!.]$/.test(slice)) slice += tailPunct;
    if (++tries > maxTries || guard.soft() || stop()) return null;
    const result = await tryParse(slice);
    if (!result) continue;
    const ignored = [];
    if (i > 0) ignored.push({ text: text.slice(toks[0].s, toks[i - 1].e), start: toks[0].s, end: toks[i - 1].e });
    if (j < toks.length - 1) ignored.push({ text: text.slice(toks[j + 1].s, toks.at(-1).e), start: toks[j + 1].s, end: toks.at(-1).e });
    return { text: slice, ignored, coverage, result, offset: toks[i].s };
  }
  return null;
}
