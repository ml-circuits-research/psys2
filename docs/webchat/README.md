# PSys2 webchat

A static page that runs PSys2 C2 (operation) entirely in the browser: no server, no language model. The same `src/` modules run here, copied to `lib/`; the worlds are bundled into `worlds/`.

## Build and serve
```sh
npm run build:webchat          # writes lib/, worlds/ and build-info.json into docs/webchat/
cd docs && python3 -m http.server 8080   # any static server works; open http://localhost:8080/webchat/
```
ES modules need HTTP, so `file://` is not supported. For GitHub Pages publish the `/docs` folder (commit the build output) and open `/webchat/`. The build is idempotent and only replaces `lib/`, `worlds/` and `build-info.json`; `index.html`, `app.mjs`, `style.css` and `ui/` are hand-written sources. `node scripts/build-webchat.mjs --out <dir>` builds somewhere else (the test does this).

## Encoder formalizer (neural dispatcher + rule validation)
Settings, "Formalizer", option **Encoder (dispatcher + rule validation)**. A DistilBERT dispatcher (int8, about 64 MB, ONNX Runtime Web WASM, single thread, no COOP/COEP needed) cuts the message into pieces and proposes the top-3 worlds per piece; the rules check every proposal and the winning reading produces the wires (spec 03 §7.7, spec 06). Rules stay the fallback for anything not validated. The model is downloaded and started only when the option is selected (status in the settings panel and the status line); the trace of every answer then shows the candidate segmentations, the top-3 worlds with scores, which candidate validated and why the winner won. The setting "Accept parses the interpreter refuses" (default on) is the validation policy `acceptRefused`.
```sh
cd training && . ../.venv/bin/activate
python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert      # -> runs/export/dispatcher-distilbert/{model.onnx, model.int8.onnx, tokenizer/vocab.txt, ...}
cd .. && node scripts/build-webchat.mjs --models                          # copies model.int8.onnx, vocab.txt, meta.json to docs/webchat/models/dispatcher/
cd docs && python3 -m http.server 8080                                    # open http://localhost:8080/webchat/ , Settings -> Formalizer -> Encoder
```
`*.onnx` under `docs/webchat/models/` is gitignored (the model is rebuilt from the checkpoint). Without the model files the option reads "Encoder (not available)". `vendor/onnxruntime/` holds the runtime (MIT, see `vendor/README.md`); `ui/dispatcher-host.mjs` loads it lazily and hands the session to `lib/dialog/encoder-dispatch.mjs`. Check the JS path against Python: `node scripts/verify-dispatcher-js.mjs --export training/runs/export/dispatcher-distilbert --ort <onnxruntime-node entry>` (see the script header).

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
