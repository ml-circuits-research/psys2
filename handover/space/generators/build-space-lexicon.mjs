// SPDX-License-Identifier: AGPL-3.0-only
// Writes worlds/space/lexicon.sop from the word tables of worlds/space/space.mjs (WORDS), so the module's words are lexicons, stated once.
//   node scripts/build-space-lexicon.mjs [--check]    (--check: exit 1 when the file is stale; tests/space.test.mjs runs the same comparison)
import { readFile, writeFile } from 'node:fs/promises';
import { WORDS, RULES } from '../worlds/space/space.mjs';

const DOC = {
  ordinals: 'Which one by order: first, second, ... last.',
  positions: 'Which one by place: left, right, top, bottom, middle (as the word of a thing: the left one, the middle house).',
  sizes: 'Which one by size: biggest, smallest.',
  counts: 'How many of the group: the two on the left.',
  dirs: 'Directions of a move, combined with and (left and down).',
  amounts: 'How far one move goes: a step by default, a bit, a lot, all the way, by half.',
  more: 'Words that repeat or continue the last move: further, more, again.',
  layouts: 'Ways to arrange a group: row, column, grid, circle, spread, align, tidy, swap, stack, by height, the parts of a face.',
  relations: 'Where a thing goes in relation to another: next to, above, under, between, around, against, in, on.',
  contact: 'Words that ask for contact: touching, against, joined.',
  apart: 'Words that ask for a gap: apart, gap, separate.',
};
export const build = () => Object.entries(WORDS).map(([name, ws]) => `@lex.space.${name} core.lexicon\n    class=modifier\n    doc="${DOC[name]}"\n${[...new Set(ws)].map((w) => `    word=${w}`).join('\n')}\n`).join('\n');

export const buildRules = () => RULES.map((r) => `@rule.space.${r.id.replace(/-/g, '_')} space.rule\n    id=${r.id}\n    doc="${r.doc}"\n    core.source="fixture:space/rules"\n`).join('\n');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const path = new URL('../worlds/space/lexicon.sop', import.meta.url);
  if (process.argv.includes('--check')) { const have = await readFile(path, 'utf8').catch(() => ''); const haveR = await readFile(new URL('../worlds/space/rules.sop', import.meta.url), 'utf8').catch(() => ''); if (have !== build() || haveR !== buildRules()) { console.error('worlds/space/lexicon.sop is stale; run node scripts/build-space-lexicon.mjs'); process.exit(1); } }
  else { await writeFile(path, build()); await writeFile(new URL('../worlds/space/rules.sop', import.meta.url), buildRules()); }
}
