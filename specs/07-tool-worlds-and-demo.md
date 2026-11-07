# 07 — Tool-use worlds and the hands-free browser demo

Goal: show PSys2 as an agent that *does things* with client-side tools, controlled entirely by voice or text, with no LLM: the same formalize → plan → execute → observe loop as every other world (vision §8, effectful operations), applied to an app. The end use cases are a chatbot embedded in a website, and a tool to talk with a document and create documents from the context of the conversation.

## 1. Principle: worlds own state, the host renders it
- Every tool world keeps its state in `ctx.state` (spec 04), a plain JSON object per world and session. Operations with `semantics=action` change it. Tests and the CLI check the state directly, so tool worlds are as testable as any other world.
- The **host** (the webchat page, or a website embedding PSys2) only renders state and executes **effects** that cannot be state (speaking a text now, copying to the clipboard, downloading a file, focusing an element).
- `ctx.effect(name, args)` queues an effect. `session.send()` returns, besides the usual reply fields, `state` (a snapshot of every world's state that changed) and `effects` (the queued effects, in order). The host executes effects only from its allow-list (capabilities); unknown effects are ignored and reported back.
- Observation: the host may report an effect's outcome with `session.observe({effect, ok, detail})`, which records a `core.observation` wire in the session (vision §8: observations confirm or refute expected effects).

## 2. Modal input
Some tools need raw text instead of commands (dictation). A world may export `interceptInput(ctx, text)` from `ops.mjs`. Before formalization, the dialog engine calls the interceptors of worlds whose state has `inputMode` set; the first that returns `{ handled: true, reply? }` consumes the message. Dictation uses this: while `docs.editor` is dictating, text goes into the document, except control phrases (`stop dictation`, `new paragraph`, `new line`, `undo that`, `delete the last sentence`).

## 3. Worlds
All are `status=fixture`, English, `formalization=rules`, with tests that assert state and effects.

### `ui.shell` — app control and voice settings
State: `{ activeTab: 'robot'|'editor'|'tictactoe'|'guess'|'hangman', speaker: bool, listening: bool, handsFree: bool, rate: number, language: 'en'|'ro' }`.
Commands: "open the editor", "show me the robot", "let's play tic tac toe", "go back"; "turn on/off the speaker", "speak slower/faster", "stop listening", "hands-free mode on", "switch to Romanian"; "what can I say here?" (help for the active tab, from the active tab world's pattern examples).

### `ui.avatar` — the robot face (default tab)
State: `{ name, faceColor, faceShape: 'round'|'square'|'oval', eyes: { size: 'small'|'medium'|'large', shape: 'round'|'square'|'oval'|'star', color }, mouth: 'smile'|'neutral'|'open'|'sad'|'surprised'|'grin', look: 'center'|'left'|'right'|'up'|'down', antenna: { on, color }, hat: 'none'|'cap'|'crown'|'party'|'wizard', accessory: 'none'|'glasses'|'bowtie'|'mustache', ears: bool, blink: bool }`. Colors are named colors from a fixed list of about 20.
Commands: "make your eyes bigger", "make your face green", "smile", "look left", "wink", "put on a crown", "take off your hat", "give yourself glasses", "your name is Robi", "make your antenna red", "reset your face", and questions about it: "what color are your eyes?", "what are you wearing?". The host may also set the mouth from the reply status (smile for supported, surprised for missing) without changing stored state.

### `docs.editor` — talk with a document, dictate, edit, create documents
State: `{ title, blocks: [{ id, kind: 'heading'|'paragraph'|'list', text?, items? }], cursor, inputMode: null|'dictation', history: [snapshots for undo, max 50] }`.
- Dictation: "start dictation" … "stop dictation"; punctuation words ("comma", "period", "question mark") converted.
- Editing: "add a heading Shopping", "add a paragraph …", "add a list with milk, eggs and bread", "delete the second paragraph", "replace cat with dog", "move the last paragraph to the top", "make the title …", "undo", "redo", "clear the document".
- Reading and asking: "read the document", "read paragraph 2" (effect `speech.say`), "how many paragraphs are there?", "what is the title?", "does the document mention milk?".
- Creating documents from the conversation (the agentic showcase): "make a document from my shopping list", "write a report about sea animals", "write down what Tom and Ana have" — operations call other worlds through `ctx.ask` (kids.tasks, kids.animals, kids.arith), compose blocks with templates, switch to the editor tab and read the title aloud. Every created sentence comes from wires (no generated text); the document carries the source wire ids.
- Export: "copy the document" (effect `clipboard.copy`), "download the document as text/markdown" (effect `file.download`).

### Games (voice- or chat-controlled)
- `games.tictactoe` — state `{ board: 9 cells 'X'|'O'|'', user: 'X', turn, winner, level: 'easy'|'perfect' }`; moves by name ("top left", "center", "bottom right", "middle row left") or coordinates ("B2"); the system answers with its move (minimax for `perfect`); "new game", "who is winning?", "let me go second".
- `games.guess` — twenty questions where **PSys2 guesses the user's animal** by asking yes/no questions chosen from the kids.animals knowledge base (split the remaining candidates as evenly as possible); answers "yes", "no", "I don't know"; at the end it names the animal or admits defeat and asks the user to teach it ("it was a zebra" → a session fact). Shows the knowledge base and planning at work.
- `games.hangman` — a word from the kids.animals or kids.shapes lexicon; "is there an E?", "the letter R", "is it elephant?", "give me a hint" (a fact about the animal from the KB).

## 4. The demo page (`docs/webchat/`)
- Layout: chat on the left (30% of the width, WhatsApp-like bubbles, timestamps, a status line showing listening/speaking), tabs on the right (Robot — default, Editor, Tic-tac-toe, Guess the animal, Hangman). On narrow screens the tabs stack under the chat.
- Hands-free: a hands-free toggle (also by voice) keeps speech recognition running continuously; recognition pauses while the speaker is talking, to avoid hearing itself; push-to-talk with the space bar when the chat input is not focused; the microphone and speaker buttons of ADR-002 remain.
- Every voice or text command goes through the same `session.send()`; tab switching, avatar changes, edits and game moves all come from world state, so the whole demo is controllable without mouse or keyboard.
- A collapsible trace panel shows, per message, the matched pattern, the wires, the operations and the effects: the visible proof that no LLM is involved.
- Embedding: the same engine and host code can be mounted in another page as a chat widget (`mountPsys2(element, { worlds, tabs })`), which is the website-chatbot use case.
