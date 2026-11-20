// SPDX-License-Identifier: AGPL-3.0-only
// Build a World from the knowledge catalog by its own index: the schemas of the named modules and of
// everything they depend on become the World's library, and the shards a caller names are told as facts.
// Generic: no world, type or tab is named here. readText(path) reads a catalog file (index.json, schemas, shards).
import {World} from '../lib/vendor/sopworld/sopworld.mjs?v=b665fdbe3d';
import {budget} from '../lib/dialog/budget.mjs?v=00bce6e369';

const MAX_MODULES = 128;

export async function catalogWorld(readText, { modules, shardsOf = () => [], use = modules, options = {} } = {}) {
  const index = JSON.parse(await readText('index.json'));
  const entries = new Map([...(index.worlds ?? []), ...(index.schemas ?? [])].map((entry) => [entry.id, entry]));
  // The modules and everything they depend on are known from the index alone; their schemas and every named shard are
  // read at once (a catalog served over the network costs one round trip, not one per file or per dependency level).
  const ids = [];
  for (let wave = [...new Set(modules)]; wave.length;) {
    budget.tick('catalog-world.dependencies');
    for (const id of wave) if (!entries.get(id)?.schema) throw Error('catalog-module-unavailable:' + id);
    ids.push(...wave);
    if (ids.length > MAX_MODULES) throw Error('catalog-module-budget');
    wave = [...new Set(wave.flatMap((id) => entries.get(id).depends ?? []))].filter((id) => entries.has(id) && !ids.includes(id));
  }
  const paths = modules.flatMap((id) => shardsOf(entries.get(id)));
  const texts = await Promise.all([...ids.map((id) => entries.get(id).schema), ...paths].map((path) => readText(path)));
  const library = Object.fromEntries(ids.map((id, n) => [id, texts[n]])), shardTexts = texts.slice(ids.length);
  // options: World options a caller declares (a derivation depth budget), passed through unchanged.
  const world = new World({ ...options, library });
  const loaded = world.load(use.map((id, n) => `@catalog.use.${n} core.use world=${id}`).join('\n'));
  if (!loaded.ok) throw Error('catalog-load-refused');
  paths.forEach((path, n) => {
    const told = world.tell(shardTexts[n], { factsOnly: true });
    if (!told.ok) throw Error('catalog-shard-refused:' + path);
  });
  return world;
}
