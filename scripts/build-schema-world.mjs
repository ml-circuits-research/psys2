// Generates the files of a schema world from its schema.sop (spec 21): lexicon.sop, patterns.sop, operations.sop, templates.sop, ops.mjs.
//   node scripts/build-schema-world.mjs <world dir> [--check]      (--check: exit 1 when a generated file is stale)
// The world's own files (world.sop, legend.sop, tests.sop, schema.sop) are never touched.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { parseSchema, generate } from '../worlds/acts/acts.mjs';

/** { files, schema } for a world directory. */
export async function build(dir) {
  const text = await readFile(path.join(dir, 'schema.sop'), 'utf8');
  const { wires, errors } = parse(text, { source: 'schema.sop' });
  if (errors.length) throw new Error(`schema.sop: ${errors[0].message}`);
  const ns = path.basename(dir);
  const schema = parseSchema(wires);
  const rel = path.relative(dir, path.resolve(import.meta.dirname, '../worlds/acts/acts.mjs')).split(path.sep).join('/');
  return { files: generate(schema, ns, rel), schema };
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
