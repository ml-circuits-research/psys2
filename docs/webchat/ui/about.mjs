// SPDX-License-Identifier: AGPL-3.0-only
// Texts and data for Settings > About and the help answers: credits of the vendored libraries and models (from docs/webchat/vendor/README.md
// and the LICENSES.md files). Pure data, no DOM, so node:test can import it.

export const SOURCE_URL = 'https://github.com/ml-circuits-research/psys2';

/** [name, version, licence, used by]. Keep in step with docs/webchat/vendor/README.md. */
export const CREDITS = [
  ['DiceBear core; styles voxel-bot, open-peeps, moods', '10.7.0 / 10.6.0', 'MIT / CC0 1.0', 'Avatar tab'],
  ['TipTap and ProseMirror', '3.33.0', 'MIT', 'Editor tab'],
  ['chessground, Stockfish 19 lite', 'see vendor/chess/LICENSES.md', 'GPL-3.0', 'Chess tab'],
  ['Tone.js, abcjs', '15.1.22 / 6.7.2', 'MIT', 'Music tab'],
  ['Leaflet; Natural Earth; GeoNames', '1.9.4', 'BSD-2 / public domain / CC BY 4.0', 'Map tab (OpenStreetMap tiles online: ODbL)'],
  ['Chart.js, @kurkle/color', '4.6.1 / 0.3.4', 'MIT', 'Charts tab'],
  ['rough.js', '4.6.6', 'MIT', 'Drawing tab'],
  ['PDF.js, mammoth.js', '6.5.438 / 1.13.0', 'Apache-2.0 / BSD-2', 'Documents tab'],
  ['ONNX Runtime Web (WASM, CPU)', '1.31.1', 'MIT', 'runs the two small models in your browser'],
  ['bergamot-translator (WASM) and the Mozilla Firefox Translations models (downloaded when a language is selected)', '0.4.9', 'MPL-2.0', 'on-device translation where the browser has no Translator'],
  ['chess.js, tonal (inside the worlds)', 'see worlds/*/vendor', 'BSD-2 / MIT', 'chess and music rules'],
  ['DistilBERT (distilbert-base-uncased), fine-tuned by this project', 'dispatcher', 'Apache-2.0', 'the dispatcher model'],
  ['FLAN-T5 small (google/flan-t5-small), fine-tuned by this project', 'normalizer', 'Apache-2.0', 'the phrasing normalizer'],
];

/** The one-line description used in the header, the page title and the greeting (DOC). */
export const TAGLINE = 'neurosymbolic · runs in your browser';
export const PAGE_TITLE = 'PSys2: a neurosymbolic assistant that runs in your browser, with no server and no large language model';
export const GREETING = 'Hi, I am PSys2, a neurosymbolic assistant that runs entirely in your browser. Small neural models split what you say and propose meanings; symbolic worlds check every meaning against formal rules before anything happens, so I do what I understood and tell you what I did not. Talk to me or type. Try one of these:';

/** Settings > About: what PSys2 is and why it is safe, in short paragraphs ([heading, text]). Never claims more than we have. */
export const ABOUT_SECTIONS = [
  ['What PSys2 is', 'PSys2 is a neurosymbolic assistant that runs entirely in your browser. There is no server and no large language model: two small neural models (about 160 MB together, cached in your browser) work with formal rules and small knowledge worlds.'],
  ['What neurosymbolic means here', 'The neural part reads: a DistilBERT dispatcher cuts your message into parts and proposes which world each part belongs to, and a small FLAN-T5 normalizer may propose a simpler wording when nothing else reads a sentence. The symbolic part decides: rules turn a part into formal wires (SOP Lang), the interpreter runs them on a world, and the answer is written from templates.'],
  ['Why the symbolic layer makes it safe', 'The neural models only propose. A proposal is used only if the rules read it, a value checker confirms that its numbers, names and negations are the ones you said, and a world accepts it. Nothing runs unless a world validates it, so I do what I understood and tell you what I did not.'],
];
/** Measured accuracy (training/RESULTS.md, authored operational set of 1240 messages; Romanian set of 2480 cases). */
export const ACCURACY = [
  'English, 1240 authored messages: 98.6% answered correctly and 0.4% wrongly with the dispatcher and the normalizer (95.4% and 0.5% with the rules alone).',
  'Romanian, 2480 cases: 84.7% correct and 2.7% wrong.',
  'These sets were written by us and the rules were widened by reading them, so real users will see lower numbers; the phrase log is how we collect real phrasings.',
];
