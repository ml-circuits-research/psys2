# PSys2 webchat

A static page that runs PSys2 C2 (operation) entirely in the browser: no server, no language model. The same `src/` modules run here, copied to `lib/`; the worlds are bundled into `worlds/`.

## Build and serve
```sh
npm run build:webchat          # writes lib/, worlds/ and build-info.json into docs/webchat/
cd docs && python3 -m http.server 8080   # any static server works; open http://localhost:8080/webchat/
```
ES modules need HTTP, so `file://` is not supported. For GitHub Pages publish the `/docs` folder (commit the build output) and open `/webchat/`. The build is idempotent and only replaces `lib/`, `worlds/` and `build-info.json`; `index.html`, `app.mjs`, `style.css` and `ui/` are hand-written sources. `node scripts/build-webchat.mjs --out <dir>` builds somewhere else (the test does this).

## Encoder formalizer (neural dispatcher + rule validation)
The **Encoder (dispatcher + rule validation)** is the default Formalizer (Settings, "Formalizer"; saved settings from before the version bump that still say "rules" are migrated once, an explicit later choice is respected). A DistilBERT dispatcher (int8, about 64 MB, ONNX Runtime Web WASM, single thread, no COOP/COEP needed) cuts the message into pieces and proposes the top-3 worlds per piece; the rules check every proposal and the winning reading produces the wires (spec 03 §7.7, spec 06). Rules stay the fallback for anything not validated. The model is loaded in the background as soon as the page opens; until it is ready the rules answer, and the status line reads "Model loading…" and then "Ready · model v<export date> <sha8>" ("(cached)" when it came from the browser cache). On every page load `models/dispatcher/meta.json` is fetched with `cache: 'no-cache'` and its `version.sha256` decides: the model files are stored in the Cache API under that sha256 (repeat visits start instantly, offline too), a newly published version is downloaded automatically (checked against the sha256) and every older cached version is evicted. If the model cannot be loaded the rules take over with one notice line. Two more settings, both on by default: **Spellcheck** (typos and chat abbreviations, spec 03 §7.9) and **Partial understanding** (do what was understood and say what was ignored, spec 03 §7.10); the trace shows corrections ("eyes ← yes") and ignored words. Trace: the trace of every answer then shows the candidate segmentations, the top-3 worlds with scores, which candidate validated and why the winner won. The setting "Accept parses the interpreter refuses" (default on) is the validation policy `acceptRefused`.
```sh
cd training && . ../.venv/bin/activate
python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert      # -> runs/export/dispatcher-distilbert/{model.onnx, model.int8.onnx, tokenizer/vocab.txt, ...}
cd .. && node scripts/build-webchat.mjs --models                          # copies model.int8.onnx, vocab.txt, meta.json to docs/webchat/models/dispatcher/
cd docs && python3 -m http.server 8080                                    # open http://localhost:8080/webchat/ , Settings -> Formalizer -> Encoder
```
The published model is committed in the repo (`docs/webchat/models/dispatcher/{model.int8.onnx, vocab.txt, meta.json}`, int8 only, never fp32, about 64 MB; GitHub Pages serves it with CORS, Release assets and Git LFS files would not work). If the model cannot be loaded (network error, missing file, WASM failure) the chat shows one notice line and the rules take over. Settings shows the model version from `meta.json` (`version` block). Without the model files the option reads "Encoder (not available)" and the rules are used.

**Publishing a new model version.** The build is idempotent: `build-webchat.mjs --models` copies `model.int8.onnx` and `vocab.txt` only when their content changed, and rewrites `meta.json` with a `version` block (checkpoint path, model name, dataset baseline commit and hash, export date taken from the export file, sha256 of `model.int8.onnx`, test-split world top-1/top-3 and segmentation F1 from `training/results/<name>.json`). A rerun with an unchanged checkpoint gives no git diff. If the export directory is missing it prints a notice and touches nothing. `--meta-only` regenerates `meta.json` from the already published model without copying anything. To publish: export the checkpoint, run the build with `--models`, overwrite the same three paths (never add a second model file), and make **one commit per model version** whose message names the checkpoint, the dataset commit and the headline metric, for example `D4b: publish dispatcher distilbert (ckpt runs/dispatcher-distilbert, dataset c989cd1, test world top-1 0.971 / top-3 0.994, seg F1 0.985)`. The repository keeps every old version in git history only (about 64 MB each), so publish sparingly.

`vendor/onnxruntime/` holds the runtime (MIT, see `vendor/README.md`); `ui/dispatcher-host.mjs` loads it lazily and hands the session to `lib/dialog/encoder-dispatch.mjs`. Check the JS path against Python: `node scripts/verify-dispatcher-js.mjs --export training/runs/export/dispatcher-distilbert --ort <onnxruntime-node entry>` (see the script header).

## Layout
| File | Role |
| --- | --- |
| `index.html` | Standalone page: mounts the app in `<main id="app">`. |
| `app.mjs` | `mountPsys2`, chat, settings, effect allow-list, speech wiring, state-to-UI mapping. |
| `ui/robot.mjs`, `editor.mjs`, `games.mjs` | Renderers for the tabs (own SVG/DOM code, no libraries, so no `vendor/` folder). |
| `ui/speech.mjs`, `translation.mjs`, `trace.mjs` | Web Speech, translation strategies with checker, trace panel (including the dispatcher candidates). |
| `ui/dispatcher-host.mjs` | Finds `models/dispatcher/`, lazily loads onnxruntime-web and the model for the Encoder formalizer. |

## State and effects
The host only renders world state and runs effects (spec 07). `reply.state` (and `session.state()` at start) is a map `worldId -> state`: `ui.shell.activeTab` selects the tab, `ui.avatar` draws the robot, `docs.editor` the document, `games.*` the boards. Effects are executed only from an allow-list: `speech.say`, `clipboard.copy`, `file.download`, `ui.focus`. Anything else is ignored; every outcome is reported with `session.observe({ effect, ok, detail })` when the engine offers it. A tab whose world is not in the build shows a placeholder.

## Speech and translation
Microphone (single shot), push-to-talk (hold the space bar when no input has focus), hands-free (continuous, paused while the speaker talks, auto-restart) and the speaker toggle use the Web Speech APIs; a control whose API is missing is disabled with a tooltip. When the language is not English, input is translated with the browser's on-device Translator API (feature-detected) or the rules translator in `lib/translate`; browser output must pass number, name, negation and question checks or the rules translator is used. The trace shows which one ran.

## Embedding as a chat widget
```html
<div id="chat" style="height: 560px"></div>
<script type="module">
  import { mountPsys2 } from '/webchat/app.mjs';
  const psys2 = await mountPsys2(document.getElementById('chat'), {
    tabs: [],                                  // chat only; or e.g. ['robot', 'editor']
    worlds: ['core', 'kids.common', 'kids.animals'], // optional allow-list (include what the worlds import)
    language: 'en', onboarding: false, persist: false,
  });
  psys2.send('hello');                         // also: psys2.session, psys2.engine, psys2.applyState(), psys2.destroy()
</script>
```
Options: `baseUrl` (where `lib/` and `worlds/` live), `worlds`, `tabs`, `language`, `title`, `onboarding`, `persist` (settings in localStorage), `pushToTalk`, `onReply(reply)`, `onState(states, changedIds)`. Styles are scoped under `.p2`; the layout adapts to the width of the element (container query), not the window.

## Language detection
Settings has a "Language detection" choice next to Translation: Automatic (the browser `LanguageDetector` API, with the rules detector as backup; default), Browser API, or Rules. Uncertain results (confidence below 0.5), other languages and very short inputs keep the session language or use the rules detector. The trace of each answer shows the detector used. See ADR-002.
