// SPDX-License-Identifier: AGPL-3.0-only
// The shipped runtime defaults, in a module of their own: the page reads them for its settings and must not load the reading engine for that (LAZY LOADING). `runtime-config.mjs` re-exports them.
import { DEFAULT_NX_STRATEGY } from '../formalizer/nx-strategy.mjs';

/** The shipped defaults of everything that changes what the pipeline answers (the webchat adds UI-only keys on top). */
export const RUNTIME_DEFAULTS = Object.freeze({
  formalizer: 'encoder',          // the DistilBERT dispatcher validated by the rules; rules answer while it loads or when it cannot load
  encoderAcceptRefused: true,     // accept parses the interpreter refuses by state (for example "move the piece" with no game on)
  partialUnderstanding: true,     // execute what was understood and say what was ignored (7.10)
  normalizer: false,              // seq2seq phrasing normalizer (97 MB), a fallback only (7.12, 7.13); OFF by default since 2026-11-14 (+28 right of 6,099 for 97 MB): an optional download the user starts
  spellcheck: true,               // spell correction against the worlds' vocabulary (7.9)
  bestEffort: true,               // after everything else failed, execute the most sensible reading of loose words and say what was understood (7.15)
  editHead: false,                // the S1 edit head's simplified text as a candidate reading: OFF in the shipped pipeline (review decision e: 3 recovered against 7 misled); the code stays behind this flag
  nxStrategy: DEFAULT_NX_STRATEGY, // who reads first, ADR-009: 'hybrid' (the rules path as shipped, the model reads what it left unparsed, gated) | 'neural' (model first) | 'rules'; used with the encoder formalizer
  suspectWords: true,             // suspect-word leniency (7.17): a completely read segment the interpreter refuses, with a word one slip from a known word, is also tried spell-corrected
  reader: 'off',                  // READER-ROUTE (spec 16 section 7, 7.17): measured with the other two switches on, 'fill' loses 2 dialogue turns and 10 typos (it answers "I don't know what a X is" for a typo'd question), so it stays off
  fastPath: false,                // encoder only: skip the model when the rules read the whole message and the interpreter accepts it (PERF; the webchat turns it on)
});

