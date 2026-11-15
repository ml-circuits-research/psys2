#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * TYPED WORLDS at build time (spec 16 section 13, Q16; sopworld 0.114 `typedWorldFor`): writes `worlds/<id>/typed.json` for every world that has patterns.
 *   node scripts/build-typed-worlds.mjs [--check] [--catalog <dir>]      (--check: exit 1 when a file is stale; the catalog default is tests/fixtures/catalog)
 *
 * What the file holds (everything the library's `typedWorldFor(description, knowledge, { things })` needs, so the runtime only has to call it, lazily, per world):
 *   description  { kinds: [{ type, words, keys: [{ key, value, many, enum, join }] }], words }   from the world's legend (core.type / core.key) and, for a schema world (spec 21), its
 *                schema.sop (acts.kind with its words, acts.attr with its values): the shape typedWorldFor takes
 *   known        the words of the world's own lexicons, kinds, attributes and values (the words a phrase of this world is made of)
 *   args         how the arguments of the world's requests are typed: `{ thing: 'phrase' | 'open', place: 'place' }` (a `thing` argument is a noun phrase of the world's kinds, checked when it is
 *                read as a noun phrase, not when it is dictation (`rest`); `open`: the kinds are open to the knowledge catalog, so any word may be a kind; a `place` is a kind or a position word of
 *                the world, checked even in `rest`)
 *   views        the words that name a view (tabs, worlds, session.things view words): what the place of the act send (`args['send.place'] = 'view'`) is made of
 *   openSlots    the `<type>|<key>` slots whose join is open (the world takes other names too, they can be taught: `open=yes` in typed.sop): typed, never closed
 *   knowledge    { '<k type>': [{ name, kind? }] } the things of the knowledge types the keys join (declared in the world's `typed.sop`: `core.typed.join slot=<type>.<key> type=<k type> by=name`)
 * The file is generated and never edited by hand; `--check` is run by a test.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parseSchema } from '../worlds/acts/acts.mjs';
import { colourLexiconWords } from '../src/knowledge/values.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bare = (v) => String(v ?? '').replace(/^"|"$/g, '').replace(/^\$/, '');
const val = (w, k) => (w.entries.find((e) => e.key === k) ? bare(w.entries.find((e) => e.key === k).value?.v ?? w.entries.find((e) => e.key === k).value) : null);
const vals = (w, k) => w.entries.filter((e) => e.key === k).map((e) => bare(e.value?.v ?? e.value));
const toks = (s) => String(s ?? '').toLowerCase().split(/[\s_]+/).filter((x) => /^[a-z][a-z'-]*$/.test(x));
const exists = (p) => stat(p).then(() => true, () => false);

/** The names (and kinds) of the things of a knowledge type, read from the shards of its catalog world (text, no library needed). */
async function knowledgeOf(catalog, type) {
  const dirs = (await readdir(catalog, { withFileTypes: true })).filter((e) => e.isDirectory() && (type === e.name || type.startsWith(`${e.name}.`))).map((e) => e.name).sort((a, b) => b.length - a.length);
  const out = [];
  if (!dirs.length) return out;
  const shards = path.join(catalog, dirs[0], 'shards');
  if (!(await exists(shards))) return out;
  for (const f of (await readdir(shards)).filter((x) => x.endsWith('.sop')).sort()) {
    for (const w of parse(await readFile(path.join(shards, f), 'utf8'), { source: f }).wires.filter((x) => x.type === type)) {
      const name = val(w, 'name');
      if (name) out.push({ name, ...(val(w, 'kind') ?? val(w, 'class') ? { kind: val(w, 'kind') ?? val(w, 'class') } : {}) });
    }
  }
  return out;
}

/** The words that name a view: every world's tab (id, title, aliases), the last part of every world id, and the view words of session.things (`lex.session.things.views`). */
function viewWords(set) {
  const out = new Set();
  for (const w of set.list()) {
    for (const x of [w.id.split('.').pop(), ...(w.tab ? [w.tab.id, w.tab.title, ...(w.tab.aliases ?? [])] : [])]) for (const t of toks(x)) out.add(t);
    for (const l of w.lexicons ?? []) if (l.id === 'lex.session.things.views') for (const x of l.words) for (const t of toks(x)) out.add(t);
  }
  return [...out].sort();
}

export async function describeWorld(w, dir, { catalog, set }) {
  const lexWords = (id) => set.list().flatMap((x) => x.lexicons ?? []).filter((l) => l.id === id).flatMap((l) => [...l.words, ...(l.plurals ?? []).flatMap((p) => String(p).split(':'))]);
  const kinds = [], known = new Set(), args = {}, knowledge = {}, openSlots = [];
  let rawArgs = false;   // a world with its own reader: the free text of its generated patterns is RAW (read when the world knows its words or its reader reads the whole clause)
  const joins = new Map();
  if (await exists(path.join(dir, 'typed.sop'))) {
    for (const x of parse(await readFile(path.join(dir, 'typed.sop'), 'utf8'), { source: 'typed.sop' }).wires.filter((y) => y.type === 'core.typed.join')) joins.set(val(x, 'slot'), { type: val(x, 'type'), by: val(x, 'by') ?? 'name', open: val(x, 'open') === 'yes' });
  }
  // the legend: the world's own types and keys
  for (const lw of w.legendWires ?? []) {
    if (lw.type !== 'core.type' || !String(lw.id).startsWith(`${w.id}.`)) continue;
    const keys = (w.legendWires ?? []).filter((k) => k.type === 'core.key' && String(k.id).startsWith(`${lw.id}.`) && !String(k.id).slice(lw.id.length + 1).includes('.')).map((k) => {
      const key = String(k.id).slice(lw.id.length + 1), v = val(k, 'value') ?? 'string';
      if (joins.get(k.id)?.open) openSlots.push(`${lw.id}|${key}`);   // the world takes other names too (they can be taught): the join types the known ones, it does not close the slot
      const j = joins.get(k.id);
      return { key, value: /^(integer|number)$/.test(v) ? v : 'string', many: val(k, 'card') === 'many', join: j ? { type: j.type, by: j.by } : null, words: [key.replace(/_/g, ' ')] };
    });
    kinds.push({ type: lw.id, words: [String(lw.id).split('.').pop().replace(/_/g, ' ')], keys });
  }
  for (const [slot, j] of joins) if (j.type) knowledge[j.type] ??= await knowledgeOf(catalog, j.type);
  // a schema world: its kinds with their words, its attributes with their values
  if (await exists(path.join(dir, 'schema.sop'))) {
    const schema = parseSchema(parse(await readFile(path.join(dir, 'schema.sop'), 'utf8'), { source: 'schema.sop' }).wires);
    let open = false;
    for (const k of Object.values(schema.kinds)) {
      const words = [...new Set([k.name.replace(/_/g, ' '), k.plural.replace(/_/g, ' '), ...k.words.map((x) => x.replace(/_/g, ' '))])];
      if (k.any || k.catalog?.length || k.know) open = true;   // the kind's things come from the knowledge (any, a catalog, a list): any word may be one
      const keys = Object.values(schema.attrs).filter((a) => a.of.includes(k.name)).map((a) => ({
        key: a.name, value: a.type === 'number' ? 'number' : a.type === 'bool' ? 'boolean' : 'string', many: false, join: null,
        ...(a.type === 'enum' ? { enum: a.values } : a.type === 'colour' && a.values.length ? { enum: a.values } : {}), words: [a.name.replace(/_/g, ' ')],
      }));
      kinds.push({ type: `${w.id}.${k.name}`, words, keys });
      for (const x of words) for (const t of toks(x)) known.add(t);
    }
    for (const a of Object.values(schema.attrs)) {
      for (const x of [a.name, ...a.values, ...(a.more ?? []), ...(a.less ?? [])]) for (const t of toks(x)) known.add(t);
      if (a.type === 'colour') for (const x of colourLexiconWords()) for (const t of toks(x)) known.add(t);
    }
    if (schema.flags?.reader) rawArgs = true;
    if (!schema.flags?.reader) {   // a world with its own reader (flag `reader`: the diagram) reads whole sentences itself: its generated patterns are shortcuts, their free text is raw (rawArgs), not typed by kind
      args.thing = open ? 'open' : 'phrase';
      if (!open) args.place = 'place';
      args['send.place'] = 'view';   // the place of the act send is another view (a tab or a world: "send table 1 to the talk"), not a place of this world
    }   // where a thing goes: a kind of the world or a position word the world has (direction words with the flag `dir`, layout words with `layout`)
    if (!schema.flags?.reader) for (const [flag, id] of [[true, 'lex.acts.rel'], [!!schema.flags?.dir, 'lex.acts.dir'], [!!schema.flags?.layout, 'lex.acts.layout']]) if (flag) for (const x of lexWords(id)) for (const t of toks(x)) known.add(t);
  }
  // a hand-built world whose operations hand the sentence to their own reader (manifest `reader=yes`: calc.story, the library's storyState) has raw free text, as a schema world with the flag `reader`
  if ((w.manifest?.entries ?? []).some((e) => e.key === 'reader' && String(e.value?.v) === 'yes')) rawArgs = true;
  // the words of the world's own lexicons (a lexicon `lex.<world>.*`)
  for (const l of w.lexicons ?? []) if (String(l.id).startsWith(`lex.${w.id}.`) && !l.open) for (const x of [...l.words, ...(l.plurals ?? []).flatMap((p) => String(p).split(':'))]) for (const t of toks(x)) known.add(t);
  const views = args['send.place'] ? viewWords(set) : [];
  return { description: { kinds, words: [] }, known: [...known].sort(), args, ...(rawArgs ? { rawArgs } : {}), openSlots, knowledge, ...(views.length ? { views } : {}) };
}

export async function build({ catalog = path.join(REPO, 'tests/fixtures/catalog') } = {}) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [path.join(REPO, 'worlds')] }), options: { reasoner: 'matrix' } });
  const files = {};
  for (const w of engine.set.list()) {
    if (!w.patterns?.length) continue;
    const dir = path.join(REPO, 'worlds', w.id);
    const d = await describeWorld(w, dir, { catalog, set: engine.set });
    files[w.id] = `${JSON.stringify({ generated: 'scripts/build-typed-worlds.mjs (spec 16 section 13); never edited by hand', version: 1, world: w.id, ...d })}\n`;
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--catalog');
  const files = await build(i > 0 ? { catalog: path.resolve(process.argv[i + 1]) } : {});
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [id, text] of Object.entries(files)) {
    const f = path.join(REPO, 'worlds', id, 'typed.json');
    const cur = await readFile(f, 'utf8').catch(() => null);
    if (cur === text) continue;
    if (check) { stale++; console.error(`stale: worlds/${id}/typed.json`); } else { await writeFile(f, text); console.log(`written worlds/${id}/typed.json (${text.length} bytes)`); }
  }
  if (stale) process.exit(1);
}
