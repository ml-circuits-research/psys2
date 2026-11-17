# Vendored third-party code (browser host only)

Each library is bundled into one file (or one folder for multi-file assets) with a header naming the library, version, source and licence. The engine and the worlds never depend on these files, except the rule libraries vendored inside worlds (listed at the end). All licences are compatible with the project's AGPL-3.0-only.

| Folder / file | Library | Version | Licence | Used by |
| --- | --- | --- | --- | --- |
| `editor/` | TipTap + ProseMirror (and linkifyjs, orderedmap, rope-sequence, w3c-keyname) | 3.33.0 | MIT | Documents tab |
| `music/` | Tone.js, abcjs | 15.1.22 / 6.7.2 | MIT | Music tab |
| `map/` | Leaflet; Natural Earth outlines; GeoNames places | 1.9.4 | BSD-2 / public domain / CC BY 4.0 | Map tab (OSM tiles online: ODbL, attributed) |
| `charts/` | Chart.js, @kurkle/color | 4.6.1 / 0.3.4 | MIT | Charts tab |
| `draw/` | rough.js | 4.6.6 | MIT | Drawing tab |
| `onnxruntime/` | ONNX Runtime Web (`ort.wasm.bundle.min.mjs` + its loader `ort-wasm-simd-threaded.mjs` + `ort-wasm-simd-threaded.wasm`, WASM CPU backend) | 1.31.1 | MIT | Sole SOP-BERT cutter/key reader, WASM CPU backend |
| `bergamot/` | bergamot-translator (`bergamot-translator-worker.js`, `bergamot-translator-worker.wasm`, `translator-worker.js`; the Mozilla translation models are NOT vendored: downloaded lazily, from the page host copies in `../../models-mt/` (Romanian; `scripts/mirror-mt-models.mjs`) or Mozilla's public bucket (CORS for localhost only), listed in `registry.json` built by `scripts/build-mt-registry.mjs`; `quality.json` = `scripts/mt-quality.mjs` result) | 0.4.9 | MPL-2.0 (engine and models) | On-device translation when the browser has no Translator API (lazy: only when a non-English language is selected) |

Rule libraries vendored inside worlds (so C2 reasoning stays deterministic and testable): `worlds/media.music/vendor/tonal.mjs` (tonal, MIT). World data: `worlds/geo.map` (GeoNames CC BY 4.0, world-countries ODbL, country-json MIT; see its data README).

Details per folder are in each `LICENSES.md`.

| `sop-tokenizer/bert-tokenizer.mjs` | Transformers.js BertTokenizer constructor only | 3.8.1 | Apache-2.0 / MIT dependencies, see subdirectory licences | Sole SOP-BERT reader tokenizer; no model/network loader or second ONNX runtime |
