// SPDX-License-Identifier: AGPL-3.0-only
// The part of the catalog that diagrams are composed from, bundled the same way as k.genres and k.interest (spec 14 section 9). GENERATED, never copied by hand:
//   node scripts/build-bundled-diagrams.mjs [<catalog folder (docs/worlds of sop-knowledge-worlds)>] [--check]     (no folder: the catalog at the pin; --check: exit 1 when stale)
// Writes src/knowledge/bundled-diagrams.mjs: k.diagrams (the kinds of diagram, their shapes and the fills that say which knowledge has each structure) and the schema of w.diagram, whole;
// and, from the worlds the fills read, only the wires of the types the fills name (k.diagrams.fill `type=`): the usual parts of the animals and things (k.parts.usual), the kinds of
// the things that have parts (k.kinds.parent), the steps of the methods (k.procedures.step; with the methods and both schemas, for `user_facing`), the cycles of nature and the calendar (k.time: schema and shards), the elements of a story
// (k.story.element), the parts of a genre (k.genres.part) and the aspects of a thing (k.attributes.aspect). The live catalog adds the rest (src/knowledge/diagram-world.mjs).
// Each fact line is kept as the catalog wrote it, without its `core.source`. Nothing here names a kind, a topic or a type: the types come from the fills.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { catalogFolder, emit, done, stamp } from './lib/generated.mjs';

const { dir, commit } = await catalogFolder();
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
const version = (id) => index.worlds.find((w) => w.id === id)?.version ?? null;
const read = (p) => readFileSync(path.join(dir, p), 'utf8');
const shardFiles = (id) => readdirSync(path.join(dir, id, 'shards')).filter((f) => f.endsWith('.sop')).sort();
const lines = (id) => shardFiles(id).flatMap((f) => read(`${id}/shards/${f}`).split('\n'));
const strip = (l) => l.replace(/ core\.source="[^"]*"/g, '');
const ofType = (id, type) => lines(id).filter((l) => l.startsWith('@') && l.split(' ')[1] === type).map(strip);
const MAX_TYPE_BYTES = 90000;
const nameOf = (l) => /\sname=("[^"]*"|\S+)/.exec(l)?.[1];

const files = {};
files['k.diagrams'] = [read('k.diagrams/schema.sop'), ...shardFiles('k.diagrams').map((f) => read(`k.diagrams/shards/${f}`))].join('\n').split('\n').map(strip).join('\n');
files['w.diagram'] = read('w.diagram/schema.sop').split('\n').map(strip).join('\n');

// the types the fills read: world id = the first two words of the type (k.parts.usual -> k.parts)
const fillLines = lines('k.diagrams').filter((l) => / k\.diagrams\.fill /.test(l));
const fills = fillLines.map((l) => /\stype=(\S+)/.exec(l)?.[1]);
// the topic key of a fill names what the diagram is about (a step's `method`); its slot says which facts those are (`type=k.procedures.method by=name`), and those facts say whether a person
// is ever offered them (`user_facing=false`: PSys2's own drawing methods). The slot line and the facts it names are bundled with the fill's type, so the host filters by the published key offline too.
const topicKeys = new Map();
for (const l of fillLines) { const t = /\stype=(\S+)/.exec(l)?.[1], k = /\stopic=(\S+)/.exec(l)?.[1]; if (t && k) (topicKeys.get(t) ?? topicKeys.set(t, new Set()).get(t)).add(k); }
const schemaLines = (world) => { try { return read(`${world}/schema.sop`).split('\n'); } catch { return []; } };
const slotLine = (world, id) => schemaLines(world).find((l) => l.startsWith(`@${id} core.slot `));
// a type's own schema whole (its core.type and every core.slot of it): a part of it would change what a fact is (an identity slot alone makes two steps of one method one fact)
const typeSchema = (world, type) => schemaLines(world).filter((l) => l.startsWith(`@${type} core.type `) || (l.startsWith('@') && l.includes(` core.slot of=${type} `))).map(strip);
const typesByWorld = new Map();
for (const t of new Set(fills)) { const w = t.split('.').slice(0, 2).join('.'); (typesByWorld.get(w) ?? typesByWorld.set(w, new Set()).get(w)).add(t); }

// big catalog types are restricted to what the small ones name: the kinds of the things that have usual parts
const usualNames = new Set(ofType('k.parts', 'k.parts.usual').map(nameOf));
for (const [world, types] of typesByWorld) {
  if (world === 'k.time') { // small and with its own rules: the schema and the shards of the calendar and the cycles, not the derived order
    files['k.time'] = [read('k.time/schema.sop'), ...shardFiles('k.time').filter((f) => /^(calendar|cycles)/.test(f)).map((f) => read(`k.time/shards/${f}`))].join('\n').split('\n').map(strip).join('\n');
    continue;
  }
  const out = [];
  for (const t of types) {
    let ls = ofType(world, t);
    if (t === 'k.kinds.parent') ls = ls.filter((l) => usualNames.has(nameOf(l)));
    const bytes = ls.reduce((n, l) => n + l.length + 1, 0);
    if (bytes > MAX_TYPE_BYTES) { console.log(`left to the live catalog: ${t} (${ls.length} wires, ${bytes} bytes)`); continue; }   // a size rule, not a list: a type bigger than this is read from the catalog (spec 14 section 9)
    out.push(...ls);
    for (const k of topicKeys.get(t) ?? []) {
      const slot = slotLine(world, `${t}.${k}`), ref = slot && /\stype=(\S+)/.exec(slot)?.[1];
      if (!ref || ref === t || types.has(ref) || ref.split('.').slice(0, 2).join('.') !== world) continue;   // the facts a topic names, from the same world (another world's are its own bundle's or the catalog's)
      const named = ofType(world, ref), size = named.reduce((n, l) => n + l.length + 1, 0);
      if (size > MAX_TYPE_BYTES || !named.some((l) => /\suser_facing=/.test(l))) continue;   // only where the facts say who they are for: the rest of a topic's facts the catalog adds
      out.unshift(...typeSchema(world, t), ...typeSchema(world, ref));   // the schemas first: the slot says which facts a topic names (`type=... by=name`)
      out.push(...named);
    }
  }
  if (out.length) files[world] = out.join('\n');
}
const versions = Object.fromEntries(Object.keys(files).map((id) => [id, version(id)]));
// THE OUTLINES (Q21, reviewer 2026-11-15 05:10): the 50 outlines of k.layouts (17 shapes, 33 drawings traced; points in a 0-100 frame, clockwise from the top) and the w.lang.en frames that
// say an arrangement in the shape of one ("in the shape of a house", "shaped like", "house-shaped", "in heart form": shard shape-frames, with their lexicons): a diagram is arranged along one
// with the library's arrange(..., 'path'). Kept apart from `files` (the World of the fills does not read them).
const enShard = (name) => read(`w.lang.en/shards/${name}.sop`).split('\n').filter((l) => l.startsWith('@')).map(strip).join('\n');
const outlines = [...ofType('k.layouts', 'k.layouts.outline'), ...ofType('k.layouts', 'k.layouts.outline_point')].join('\n');
const shapeFrames = enShard('shape-frames');
emit(path.join(import.meta.dirname, '../src/knowledge/bundled-diagrams.mjs'),
  `// SPDX-License-Identifier: AGPL-3.0-only\n// GENERATED by scripts/build-bundled-diagrams.mjs from the knowledge catalog (${Object.entries(versions).map(([k, v]) => `${k} ${v}`).join(', ')}${stamp(commit)}): do not edit by hand.\n// The kinds of diagram and the knowledge their fills read, for the first paint and offline; the live catalog adds to it.\nexport const BUNDLED_DIAGRAMS = ${JSON.stringify({ versions, files, outlines, shapeFrames })};\n`);
console.log('bundled-diagrams.mjs', Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), 'outlines', outlines.length, 'shape frames', shapeFrames.length);
done('build-bundled-diagrams');
