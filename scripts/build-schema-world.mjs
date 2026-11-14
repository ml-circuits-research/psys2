// Generates the files of a schema world from its schema.sop (spec 21): lexicon.sop, patterns.sop, operations.sop, templates.sop, ops.mjs.
//   node scripts/build-schema-world.mjs <world dir> [--check]      (--check: exit 1 when a generated file is stale)
// The world's own files (world.sop, legend.sop, tests.sop, schema.sop) are never touched.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { isCanonicalSentence } from '../src/worlds/canonical.mjs';
import { parseSchema, serializeSchema, generate, ACT_VERBS, DET_WORDS, REL_WORDS } from '../worlds/acts/acts.mjs';


// Kinds from the catalog are not generated: a kind with `catalog=` makes the kinds lexicon open (`open=knowledge`), read by lookup (src/knowledge/open-words.mjs, spec 21 section 10).

/** { files, schema } for a world directory. */
export async function build(dir) {
  const text = await readFile(path.join(dir, 'schema.sop'), 'utf8');
  const { wires, errors } = parse(text, { source: 'schema.sop' });
  if (errors.length) throw new Error(`schema.sop: ${errors[0].message}`);
  const ns = path.basename(dir);
  const schema = parseSchema(wires);
  const rel = path.relative(dir, path.resolve(import.meta.dirname, '../worlds/acts/acts.mjs')).split(path.sep).join('/');
  // a declaration-only schema (declare=yes): the world's files are its own; only the schema as a module is written, for the world's ops.mjs (declaredExecutor)
  if (schema.declared) return { files: { 'schema.declared.mjs': `// GENERATED from schema.sop by scripts/build-schema-world.mjs (declare=yes). Never edited by hand.\nexport const SCHEMA = ${JSON.stringify(serializeSchema(schema))};\n` }, schema };
  const files = generate(schema, ns, rel, isCanonicalSentence);
  // hand-written vocabulary a world keeps beside the generated one (the legend words of the diagram engine: shape names, colours ...): appended to the generated lexicon.sop
  const extra = await readFile(path.join(dir, 'lexicon.extra.sop'), 'utf8').catch(() => null);
  if (extra) files['lexicon.sop'] += `\n# ---- lexicon.extra.sop (hand-written, appended by the generator)\n${extra}`;
  // hand-written wires beside the generated ones: the patterns, operations and templates of the families the acts do not name (a chart's sources and statistics)
  for (const f of ['patterns', 'operations', 'templates']) {
    const more = await readFile(path.join(dir, `${f}.extra.sop`), 'utf8').catch(() => null);
    if (more) files[`${f}.sop`] += `\n# ---- ${f}.extra.sop (hand-written, appended by the generator)\n${more}`;
  }
  return { files, schema };
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
