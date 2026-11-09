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
  ['chess.js, tonal (inside the worlds)', 'see worlds/*/vendor', 'BSD-2 / MIT', 'chess and music rules'],
  ['DistilBERT (distilbert-base-uncased), fine-tuned by this project', 'dispatcher', 'Apache-2.0', 'the dispatcher model'],
  ['FLAN-T5 small (google/flan-t5-small), fine-tuned by this project', 'normalizer', 'Apache-2.0', 'the phrasing normalizer'],
];
