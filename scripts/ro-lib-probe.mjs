// Probe: read the catalog's w.lang.ro with the vendored library (std.morph). node scripts/ro-lib-probe.mjs <catalog docs/worlds> word...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const dir = join(process.argv[2], 'w.lang.ro');
const text = ['schema.sop', ...readdirSync(join(dir, 'shards')).map((f) => `shards/${f}`)].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const world = new lib.World();
world.load(text);
const types = { cls: 'w.lang.ro.class', ending: 'w.lang.ro.ending', irregular: 'w.lang.ro.irregular', fold: 'w.lang.ro.fold', split: 'w.lang.ro.split', template: 'w.lang.ro.template', vowel: 'w.lang.ro.vowel' };
const t0 = performance.now();
const m = lib.morphOf(world, { types });
const d = lib.dictionary({ read: (l) => { try { return readFileSync(join(dir, 'dictionary', `${l}.tsv`), 'utf8'); } catch { return null; } }, fold: (s) => lib.fold(m, s) });
console.log('compiled in', Math.round(performance.now() - t0), 'ms');
for (const w of process.argv.slice(3)) console.log(w, JSON.stringify(lib.splitClitics(m, w)), JSON.stringify(lib.analyse(m, w, { dictionary: d }).slice(0, 3)));
