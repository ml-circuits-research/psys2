// SPDX-License-Identifier: AGPL-3.0-only
// Texts and data for Settings > About and the help answers: credits of the vendored libraries and models (from docs/webchat/vendor/README.md
// and the LICENSES.md files). Pure data, no DOM, so node:test can import it.

export const SOURCE_URL = 'https://github.com/ml-circuits-research/psys2';

/** [name, version, licence, used by]. Keep in step with docs/webchat/vendor/README.md. */
export const CREDITS = [
  ['k.faces (hand-written face parts, sop-knowledge-worlds)', 'catalog', 'CC0 1.0', 'avatar popup'],
  ['TipTap and ProseMirror', '3.33.0', 'MIT', 'Documents tab'],
  ['Tone.js, abcjs', '15.1.22 / 6.7.2', 'MIT', 'Music tab'],
  ['Leaflet; Natural Earth; GeoNames', '1.9.4', 'BSD-2 / public domain / CC BY 4.0', 'Map tab (OpenStreetMap tiles online: ODbL)'],
  ['Chart.js, @kurkle/color', '4.6.1 / 0.3.4', 'MIT', 'Charts tab'],
  ['rough.js', '4.6.6', 'MIT', 'Drawing tab'],
  ['ONNX Runtime Web (WASM, CPU)', '1.31.1', 'MIT', 'runs the two small models in your browser'],
  ['bergamot-translator (WASM) and the Mozilla Firefox Translations models (downloaded when a language is selected)', '0.4.9', 'MPL-2.0', 'on-device translation where the browser has no Translator'],
  ['tonal (inside the worlds)', 'see worlds/*/vendor', 'MIT', 'music rules'],
  ['DistilBERT (distilbert-base-uncased), fine-tuned by this project', 'dispatcher', 'Apache-2.0', 'the dispatcher model'],
  ['FLAN-T5 small (google/flan-t5-small), fine-tuned by this project', 'normalizer', 'Apache-2.0', 'the phrasing normalizer'],
];

/** The one-line description used in the header, the page title and the greeting (DOC). */
export const TAGLINE = 'neurosymbolic · runs in your browser';
export const PAGE_TITLE = 'PSys2: a neurosymbolic assistant that runs in your browser, with no server and no large language model';
export const GREETING = 'Hi, I am PSys2. The SOP-BERT request reader is not ready yet. Typed commands leave your work unchanged; you can still use the area controls.';

/** Current application behavior, separate from historical experiments. */
export const ABOUT_SECTIONS = [
  ['What PSys2 is', 'PSys2 is a browser application with native drawing, diagram, document and calendar tools. Typed requests must pass through SOP-BERT and validated request graphs before changing a world.'],
  ['Reader readiness', 'SOP-BERT is the only application reader. A complete graph-producing model has not yet been deployed. There is no grammar fallback: unavailable, incomplete or unapproved proposals receive an explicit no-effect answer.'],
  ['How effects are checked', 'A complete proposal must resolve its targets and declared values, pass the native tool checks, and retain observations of the result. A native receipt alone is not proof that the requested outcome was achieved.'],
];
export const ACCURACY = [
  'No end-to-end SOP-BERT request accuracy is claimed yet.',
  'Auxiliary field and span calibration measures are reported separately from complete request understanding and execution.',
  'Development evaluation keeps setup failures and unreviewed outcomes visible rather than counting them as correct.',
];
