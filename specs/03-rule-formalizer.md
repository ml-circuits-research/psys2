# 03 — The rule-based formalizer (`formalization=rules`)

A light formalization strategy built from patterns and heuristics, declared per world. It runs on any CPU and in the browser, needs no model, and is used to bootstrap worlds quickly, to generate and check training data for the encoder strategy (vision §5–6), for tests, and wherever speed matters more than full coverage of natural language. See ADR-001. Input is English (other languages are translated first, spec 05).

Implementation: `src/formalizer/rules/` (browser-safe). Interface:

```js
formalize(text, { worlds, session, source }) -> {
  segments: [{ text, span:[start,end], isQuestion, worlds:[{id, score}], match: { patternId, worldId, slots } | null,
               wires: Wire[], unparsed: boolean }],
  wires: Wire[]          // all emitted wires, in order
}
```

## 1. Normalization and segmentation
1. Split into sentences on `.`, `!`, `?` (not inside numbers like `3.5`), keeping offsets; `?` marks a question. A sentence that starts with a question word (`how`, `what`, `who`, `where`, `when`, `which`, `why`, `is`, `are`, `does`, `do`, `can`, `did`) is also a question.
2. Tokenize: words, numbers, `'s`, and the arithmetic symbols `+ - * / × ÷ =` (`×` and `÷` become `*` and `/`) when they stand between two numbers (`7+5`, `12 - 4`, `3 × 4`) or `=` right after a number (`7 + 5 =`); anywhere else they are dropped. A `-` directly before a digit and not after a word or digit is a negative number (`-3`). Keep the original casing of each token (needed for names) and a lowercase form for matching.
3. Expand contractions (`doesn't` → `does not`, `isn't` → `is not`, `I'm` → `I am`, `what's` → `what is`, `don't` → `do not`, `can't` → `can not`).
4. Number words to digits: `zero`…`twenty`, tens, `hundred`, `thousand`, combinations (`twenty-one`, `one hundred and five`), `half` → `0.5`, `a dozen` → `12`.
5. Drop filler tokens anywhere: `please`, `ok`, `okay`, `well`, `so` (sentence-initial), `um`; drop sentence-initial `and`, `then`, `after that`.

### 1b. Typo tolerance

When no pattern matches a sentence (and no clause of it), the formalizer retries **once** with the unknown words corrected to the closest known word. The vocabulary is every literal of every pattern plus every word of every lexicon of the loaded worlds (multi-word entries split into words, plural forms included). Distance is Damerau-Levenshtein (insert, delete, substitute, swap neighbours): 1 for words of 4 to 7 letters, 2 for words of 8 or more, none below 4. Never corrected: numbers, text in quotes, capitalized names (except the first word), words with digits, apostrophes or hyphens, words that are already known (also by lemma), and words with two equally close candidates. At most three words per sentence. The corrections are recorded as `segment.corrections = [{ from, to, span }]` (also in the trace) and the dialog appends `(I read "suprised" as "surprised")` to the reply. A sentence that matched without correction is never touched.

## 2. Patterns
```
@pat.arith.has core.pattern
    match="{who:agent} [has|have|had|got] {n:number} {item:noun}"
    emit="@{_} kids.arith.holding owner={who} count={n} item={item}"
    kind=statement
    priority=10
    example="Tom has 5 apples."
```
### Match syntax (token level, anchored to the whole sentence without its final punctuation)
| Element | Meaning |
| --- | --- |
| `word` | literal token (case-insensitive) |
| `[a\|b\|c]` | exactly one of the alternatives; an alternative may be multi-word with `_` (`[how_many\|how_much]`) |
| `[a\|b]?` | optional alternative |
| `{name:class}` | capture one item of the given class |
| `{name:class?}` | optional capture |
| `{name:class(args)}` | class with arguments: `words(20)`, `recent(<lexicon>,<agent slot>)` |
| `...` | skip 0–4 arbitrary tokens (lazy) |

### Slot classes
| Class | Accepts | Captured value |
| --- | --- | --- |
| `number` | one numeric token | atom (`5`, `2.5`, `-3`) |
| `word` | any single token | atom (lowercase) |
| `words` | 1–12 tokens, lazy; `words(N)` sets the maximum to N | string (original text) |
| `recent(<lexicon id>,<agent slot>)` | zero tokens: ellipsis. The item of that lexicon most recently mentioned together with the agent captured by `<agent slot>` (an earlier slot of the pattern), else the one most recently mentioned in the session. No such item: the pattern does not match (no guessing) | atom: the lexicon entry |
| `noun` | a single word, or a multi-word lexicon noun | atom: singular lemma, `_` joins multi-word (`ice_cream`) |
| `<lexicon id>` (e.g. `lex.kids.animals.names`) | a word (or multi-word entry) whose singular lemma is in that lexicon | atom: the lexicon entry |
| `agent` | a person: a capitalized token that is not a known lowercase word, or a name from any `class=name` lexicon, or a pronoun | reference to an agent entity (`$e.tom`) |
| `unit` | a token in any `class=unit` lexicon or the quantity unit table | atom |
| `rest` | all remaining tokens up to the end of the sentence (1 or more), commas kept in the text; use it last, for free text (dictation, titles) | string (original text) |

Singular lemma: irregular plurals from `plural=` lexicon entries first; (and a few built-in Latin plurals: `cacti`, `octopi`, `fungi`); then `ies`→`y`, `ves`→`f`, `(ch\|sh\|x\|ss)es`→drop `es`, `-us` plurals (`octopuses`, `buses`, `viruses`, `walruses`, `cactuses`)→drop `es`, `s`→drop. Singular nouns ending in `ss`, `us` or `is` (`glass`, `octopus`, `iris`) keep their `s`; a short list of `-is` plurals (`kiwis`, `taxis`) still loses it. The lemma is used for matching lexicons and in emitted atoms.

Optional elements and lazy skips are tried in a backtracking matcher; the first full match in left-to-right, prefer-consume order wins for one pattern.

### Emit templates
`emit` is SOP Lang with placeholders:
- `{slot}` → the slot value (atom, or `$id` for agents); inside a string (`"{slot}"`) the original text, JSON-escaped.
- Ellipsis: the formalizer remembers, per session, the item (value of a lexicon slot) mentioned with each agent; `recent(...)` slots read it. Example: `Tom has 5 apples. He gives 2 to Ana.` reads the second sentence as `give who=Tom to=Ana count=2 item=apple`.
- `{_}`, `{_1}`, `{_2}`, … → fresh wire ids, unique per session (`w17`, `w18`).
- An optional slot that was not captured removes the whole `key={slot}` entry.

The engine adds to every emitted wire: `core.via=$<patternId>`, `core.source="<source>#<start>-<end>"`, `core.seq=<n>` (strictly increasing per session; it orders events) and `core.in=$<worldId>`.

### Pattern kinds
- `statement` — asserts facts or events into session memory.
- `question` — emits a `core.question` (spec 04).
- `request` — emits a `core.request` (an action or task).
- `chat` — conversational acts (greetings, thanks); emits `core.request action=<op>` handled by a world operation.

## 3. Entities and reference
- An `agent` slot creates (first mention) or reuses an entity wire `@e.<lowercase name> core.agent name="Tom"` in session memory, with `gender=m|f` if a name lexicon says so.
- Pronouns: `he`/`him`/`his` → most recent agent with gender `m` or unknown; `she`/`her` → `f` or unknown; `they`/`them` → most recent agent; `I`/`me`/`my` → `e.user`; `you` → `e.assistant`. An unresolvable pronoun makes the pattern fail for that sentence (no guessing).
- Mentions are tracked in order of appearance; questions also update recency.

## 4. Choosing a reading
For each sentence:
1. Try every pattern of every loaded world (patterns are cheap).
2. Order the full matches with the **routing policy** (`src/formalizer/routing.mjs`, ADR-004), which knows the application state. The dialog session passes a context `{ activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld }`. Tiers, smaller wins:
   1. **Modal intercept**: a world with an open modal input consumes the sentence before formalization (spec 07 §2).
   2. **Navigation / meta**: `ui.shell` requests without wildcard captures. 2a: naming a tab (`ui.openTab`, `ui.playGame`) always wins. 2b: settings and meta (speaker, listening, hands-free, rate, language, phrase log, help, which tab, go back) win over every other match of equal or lower priority (a world that claims the phrase with a higher priority keeps it: "Where am I?" on the map).
   3. **Active tab**: a match from the world that owns the active tab wins over other worlds, and `ui.shell` game controls (new game, give up, hint) count as the tab's when the tab belongs to a `games.*` world. Exception: another world's match wins when the tab's match is a catch-all (its wildcard captures, `rest`/`words`/`...`, are more tokens than its literal words) and the other match has no wildcard capture and at least two more literal words.
   4. **Recent**: the world with an active game, then the worlds that produced the last readings, most recent first.
   5. **Everything else**: by `priority`.
   Inside a tier: `priority`, number of literal tokens, fewer `...`/`words` captures, router score of the world, pattern order. If the tab world has no match, nothing is claimed by the tab, so cross-world questions ("How many legs does a spider have?" on the editor tab) work.
   Every segment and the trace carry the **decision**: `{ router, tier, tierName, reason, winner, runnerUp, contested, context }`. A learned router (for example a ModernBERT/LoRA head over state + text) plugs in through `createRouter({ id, model })` with the same `route({ matches, context, scores, tokens })` interface.
3. If no pattern matches the whole sentence, split it into clauses at `,`, `and`, `then`, `but` (one level) and match each clause; a clause that still fails is reported as unparsed.
4. Matches from different worlds with the same tier, rank and literals that emit different wires are kept as **alternatives**; the dialog layer reports the ambiguity instead of choosing silently (vision §7).

## 5. Router
Scores every loaded world for each sentence: `+5` if one of its patterns matches the sentence, `+1` for each token whose lemma is in one of its lexicons (`trigger` entries `+2`). Worlds with score > 0 are candidates (top 3 reported). The router is used for reporting, for ordering ties, and later for restricting the encoder strategy, which cannot afford to try every world.

## 6. Training-data export
Because every emitted wire carries `core.source` offsets and the slot spans, the rule formalizer can export encoder training records (vision §6: text, mentions, key spans, references, label status `generator-backed` or `rule-derived`). `scripts/export-training.mjs` writes JSONL for `training/`. With `--routing-context` the generator's own world is the active tab (`routing` is attached to each record) and the report gives the agreement with and without that context, so cross-world ties are labelled by context instead of counted as disagreements.

## 7. Dispatcher validation layer
A learned **dispatcher** (one small shared encoder, worker-tasks D1) proposes how to cut a message and which worlds own each piece. It never produces circuits. The rule formalizers **validate** its proposals (ADR-005). Implementation: `src/dialog/dispatch-validate.mjs` (browser-safe, no `node:*`), evaluation: `scripts/eval-dispatch.mjs`.

### 7.1 Input contract (dispatcher prediction, one JSON object per line)
```
{ id, text,
  context: { tab, recent_worlds: [world...], session: [earlier user messages...] },
  boundaries: [{ offset, p }],                      // optional, per-token boundary probability (informational)
  segmentations: [                                  // beam <= 4, most likely first
    { score,                                        // log-probability of the segmentation (<= 0)
      segments: [ { start, end, text,               // character offsets in `text` and the piece text
                    worlds: [{ world, score }],     // top-3, most likely first; score is a probability in [0,1]
                    simplified? } ] } ],            // optional cleaner variant of the piece (edit-tag head)
  gold? }                                           // ignored by the validator
```
`id` must be the dataset record id so the evaluation can join gold: the id of a `training/dataset/<world>/test.jsonl` record, of a `routing.jsonl` test row, or of a `multicmd/test.jsonl` message (`mc......`). Parsing is tolerant (`normalizePrediction`): negative world scores are read as natural-log probabilities, `worlds` entries may be `[world, score]` or bare ids (rank-based score), `p`/`prob` may replace `score`, a segmentation may be a bare list of segments, a missing `segmentations` becomes one segmentation of the whole text using the record's `worlds`, `simplified` equal to `text` is dropped, missing `text` of a piece is sliced from `start`/`end`.

### 7.2 Checking a candidate
For every piece, every candidate world (score order, up to `maxWorlds`) and every text variant (original, then `simplified` when present and `trySimplified`), a **fresh dialog session** is seeded exactly as the dataset records are: active tab (`ui.shell` state), recent worlds, then the `session` messages. When `intersegmentContext` is on, the pieces chosen earlier in the same segmentation are replayed first, so pronouns and elliptic sentences see what the earlier pieces said. The candidate is then formalized with the rule formalizer **restricted to the candidate world and its `extends`/imports** (a view of the world set with only those worlds), with the session's routing context and the engine's router. The wires of parsed segments are added to the session and every wire is resolved by the interpreter.

A candidate is **valid** when
1. every segment the rules found is parsed (no unparsed token group) and at least one segment exists, and
2. the interpreter returns neither `unsupported` nor `error` for any wire (`missing`, `conflicting`, `budget` and `supported` are fine: the sentence was understood, the state may lack facts).

A candidate that parses completely but is refused by the interpreter is `refused` (typical: an illegal chess move, a drawing command with nothing drawn). With `acceptRefused` it counts as valid with a smaller penalty (default off, as specified; the evaluation reports both).

### 7.3 Scoring (log domain, all weights are policy options, defaults in `DEFAULT_POLICY`)
For a piece, each candidate (world w, variant v) scores
`s = worldWeight * ln(max(p_w, scoreFloor)) - simplifiedPenalty * [v is simplified] - penalty`, with `penalty = 0` when valid, `interpreterPenalty` when refused and `acceptRefused`, else `unparsedPenalty`.
The piece takes its best candidate. A segmentation scores `segWeight * seg.score + sum of the piece scores` (a piece with no candidate contributes `-unparsedPenalty + ln(scoreFloor)`). Defaults: `segWeight 1`, `worldWeight 1`, `unparsedPenalty 6` (about x 0.0025), `interpreterPenalty 3`, `simplifiedPenalty 0.05`, `scoreFloor 1e-6`, `tieEps 1e-6`, `maxSegmentations 4`, `maxWorlds 3`. The winner is the segmentation with the highest score (ties keep the dispatcher order). The result is `understood` iff every piece of the winner is valid.

### 7.4 Ties and routing policy
Candidates of one piece whose scores differ by at most `tieEps`, same text, different worlds, are tied. The tie is broken by the routing policy of section 4: the text is formalized with the tied worlds together (same session, same context) and the router's winner is chosen, so the tiers apply unchanged (modal, navigation, active tab, game/recent worlds, priority). The decision tier and reason are recorded in the trace.

### 7.5 Result and trace
`validateDispatch` returns `{ id, text, status: 'understood' | 'not_understood', winner: { index, score }, produced: [{ start, end, text, world, textUsed, usedText, wires, sop }], notUnderstood, why, trace }`.
- `notUnderstood` (only when nothing validates) holds the best segmentation's failing pieces with their candidate worlds (`pieces[].candidateWorlds`, `candidateWorlds`), so `ui.help` can say "Did you mean ...?" with examples from those worlds.
- `trace.segmentations[]` lists every segmentation, every piece, **every candidate** (world, rank, variant, text, score, `valid`, `refused`, reason, matched worlds, interpreter statuses, unparsed count), the piece's choice and tie decision, and `why` explains the winner (beats the top segmentation, candidate 2 recovered after candidate 1 failed, only the simplified text validates, tie broken by tier ...).

### 7.6 Exact SOP of a message
For evaluation, the circuits of a message are the concatenation, in message order, of the id-normalized SOP (`normalizedSop`) of every produced piece; the gold is the same concatenation over the gold segments' targets. A negative record is correct when the result is `not_understood`.

### 7.7 Running the dispatcher in the browser (Encoder formalizer, D4)
The same chain runs client-side as the `encoder` formalizer strategy (spec 06 "Formalizer strategies"):
1. **Model files** (`python -m psys2_train.export_onnx --ckpt training/runs/dispatcher-<name>`): one ONNX graph with inputs `input_ids`, `attention_mask` (int64 `[b, t]`, dynamic axes) and outputs `seg_logits [b, t, 2]` (boundary head, per token) and `world_logits [b, W]` (world head on the first token), exported fp32 (opset 17) and quantized with onnxruntime dynamic int8 (per-channel weights). `labels.json` holds the world order; `tokenizer/vocab.txt` is the WordPiece vocabulary.
2. **Tokenizer** `src/formalizer/wordpiece.mjs`: the uncased BERT WordPiece pipeline (clean, CJK spacing, NFD accent stripping, lowercase, punctuation split, greedy longest match `##`); `encode(text, { maxLength })` returns ids and character offsets in the original text. `tests/wordpiece.test.mjs` checks ids and offsets against the Python tokenizer on a fixture of about 200 sentences (`tests/fixtures/wordpiece-distilbert.json`, made by `psys2_train.dump_tokenizer_fixture`).
3. **Runtime** `src/formalizer/dispatcher-runtime.mjs` `createDispatcherRuntime({ ort, session, tokenizer, worlds })` (the host injects an onnxruntime session; the core has no dependency on it) mirrors `dispatcher.dispatch` exactly: segmentation pass on the raw message (max 192 tokens), boundary candidates at word-start tokens, beam of at most 4 segmentations from flips of the 6 most uncertain boundaries (independent Bernoulli log-probability), joiners trimmed, then one world pass per distinct piece with the input `tab: <tab|none> ; recent: <w1 w2|none> ;; <piece>` (max 128 tokens) and the top-3 softmax probabilities. `predict(text, context)` returns the record of section 7.1 (without `id`).
4. **Strategy** `src/dialog/encoder-dispatch.mjs` `createDispatcherFormalizer({ load, getPolicy })`: loads the model lazily through the host's `load()` (first use or `prepare()`), calls `predict`, validates with `createDispatchValidator` (sections 7.2-7.5), then formalizes every piece of the winning segmentation with the rules of its chosen world (restricted view, section 7.2) **in the real session**, so the wires are ordinary rule wires and everything after formalization is unchanged. Pieces nobody validated are returned as `unparsed`; the dialog engine retries those with the rules over all worlds. A failing model load makes `available()` false and the engine uses the rules (the error is in `trace.formalizer.error`). `context.session` of the prediction is the strategy's own memory of the last 6 messages it formalized in that session (so pronouns and ellipsis see earlier pieces).
5. **Policy for the demo**: `acceptRefused: true` (a parse the interpreter refuses for a state reason, for example a chess move when no game is on, counts as understood; strict interpretation rejects refused-but-correct parses, questions.md Q3). It is the setting "Accept parses the interpreter refuses" in the webchat.
6. **Trace**: `reply.trace.dispatch` = `{ status, why, policy, winnerIndex, modelMs, totalMs, boundaries, segmentations: [{ index, dispatcherScore, score, valid, nInvalid, pieces: [{ text, valid, chosen, tie, attempts: [{ world, rank, worldScore, variant, valid, refused, reason, score }] }] }] }` and each segment of `trace.segments` has `dispatch: { world, rank, variant, worldScore }`.
`scripts/verify-dispatcher-js.mjs` runs this runtime in Node with onnxruntime-node (installed outside the repository) and compares it with the Python predictions (`psys2_train.dump_dispatch_reference`).

### 7.8 The rephraser: edit tags (simplification head, D1b)
The dispatcher model has a third head that proposes `segment.simplified` (spec 7.1) without generating text. Per **word** of a piece (`src/formalizer/edit-tags.mjs` `wordsOf`: letters/digits with inner apostrophes, every other non-blank character is a word) it predicts one tag: `KEEP`, `DELETE`, `R:<text>` (replace the word), `P:<text>` (put text before it) or `A:<text>` (append after it; glued when the text starts with punctuation); the `R/P/A` vocabulary (at most 500 entries) is built from the data and shipped as `edit-vocab.json` next to the model (`tags[k]` = channel `k` of the output `edit_logits [b, t, K]`, channels 0/1 are KEEP/DELETE). `applyEditTags` builds the rewritten text (original spacing kept); the segment carries `simplified` only when the rewrite differs from the piece and is not empty. The edit head reads the **same input as the world head** (`tab: .. ; recent: .. ;; <piece>`), so one encoder pass per piece gives the world scores and the tags; the tag of a word is read from its first sub-token. A word receives its best non-KEEP tag only when that tag's softmax probability is at least `edit_threshold` (meta.json, default 0.5). The validation layer (7.2) tries `simplified` only after the original, with `simplifiedPenalty`, so the rephraser can only add understanding. Training data: `scripts/build-edit-tags.mjs` aligns paraphrase variants to a rules-verified phrasing of the same task and keeps an alignment only when the rules formalize the rewrite to the target SOP, plus identity (all KEEP) examples and synthetic noise (fillers and word pairs mined from the real alignments). Metric: `scripts/eval-simplify.mjs` (share of variants the rules formalize on the original, on the rewrite, and on either). Python mirror: `training/psys2_train/edit.py`; the two implementations are tied by `tests/fixtures/edit-tags-python.json`.
