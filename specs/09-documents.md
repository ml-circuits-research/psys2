# 09 — Documents: questions about files the user adds (world `docs.reader`, tab "Documents")

C2 world, no LLM, everything in the browser. The user drops a `.md`, `.txt`, `.pdf` or `.docx` file on the Documents tab (or uses "Add file"); the tab extracts text, `analyzeDocument` formalizes it, and questions are answered by operations over the formal document. Every answer cites sentence numbers; the tab highlights the cited sentences.

## 1. The formal document (`worlds/docs.reader/analyze.mjs`)
`analyzeDocument(text, { title, format, id, name, origin })` returns a plain JSON object (it lives in the world state):

| Part | Content | Method |
|---|---|---|
| sections, paragraphs, sentences | Markdown headings or heuristic headings; numbered 1-based; each sentence knows its paragraph, section, quote and speaker | `text.mjs` `toBlocks`, `splitSentences` (abbreviations, quotes, initials) |
| entities | characters, places, things; name, gender, number, first mention, aliases, role | capitalisation statistics, titles, role nouns, place and thing lexicons |
| mentions | `[entity, sentence, start, end, via, inQuote]` with `via` = name, role, pronoun | pronoun resolution by gender, number, recency, subject preference; identity merging (union-find) |
| events | agent, verb, object, place, time, negation per clause | clause split, agent + verb search, preposition phrases |
| dialogue | quote text, speaker, sentence | quote and speech-verb patterns, alternation |
| relations | kin (brother, mother ...) with inverse | "his sister", "their stepmother" |
| keywords | TF-IDF over paragraphs | `tfidfKeywords` |
| BM25 | over sentences (k1 1.5, b 0.75, stemmed, stop words removed) | `buildBm25`, `bm25Search` |

Facts are also written to the session as SOP Lang wires, once per document (`toSop`, two batches because refs need existing targets): `docs.reader.document`, `.sentence`, `.entity`, `.event`, `.said`, `.relation`, each with `core.source="<doc id>#s<n>"`. The wire of a sentence is `<doc id>.s<n>`; an operation's `from` lists the wires it cites, so an answer is traceable to its sentences (spec 04 provenance).

## 2. Question types
Answer text always ends with `(sentence N)` / `(sentences N, M and K more)` unless the answer is a list that names them. State `focus = { doc, sentences, entities, terms, n, emphasis? }` is set by every answer and drives the highlight.

| Question | Operation (`docr.*`) | Answer template (templates.sop) | Citation |
|---|---|---|---|
| describe the file | describe | title, words, sections, main characters, places, key words | none (summary of the whole) |
| summary, summary in k sentences, section N | summary | "In short: ..." k top sentences in text order (score = TF-IDF mass + position + length) | those sentences |
| who are the characters / who is in it | characters | list with mention counts | first sentence of each |
| main character | mainCharacter | name, count, runner-up, example | an example sentence |
| places / objects | places | list with counts | first mentions |
| key words | keywords | TF-IDF terms with counts | none |
| outline / how many sections | outline, stats | numbered headings with sentence counts; counts of words, sentences, paragraphs | none |
| who is X / tell me about X | who | kind, aliases, count, first sentence, example, attributes | first and example sentence |
| who is X's brother / how are X and Y related | relation, isRelated | relation phrase | the sentence that states it |
| what did X do | did | event phrases in text order, "tell me more" pages | sentences of the events |
| what happened to X | happened | events where X is object or patient | those sentences |
| where does X live / go / is X | where (mode live, go, be) | place of the matching event | event sentence |
| where did <event> / when did <event> | whereDid, whenDid | "<Agent> <verb phrase> at <place>" / time phrase | event sentence |
| who did <verb> Y / who <verb>ed | whoV, didV | agent list by verb lemma | event sentences |
| who said "..." | said | speaker and exact quote (only if a dialogue line matches) | the quote sentence |
| what did X say | saying | X's lines | those sentences |
| beginning, middle, end, section N | part | label and top sentences of that part | the sentences |
| read sentence N / read the ending / read section N aloud | sentence, read | confirmation text; effect `speech.say { text }` | the read sentences |
| how many times is X mentioned | count | count and number of sentences | all sentences with a mention |
| find / search / where does it say W | search | n results with the first five, BM25 order, exact phrase first; `search` state holds the hits | hits (the tab marks all, outlines the current) |
| next result / clear the search | searchStep, clearSearch | "Result k of n ..." | current hit |
| ask across documents / "in all my documents" | across | per-document best sentence | best sentences |
| my documents / open / close / load the sample | list, open, close, loadSample | list with [open] marker | none |
| tell me more | more | next page of the previous answer | next sentences |
| anything else naming a known entity | ask | BM25 over sentences, best three; if the best score is low: "The document does not say that" | closest sentences |

### Honest "the document does not say"
If an entity is known but no event, place, time or quote matches, the answer is `The document does not say <what>.` followed by "The closest sentences are: ..." (up to three, BM25 on the question terms and the entity name), status `supported` with `data.notSaid = true`. If the entity is unknown: "I could not find X in <title>. The characters I know are ..." (status `missing`). No answer is ever made up from outside the document.

## 3. Routing policy: who may answer what
- **Pattern layer** (`patterns.sop`): priorities 10 to 15. Patterns that need the word file, story, text, book, tale or title (as `lex.docs.reader.docs`) are safe anywhere. The editor world also says "document", so patterns that contain only "document" and an ambiguous verb stay below the editor's priority; the tab wins them because the active tab is the routing tier 3 (`routing.mjs`).
- **Free questions** (no document noun: "who is the witch", "what did she do", "where did they live", "who said ...", "find ..."): handled by `interceptInput` (modal input hook, spec 07 section 2) only while the tab is shown. The tab sets `{ visible: true, inputMode: 'documents' }` in its `show()` and `{ visible: false, inputMode: null }` in `hide()` (`host.setWorldState`). Off the tab nothing of this world matches generic who/what/why/where sentences; `interceptInput` also refuses a sentence unless it names a known entity, quoted text that is in a dialogue line, or has BM25 hits.
- Off the tab only sentences that name a document noun, a title, or one of the sample's cast match (the sample story is bundled and its cast is in `lexicon.sop`).
- `ui.help` owns generic help; `docs.reader` has none. A pattern-level attribute for "only when the tab is active" would replace the interceptor (host hook not needed today).

## 4. Tab (`docs/webchat/ui/tabs/documents.mjs`)
Document chips (switch, close), drop zone and picker, text view with numbered sentences (cited sentences filled, search hits yellow, the current hit outlined, entity mentions underlined and the focus entity green, search terms marked), outline, characters, places, keywords, "Try asking" chips, a search bar with Next and Clear. Every click is a typed command through `host.send`. Scrolls to `focus.emphasis`, else the current hit, else the first cited sentence.

File input: `.md` and `.txt` via `File.text()`; `.pdf` via pdf.js (lines to paragraphs by line length; no OCR, a scanned PDF is refused with a message); `.docx` via mammoth `convertToHtml` then headings to `#`, paragraphs and list items to blocks. Limit 12 MB.

## 5. Vendored libraries (`docs/webchat/vendor/documents/`, README row, `LICENSES.md`)
- `pdf.mjs` pdfjs-dist 6.5.438 `build/pdf.min.mjs`, unmodified, with header (Apache-2.0). `pdf.worker.mjs` is the second file (the worker cannot be bundled into the main file); it is loaded with `GlobalWorkerOptions.workerSrc`.
- `mammoth.mjs` mammoth 1.13.0, bundled with esbuild to one ES module (BSD-2-Clause; bundled dependencies keep their notices).
- Both load on first use only (dynamic import). No CDN.

## 6. Sample
`worlds/docs.reader/samples/hansel-and-gretel.md` (also `sample.mjs`): an original CC0 retelling of the fairy tale (685 words, 66 sentences, 4 sections). Project Gutenberg was not reachable, so no third-party text is bundled.

## 7. Known limits
- Heuristic NER and co-reference: names without capitals, nested or plural groups, and "it" for things are weak; pronoun links across paragraphs can be wrong. Entities of a user file are not in the lexicon, so patterns that need an entity word rely on the tab.
- Events are one clause, one agent; passive voice and long relative clauses are partly captured.
- PDF layout (columns, tables, headings) is flattened; docx tables and footnotes are skipped.
- English only. The "documents" tab alias is shadowed by the editor's lemma "document".
- Generator agreement (`datagen.mjs`) 98.7%; tests: 95 in `tests.sop`.

## 8. Conversation inside a document (dialogue-set audit)
- State: `section` / `sectionDoc` (the section last summarized or read) and `ctx` (`'section'` or `'result'`: what was shown last, a section or a search result), `awaiting` (`'search'` after "find it").
- Section references: `section N`, `the last section`, `the first section` (also after "and" / "what about", on the Documents tab), `the next / previous section`, `the one before / after that`, `that section` (`summarize that section`, `read that section again`), `go to the next section` (`rel` = same | next | prev in `docr.summary` and `docr.read`; at the ends: "Section 4 is the last one."). The discourse ellipsis also resolves "and section 1?" after "summarize section 2" (spec 11 section 10, label rule).
- `docr.pick` ("the last one", "the second one", "the one before that"): a search result when a search was shown last (`searchStep` with `at`), else a section. "Read a section aloud." asks which one (pending `n`).
- Search: "find it." asks what to look for and the next short answer is the query; "no, I meant oven" / "no, search for oven instead" right after a search replaces the query; trailing "instead / please / now / again" is not part of a query.
