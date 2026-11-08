#!/usr/bin/env node
/**
 * Seeds `worlds/lang.common/lexicon.sop` (L3): the phrase macros as the UNION of today's per-world lead-in and suffix lists
 * (alternatives that can never match because the tokenizer drops their words are left out), and the shared lexicons as the union
 * of the per-world colour / ordinal / size / degree / direction / position / unit lists.
 *
 * An alternative enters a macro when it occurs in the optional lead-in / suffix groups (3 or more alternatives) of at least two
 * worlds, or in at least 10 patterns of a group of 5 or more alternatives (generic frame vocabulary of one big world).
 * Macros: lang.lead.polite, lang.lead.question, lang.lead.filler, lang.tail.filler (longest alternatives first).
 *
 * Usage: node scripts/build-lang-common.mjs [--write] [--force]   (stdout by default; --write refuses to overwrite hand edits without --force)
 * After the seed, `lang.common` is edited by hand: new common phrasing goes there, never inline in a world.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse, get, getAll } from '../src/soplang/index.mjs';
import { readPatterns, altStats } from './lib/phrase-groups.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'worlds');
const OUT = join(ROOT, 'lang.common', 'lexicon.sop');
const MIN_WORLDS = 1;
const args = new Set(process.argv.slice(2));

const patterns = readPatterns(ROOT).filter((p) => p.world !== 'lang.common');
const stats = altStats(patterns);
const macros = new Map();
for (const e of stats.values()) {
  if (!(e.worlds.size >= MIN_WORLDS)) continue;
  if (!macros.has(e.class)) macros.set(e.class, []);
  macros.get(e.class).push(e.alt);
}
const byLength = (a, b) => b.split('_').length - a.split('_').length || a.localeCompare(b);

const DOC = {
  'lead.polite': 'Polite request lead-ins ("can you", "i would like you to", "let us"), optional before an imperative.',
  'lead.question': 'Indirect question lead-ins ("tell me", "do you know", "i wonder"), optional before a question.',
  'lead.filler': 'Spoken fillers and interjections at the start of a sentence ("so", "like", "you know", "yo").',
  'tail.filler': 'Suffix fillers and politeness at the end of a sentence ("for me", "thanks", "right away", "or something").',
};
let out = '@gen.lang.common.note core.note\n    text="Seeded by scripts/build-lang-common.mjs from the union of the per-world lead-in and suffix lists (unreachable alternatives removed) and the per-world shared lexicons; edit by hand from now on. New common phrasing goes here, never inline in a world."\n\n';
for (const cls of ['lead.polite', 'lead.question', 'lead.filler', 'tail.filler']) {
  const alts = (macros.get(cls) ?? []).sort(byLength);
  out += `@phrase.lang.${cls} core.phrase\n    doc=${JSON.stringify(DOC[cls])}\n` + alts.map((a) => `    alt=${a}\n`).join('') + '\n';
  console.error(`${cls}: ${alts.length} alternatives`);
}

/** Union of the words of lexicons (world:file:id) in first-seen order. */
function union(sources, own = []) {
  const words = [], plurals = [];
  for (const s of sources) {
    const [w, f, id] = s.split(':');
    const x = parse(readFileSync(join(ROOT, w, f), 'utf8')).wires.find((y) => y.id === id);
    if (!x) throw new Error(`missing lexicon ${s}`);
    for (const v of getAll(x, 'word')) if (!words.includes(v.v)) words.push(v.v);
    for (const v of getAll(x, 'plural')) if (!plurals.includes(v.v)) plurals.push(v.v);
  }
  for (const v of own) if (!words.includes(v)) words.push(v);
  return { words, plurals };
}
const LEX = [
  ['colour', 'noun', 'Colour names (union of the colour lexicons of the draw, editor, charts, shapes and avatar worlds).',
    ['art.draw:lexicon.sop:lex.art.draw.colors', 'docs.editor:lexicon.sop:lex.docs.editor.colors', 'data.charts:lexicon.sop:lex.data.charts.colors', 'kids.shapes:lexicon.sop:lex.kids.shapes.colors', 'ui.avatar:lexicon.sop:lex.ui.avatar.colors']],
  ['ordinal', 'noun', 'Ordinal words (first ... tenth, last).', ['art.draw:lexicon.sop:lex.art.draw.ordinals', 'docs.editor:lexicon.sop:lex.docs.editor.ordinals', 'data.charts:lexicon.sop:lex.data.charts.ordinals', 'docs.reader:lexicon.sop:lex.docs.reader.ordinals']],
  ['size', 'noun', 'Size words and comparatives.', ['art.draw:lexicon.sop:lex.art.draw.sizes', 'docs.editor:lexicon.sop:lex.docs.editor.sizes', 'ui.avatar:lexicon.extra.sop:lex.ui.avatar.size']],
  ['degree', 'degree', 'Degree adverbs ("a bit", "a lot", "slightly").', ['media.music:lexicon.sop:lex.media.music.degrees']],
  ['direction', 'direction', 'Directions: compass, vertical and horizontal.', ['media.music:lexicon.sop:lex.media.music.directions', 'geo.map:lexicon.sop:lex.geo.map.directions']],
  ['position', 'noun', 'Positions in a text, a list or on a board.', ['docs.editor:lexicon.sop:lex.docs.editor.positions', 'games.tictactoe:lexicon.sop:lex.games.tictactoe.positions']],
  ['unit', 'noun', 'Units of text and of money.', ['docs.reader:lexicon.sop:lex.docs.reader.units', 'kids.shop:lexicon.sop:lex.kids.shop.units']],
];
for (const [name, cls, doc, srcs] of LEX) {
  const { words, plurals } = union(srcs);
  out += `@lex.lang.${name} core.lexicon\n    class=${cls}\n    doc=${JSON.stringify(doc)}\n` + words.map((w) => `    word=${w}\n`).join('') + plurals.map((p) => `    plural=${p}\n`).join('') + '\n';
  console.error(`lex.lang.${name}: ${words.length} words`);
}

if (args.has('--write')) {
  if (existsSync(OUT) && !args.has('--force')) { console.error(`${OUT} exists; pass --force to overwrite hand edits`); process.exit(1); }
  writeFileSync(OUT, out.trimEnd() + '\n');
  console.error(`wrote ${OUT}`);
} else process.stdout.write(out);
