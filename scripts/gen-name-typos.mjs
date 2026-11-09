#!/usr/bin/env node
/**
 * Proper-name typo set (RD10): values of the lexicons (gazetteer places, animal names, song titles) with a deterministic typo inside the
 * value, in a request the world reads. Writes training/eval/typos/proper-names.jsonl in the format of scripts/eval-typos.mjs
 * ({ world, tab, original, typo, kind }). Wrapped forms ("the city of X", "X city") are included for places.
 *
 *   node scripts/gen-name-typos.mjs [--places 150] [--animals 60] [--songs 25]
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
let seed = 20261109;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const title = (v) => v.replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** One typo inside a value: transposition, deletion, doubling or a neighbouring-key substitution of a letter (never the first letter, never a space). */
function mutate(v) {
  const letters = [...v].map((c, i) => ({ c, i })).filter((x) => x.c !== ' ' && x.i > 0);
  for (let t = 0; t < 20; t++) {
    const { c, i } = pick(letters);
    const kind = pick(['swap', 'drop', 'double', 'sub']);
    let out = v;
    if (kind === 'swap' && v[i + 1] && v[i + 1] !== ' ' && v[i + 1] !== c) out = v.slice(0, i) + v[i + 1] + c + v.slice(i + 2);
    else if (kind === 'drop') out = v.slice(0, i) + v.slice(i + 1);
    else if (kind === 'double') out = v.slice(0, i + 1) + c + v.slice(i + 1);
    else if (kind === 'sub') { const near = 'qwertyuiopasdfghjklzxcvbnm'; const j = near.indexOf(c); out = v.slice(0, i) + near[(j + (rnd() < 0.5 ? 1 : -1) + near.length) % near.length] + v.slice(i + 1); }
    if (out !== v && !out.includes('  ') && /[a-z]{2}/.test(out)) return out;
  }
  return null;
}

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const lex = lexIndex(engine.set);
const valuesOf = (re, ok) => [...new Set([...lex.lexicons.values()].filter((l) => re.test(l.id)).flatMap((l) => [...l.words]))].map((w) => w.replace(/_/g, ' ')).filter(ok).sort();
const sample = (a, n) => { const b = [...a]; const out = []; while (out.length < n && b.length) out.push(b.splice(Math.floor(rnd() * b.length), 1)[0]); return out; };

const rows = [];
const add = (world, tab, orig, typo) => { if (typo && typo !== orig) rows.push({ world, tab, original: orig, typo, kind: 'nonword' }); };
const places = valuesOf(/\.places$/, (v) => /^[a-z ]+$/.test(v) && v.length >= 5 && v.length <= 22);
const multi = places.filter((v) => v.includes(' ')), single = places.filter((v) => !v.includes(' '));
const chosen = [...sample(multi, Math.round(arg('places', 150) * 0.3)), ...sample(single, Math.round(arg('places', 150) * 0.7))];
chosen.forEach((v, k) => {
  const bad = mutate(v);
  if (!bad) return;
  const style = k % 5;
  if (style === 3) add('geo.map', 'map', `Show the city of ${title(v)}.`, `Show the city of ${title(bad)}.`);
  else if (style === 4) add('geo.map', 'map', `Show ${title(v)} city.`, `Show ${title(bad)} city.`);
  else add('geo.map', 'map', `Show me ${title(v)}.`, `Show me ${title(bad)}.`);
});
const animals = valuesOf(/animals\.names$/, (v) => /^[a-z]+$/.test(v) && v.length >= 5);
for (const v of [...sample(animals, arg("animals", 60)), ...sample(animals, arg("animals", 60))]) add('kids.animals', null, `How many legs does a ${v} have?`, `How many legs does a ${mutate(v)} have?`);
const songs = valuesOf(/songtitles$/, (v) => v.length >= 6 && /^[a-z ]+$/.test(v));
for (const v of [...sample(songs, arg("songs", 25)), ...sample(songs, arg("songs", 25))]) { const bad = mutate(v); add('media.music', 'music', `Play ${title(v)}.`, `Play ${title(bad ?? v)}.`); }

writeFileSync(join(REPO, 'training/eval/typos/proper-names.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} lines: ${['geo.map', 'kids.animals', 'media.music'].map((w) => `${w} ${rows.filter((r) => r.world === w).length}`).join(', ')}`);
