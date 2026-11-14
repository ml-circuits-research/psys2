// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Host adapter for the library's `cousins(world, case, { degree })` (spec 16, "Cousins of a case"). Measurement only: nothing under src/ imports this.
 * Pure helpers (no node:* imports except the lib resolver) so that a test can drive them with a fake library.
 *
 *   resolveLibrary({ vendored, libPath })   the library to take `cousins` from: the vendored one when it exports it, else the sopworld checkout at `libPath`
 *   expand(lib, world, kase, { degree })    the cases of a case: [{ frame, text, degree, dims, valid, why, dimension }]  (no hand-written lists: every cousin comes from the library)
 *   expectedOf(world, cousin)               what a correct reply must say: { all: [word...] } from the frame's answer (an ask: the values; a find: the names of the holders)
 *   judge(cousin, expected, run)            right | wrong | no_reply, by the reply AND the state (a question must not change the state)
 *   tabulate(rows)                          degree x dimension -> { right, of }
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The five dimensions the owner named, and which of them the library (0.73) generates: `filler` = the filler kind, `key` = the aspect. The others are listed as "not generated" so the table says so. */
export const DIMENSIONS = Object.freeze({ filler: 'filler kind', key: 'aspect', act: 'act family', alternation: 'alternation', structure: 'world structure' });
export const dimensionOf = (c) => DIMENSIONS[(c.dims ?? [])[0]] ?? (c.dims ?? []).join('+');

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

/** `rows`: [{ degree, dimension, outcome, reasoner? }] -> Map "degree|dimension" -> { degree, dimension, right, of }, ordered by degree then dimension. */
export function tabulate(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.degree}|${r.dimension}`;
    const e = m.get(k) ?? m.set(k, { degree: r.degree, dimension: r.dimension, right: 0, of: 0 }).get(k);
    e.of++;
    if (r.outcome === 'right') e.right++;
  }
  return [...m.values()].sort((a, b) => a.degree - b.degree || String(a.dimension).localeCompare(String(b.dimension)));
}

/** A plain text table of `tabulate` output. */
export function tableText(entries, { title = '' } = {}) {
  const w = Math.max(9, ...entries.map((e) => String(e.dimension).length));
  const lines = [title, `degree  ${'dimension'.padEnd(w)}  right / of`];
  for (const e of entries) lines.push(`${String(e.degree).padEnd(6)}  ${String(e.dimension).padEnd(w)}  ${e.right} / ${e.of}  (${e.of ? Math.round((1000 * e.right) / e.of) / 10 : 0}%)`);
  if (!entries.length) lines.push('(no valid cousins)');
  return lines.filter((l, i) => i || l).join('\n');
}
