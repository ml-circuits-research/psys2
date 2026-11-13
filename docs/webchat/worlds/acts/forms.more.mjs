// SPDX-License-Identifier: AGPL-3.0-only
// The flags and lexicons of the more English forms of the acts (the forms themselves are facts: handover/lang.en/shards/frames-acts.sop, set acts.more), used by every schema world that sets the flag named in `if` (spec 21, art.draw pilot). Each group is a way
// people ask for the same acts: with a wish ("I want a red house"), as a question about what is there ("is there a tree?", "describe my picture"), counted or located in other words,
// with an amount ("a bit smaller"), turned, cleared, a surprise. The notation is that of FORMS (L lead-in, D determiner, V.<act>, REL, `{role:ATTR|VALUE|KIND|MORE|LESS|TURN|NOUN}`),
// `{x:lexicon?}` is optional. Roles beyond the six (`m1`, `m2`: modifier words before a kind, `kind`) are joined back into the thing by the world's hooks. No imports: browser-safe.
export const FLAGS_MORE = ['wish', 'list', 'say', 'scale', 'turn', 'clear', 'random', 'none', 'ground'];

/** The lexicons the forms above need besides those of acts.mjs, as [lexicon id suffix, doc, words]: `turn` and `nouns` are per world (`lex.<ns>.turn`), `lex.space.factor` is the space module's. */
export const TURN_WORDS = ['around', 'over', 'back', 'round', 'upside_down', 'the_other_way', 'backwards', 'clockwise', 'counter_clockwise', 'to_the_left', 'to_the_right', 'to_left', 'to_right', 'left', 'right', 'sideways', 'forward'];
