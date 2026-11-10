/**
 * NX3b generation prompt: the world's exact operation ids, keys, fixed values and the FULL lexicons (NX3's prompt cut each lexicon at 10
 * words and listed the keys without their value sets, which is where unknown-op / unknown-key / value-not-in-lexicon drops came from).
 */
import { describeWorld } from './nx-read.mjs';

const FIXED_NOTE = '(fixed constants of the op: the value is one of these)';

export function worldPromptB(set, worldId, genRules, seeds = []) {
  const d = describeWorld(set, worldId);
  const w = set.get(worldId);
  const used = new Set(seeds.map((s) => s.op));
  const ops = d.ops.map((o) => {
    const keys = o.keys.map((k) => `    - ${k.key}${k.ask ? ` : "${k.ask}"` : ''}`).join('\n');
    const fx = Object.entries(o.fixed).map(([k, v]) => `    - ${k} ${FIXED_NOTE}: ${v.join(' | ')}`).join('\n');
    return `* ${o.op}${used.has(o.op) ? '  [used by seeds in this round]' : ''}${o.doc ? ` - ${o.doc}` : ''}\n${keys}${fx ? '\n' + fx : ''}${o.examples.length ? `\n    e.g. ${o.examples.slice(0, 3).map((x) => `"${x}"`).join('; ')}` : ''}`;
  }).join('\n');
  const lex = w.lexicons.filter((l) => l.words.length).map((l) => `- ${l.id} (${l.class ?? 'words'}, ${l.words.length} words): ${l.words.slice(0, 120).map((x) => String(x).replace(/_/g, ' ')).join(', ')}${l.words.length > 120 ? ', ...' : ''}`).join('\n');
  return `You write training phrasings for a conversational system. The labels are given by the seed: you never choose or change an operation, a key or a value.

WORLD: ${worldId}

EXACT OPERATION IDS OF THIS WORLD (the only ones that exist): ${d.ops.map((o) => o.op).join(' , ')}

OPERATIONS (id - meaning; each key with the question it answers; fixed constants):
${ops}

LEXICONS (the exact words the system knows for value slots; a slot bound to a lexicon is phrased with one of these words or a plain inflection of it (plural, past tense), never a synonym outside the list):
${lex || '(none)'}

KEYS: in "x" use exactly the slot keys the seed gives, spelled the same; never add, drop or rename a key. Slot values stay exactly as in the seed.

${genRules}
`;
}
