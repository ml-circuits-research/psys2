// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Host adapter for the library's `cousins(world, case, { degree })` (spec 16, "Cousins of a case"). Measurement only: nothing under src/ imports this.
 * Pure helpers (no node:* imports except the lib resolver) so that a test can drive them with a fake library.
 *
 *   resolveLibrary({ vendored, libPath })   the library to take `cousins` from: the vendored one when it exports it, else the sopworld checkout at `libPath`
 *   expand(lib, world, kase, { degree })    the cases of a case: [{ frame, text, degree, dims, valid, why, dimension }]  (no hand-written lists: every cousin comes from the library)
 *   expectedOf(world, cousin)               what a correct reply must say: { all: [word...] } from the frame's answer (an ask: the values; a find: the names of the holders)
 *   judge(cousin, expected, run)            right | wrong | no_reply, by the reply AND the state (a question must not change the state)
 *   (tabulate and tableText: the library's, 0.103; scripts/cousins.mjs calls them)
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The five dimensions the owner named, and which of them the library (0.73) generates: `filler` = the filler kind, `key` = the aspect. The others are listed as "not generated" so the table says so. */
export const DIMENSIONS = Object.freeze({ filler: 'filler kind', key: 'aspect', act: 'act family', alternation: 'alternation', structure: 'world structure' });
/** 0.80 names a lifted-filler cousin by the EDGE it came by (`kind`, `class`, the host's), 0.73 as `filler`; `key` is the aspect. Any other name is a new dimension and is shown as it is. */
export const dimensionOf = (c) => {
  const d = (c.dims ?? [])[0];
  if (d === 'key') return DIMENSIONS.key;
  if (d === 'filler') return DIMENSIONS.filler;
  return d ? `${DIMENSIONS.filler} (edge ${d})` : '';
};

const hasCousins = (m) => typeof m?.cousins === 'function' && typeof m?.readByTypes === 'function';

/** `{ lib, source }`: `source` is 'vendored' or the path. A library that lacks `cousins` is an error naming where it looked (never a silent fallback to a hand-written list). */
export async function resolveLibrary({ vendored, libPath } = {}) {
  if (hasCousins(vendored)) return { lib: vendored, source: 'vendored' };
  if (libPath) {
    const root = resolve(libPath);
    for (const rel of ['docs/sopworld.mjs', 'src/index.mjs']) {
      const f = join(root, rel);
      if (!existsSync(f)) continue;
      const m = await import(pathToFileURL(f).href);
      if (hasCousins(m)) return { lib: m, source: `${root} (${rel})` };
    }
    throw new Error(`no cousins() in ${root} (looked at docs/sopworld.mjs and src/index.mjs)`);
  }
  throw new Error('the vendored sopworld has no cousins() yet: pass --lib <sopworld checkout> (measurement only)');
}

/** The reading options a host gives readByTypes: question words and function words (English). */
export const READ = Object.freeze({ question: ['what', 'which', 'how', 'many', 'much', 'does', 'do', 'is', 'are', 'who', 'where'], skip: ['a', 'an', 'the', 'of', 'in', 'to'] });

/** The case's frame (read by the library from the sentence) and its cousins. A sentence the types do not read gives `{ frame: null }` (a class the library cannot expand). */
export function expand(lib, world, kase, { degree = 2, n = 50, seed = 1 } = {}) {
  const text = kase.text;
  const frame = kase.frame ?? lib.readByTypes(world, text, READ).best;
  if (!frame) return { frame: null, cousins: [], why: 'no typed frame: readByTypes does not read the sentence in this world' };
  const cs = lib.cousins(world, { text, frame }, { degree, read: READ, known: [text], n, seed });
  return { frame, cousins: cs.map((c) => ({ ...c, dimension: dimensionOf(c) })) };
}

const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** The names a reply may use for an answer value: the value, and for a small number its word. */
export function formsOf(v) {
  const s = bare(v).replace(/_/g, ' ');
  const out = [s];
  if (/^\d+$/.test(s) && Number(s) < NUMBER_WORDS.length) out.push(NUMBER_WORDS[Number(s)]);
  return out;
}

/** What a correct reply must contain: one entry per answer value, each a list of accepted forms (the id of a holder is read as its name). */
export function expectedOf(world, c) {
  const f = c.frame;
  const names = (id) => { const w = world.get?.(id); return bare(w?.attrs?.name?.[0] ?? String(id).split('.').pop()); };
  const values = (f.answer ?? []).map((a) => (f.is === 'find' ? names(a) : a));
  return { all: values.map(formsOf) };
}

/**
 * Per-clause judge (library 0.88 `tools/cousins-test.mjs`: "a compound text passes only when the host's answer holds every clause's answer"): the answer of each clause the system cut
 * the text into, from the world as oracle. `clauses` = the texts of the segments of the run. A clause's answer is, in this order: the answer of the frame `readByTypes` reads in it (an ask or a
 * find of the typed world), an arithmetic clause ("what is 20 minus 8", "what 7 plus 5"), a yes/no question about a place ("is Egypt in Africa": yes), a count of the calendar ("how many days are in
 * a week": 7); a clause none of these answer is not judged (counted in `skipped`). Returns `{ all: [forms...], skipped }` to ADD to `expectedOf`; values already expected are not repeated.
 */
export function clauseExpected(lib, world, clauses, already, read = READ) {
  const have = new Set(already.all.map((f) => f[0])), all = [];
  let skipped = 0;
  const add = (v) => { const fs = formsOf(v); if (!have.has(fs[0])) { have.add(fs[0]); all.push(fs); } };
  for (const clause of clauses ?? []) {
    const t = String(clause).toLowerCase();
    const a = /(\d+)\s*(plus|minus|min|times)\s*(\d+)/.exec(t);
    if (a) { const [x, y] = [Number(a[1]), Number(a[3])]; add(a[2] === 'plus' ? x + y : a[2] === 'times' ? x * y : x - y); continue; }
    if (/\bhow many days\b.*\bin a week\b/.test(t)) { add(7); continue; }
    if (/^\W*(is|are)\b.*\bin\b/.test(t) && /\b(egypt|africa|paris|france|europe|asia)\b/.test(t)) { add('yes'); continue; }
    let b = null;
    try { b = lib.readByTypes(world, clause, read).best; } catch { b = null; }
    if (b && (b.is === 'ask' || b.is === 'find') && b.answer?.length) { for (const v of expectedOf(world, { frame: b }).all) if (!have.has(v[0])) { have.add(v[0]); all.push(v); } continue; }
    skipped++;
  }
  return { all, skipped };
}

const has = (reply, form) => new RegExp(`(^|[^\\p{L}\\p{N}])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(reply);

/**
 * Judged by state, not by wording: right when every answer value is said in the ANSWER part of the reply and a question changed nothing; wrong when it says something else
 * or changed the state; no_reply when the reply is empty. `run` = { reply, before, after } (visible states, compared as JSON).
 */
export function judge(c, expected, run) {
  if (!String(run.reply ?? '').trim()) return { outcome: 'no_reply', why: 'empty reply' };
  const missing = expected.all.filter((forms) => !forms.some((f) => has(run.reply, f)));
  const stateSame = JSON.stringify(run.before ?? null) === JSON.stringify(run.after ?? null);
  if (!stateSame) return { outcome: 'wrong', why: 'a question changed the state' };
  if (missing.length) return { outcome: 'wrong', why: `missing ${missing.map((m) => m[0]).join(', ')}` };
  return { outcome: 'right', why: '' };
}
