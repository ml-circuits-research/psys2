// SPDX-License-Identifier: AGPL-3.0-only
// The offline catalog subsets of the SOP areas, GENERATED from the pinned catalog. For each worlds/<area>/area.sop:
// the schemas of its instance and knowledge modules with their dependency closure, and the knowledge shards it
// declares for offline use (app.area.offline prefix=..., else every shard but the vocabulary), with an index
// listing only what is bundled. The page reads the catalog when it can; a subset lets an area start with no
// network and lets Node tests run without a catalog checkout.
//   node scripts/build-bundled-areas.mjs [--check]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { World, str } from '../src/vendor/sopworld/sopworld.mjs';
import { catalogFolder, emit, done, stamp } from './lib/generated.mjs';
import { definesAny } from '../worlds/sop-area.mjs';

const { dir, commit } = await catalogFolder();
const ROOT = path.join(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
const entries = new Map([...(index.worlds ?? []), ...(index.schemas ?? [])].map((entry) => [entry.id, entry]));
const read = (fact, key) => (fact.attrs[key] ?? []).map((raw) => raw.startsWith('"') ? str(raw) : raw);
const areas = {};
for (const world of readdirSync(path.join(ROOT, 'worlds')).filter((w) => existsSync(path.join(ROOT, 'worlds', w, 'area.sop'))).sort()) {
  const declaration = new World();
  if (!declaration.load(readFileSync(path.join(ROOT, 'worlds', world, 'area.sop'), 'utf8')).ok) throw Error('invalid area.sop: ' + world);
  const [area] = declaration.ofType('app.area'), offline = declaration.ofType('app.area.offline').flatMap((f) => read(f, 'prefix'));
  const knowledge = read(area, 'knowledge'), modules = [...read(area, 'instance'), ...knowledge];
  // app.area.subset: the shard prefixes a knowledge module is loaded with (worlds/sop-area.mjs), per module.
  const subsets = new Map(declaration.ofType('app.area.subset').map((f) => [read(f, 'world')[0], { prefixes: read(f, 'prefix'), strict: read(f, 'strict')[0] === 'true' }]));
  const files = {}, kept = { worlds: [], schemas: [] }, pending = [...modules], seen = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = entries.get(id);
    if (!entry) continue;
    files[entry.schema] = readFileSync(path.join(dir, entry.schema), 'utf8');
    const shards = knowledge.includes(id) ? (entry.shards ?? []).map((s) => typeof s === 'string' ? s : s.path).filter((p) => {
      const name = path.basename(p, '.sop');
      if (name === 'words') return false;
      const subset = subsets.get(id), prefixes = subset?.prefixes ?? offline;
      return !prefixes.length || prefixes.some((prefix) => name.startsWith(prefix)) || (!subset?.strict && !name.includes('-'));
    }) : [];
    for (const shard of shards) files[shard] = readFileSync(path.join(dir, shard), 'utf8');
    (index.worlds?.some((w) => w.id === id) ? kept.worlds : kept.schemas).push({ id, schema: entry.schema, depends: entry.depends ?? [], shards });
    for (const dependency of entry.depends ?? []) pending.push(dependency);
  }
  // Lookup worlds (app.area.lookup): the schema, its dependencies and the shards whose index keys name a value the
  // area offers by choice (the facts of each app.area.choice type, read from the area's rule files) or the lookup names
  // as a fixed value (value=...).
  const ruleText = declaration.ofType('app.area.rules').map((f) => readFileSync(path.join(ROOT, 'worlds', read(f, 'world')[0] ?? world, read(f, 'file')[0]), 'utf8')).join('\n');
  const offered = new Set(declaration.ofType('app.area.choice').flatMap((choice) => {
    const [type] = read(choice, 'type'), [key] = read(choice, 'key');
    return [...ruleText.matchAll(new RegExp('^@\\S+ ' + type.replace(/\./g, '\\.') + ' .*?\\b' + key + '=("[^"]*"|\\S+)', 'gm'))].map((m) => m[1].replace(/^"|"$/g, ''));
  }));
  for (const lookup of declaration.ofType('app.area.lookup')) {
    const pendingLookup = [...read(lookup, 'world')];
    while (pendingLookup.length) {
      const id = pendingLookup.pop(), entry = entries.get(id);
      if (!entry || seen.has(id)) continue;
      seen.add(id);
      files[entry.schema] = readFileSync(path.join(dir, entry.schema), 'utf8');
      const wanted = new Set([...offered, ...read(lookup, 'value')]);
      const shards = read(lookup, 'world').includes(id) ? (entry.shards ?? []).filter((s) => typeof s !== 'string' && (s.keys ?? []).some((k) => wanted.has(k))).map((s) => s.path)
        .filter((p) => definesAny(readFileSync(path.join(dir, p), 'utf8'), entry.indexedFields, wanted)) : [];
      for (const shard of shards) files[shard] = readFileSync(path.join(dir, shard), 'utf8');
      (index.worlds?.some((w) => w.id === id) ? kept.worlds : kept.schemas).push({ id, schema: entry.schema, depends: entry.depends ?? [], indexedFields: entry.indexedFields, shards: (entry.shards ?? []).filter((s) => shards.includes(typeof s === 'string' ? s : s.path)) });
      for (const dependency of entry.depends ?? []) pendingLookup.push(dependency);
    }
  }
  files['index.json'] = JSON.stringify(kept);
  areas[world] = files;
}
emit(path.join(ROOT, 'src/knowledge/bundled-areas.mjs'),
  `// GENERATED by scripts/build-bundled-areas.mjs${stamp(commit)}. Do not edit.\n// Offline catalog subsets of the SOP areas: ${Object.entries(areas).map(([w, f]) => w + ' ' + Object.keys(f).length + ' files').join(', ')}.\nexport const BUNDLED_AREAS = ${JSON.stringify(areas)};\n`);
done('build-bundled-areas');
