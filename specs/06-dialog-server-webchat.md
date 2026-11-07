# 06 — C2 dialog pipeline, server API and the browser webchat

## Dialog pipeline (`src/dialog/`, browser-safe)
```js
const engine = await createEngine({ loader })   // loads all worlds via the loader
const session = engine.createSession({ language: 'auto' })
const reply = await session.send(text)
// reply = { text, lang, translation, segments, wires, answers, statuses, trace }
```
Steps for every user message:
1. **Language**: detect; if not English, translate to English (spec 05). Keep the original as the source record.
2. **Formalize** with the rule formalizer over all loaded worlds (spec 03). Emitted wires go to session memory.
3. **Solve**: every `core.question` and `core.request` is resolved by the interpreter (spec 04).
4. **Render** each result with world templates; statements get acknowledgements; unparsed sentences get: `I did not understand "<sentence>".` plus up to two example sentences from the closest world (router score).
5. **Back-translate** the reply if the user wrote in another language.
6. Return the reply and a `trace` (segments, router scores, matched patterns, wires, operations called, statuses), which is the episode record (vision §7).

`engine.worlds()` lists loaded worlds; `session.memory()` returns the session wires as SOP Lang.

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
| `POST /v1/sessions` | `{ language? }` → `{ sessionId }` |
| `POST /v1/sessions/{id}/messages` | `{ text }` → reply object |
| `GET /v1/sessions/{id}/memory` | session wires as SOP Lang (`text/plain`) |
| `POST /v1/learn/*`, `POST /v1/worlds/{id}/improvements` | `501` with a pointer to the vision (C1/C3 not implemented) |

Sessions are kept in memory with an idle timeout (30 min). No LLM is reachable from this process.

## CLI (`src/cli.mjs`)
- `node src/cli.mjs chat` — interactive C2 dialog in the terminal.
- `node src/cli.mjs test-world <id|all>` — runs the world's `tests.sop`.
- `node src/cli.mjs parse <file.sop>` — parse and report errors.
- `node src/cli.mjs formalize "<text>"` — print the emitted wires.

## Webchat (`docs/webchat/`)
A static page that runs C2 entirely in the browser, with no server: the same `src/` modules copied by `scripts/build-webchat.mjs` into `docs/webchat/lib/` and the worlds bundled into `docs/webchat/worlds/`. It shows the chat, and on demand the trace (wires, patterns, operations) so the demo makes the reasoning visible. It must work when opened from GitHub Pages (`/docs` folder) or any static server; ES modules require HTTP, so `file://` is not a supported way to open it.
