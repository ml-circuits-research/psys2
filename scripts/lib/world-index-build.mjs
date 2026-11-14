// SPDX-License-Identifier: AGPL-3.0-only
// Builds the word index files of lazy loading from a loaded world set (node). Used by scripts/build-webchat.mjs and scripts/eval-word-index.mjs.
// What a world is indexed under (`keys`): the words its patterns are filed under by the rules' own prefilter (`patternKeys`: sound, a world that could claim a message always has a key in it),
// the names the user opens its tab by (id, title, aliases). `vocab` (every word of the world's patterns and lexicons) is the looser index of the first design, kept for the measure.
//   A: `words.bloom.json`  { ids, filters: [{ m, k, n, bits }] }    one Bloom filter per world (about 10 bits per key)
//   B: `words/<bucket>.json`  { word: [world index, ...] }           exact, cut by the first two letters; `words/index.json` { ids, buckets: { bucket: n } }
import { worldWords, invert } from './world-words.mjs';
import { patternKeys } from '../../src/formalizer/rules/index.mjs';
import { bloomBuild, bucketsBuild } from '../../src/worlds/word-index.mjs';

/** Worlds that every start loads: the shell and the infrastructure the reading needs (see specs/06 "Lazy loading"). */
export const ALWAYS = ['core', 'lang.common', 'acts', 'kids.common', 'common.sense', 'meta.worlds', 'ui.shell', 'ui.help', 'session.dialogue', 'session.conversation', 'session.things'];

const atom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

export function buildWorldIndex(set, { bitsPerEntry = 10, mode = 'keys' } = {}) {
  const ids = set.list().map((w) => w.id).sort();
  const idx = new Map(ids.map((id, i) => [id, i]));
  const vocab = worldWords(set);
  const pk = patternKeys(set);
  const keys = new Map(), always = [], strong = new Map();   // strong: the names a user opens a world's tab by ("map", "drawing", "chess"): they load the world whatever else uses the word
  const addStrong = (w, id) => { if (w.length > 1) (strong.get(w) ?? strong.set(w, []).get(w)).push(idx.get(id)); };
  for (const id of ids) {
    const ks = new Set(pk.get(id)?.keys ?? []);
    const w = set.get(id);
    if (w?.tab) for (const x of [w.tab.id, w.tab.title, ...(w.tab.aliases ?? [])]) { const a = atom(x); if (a) { ks.add(a); addStrong(a, id); for (const part of a.split('_')) if (part.length > 2) { ks.add(part); addStrong(part, id); } } }
    keys.set(id, ks);
    if (pk.get(id)?.always) always.push(id);
  }
  const src = mode === 'vocab' ? vocab : keys;
  const inv = invert(src);
  const bloom = { ids, filters: ids.map((id) => bloomBuild(src.get(id) ?? [], { bitsPerEntry })) };
  const entries = new Map();
  for (const [w, list] of inv) entries.set(w, list.map((id) => idx.get(id)).sort((a, b) => a - b));
  for (const [w, list] of strong) entries.set(`!${w}`, [...new Set(list)].sort((a, b) => a - b));   // `!word`: strong entries live in the same bucket as the word
  const buckets = bucketsBuild(entries);
  return { ids, strong, words: src, vocab, keys, always, patternStats: Object.fromEntries(ids.map((id) => [id, pk.get(id) ? { patterns: pk.get(id).patterns, always: pk.get(id).always, keys: pk.get(id).keys.size } : null])), inv, bloom, buckets, index: { ids, buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Object.keys(v).length])) } };
}
