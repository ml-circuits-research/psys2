// SPDX-License-Identifier: AGPL-3.0-only
// Builds tests/fixtures/catalog/ (the small local copy of the knowledge catalog that tests read; tests never touch the network) from a checkout of the real catalog:
//   node scripts/make-catalog-fixture.mjs <path to sop-knowledge-worlds/docs/worlds>
// k.faces: every slot of the hand-written style keeps the variants the presets use plus the first two others; the other worlds are hand-sized samples in the same format.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/make-catalog-fixture.mjs <catalog docs/worlds folder>'); process.exit(1); }
const out = path.join(import.meta.dirname, '../tests/fixtures/catalog');
const real = JSON.parse(readFileSync(path.join(src, 'index.json'), 'utf8'));
const faces = real.worlds.find((w) => w.id === 'k.faces');
const hand = faces.shards.filter((s) => s.sources.every((x) => x.startsWith('hand-core')));
const presets = readFileSync(path.join(src, 'k.faces/shards/presets.sop'), 'utf8');
const used = new Set();
for (const line of presets.split('\n').filter((l) => l.includes(' k.faces.preset '))) {
  for (const t of line.matchAll(/ (\w+)=("[^"]*"|\S+)/g)) used.add(`${t[1]}:${t[2].replace(/"/g, '')}`);
}
const files = {}, shards = [];
const put = (id, text, keys, sources = ['hand-core-1']) => {
  files[`${id}.sop`] = text;
  shards.push({ id, path: `${id}.sop`, wires: text.split('\n').filter((l) => l.startsWith('@')).length, bytes: text.length, keys, sources, license: 'CC0-1.0', warnings: [] });
};
for (const sh of hand) {
  const text = readFileSync(path.join(src, `${sh.id}.sop`), 'utf8');
  if (!/\/plain-/.test(sh.id)) { put(sh.id, text, sh.keys); continue; }
  const lines = text.split('\n');
  const variants = lines.filter((l) => / k\.faces\.variant /.test(l)).map((l) => ({ id: l.split(' ')[0].slice(1), slot: /slot=(\S+)/.exec(l)[1], name: /name=("[^"]*"|\S+)/.exec(l)[1].replace(/"/g, '') }));
  const keep = new Set(variants.filter((v, i) => i < 2 || used.has(`${v.slot}:${v.name}`)).map((v) => v.id));
  const kept = lines.filter((l) => {
    if (!l.startsWith('@')) return false;
    const id = l.split(' ')[0].slice(1);
    return [...keep].some((k) => id === k || id.startsWith(`${k}.`));
  });
  const names = variants.filter((v) => keep.has(v.id)).map((v) => v.name.toLowerCase());
  put(sh.id, [...lines.filter((l) => l.startsWith('# k.faces/') || l.startsWith('# sources') || l.startsWith('# license')), '', ...kept].join('\n') + '\n', [variants[0].slot, ...names].sort());
}
// a hand-sized sample of other worlds, in the format of the catalog (k.demo is a world no PSys2 code knows)
const SRC = 'core.source="fixture 1"';
put('k.objects/shards/buildings', [`@k.objects.house k.objects.object name=house ${SRC}`,
  `@k.objects.house.body k.objects.part of=house name=body shape=rectangle x=20 y=45 w=60 h=50 z=1 colour=red ${SRC}`,
  `@k.objects.house.roof k.objects.part of=house name=roof shape=triangle x=12 y=15 w=76 h=30 z=2 colour=brown ${SRC}`].join('\n') + '\n', ['house', 'body', 'roof'], ['fixture-1']);
put('k.objects/shards/stand-ins-hand', `@k.objects.hand.kind.villa k.objects.stand_in name=villa drawing=house ${SRC}\n`, ['villa'], ['fixture-1']);
put('k.words/shards/ma', `@k.words.mansion.noun.1 k.words.sense word=mansion pos=noun n=1 gloss="a large and stately house" is_a=house ${SRC}\n`, ['mansion'], ['fixture-1']);
put('k.words/shards/gl', `@k.words.glasses.noun.1 k.words.sense word=glasses pos=noun n=1 gloss="optical instrument with a frame that holds a pair of lenses" synonym=spectacles synonym=specs synonym=eyeglasses ${SRC}\n`, ['glasses'], ['fixture-1']);
put('k.words/shards/sp', `@k.words.spectacles.noun.1 k.words.sense word=spectacles pos=noun n=1 gloss="optical instrument" synonym=eyeglasses synonym=glasses ${SRC}\n`, ['spectacles'], ['fixture-1']);
put('k.demo/shards/fruits', [`@k.demo.apple k.demo.fruit name=apple colour=red taste=sweet ${SRC}`, `@k.demo.lemon k.demo.fruit name=lemon colour=yellow taste=sour ${SRC}`].join('\n') + '\n', ['apple', 'lemon'], ['fixture-1']);
// k.layouts: the face layout only (its slots say what each holds: other names of the slots)
const lay = readFileSync(path.join(src, 'k.layouts/shards/layouts.sop'), 'utf8').split('\n').filter((l) => l.startsWith('@') && (/ layout=face /.test(l) || /^@k\.layouts\.layout\.face /.test(l)));
const layKeys = ['face', ...lay.map((l) => / name=("[^"]*"|\S+)/.exec(l)?.[1]?.replace(/"/g, '').toLowerCase()).filter(Boolean)];
put('k.layouts/shards/layouts', `# fixture: the face layout of k.layouts\n\n${lay.join('\n')}\n`, layKeys, ['hand-core-1']);
// k.layouts, every layout by name (the names are the words of an arrangement: spec 21), without the slots of the layouts
const allLay = readFileSync(path.join(src, 'k.layouts/shards/layouts.sop'), 'utf8').split('\n').filter((l) => /^@k\.layouts\.layout\.\w+ k\.layouts\.layout /.test(l) && !/ layout=face /.test(l) && !/^@k\.layouts\.layout\.face /.test(l));
put('k.layouts/shards/names', `# fixture: the names of the layouts of k.layouts\n\n${allLay.join('\n')}\n`, allLay.map((l) => / name=("[^"]*"|\S+)/.exec(l)?.[1]?.replace(/"/g, '').toLowerCase()).filter(Boolean), ['hand-core-1']);
// k.actions: the whole world (acts, roles, markings, verbs: the act phrases of spec 21), copied as it is
const actionsReal = real.worlds.find((w) => w.id === 'k.actions');
files['k.actions/schema.sop'] = readFileSync(path.join(src, 'k.actions/schema.sop'), 'utf8');
for (const sh of actionsReal.shards) put(sh.id, readFileSync(path.join(src, sh.path), 'utf8'), sh.keys, sh.sources);
const byWorld = (id) => shards.filter((s) => s.id.startsWith(`${id}/`));
const worlds = [
  { id: 'k.faces', version: '1', schema: 'k.faces/schema.sop', exports: faces.exports, depends: [], shards: byWorld('k.faces') },
  { id: 'k.objects', version: '3', schema: 'k.objects/schema.sop', exports: ['k.objects.object', 'k.objects.part', 'k.objects.stand_in'], depends: [], shards: byWorld('k.objects') },
  { id: 'k.words', version: '1', schema: 'k.words/schema.sop', exports: ['k.words.sense'], depends: [], shards: byWorld('k.words') },
  { id: 'k.layouts', version: '1', schema: 'k.layouts/schema.sop', exports: ['k.layouts.layout', 'k.layouts.slot'], depends: [], shards: byWorld('k.layouts') },
  { id: 'k.actions', version: actionsReal.version, schema: 'k.actions/schema.sop', exports: actionsReal.exports, depends: [], shards: byWorld('k.actions') },
  { id: 'k.demo', version: '1', schema: 'k.demo/schema.sop', exports: ['k.demo.fruit'], depends: [], shards: byWorld('k.demo') },
];
const vocab = {};
for (const w of worlds) for (const s of w.shards) for (const k of s.keys) (vocab[k.toLowerCase()] ??= []).push(s.id);
files['index.json'] = JSON.stringify({ version: 'fixture', sopworld: '1e18f1d', worlds }, null, 1);
files['vocab.json'] = JSON.stringify(vocab, null, 1);
for (const [p, t] of Object.entries(files)) { mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); writeFileSync(path.join(out, p), t); }
console.log(`${Object.keys(files).length} files, ${Object.values(files).reduce((a, t) => a + t.length, 0)} bytes -> ${out}`);
