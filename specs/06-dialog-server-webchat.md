# 06 — C2 dialog pipeline, server API and the browser webchat

## Dialog pipeline (`src/dialog/`, browser-safe)
```js
const engine = await createEngine({ loader })   // loads all worlds via the loader
const session = engine.createSession({ language: 'auto' })
const reply = await session.send(text)
// reply = { text, parts, lang, translation, segments, wires, answers, statuses, trace }
```
Steps for every user message:
1. **Language**: detect; if not English, translate to English (spec 05). Keep the original as the source record.
2. **Formalize** with the rule formalizer over all loaded worlds (spec 03). Emitted wires go to session memory.
3. **Solve**: every `core.question` and `core.request` is resolved by the interpreter (spec 04).
4. **Render** each result with world templates; statements get acknowledgements; unparsed sentences get: `I did not understand "<sentence>".` plus up to two example sentences from the closest world (router score). The `capabilities` answer ("What can you do?") is one short sentence built from the `summary=` of every world manifest (spec 02).
5. **Back-translate** the reply if the user wrote in another language. The reply is built as **parts** `[{ text, translate, quote?, example? }]`: `translate: true` parts are back-translated (consecutive ones together), `translate: false` parts are kept verbatim. Text quoting the user (`I did not understand "<sentence>"`, the unknown words) is a `translate: false`, `quote: true` part holding the user's ORIGINAL sentence (found through the translation alignment), never the English translation. Each example sentence is translated separately by the translator and quoted as a `translate: false`, `quote: true`, `example: true` part; an example whose translation reports unknown words is omitted, and the whole lead-in is omitted when none is left. `reply.parts` exposes the final parts (already in the reply language; `reply.text` is their concatenation) so the webchat can style quotes.
6. Return the reply and a `trace` (segments, router scores, matched patterns, wires, operations called, statuses), which is the episode record (vision §7).

`engine.worlds()` lists loaded worlds; `session.memory()` returns the session wires as SOP Lang.

Tool-world additions (spec 07): `reply` also has `state` (snapshot of each world state that changed during the message, by world id), `effects` (`[{ name, args, world }]` in order) and `trace.intercepted` / `trace.effects` / `trace.formalizer` / `trace.routing` (one routing decision per segment: tier, reason, winner, runner-up, context; tier 1 for a modal intercept; spec 03 section 4, ADR-004). `session.context()` returns the routing context (active tab and its owner world, active game world, modal world, recent and last worlds); the host sets the active tab with `setWorldState('ui.shell', { activeTab })` and an active game with `{ activeGame: '<world id>' }`. `session.state(worldId?)` returns the current state; `session.setWorldState(worldId, patch)` is the host's way to change state (a click on a tab): shallow merge, no reply, no effects; `session.observe({ effect, ok, detail })` records a `core.observation` wire. Correction phase (spec 03 section 1c, review G2): `send` first resolves self-corrections ("knight to f3, no, knight to c3") on the whole English message, ahead of the modal interceptors, discourse and formalization; the result is `trace.selfCorrections`. Modal input: before formalization the engine offers the (translated) text to `interceptInput(ctx, text)` of every world whose state has a truthy `inputMode`; the first `{ handled: true, reply? }` consumes the message. `engine.formalizers` is `{ rules, encoder }`; `session.formalizer` (writable), `createSession({ formalizer })` and `send(text, { formalizer })` choose the preference.

## Loaders
- Node: `src/loaders/fs-loader.mjs` reads `worlds/*/` and imports `ops.mjs` with dynamic `import()`.
- Browser: `src/loaders/bundle-loader.mjs` reads a bundle produced by `scripts/build-webchat.mjs` (`worlds/index.json` with file texts) and imports each world's `ops.mjs` from its copied path.

## Server (`src/server/`, Node only)
`node src/server/index.mjs [--port 8080]` — `node:http`, no framework. JSON in and out.
| Method and path | Behaviour |
| --- | --- |
| `GET /v1/health` | `{ ok, version, worlds }` |
| `GET /v1/worlds` | world manifests |
| `GET /v1/worlds/{id}` | manifest, legend summary, tests summary |
| `POST /v1/sessions` | `{ language?, formalizer? }` → `{ sessionId }` |
| `POST /v1/sessions/{id}/messages` | `{ text }` → reply object |
| `GET /v1/sessions/{id}/memory` | session wires as SOP Lang (`text/plain`) |
| `POST /v1/learn/*`, `POST /v1/worlds/{id}/improvements` | `501` with a pointer to the vision (C1/C3 not implemented) |

Sessions are kept in memory with an idle timeout (30 min). No LLM is reachable from this process.

## CLI (`src/cli.mjs`)
- `node src/cli.mjs chat` — interactive C2 dialog in the terminal.
- `node src/cli.mjs test-world <id|all> [--jobs N]` — runs the world's `tests.sop`. `all` runs the worlds in `min(N, worlds)` worker threads (default `os.availableParallelism()`, `--jobs 1` = in-process); lines are printed in world order and the exit code is the same as a serial run.
- Parallel evaluation tools (`scripts/lib/shard.mjs`): `scripts/eval-operational.mjs`, `eval-rules.mjs`, `eval-dispatch.mjs` and `npm test` (`scripts/run-tests.mjs`) take `--jobs N` (default all cores). `eval-operational --jobs 1` is the single-thread CPU latency measurement; with N > 1 each worker loads the engine and the ONNX session once (intraOpNumThreads 1), results are merged in the original order and totals are identical, but per-message latency (measured inside the worker) includes CPU contention. The output states the mode (`single-thread` or `sharded xN`).
- `node src/cli.mjs parse <file.sop>` — parse and report errors.
- `node src/cli.mjs formalize "<text>"` — print the emitted wires.

## Webchat (`docs/webchat/`)
A static page that runs C2 entirely in the browser, with no server: the same `src/` modules copied by `scripts/build-webchat.mjs` into `docs/webchat/lib/` and the worlds bundled into `docs/webchat/worlds/`. It shows the chat, and on demand the trace (wires, patterns, operations) so the demo makes the reasoning visible. It must work when opened from GitHub Pages (`/docs` folder) or any static server; ES modules require HTTP, so `file://` is not a supported way to open it.

### Webchat features (ADR-002)
- Language selector: interface, speech recognition and speech synthesis language (English and Romanian at least).
- Translation: `browser-api` strategy when the browser offers an on-device translator (feature-detected), otherwise the `rules` translator; the trace shows which one was used and whether the checker fell back.
- Language detection: setting `languageDetection` (`auto` default | `browser-api` | `rules`). The browser `LanguageDetector` (or older `ai.languageDetector`) is used when present; its result is mapped to en/ro/unknown (other languages and confidence below 0.5 are `unknown`, so the session language is kept); the `rules` detector is the backup (API missing, downloading, throwing, or input under 3 letters). The trace shows which detector ran. Demo only: `src/translate` is unchanged.
- Microphone button: dictation with the Web Speech recognition API in the selected language; the recognized text is sent as a message.
- Speaker toggle: when on, every answer is read aloud with the speech-synthesis API in the selected language.
- Missing browser APIs disable the corresponding control with a tooltip; nothing else depends on them.

## Formalizer strategies (one interface)
The rule formalizer (spec 03) and the encoder formalizer (vision §5, ModernBERT + per-world LoRA) implement one interface, so everything after formalization (interpreter, operations, tools, effects, rendering) is identical whichever formalizer produced the wires; only the quality of the SOP Lang differs.

```js
// src/formalizer/strategy.mjs
{ id: 'rules' | 'encoder', available(): boolean | Promise<boolean>, supports(world): boolean,
  formalize(text, { worlds, session, source }) -> same result shape as spec 03 }
```
- `createRulesFormalizer()` — always available; supports every world that has `patterns.sop`.
- `createEncoderFormalizer({ endpoint })` — talks to an inference worker (vision §13); until one exists it reports `available() === false`.
- `createDispatcherFormalizer({ load, getPolicy })` (`src/dialog/encoder-dispatch.mjs`) — the in-browser encoder strategy: a small dispatcher model (DistilBERT int8 ONNX) proposes segmentations and the top-3 worlds per piece, the rule validation layer (spec 03 §7) picks the reading, the rules of the chosen world produce the wires. It is installed as `engine.formalizers.encoder` by the host and attached with `attach(engine)`; the model is loaded lazily (`prepare()` or the first message), `onStatus(fn)` reports `idle | loading | ready | error`. When validation fails or the model cannot load, the segments come back unparsed / the strategy is unavailable and the rule formalizer is used. `reply.trace.dispatch` carries the candidates and why the winner won (spec 03 §7.7).
- Selection: the session setting `formalizer` (`'rules'` in the library; the webchat defaults to `'encoder'`) is a preference. For each world, the preferred strategy is used if it is available and `supports(world)`; otherwise the rule formalizer is used. The trace records, per segment, which strategy produced the wires.
- The webchat settings panel exposes the choice; the server accepts `{ formalizer }` when creating a session.

### Webchat model loading and leniency settings
- **Settings version** (`docs/webchat/ui/settings.mjs`, `SETTINGS_VERSION = 2`): defaults `formalizer: 'encoder'`, `spellcheck: true`, `partialUnderstanding: true`. A saved v1 record (no `settingsVersion`) with `formalizer: 'rules'` was the old default, not a choice, so it is migrated to `'encoder'` once and written back with the new version; any later explicit choice is saved with the current version and respected. Unknown values fall back to the default.
- **Model loading** (`docs/webchat/ui/dispatcher-host.mjs`): at page load `models/dispatcher/meta.json` is fetched with `cache: 'no-cache'`; the model files are kept in the Cache API (`psys2-dispatcher-model`) under keys carrying `meta.version.sha256`. Same sha256: loaded from the cache without a download. New sha256: downloaded, verified against it (a mismatch is an error, so a half-published deploy never runs a wrong model), cached, and all older versions deleted. Offline with a cached model: the cached `meta.json` copy is used. The model loads in the background (`createDispatcherFormalizer({ waitForModel: false })`: `available()` is false until `ready`, so the rules answer meanwhile); the status line reads "Model loading…" and then "Ready · model <version>" (+ "(cached)"). A failure shows one notice line and the rules stay in use; the saved setting is not changed.
- **Leniency settings**: "Spellcheck" sets policy `trySpell` and the session option `spell`; "Partial understanding" sets policy `acceptPartial` and the session option `partial` (spec 03 sections 7.9 and 7.10). The reply tells what was corrected (`(I read "yes" as "eyes")`) and what was ignored (`I understood only part of that: I did not use "..."`).

### Performance (PERF)
Measured with `scripts/perf-webchat.mjs` (headless Chrome, 390x844, 4x CPU throttle; puppeteer-core from a scratch install, see the script header).
- **Stage timing**: `src/formalizer/perf.mjs` keeps one record per top-level `DialogSession.send`; the reply carries it as `reply.perf = { total, stages: { name: { n, ms } } }` (stages are inclusive: `formalize`, `encoder`, `predict`, `ort`, `tokenize`, `validate`, `seed`, `check`, `normalizer`, `lenient`, `discourse`, `interpret`, ...). The webchat adds `engineMs`, `render`, `effects`, `totalMs`, shows the stages in the trace ("Timing"), pushes every record to `globalThis.__psys2Perf` and, with `?perf=1` in the URL, draws them in an overlay. Nested sends (scratch sessions) do not open records.
- **Validator seeds** (root cause of the slow encoder setting): `check` used to build a scratch session and replay the last six messages for every candidate (about 40 candidates per message, each replay re-detecting the language through the browser API). The seeded session is now built once per context (`seed`) and every check works on `DialogSession.forkForValidation()` (a copy of the interpreter session: memory overlay, world state, form state). Replays use language `en`. Readings are identical (test `tests/perf-fork.test.mjs`, and the operational set in encoder mode gives byte-identical replies).
- **Best effort with loose words** (`bestEffort`, session option, `RUNTIME_DEFAULTS.bestEffort = true`, webchat checkbox "Best effort with loose words", on by default; the `DialogSession` library default is off so that unit tests keep exact answers): when a message is ONE clause that nothing read (rules, spelling, partial understanding, normalizer, discourse all failed), the dialog builds a sentence from the content words and executes it, saying "I took that as: ..." (spec 03 section 7.15). `send(text, { bestEffort })` overrides per message; `sessionOptions(settings)` passes the flag, so the webchat and the evaluators share it. A/B in the evaluators: `--best-effort on|off` (`scripts/eval-operational.mjs`, `scripts/eval-dialogues.mjs`, reported in `config.policy`), and `scripts/eval-loose-words.mjs` runs every row with the flag off and on.
- **Fast path** (session option and webchat setting `fastPath`, default on in the webchat, off in `RUNTIME_DEFAULTS`; evaluation modes `encoder+fast`, `encoder+n1+fast`): in the encoder setting, a single-clause message (no `, ; :` and no connective) that the rules read as ONE segment completely, without spelling correction or ignored words, and whose readings the interpreter accepts on a copy of the session, is answered by the rules without running the model. Everything else goes through the dispatcher and the validator as before.
- **Start-up**: models load after the page is usable (the hint message is shown), a scratch session warms the rules (pattern compilation, vocabularies) and then the model; `docs.reader` analyses its sample document once per page.
- **Thinking indicator**: on Send the message appears at once and the input clears; a "thinking... 0.8 s" bubble counts up live; each answer shows "answered in 340 ms".

### Phrase log (webchat Settings)
Collects every sentence a human typed or dictated, so real training data can be gathered. Implemented by `docs/webchat/ui/phrase-log.mjs` (pure functions plus a localStorage store); nothing in `src/` changes, the record is built from what `session.send()` returns.
- Record per user message: `id`, ISO `time`, `text` as typed or heard, `mode` (`typed` | `voice` | `chip`), `source` (`human`, or `chip` for example and suggestion buttons, which are not human phrasing), UI `lang`, `english` (the translation, when `reply.lang` is not `en`), active `tab`, `segments[]` (`text`, `status`, `world` and `pattern` from `segment.match`, `unparsed`, `strategy`; status comes from the answers addressed to the segment's wires), `unparsed`, `formalizer` (`reply.trace.formalizer.used`).
- Storage: localStorage key `psys2.webchat.phrases`, every access in try/catch, capped at 5000 entries (oldest dropped). On by default; the setting `logPhrases` ("Keep a log of my phrases (stays in this browser)") turns it off.
- Settings section: counts, filter (all / not understood only / voice only), scrollable list (newest first) with mode, world, status and per-entry Delete, Export JSONL (`psys2-phrases-YYYYMMDD.jsonl`, one record `{text, lang, english, mode, tab, worlds, status, time}` per line, in the spirit of spec 08; chips excluded), Copy as text (one phrase per line, chips excluded), Clear with an inline confirmation (no browser dialogs).
- Voice commands: `ui.shell` pattern `ui.phraseLog` ("show my phrase log", "export my phrases", "how many phrases have I said?") emits the effect `phraselog { what: show | export | count }`, which the host carries out.
