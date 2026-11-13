// Generates the files of a schema world from its schema.sop (spec 21): lexicon.sop, patterns.sop, operations.sop, templates.sop, ops.mjs.
//   node scripts/build-schema-world.mjs <world dir> [--check]      (--check: exit 1 when a generated file is stale)
// The world's own files (world.sop, legend.sop, tests.sop, schema.sop) are never touched.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { isCanonicalSentence } from '../src/worlds/canonical.mjs';
import { parseSchema, generate, ACT_VERBS, DET_WORDS, REL_WORDS } from '../worlds/acts/acts.mjs';


/**
 * KINDS FROM THE CATALOG VOCABULARY (spec 21 section 9): a kind with `catalog=<knowledge world>` (repeatable) is also said by every lemma that world's shards hold in the published vocabulary
 * (`vocab.json` of the catalog; the snapshot of the repository unless PSYS2_CATALOG names another), singular and plural, so "the crocodiles" is a bare kind without a list in the schema.
 * Words that the schema itself uses as a value, an attribute, a verb or a frame word are never added (orange, light, heart).
 */
async function addCatalogWords(schema) {
  const wanted = Object.values(schema.kinds).filter((k) => k.catalog?.length);
  if (!wanted.length) return;
  const root = path.resolve(process.env.PSYS2_CATALOG ?? path.join(import.meta.dirname, '../tests/fixtures/catalog'));
  const vocab = JSON.parse(await readFile(path.join(root, 'vocab.json'), 'utf8'));
  const taken = new Set([...Object.values(schema.attrs).flatMap((a) => [a.name, ...a.words, ...a.values, ...a.more, ...a.less]), ...Object.values(ACT_VERBS).flat(), ...DET_WORDS, ...REL_WORDS, ...Object.values(schema.kinds).flatMap((k) => [k.name, k.plural, ...k.words])]);
  // a part of an object (roof, door, wheel, leg) is read as a part of its owner, never as a kind of its own
  if (wanted.some((k) => k.catalog.includes('k.objects'))) {
    const dir = path.join(root, 'k.objects/shards');
    for (const f of await readdir(dir).catch(() => [])) for (const m of (await readFile(path.join(dir, f), 'utf8')).matchAll(/k\.objects\.part\b[^\n]*?\b(?:name|kind)=([a-z_]+)/g)) taken.add(m[1]);
    for (const f of await readdir(dir).catch(() => [])) for (const m of (await readFile(path.join(dir, f), 'utf8')).matchAll(/k\.objects\.part\b[^\n]*?\bkind=([a-z_]+)/g)) taken.add(m[1]);
  }
  for (const k of wanted) {
    const words = new Set();
    for (const [lemma, shards] of Object.entries(vocab)) {
      if (!shards.some((sh) => k.catalog.includes(sh.split('/')[0])) || !/^[a-z][a-z_]*$/.test(lemma) || taken.has(lemma) || taken.has(lemma.replace(/(?:ies|es|s)$/, '')) || taken.has(lemma.replace(/s$/, '')) || lemma.length < 3) continue;
      words.add(lemma); if (!/[^s]s$/.test(lemma)) words.add(pluralOf(lemma));   // a lemma that is already a plural (roofs, glasses) gets no second one
    }
    k.words = [...new Set([...k.words, ...[...words].sort()])];
  }
}
const pluralOf = (w) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(?:s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);

/** { files, schema } for a world directory. */
export async function build(dir) {
  const text = await readFile(path.join(dir, 'schema.sop'), 'utf8');
  const { wires, errors } = parse(text, { source: 'schema.sop' });
  if (errors.length) throw new Error(`schema.sop: ${errors[0].message}`);
  const ns = path.basename(dir);
  const schema = parseSchema(wires);
  await addCatalogWords(schema);
  const rel = path.relative(dir, path.resolve(import.meta.dirname, '../worlds/acts/acts.mjs')).split(path.sep).join('/');
  return { files: generate(schema, ns, rel, isCanonicalSentence), schema };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.argv[2] ?? '.');
  const check = process.argv.includes('--check');
  const { files } = await build(dir);
  let stale = 0;
  for (const [name, text] of Object.entries(files)) {
    const cur = await readFile(path.join(dir, name), 'utf8').catch(() => null);
    if (cur === text) continue;
    if (check) { stale++; console.error(`stale: ${name}`); } else { await writeFile(path.join(dir, name), text); console.log(`written ${name}`); }
  }
  if (stale) process.exit(1);
}
