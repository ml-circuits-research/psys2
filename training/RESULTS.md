# Training results

State of the PSys2 C2 pipeline after the 2026-11-08 / 2026-11-09 work batch (R3, R4, L6-L10, RD1-RD8, D5, PERF, BEST-EFFORT, L-RO and Romanian quality). Every number below comes from a committed JSON under `training/results/` (the path is cited next to each table) or from `worker-log.md` (cited as "worker-log"). Anything not found is marked "not measured". Older detail (T2 rule baselines, D3 dispatcher evaluation, F1, dialogue audit) is kept at the end under "Archive".

## Who does what

| component | role |
| --- | --- |
| DistilBERT dispatcher (v4: int8, sha256 `6c41eb2434646b988e8936f1a2a82e1490465ca023a0d5b2be6987daedcac2be`, run `v4e`, ckpt 2448) | splits a message into pieces and proposes the top-3 world candidates per piece (and carries the S1 edit head) |
| per-world rules (`worlds/*/patterns.sop`) | the only formalizer: they turn a piece into an SOP circuit |
| validation layer (`src/dialog/dispatch-validate.mjs`) | picks the candidate (segmentation and world) that the rules parse and the interpreter accepts |
| N1 normalizer (FLAN-T5-small, int8, v3) | only proposes a simpler phrasing, which the rules must formalize and the value checker must accept; used when nothing validates |
| best-effort (`src/formalizer/best-effort.mjs`) | answers a partially understood message ("I took that as: ...", or "Did you mean") from pattern examples and the input's own content words |

No generative model is used in C2 beyond the N1 normalizer (AGENTS.md).

## 1. Headline: main operational set (1240 messages)

Set `training/eval/operational.jsonl`. Right / partly / wrong / not understood, in %. Sources: `training/results/operational/published.json` (points at `encoder+n1-6c41eb24-2026-11-09.json`), `rules-nomodel-2026-11-09-r4-v3base.json`, `encoder-19dd054b-2026-11-09-r4-v3base.json`, `encoder+n1-19dd054b-2026-11-09-r4-v3base.json`, `encoder+n1-6c41eb24-2026-11-09-r4-v4e.json`; the v4 three-mode table is in worker-log "R4".

| mode | v3 dispatcher (19dd054b) + N1 v3 | v4 dispatcher (6c41eb24) + N1 v3 (shipped) |
| --- | --- | --- |
| rules only (no model, same rules on both sides) | 95.4 / 1.8 / 0.5 / 2.3 | same |
| encoder (dispatcher, no N1) | 98.4 / 0 / 0.6 / 1.0 | 98.6 / 0 / 0.4 / 1.0 |
| encoder+n1 (shipped configuration) | 98.4 / 0 / 0.6 / 1.0 | 98.6 / 0 / 0.4 / 1.0 |

Counts for the shipped run (`published.json` and its result file): 1223 right, 5 wrong, 12 not understood of 1240. N1 changes nothing on the main set in either configuration (it only fires on the fallback distribution; worker-log "R4"). Per group, encoder+n1 v4 (right %): kids 99.8, avatar/shell/editor 97.9, music/draw/map/charts 98.2, games 98.0, documents 91.7 (`encoder+n1-6c41eb24-2026-11-09.json`, `by_group`).

Before-batch baselines (rules only, no model), on the older 1234-message set:

| point | right | wrong | source |
| --- | --- | --- | --- |
| L0 baseline at cff3f36 | 1066 / 1234 (86.4 %) | 38 / 1234 (3.1 %) | worker-log "L0" (counts; percentages computed here). worker-tasks.md quotes "86.5% right, 3.0% wrong" for the same baseline at a later commit. |
| rules only, evaluator before G5 | 86.7 % | 2.9 % | `training/results/operational/superseded/operational-rules-only.json` |
| full pipeline before G5 (old dispatcher, no N1) | 89.0 % | 4.3 % | `training/results/operational/superseded/operational-full.json` |
| rules only, R3 baseline 2026-11-08 | 94.2 % | 0.6 % | `operational/rules-nomodel-2026-11-08-r3-baseline.json` |

Rules-only went from 86.4 % (L0) to 95.4 % right on the 1240 set through the rule work (RD, L-series, dialogue fixes); the shipped full pipeline is at 98.6 % right / 0.4 % wrong (the pre-G5 full pipeline was 89.0 % / 4.3 %). The set is authored (no real phrase logs yet) and the rules were widened by reading it, so these numbers are optimistic for unseen users.

Latency, shipped run (`encoder+n1-6c41eb24-2026-11-09-r4-v4e.json`, 20 parallel workers, loaded host): mean 256 ms, p50 179 ms, p95 711 ms. These are node-side numbers, not the phone page (see section 5).

## 2. Long set, dialogues, Romanian, loose words, typos

**Long and medium set (154 messages: 118 mid, 36 long).** `training/eval/operational-long.jsonl`; `operational/encoder+n1-6c41eb24-2026-11-09-r4-v4e-long.json` (v4) and `encoder+n1-19dd054b-2026-11-09-r4-v3base-long.json` (v3). Right / partly / wrong / not understood %:

| config | all | mid | long |
| --- | --- | --- | --- |
| v3 + N1 v3 | 94.2 / 3.2 / 1.9 / 0.6 | 95.8 / 1.7 / 1.7 / 0.8 | 88.9 / 8.3 / 2.8 / 0 |
| v4 + N1 v3 (shipped) | 94.2 / 3.2 / 1.9 / 0.6 | 95.8 / 1.7 / 1.7 / 0.8 | 88.9 / 8.3 / 2.8 / 0 |

Encoder-only (no N1): v3 94.2, v4 93.5 right (worker-log "R4": one case of 154; N1 recovers it, so the publish margin is one case). Gold items missed with v4 + N1: mid 11 of 454 (2.4 %), long 8 of 268 (3.0 %). Earlier in the batch (v2/v3 before the G7 fixes): rules 46.1, v3 encoder+n1 74.7 right on this set (worker-log "G6b").

**Dialogues (408 dialogues, 1961 turns).** `training/eval/dialogues.jsonl`; `training/results/dialogues/*-2026-11-09.json`. Turns right % / dialogues right %:

| mode | v3 (19dd054b) | v4 (6c41eb24) |
| --- | --- | --- |
| encoder | 95.6 / 86.3 (`encoder-19dd054b-2026-11-09.json`) | 95.4 / 86.0 (`encoder-6c41eb24-2026-11-09.json`) |
| encoder+n1 | 95.5 / 86.3 (`encoder+n1-19dd054b-2026-11-09.json`) | 95.5 / 86.3 (`encoder+n1-6c41eb24-2026-11-09.json`) |
| rules only (407 dialogues, 1912 turns) | 96.6 / 87.7 (`rules-nomodel-2026-11-09.json`) | same |

v4 encoder+n1 per group, dialogues right: kids 86.0, avatar/shell/editor 82.4, music/draw/map/charts 88.0, games 93.0 (`by_group`; documents and other not reproduced here). In encoder modes the dialogue set is slightly lower than in rules mode (turns 95.5 vs 96.6): the dispatcher path loses a few turns the rules read directly. The first rules baseline on the earlier 365-dialogue set was 90.3 % turns / 70.4 % dialogues (archive below).

**Romanian (2480 cases, two per English case; diacritics and casual).** `training/eval/operational-ro.jsonl`; run with `eval-operational.mjs --ro`. No Romanian result JSON is committed, so these come from worker-log "R4" (encoder+n1): v3 84.8 right / 2.7 wrong (diacritics 86.8, casual 82.7); v4 84.7 / 2.7 (diacritics 86.7, casual 82.7). History: rules mode 48.4 right / 7.3 wrong at the first Romanian run (worker-log "RD5"), 49.6 / 8.1 wrong at the RO-1..RO-5 baseline, and L-RO raised detection of diacritic-less Romanian from 327 to 387 of 413 twins (full pipeline right 314 to 377). Per-bucket Romanian numbers after the batch are not measured in a committed file; the last per-bucket numbers (rules mode, before RO-1..RO-5) were kids 55.5, avatar/shell/editor 44.5, music/draw/map/charts 41.0, games 49.7, documents 35.4.

**Loose words (best-effort).** `training/eval/loose-words.jsonl` (670 rows); `training/results/loose-words/rules-2026-11-09.json` (rules mode). Recover rows (581): best-effort off 228 recovered / 287 not understood / 66 misled; on 349 / 143 / 89 (121 gained, 0 lost). Junk rows (84, expect "do not guess"): misled 8 off, 12 on. Operational and dialogue replies were byte-identical with best-effort on and off (worker-log "BEST-EFFORT"). Encoder modes: not measured for this set.

**Typos.** `scripts/eval-typos.mjs` over `training/eval/typos/*.jsonl` (1,023 records); no result JSON is committed, numbers from worker-log "RD1" (rules mode): non-word typos recovered 652/804 (81.1 %) to 683/804 (85.0 %), misled 142 to 111; real-word typos recovered 114/219 (52.1 %) unchanged, misled 56 to 49. Operational `typo` family (encoder+n1 v4): see `encoder+n1-6c41eb24-2026-11-09.json` `by_family`.

## 3. Dispatcher per bucket: v3 vs v4

Test multi-command set, 4,000 messages. Exact = exact segmentation; final = final answer correct; omitted / duplicate = segments omitted / duplicated. Sources: `training/results/g6-r4-v3-test-buckets.json` (v3, 19dd054b) and `g6-r4-v4e-ckpt-step2448-test-buckets.json` (v4, published). All 18 v4 checkpoints are in `g6-r4-v4?-ckpt-*-test-buckets.json`.

| bucket (commands) | n | v3 exact / final | v3 omit / dup | v4 exact / final | v4 omit / dup |
| --- | --- | --- | --- | --- | --- |
| 1 | 861 | .999 / .990 | 0 / 1 | .998 / .983 | 0 / 2 |
| 2-3 | 2139 | .914 / .808 | 14 / 51 | .924 / .814 | 14 / 32 |
| 4-5 | 242 | .831 / .529 | 5 / 17 | .839 / .545 | 6 / 13 |
| 6-8 | 358 | .768 / .380 | 11 / 36 | .793 / .397 | 11 / 23 |
| long | 400 | .525 / .160 | 37 / 192 | .562 / .185 | 58 / 118 |

Boundary F1 on this set: v3 .979, v4 .983. Test world top-1 for v4e: .9661 (v3 .9720 was measured on the older data; the run table is in worker-log "R4").

**Finding on duplicates.** A duplicate is a gold command cut into pieces, not a repeated command. Re-measured on v3: 192 duplicates in the long bucket, 189 of them in messages that fit one 192-token window, so the overlapping-window merge is not the cause and was not changed (no runtime merge bug). The cause is the boundary class weight `seg_w = [1, 2]` (seg boundary weight 2.0): the head over-splits inner phrases of commands ("italy or canada | which is bigger"). Lowering the weight trades duplicates for omissions (W 1.0: long duplicates 82-96, omissions 80-87). The published run keeps W 2.0 with the new data: duplicates 192 to 118, but long omissions rose from 37 to 58. The pipeline punishes omissions (a merged pair is lost) more than duplicates, which is why W 2.0 was kept (worker-log "R4").

Realistic-message headline for the D3 evaluation (`dispatch-r4-v3-c2448.json`, `dispatch-r4-v4e-c2448.json`, `headline.realistic_all`, n 4239, right / fallback / wrong): rules R 87.45 / 7.97 / 4.58; dispatcher + validation with acceptRefused (Br) v3 92.85 / 3.11 / 4.03, v4 93.04 / 3.28 / 3.68.

## 4. S1 edit head: target not met

The safe S1 edit head (`scripts/build-edit-tags.mjs`: DELETE, normalizing R:, function-word P:/A: only; vocabulary 500 to 141 tags) was trained jointly with v4. Pipeline level (`eval-dispatch`, test + held-out, 11,303 messages, original text only vs plus the simplified candidate; `dispatch-r4-v3-c2448.json`, `dispatch-r4-v4a-c2448.json`, `dispatch-r4-v4e-c2448.json`, summary in worker-log "R4"):

| head | recovered | misled | broken | exact-SOP % B to C |
| --- | --- | --- | --- | --- |
| v3 | 3 | 7 | 1 | 89.4 to 89.5 |
| v4a (safe head) | 3 | 7 | 0 | 89.4 to 89.5 |
| v4e (published) | 3 | 7 | 1 | 89.5 to 89.6 |

The S1 target "misled at most a quarter of recovered" is not met (7 misled against 3 recovered). The safe head halves the changed sentences and the rewrites that break the rules on the held-out set (147 to 77-88), but recovery stays at 3 because the rules now read almost everything. The head does not raise wrong answers; the value checker and the lexicographic preference stay the safety net, and the head ships inside the model (there is no separate switch in the exported model).

## 5. Performance

PERF round 1 (worker-log "PERF", headless Chromium 390x844, 4x CPU throttle, median of 3 runs, `node scripts/perf-webchat.mjs --runs 3`, host loaded, single numbers vary about 2x). Fixes: seed once per context and fork the session instead of replaying six messages per candidate; fast path for single clauses read completely by the rules (model skipped); warm-up after first paint; sample document analysed once.

| mode | stage | page ready ms | p50 per message ms | p95 per message ms |
| --- | --- | --- | --- | --- |
| rules | before / after | 3349 / 3733 | 227 / 215 | 1057 / 450 |
| encoder | before / after | 5593 / 3751 | 5698 / 410 | 26858 / 2510 |
| encoder+n1 | before / after | 4364 / 3124 | 3650 / 485 | 8472 / 1871 |

Reviewer re-measure at d7fe3f0 (worker-tasks.md, PERF entry, commit 538fc52): page ready 33.6 s (worse), hello 504 ms, 3 plus 4 203 ms, multi-command 3.96 s (worse), eyes square 202 ms, paris 637 ms, hello 154 ms. The gap between the worker's measurement (page ready about 3-4 s) and the reviewer's (33.6 s) is not explained in the files; PERF round 2 (below) addresses it. Not done in round 1: build-time compiled patterns and multi-thread WASM. Node-side latency of the shipped pipeline is in section 1.

PERF round 2 (worker-log "PERF round 2", commit 57b28bf; same script, now with `--net none|fast4g|slow4g`, `--cache cold|warm`, `--http h2|h1`; median of 3, 4x CPU, localhost, h2, cold cache). The reviewer's 33.6 s was not reproduced (quiet host: ready 1.8 s); the likely match is *model ready* (8.5 s quiet, ORT on the main thread, scales to about 30 s on a loaded host). Definitions printed by the script: `ready` = session exists and the hint is shown; `first answer` = "hello" sent at ready until answered; `model ready` = status line shows the dispatcher version; per message = Enter to answer, after model ready. Fixes: modulepreload + early fetch of worlds/index.json and model metas; ORT in its own worker (`proxy=true`); multi-clause fast path (accepted only when the model's cut, the per-piece top world and the rules agree and the interpreter accepts; 0 reading diffs); sliced pattern precompile.

| mode | build | ready ms | first answer ms | model ready ms | p50 ms | p95 ms | multi-command ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rules | before / after | 1828 / 1723 | 214 / 794 | n/a | 135 / 90 | 226 / 240 | 135 / 147 |
| encoder | before / after | 1840 / 1722 | 206 / 740 | 8543 / 4758 | 82 / 97 | 1605 / 327 | 1605 / 327 |
| encoder+n1 | before / after | 1830 / 1634 | 231 / 732 | 8562 / 4554 | 96 / 130 | 1676 / 789 | 1676 / 789 |

Fast 4G, cold: rules usable 14.5 s -> 3.8 s; encoder model ready 94.5 s -> 81.2 s (64 MB dispatcher + about 95 MB normalizer download; rules answer meanwhile). Evals unchanged (operational encoder+n1 98.6 / 0.4, 0 diffs; long 94.2 / 1.9). Open: model download size on slow links.

### PERF round 3 (2026-11-09)

`node scripts/perf-webchat.mjs --runs 3` (headless Chrome, 390x844, 4x CPU throttle, h2, cold cache; medians). Per message: hello / what is 3 plus 4 / spider legs and 3 plus 4 / pls make ur eyes square / show me paris / hello / **how many legs does a spider have and what is 3 plus 4**. Measured at host load about 7 (earlier runs at load 40-70 gave 2-6x slower numbers; load-noisy runs are not reported).

| mode | input | ready | first answer | model ready | per message (ms) | p50 | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rules | 1003 | 3228 | 1013 | n/a | 140 / 170 / 356 / 210 / 696 / 169 / 454 | 210 | 696 |
| encoder | 1039 | 3428 | 1036 | 10454 | 186 / 206 / 651 / 219 / 657 / 162 / 773 | 219 | 773 |
| encoder+n1 | 996 | 3378 | 1067 | 10616 | 200 / 223 / 710 / 250 / 665 / 149 / 721 | 250 | 721 |

Fast 4G (9 Mbit/s, 170 ms RTT), cold, encoder+n1, one run: ready 4.7 s, first answer 1.2 s, dispatcher "model ready" 85.5 s (the normalizer is no longer downloaded at load).

What changed: fast path on for multi-clause messages (already coded; contested routing and long no-connective messages now go to the model); background work (rule compilation, warm-up) yields to a turn and for 500 ms after it; the precompile builds the prefilter sets and the vocabulary faster (same vocabulary, hash checked); `_activeSpell` and `_nameRepair` build their vocabularies only when needed; normalizer deferred (decision f); Romanian translator warm-up; HANG3 (browser translator, commit 9879564) removed a 4 s wait per Romanian message; user bubble CSS and a screenshot test.

Readings (eval-operational, `--ort ... --jobs 20 --no-write` equivalents, host loaded): 1296 set encoder+n1 98.4 / 0.6 wrong; encoder+n1+fast 98.5 / 0.6: 1 diff (kids.tasks#013 not_understood to right). Long set (154): encoder+n1 94.8 / 1.3 wrong, +fast identical, 0 diffs. Rules mode 95.5 / 0.5 before and after (one case, kids.animals#029, flips with the time-based leniency budget under load). An earlier +fast run showed art.draw#082 turning wrong ("put it in the top right corner" read by tictactoe): fixed by the contested-routing rule.

## 6. Sizes

| item | measured | target | status | source |
| --- | --- | --- | --- | --- |
| total `worlds/*/patterns.sop` | 2,987,859 bytes (was 7,124,242) | <= 2 MB | missed | worker-log "L6 + L7 summary" |
| match text of hand patterns | 1,865,942 bytes (was 6,041,268, -69 %) | not separate | n/a | same |
| webchat `worlds/index.json` | 4,506,258 bytes (was 5,574,642; gzip 642,396) | <= 2.5 MB | missed | worker-log "L10" |

What stays in the browser bundle (worker-log "L10"): patterns.sop 3.06 MB (match text 1.93 MB, emit 370 KB, examples 263 KB, ids 197 KB, other keys 194 KB, canonical 33 KB), lexicon.sop 0.70 MB, kb.sop 0.39 MB, other about 0.24 MB. The build already drops `tests.sop` (837 KB) and `coverage.md` (214 KB). Dispatcher model int8 63.9 MB (worker-log "D4", target <= 150 MB, met). Rule count: 4,750 hand patterns before L6/L7, 4,670 after.

## 7. Known weaknesses and open items

- **Clarification family.** Dialogue family clarification is 68.8 % dialogues right in rules mode and with the v3 encoder, 66.7 % with v4 encoder+n1 (`dialogues/*-2026-11-09.json`, `by_family`). Open cases: "what was the sum again?", "which paragraph did you make italic?", "Why did you say 209?", the shop's "how much does it cost?" with a pronoun (worker-log "D-FIX").
- **Romanian.** Overall 84.7 % right / 2.7 % wrong; casual register 82.7 %. The documents, avatar and games buckets were the weakest in the last per-bucket measurement (rules mode, before RO-1..RO-5: documents 35.4, avatar/shell/editor 44.5, games 49.7); no later per-bucket number is committed (not measured). Known gaps: avatar "(I read ...)" fragments, long list sentences, docs.reader free-text questions.
- **"Where were we?" contradiction.** `dlg.avt#040` and `dlg.mpc#009` expect the previous topic, `dlg.doc#045` expects the story, while spec 11 section 10 keeps the explicit "back to X" topic. The gold labels contradict each other (worker-log "D-FIX").
- **Cross-world ambiguities** ("give me a clue", "not so fast", "what are you called"): named in the task as open; the files read here do not give a measured count (not measured).
- **"What colour is the sky?"**: kids.shapes knows the sky, so answering is correct; the avatar gold label says negative. Probable gold-label issue (worker-log "Rules fixes, round 2").
- **Long-message omissions rose 37 to 58** (long bucket, v3 to v4) as the price of halving duplicates (section 3).
- **S1 edit head** gives no gain (section 4).
- **Sizes** missed: patterns.sop 2.99 MB vs 2 MB, webchat bundle 4.51 MB vs 2.5 MB (section 6).
- **Performance** gap on the phone (section 5, PERF round 2 open).
- **Data caveats.** The operational, long, dialogue and Romanian sets are authored by agents; no real phrase logs exist yet (`training/phrase-logs/` is empty), so the learning loop (D5, simulated only: 1,992 of 2,621 simulated messages self-labelled, 629 queued, `training/results/learn-loop-simulation.json`) has not run on real traffic. Compute rule: no retraining was run for this document.

## Archive (earlier sections, kept as recorded)

The operational headline and dialogue baseline that used to open this file (1234 messages, old dispatcher; right 84.3 % rules-only, 89 % full) are superseded by sections 1-2 and by `training/results/operational/superseded/`. The sections below are unchanged historical records.

## T2 - Rule baseline on the test splits

Command: `node scripts/eval-rules.mjs` (about 30 s on 20 cores, deterministic: two runs give identical rules.json; failures go to `training/runs/rules-failures.jsonl`, gitignored). One run now produces the test splits, the routing rows and the held-out set.

- **restricted**: rule formalizer limited to the record's world (and imports): the ceiling of the rule formalizer.
- **routed**: dialog session over all worlds with the current rule router and the record's tab: the baseline every model must beat.
- Positive correct = all segments parsed and id-normalized SOP equals the target. Negative correct = the record's world does not claim the text (restricted: nothing parsed; routed: no segment matched by that world or its imports).
- Context: the record's `context` messages are formalized first, in a fresh session; the tab is the record's tab (generator and rule-derived records have none).

### Exact-SOP accuracy (%), 055fbeb (before widening) vs c989cd1

**Total and by source (positives n / restricted % / routed %)**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| all | 4242 | 88.7 | 88.3 | 4301 | 94.1 | 93.4 | 98.1 / 98.1 (412) | 97.5 / 97.5 (321) |

**by source**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| paraphrase | 684 | 30.1 | 30.4 | 636 | 60.4 | 61.0 | - | - |
| rule-derived | 314 | 100.0 | 94.0 | 422 | 100.0 | 94.3 | - | - |
| generator | 3244 | 100.0 | 100.0 | 3243 | 100.0 | 99.7 | 98.1 / 98.1 (412) | 97.5 / 97.5 (321) |

**By world group**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| kids | 1557 | 93.3 | 93.3 | 1589 | 97.9 | 97.8 | 99.7 / 99.7 (291) | 99.5 / 99.5 (200) |
| avatar/shell/editor | 511 | 84.3 | 84.3 | 501 | 88.6 | 88.6 | 100.0 / 100.0 (24) | 100.0 / 100.0 (24) |
| music/draw/map/charts | 1041 | 84.9 | 83.5 | 1068 | 86.8 | 85.3 | 97.6 / 97.6 (41) | 97.6 / 97.6 (41) |
| games | 827 | 83.6 | 83.8 | 837 | 97.5 | 96.4 | 89.3 / 89.3 (56) | 89.3 / 89.3 (56) |
| documents | 306 | 100.0 | 98.7 | 306 | 100.0 | 98.7 | - | - |

**By world**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| art.draw | 215 | 70.2 | 64.2 | 215 | 69.8 | 64.6 | 97.6 / 97.6 (41) | 97.6 / 97.6 (41) |
| data.charts | 270 | 96.3 | 95.9 | 276 | 96.4 | 96.0 | - | - |
| docs.editor | 115 | 67.8 | 67.8 | 116 | 70.7 | 70.7 | - | - |
| docs.reader | 306 | 100.0 | 98.7 | 306 | 100.0 | 98.7 | - | - |
| games.chess | 366 | 92.3 | 92.9 | 375 | 96.3 | 96.8 | - | - |
| games.guess | 135 | 60.0 | 60.0 | 130 | 99.2 | 99.2 | 89.3 / 89.3 (28) | 89.3 / 89.3 (28) |
| games.hangman | 188 | 100.0 | 100.0 | 188 | 100.0 | 100.0 | 89.3 / 89.3 (28) | 89.3 / 89.3 (28) |
| games.tictactoe | 138 | 60.9 | 60.9 | 144 | 95.8 | 88.2 | - | - |
| geo.map | 341 | 95.6 | 95.6 | 341 | 95.9 | 95.9 | - | - |
| kids.animals | 258 | 93.0 | 93.0 | 260 | 98.9 | 98.9 | - | - |
| kids.arith | 230 | 93.0 | 93.0 | 240 | 98.8 | 98.8 | 100.0 / 100.0 (28) | 100.0 / 100.0 (28) |
| kids.common | 54 | 16.7 | 16.7 | 61 | 68.8 | 65.6 | 100.0 / 100.0 (147) | 100.0 / 100.0 (147) |
| kids.shapes | 196 | 86.7 | 86.7 | 203 | 96.1 | 96.1 | 99.1 / 99.1 (116) | 96.0 / 96.0 (25) |
| kids.shop | 259 | 100.0 | 100.0 | 264 | 100.0 | 100.0 | - | - |
| kids.tasks | 293 | 100.0 | 100.0 | 294 | 100.0 | 100.0 | - | - |
| kids.time | 267 | 100.0 | 100.0 | 267 | 100.0 | 100.0 | - | - |
| media.music | 215 | 68.4 | 67.9 | 236 | 78.0 | 76.3 | - | - |
| ui.avatar | 79 | 67.1 | 67.1 | 71 | 88.7 | 88.7 | - | - |
| ui.help | 95 | 100.0 | 100.0 | 95 | 100.0 | 100.0 | - | - |
| ui.shell | 222 | 92.3 | 92.3 | 219 | 93.2 | 93.2 | 100.0 / 100.0 (24) | 100.0 / 100.0 (24) |

**Positives by world and source, c989cd1 (restricted / routed %, n)**

| world | generator | paraphrase | rule-derived |
|---|---|---|---|
| art.draw | 100.0 / 100.0 (49) | 45.4 / 48.7 (119) | 100.0 / 68.1 (47) |
| data.charts | 100.0 / 100.0 (247) | 9.1 / 9.1 (11) | 100.0 / 94.4 (18) |
| docs.editor | 100.0 / 100.0 (51) | 22.7 / 22.7 (44) | 100.0 / 100.0 (21) |
| docs.reader | 100.0 / 100.0 (292) | - | 100.0 / 71.4 (14) |
| games.chess | 100.0 / 100.0 (292) | 68.2 / 72.7 (44) | 100.0 / 100.0 (39) |
| games.guess | 100.0 / 100.0 (45) | 98.7 / 98.7 (74) | 100.0 / 100.0 (11) |
| games.hangman | 100.0 / 100.0 (188) | - | - |
| games.tictactoe | 100.0 / 77.5 (49) | 91.9 / 91.9 (74) | 100.0 / 100.0 (21) |
| geo.map | 100.0 / 100.0 (299) | 36.4 / 36.4 (22) | 100.0 / 100.0 (20) |
| kids.animals | 100.0 / 100.0 (228) | 86.4 / 86.4 (22) | 100.0 / 100.0 (10) |
| kids.arith | 100.0 / 100.0 (199) | 85.0 / 85.0 (20) | 100.0 / 100.0 (21) |
| kids.common | - | 64.8 / 61.1 (54) | 100.0 / 100.0 (7) |
| kids.shapes | 100.0 / 100.0 (159) | 75.0 / 75.0 (32) | 100.0 / 100.0 (12) |
| kids.shop | 100.0 / 100.0 (251) | - | 100.0 / 100.0 (13) |
| kids.tasks | 100.0 / 100.0 (293) | - | 100.0 / 100.0 (1) |
| kids.time | 100.0 / 100.0 (264) | - | 100.0 / 100.0 (3) |
| media.music | 100.0 / 100.0 (50) | 33.3 / 33.3 (78) | 100.0 / 96.3 (108) |
| ui.avatar | - | 61.9 / 61.9 (21) | 100.0 / 100.0 (50) |
| ui.help | 100.0 / 100.0 (92) | - | 100.0 / 100.0 (3) |
| ui.shell | 100.0 / 100.0 (195) | 28.6 / 28.6 (21) | 100.0 / 100.0 (3) |

### Held-out paraphrase set (primary paraphrase metric)

`training/paraphrases/heldout/out/*.jsonl`, never used for rules or training. Evaluated like the test splits (record context and tab, target = `expected_circuit`), as source `heldout`, in the `heldout` section of rules.json. `needs_review` records are excluded: **73** (by world: data.charts 1, docs.reader 66, games.guess 1, games.hangman 1, games.tictactoe 2, geo.map 1, kids.common 1). Evaluated: 2255 positives. Overall: restricted 49.4%, routed 50.4%. (The reviewer's 45% figure counts variants only, from the labelling pass; this table includes the canonical records and uses exact SOP.)

| | n | restricted % | routed % |
|---|---|---|---|
| group kids | 770 | 58.1 | 57.9 |
| group avatar/shell/editor | 440 | 38.9 | 40.5 |
| group music/draw/map/charts | 440 | 41.8 | 42.3 |
| group games | 440 | 57.5 | 62.1 |
| group documents | 165 | 35.1 | 32.7 |
| art.draw | 110 | 38.2 | 38.2 |
| data.charts | 110 | 46.4 | 46.4 |
| docs.editor | 110 | 35.4 | 35.4 |
| docs.reader | 165 | 35.1 | 32.7 |
| games.chess | 110 | 54.5 | 54.5 |
| games.guess | 110 | 68.2 | 75.4 |
| games.hangman | 110 | 56.4 | 61.8 |
| games.tictactoe | 110 | 50.9 | 56.4 |
| geo.map | 110 | 47.3 | 47.3 |
| kids.animals | 110 | 47.3 | 47.3 |
| kids.arith | 110 | 55.5 | 54.5 |
| kids.common | 110 | 53.6 | 53.6 |
| kids.shapes | 110 | 71.8 | 71.8 |
| kids.shop | 110 | 60.9 | 60.9 |
| kids.tasks | 110 | 45.5 | 45.5 |
| kids.time | 110 | 71.8 | 71.8 |
| media.music | 110 | 35.4 | 37.3 |
| ui.avatar | 110 | 47.3 | 46.4 |
| ui.help | 110 | 26.4 | 29.1 |
| ui.shell | 110 | 46.4 | 50.9 |

### World routing (routing.jsonl, test rows, rule router), 055fbeb vs c989cd1

Correct = routed world (world of the first parsed segment) equals `world` or is in `alt_worlds`; a row nothing parses counts as wrong. Context per row: tab, recent_worlds, session messages.

| subset | 055fbeb | c989cd1 |
|---|---|---|
| all | 3804/4241 = 89.7% (353 not parsed) | 4096/4300 = 95.3% (112 not parsed) |
| text not in routing train (Q1) | 3636/4052 = 89.7% (344 not parsed) | 3867/4054 = 95.4% (108 not parsed) |
| text also in train | 168/189 = 88.9% (9 not parsed) | 229/246 = 93.1% (4 not parsed) |
| real context (paraphrases, not synthetic) | 292/684 = 42.7% (347 not parsed) | 483/636 = 75.9% (105 not parsed) |
| group kids | 1446/1557 = 92.9% (94 not parsed) | 1547/1589 = 97.4% (24 not parsed) |
| group avatar/shell/editor | 438/511 = 85.7% (63 not parsed) | 452/501 = 90.2% (37 not parsed) |
| group music/draw/map/charts | 922/1040 = 88.6% (82 not parsed) | 978/1067 = 91.7% (42 not parsed) |
| group games | 696/827 = 84.2% (110 not parsed) | 817/837 = 97.6% (5 not parsed) |
| group documents | 302/306 = 98.7% (4 not parsed) | 302/306 = 98.7% (4 not parsed) |

## D3 - Dispatcher + validation, end-to-end evaluation

Commit/inputs: DistilBERT dispatcher (`training/runs/dispatcher-distilbert`, D1), predictions `training/runs/dispatch-pred/{test,heldout}.jsonl` (10,877 messages: 4,622 world test records, 4,000 multi-command messages, 2,255 held-out paraphrases), rules at baseline c989cd1. Command: `node scripts/eval-dispatch.mjs --name distilbert` (about 9 minutes with 20 workers), report `training/results/dispatch-distilbert.json` (ModernBERT: `dispatch-modernbert-full.json`). Rerun identical (byte for byte on the kids sample). Reviewer rerun from committed files (kids sample, 347 messages, 0.9 MB, about 30 s): `node scripts/eval-dispatch.mjs --pred training/results/dispatch-pred-kids-sample.jsonl --name kids-sample` (needs the dataset: `node scripts/build-dataset.mjs && python -m psys2_train.multicmd`); the sample is made by `node scripts/make-dispatch-sample.mjs`. Simplification mode (C): not available yet, no prediction carries a `simplified` text, so C = B in every table.

Policies: **Br** = dispatcher top-3 + validation, `acceptRefused` on (lead policy, Q3); **B** = the same with the strict rule. **R** = rules only (the current router, one dialog session over all worlds, no dispatcher). **Brf** = Br followed by the engine fallback of spec 03 section 7.7: when the validator does not understand the message, the rules over all worlds read it (R). Brf is approximated on the whole message; the real engine retries only the pieces nobody validated.

### Headline: user-perceived understanding (realistic messages)

Share (%) of realistic positive messages that end in: **right** (exact SOP) / **fallback** ("not understood / Did you mean ...?") / **wrong** (understood, other SOP, confidently wrong). Trained on: the dispatcher on `routing.jsonl` train rows (generator, rule-derived, paraphrase train split) plus multi-command messages built from train sentences; **the held-out set was NOT in training for these numbers (the "before" number)**. The rules were widened with the paraphrase train and test records in view, so rule numbers on the paraphrase test are optimistic.

| group | n | Br right / fallback / wrong | Brf right / fallback / wrong | B (strict) right / fallback / wrong | R rules only right / fallback / wrong |
|---|---|---|---|---|---|
| **all realistic** | 6891 | **68.5 / 22.8 / 8.7** | 69.1 / 18.4 / 12.5 | 64.7 / 27.2 / 8.1 | 43.0 / 25.5 / 31.5 |
| kids | 898 | **60.5 / 35.9 / 3.7** | 60.7 / 33.0 / 6.3 | 60.2 / 36.1 / 3.7 | 60.0 / 33.1 / 6.9 |
| avatar/shell/editor | 526 | **37.6 / 51.7 / 10.7** | 38.4 / 44.3 / 17.3 | 35.0 / 55.9 / 9.1 | 39.4 / 44.5 / 16.2 |
| music/draw/map/charts | 670 | **40.6 / 36.3 / 23.1** | 40.6 / 32.5 / 26.9 | 40.6 / 37.5 / 21.9 | 41.6 / 32.7 / 25.7 |
| games | 632 | **66.8 / 27.2 / 6.0** | 68.3 / 20.4 / 11.2 | 66.8 / 27.5 / 5.7 | 70.6 / 20.4 / 9.0 |
| documents | 165 | **32.7 / 64.2 / 3.0** | 35.1 / 53.3 / 11.5 | 32.7 / 64.8 / 2.4 | 32.7 / 54.5 / 12.7 |
| multi-command | 4000 | **80.8 / 11.5 / 7.8** | 81.4 / 7.5 / 11.1 | 74.7 / 18.1 / 7.2 | 36.0 / 19.8 / 44.3 |

Reading the headline:
- **Multi-command: the dispatcher is the win.** Right 36.0 % (rules only) to 80.8 % (Br), confidently wrong 44.3 % to 7.8 %. The rules alone cannot cut a message; the residual 11.5 % fallback is rule gaps (the D2 oracle ceilings, 68.0 B / 74.6 Br, were measured on the earlier multi-command build and are not comparable).
- **Single sentences (paraphrase test, held-out): no gain in "right", fewer confident errors.** Held-out (before): right 50.4 % (R) against 49.2 % (Br), wrong 11.8 % against 7.7 %, fallback 37.8 % against 43.1 %; paraphrase test 61.0 against 59.6 right. The limit is rule gaps (69 % of the failures), not the dispatcher (held-out world top-3 98.9 %). The dispatcher + validation layer turns some confident errors into "did you mean" answers; it cannot read what the rules cannot read. With the engine fallback (Brf) the fallback share drops to 18.4 % overall, at the price of the rules' wrong readings (12.5 %).
- **Where the dispatcher loses to rules alone** (a few points of "right"): avatar/shell/editor, music/draw/map/charts, games on single sentences. Causes: world not in the top-3 for short or typo-ridden texts, a wrong-world top-1 that also parses, and single sentences cut into two pieces (segmentation top-1 is only 94.5 % on held-out single sentences against 99.6 % on generator text). Brf closes most of this gap.
- **Strict (B) against acceptRefused (Br):** +3.8 points of right overall, +6.1 on multi-command and +14.4 points of exact SOP in games on the full test (68.2 to 82.6) (the strict rule rejects illegal or state-dependent moves, which are correct understandings). Br is the right default.

By source (same columns):

| source | n | Br | Brf | B | R |
|---|---|---|---|---|---|
| paraphrase | 636 | **59.6 / 22.6 / 17.8** | 59.8 / 18.4 / 21.9 | 59.6 / 22.8 / 17.6 | 61.0 / 18.4 / 20.6 |
| held-out (before) | 2255 | **49.2 / 43.1 / 7.7** | 50.1 / 37.6 / 12.4 | 48.5 / 44.6 / 6.9 | 50.4 / 37.8 / 11.8 |
| multi-command | 4000 | **80.8 / 11.5 / 7.8** | 81.4 / 7.5 / 11.1 | 74.7 / 18.1 / 7.2 | 36.0 / 19.8 / 44.3 |

By source and group (Br right / fallback / wrong against R):

| source | group | n | Br | Brf | R |
|---|---|---|---|---|---|
| paraphrase | kids | 128 | 73.4 / 24.2 / 2.3 | 74.2 / 21.1 / 4.7 | 72.7 / 21.1 / 6.3 |
| paraphrase | avatar/shell/editor | 86 | 33.7 / 52.3 / 14.0 | 33.7 / 45.4 / 20.9 | 33.7 / 45.4 / 20.9 |
| paraphrase | music/draw/map/charts | 230 | 38.7 / 23.5 / 37.8 | 38.7 / 19.6 / 41.7 | 40.4 / 19.6 / 40.0 |
| paraphrase | games | 192 | 87.0 / 7.3 / 5.7 | 87.0 / 3.1 / 9.9 | 90.1 / 3.1 / 6.8 |
| heldout | kids | 770 | 58.3 / 37.8 / 3.9 | 58.4 / 34.9 / 6.6 | 57.9 / 35.1 / 7.0 |
| heldout | avatar/shell/editor | 440 | 38.4 / 51.6 / 10.0 | 39.3 / 44.1 / 16.6 | 40.5 / 44.3 / 15.2 |
| heldout | music/draw/map/charts | 440 | 41.6 / 43.0 / 15.4 | 41.6 / 39.3 / 19.1 | 42.3 / 39.6 / 18.2 |
| heldout | games | 440 | 58.0 / 35.9 / 6.1 | 60.2 / 28.0 / 11.8 | 62.1 / 28.0 / 10.0 |
| heldout | documents | 165 | 32.7 / 64.2 / 3.0 | 35.1 / 53.3 / 11.5 | 32.7 / 54.5 / 12.7 |
| multi-command | multi-command | 4000 | 80.8 / 11.5 / 7.8 | 81.4 / 7.5 / 11.1 | 36.0 / 19.8 / 44.3 |

### Oracle coverage (positives, DistilBERT, with context)

Trained on: as above. `segmentation in beam` = a segmentation of the beam (4) matches the gold one (same piece count, character IoU >= 0.6); world top-1/top-3 are checked on the matching segmentation, every piece.

| group / source | n | segmentation top-1 | segmentation in beam | world top-1 | world top-3 | seg F1 (top-1) |
|---|---|---|---|---|---|---|
| **all** | 10556 | 97.5 | 99.9 | 92.4 | 98.3 | 0.9816 |
| kids | 2359 | 97.6 | 100.0 | 97.3 | 99.9 | 0.9751 |
| avatar/shell/editor | 941 | 97.3 | 100.0 | 88.2 | 96.4 | 0.9759 |
| music/draw/map/charts | 1508 | 97.8 | 100.0 | 92.5 | 98.4 | 0.98 |
| games | 1277 | 96.2 | 99.9 | 95.1 | 99.2 | 0.9577 |
| documents | 471 | 99.4 | 100.0 | 96.4 | 98.7 | 0.9968 |
| multi-command | 4000 | 97.5 | 99.9 | 89.1 | 97.4 | 0.9874 |
| source: generator | 3243 | 99.6 | 100.0 | 96.1 | 99.2 | 0.9952 |
| source: rule-derived | 422 | 98.1 | 99.8 | 81.3 | 94.5 | 0.9836 |
| source: paraphrase | 636 | 96.5 | 100.0 | 95.4 | 99.5 | 0.9691 |
| source: heldout | 2255 | 94.5 | 100.0 | 94.1 | 98.9 | 0.9452 |
| source: multi-command | 4000 | 97.5 | 99.9 | 89.1 | 97.4 | 0.9874 |

Multi-command messages: segmentation F1 (top-1, IoU >= 0.6) **0.9874**, right segmentation in the beam 99.9 %. Note that "world top-1" on multi-command is the share of messages where every piece has the right world first (a message of 3 pieces needs 3 hits), hence 89.1 %.

### End-to-end exact SOP (%), all positives with a target

Trained on: as above. A = dispatcher top-1 + rules (no interpreter); B = top-3 + validation, strict; Br = acceptRefused; R = rules only; Brf = Br + rules fallback. Simplification mode: not yet available.

| group / source | n | R rules only | A top-1 + rules | B strict | Br | Brf |
|---|---|---|---|---|---|---|
| **all** | 10556 | 62.5 | 75.3 | 74.2 | **78.5** | 79.4 |
| kids | 2359 | 84.8 | 83.6 | 84.8 | **85.0** | 85.0 |
| avatar/shell/editor | 941 | 66.1 | 58.6 | 59.7 | **62.0** | 64.7 |
| music/draw/map/charts | 1508 | 72.8 | 66.7 | 69.8 | **70.0** | 71.4 |
| games | 1277 | 84.6 | 80.0 | 68.2 | **82.6** | 84.0 |
| documents | 471 | 75.6 | 76.0 | 76.4 | **76.4** | 77.3 |
| multi-command | 4000 | 36.0 | 76.1 | 74.7 | **80.8** | 81.4 |
| source: generator | 3243 | 99.7 | 95.8 | 93.0 | **98.5** | 99.4 |
| source: rule-derived | 422 | 94.3 | 80.8 | 84.6 | **88.4** | 93.4 |
| source: paraphrase | 636 | 61.0 | 58.3 | 59.6 | **59.6** | 59.8 |
| source: heldout | 2255 | 50.4 | 48.3 | 48.5 | **49.2** | 50.1 |
| source: multi-command | 4000 | 36.0 | 76.1 | 74.7 | **80.8** | 81.4 |

Negative records (321 generator negatives; correct = no world understands the text; stricter than eval-rules, which only asks that the record's own world does not claim it): R 46.1 %, A 62.0 %, B 62.0 %, Br 62.0 %.

### Validation: rejecting a wrong top-1 and recovering

"Recoverable" = the top-1 segmentation is right, some piece has the wrong world first and the right world within the top 3. "Rejected" = the validator refuses the wrong top-1 candidate of every such piece (so the wrong world cannot win by itself); "recovered" = the final SOP is exact; "accepted" = a wrong top-1 passes validation (its world's rules parse the text too).

| group | recoverable | Br rejected | Br recovered exact | Br wrong accepted | B rejected | B recovered exact |
|---|---|---|---|---|---|---|
| **all** | 606 | 450 (74.3 %) | 305 (50.3 %) | 156 | 460 | 286 |
| kids | 60 | 41 (68.3 %) | 27 (45.0 %) | 19 | 44 | 25 |
| avatar/shell/editor | 76 | 67 (88.2 %) | 29 (38.2 %) | 9 | 67 | 29 |
| music/draw/map/charts | 89 | 60 (67.4 %) | 45 (50.6 %) | 29 | 61 | 45 |
| games | 50 | 38 (76.0 %) | 32 (64.0 %) | 12 | 39 | 32 |
| documents | 11 | 10 (90.9 %) | 2 (18.2 %) | 1 | 10 | 2 |
| multi-command | 320 | 234 (73.1 %) | 170 (53.1 %) | 86 | 239 | 153 |

Of the 803 positive messages with a wrong world-1 piece (or wrong segmentation), 606 are recoverable; validation rejects the wrong top-1 in 74.3 % and ends exact in 50.3 %. The rest are texts the rules of the right world cannot read (rule gap), so the recovery cannot finish.

### Failure analysis

Failures of Br on the realistic sources (paraphrase, held-out, multi-command), by cause (classes in the JSON `definitions`): rule gap 1496, segmentation wrong 5, sop differs 433, world not in candidates 116, wrong reading chosen 121. Over all sources: rule gap 1496, segmentation wrong 6, sop differs 433, world not in candidates 163, wrong reading chosen 170.

**Rule gaps by world** (right world and segmentation found, but the rules of that world cannot parse the piece; count over realistic records, most frequent content words, example phrasings). This is where rules are missing:

| world | gaps | frequent words | examples |
|---|---|---|---|
| docs.editor | 143 | heading (35), second (32), paragraph (30), milk (18), bread (17), middle (16) | "read the 2nd paragraph"; "word example link example dot com"; "scroll to the 2nd heading" |
| kids.common | 143 | name (61), u (23), are (18), know (14), thanks (14), have (12) | "intro yourself pls"; "helper's name?"; "did u learn my name yet" |
| art.draw | 132 | house (30), left (18), u (18), pls (17), cat (16), where (16) | "5 stars pls"; "dog the other way"; "no outline, solid heart" |
| docs.reader | 105 | story (15), pls (12), search (10), forest (9), next (9), section (9) | "what is the beginning like"; "short summary of section 2"; "what towns are mentioned" |
| kids.arith | 102 | she (30), breaks (26), zoe (23), leo (22), broke (21), how (20) | "how many does leo have after losing some"; "all the stickers total?"; "between leo and zoe who has more" |
| media.music | 88 | g (23), minor (23), major (16), e (15), c (12), which (12) | "E note pls"; "birthday song with bells"; "make it much lower, two octaves" |
| ui.shell | 88 | game (22), clue (8), games (8), want (8), now (7), play (7) | "chess board tab pls"; "tell me how many phrases i said"; "back to english" |
| kids.animals | 87 | called (21), legs (19), got (14), rex (13), name (12), dog (11) | "spider legs?"; "6 legs animals"; "can u tell me if an ostrich can fly" |
| ui.avatar | 77 | mouth (42), one (15), back (14), before (12), go (10), u (10) | "can u put sunglasses on"; "i want your mouth as a grill"; "what kind of hair u got pls" |
| geo.map | 76 | map (12), line (10), bolivia (8), country (8), germany (8), how (7) | "pull up kyoto"; "bolivia landlockd?"; "can you tell me how far madrid is from lisbon" |
| games.tictactoe | 63 | board (14), x (10), go (9), row (9), start (7), by (6) | "um, top right I think"; "me first, x please"; "any tip for my move?" |
| games.chess | 62 | white (11), moves (10), g1 (7), knight (7), move (7), pieces (7) | "can u list the legal moves of the queen"; "i play which one, white or black"; "what white has on the board" |
| ui.help | 58 | chess (12), examples (10), how (8), explain (7), rules (7), did (6) | "what u can do"; "i need examples"; "chess how to play" |
| kids.shapes | 53 | secondary (13), green (12), brown (10), make (10), how (8), orange (7) | "triangle a polygon?"; "whats a pentagon"; "a leaf could be blue right" |
| kids.shop | 43 | lei (28), puzzle (16), kite (11), kites (11), how (8), much (7) | "i got 40 lei in my purse"; "spent 2 lei just now"; "kite = 4 lei" |
| games.hangman | 42 | word (8), about (6), fact (6), hangman (5), animal (4), giraffe (4) | "giraffe is the word"; "tigre?"; "fact?" |
| data.charts | 39 | chart (9), legs (6), pls (6), plums (6), spider (6), bee (5) | "new chart bikes 4 scooters 9 kites 2"; "can u do a pie of what each kid has"; "plums in half" |
| kids.tasks | 36 | garden (11), reading (11), list (10), done (8), finished (7), homework (6) | "garden list: socks"; "reading finished"; "remove the socks from my garden" |
| kids.time | 31 | days (12), how (9), many (8), sunday (7), after (6), day (5) | "how many days in june right"; "if its sunday what day in 4 days"; "if its march, what month in 4 months" |
| games.guess | 28 | dont (5), know (5), start (4), question (3), that (3), again (2) | "begin the guess game pls"; "time to guess, start"; "cant say, dont know" |

**30 failures** (Br, realistic sources, round-robin over groups and classes, file order; `got` is the validated result, `R` the rules-only outcome on the same message):

| # | cause | group / source | tab (context) | sentence | dispatcher top-1 | got | expected | R |
|---|---|---|---|---|---|---|---|---|
| 1 | rule gap | kids / heldout | robot | spider legs? | kids.animals/ui.avatar/kids.common: spider legs? | not understood | spider legs? => type=kids.animals.animal ; seek=legs ; where.name=spider | fallback |
| 2 | rule gap | avatar/shell/editor / heldout | editor (2 msg) | read the 2nd paragraph | docs.editor/docs.reader/media.music: read the 2nd paragraph | not understood | read the 2nd paragraph => action=doc.read ; arg.n=2 ; arg.kind=paragraph | fallback |
| 3 | rule gap | music/draw/map/charts / heldout | draw | 5 stars pls | art.draw/games.chess/ui.avatar: 5 stars pls | not understood | 5 stars pls => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | fallback |
| 4 | rule gap | games / heldout | chess (1 msg) | can u list the legal moves of the queen | games.chess/games.hangman/games.tictactoe: can u list the legal moves of the queen | not understood | can u list the legal moves of the queen => action=chess.moves ; arg.piece=queen | fallback |
| 5 | rule gap | documents / heldout | documents (1 msg) | what is the beginning like | docs.reader/docs.editor/games.tictactoe: what is the beginning like | not understood | what is the beginning like => action=docr.part ; arg.at=begin | fallback |
| 6 | rule gap | multi-command / multi-command | robot | purple banana true then align the heading in the middle of the page please which season does december fall in | kids.shapes/ui.avatar/kids.animals: purple banana true // docs.editor/docs.reader/games.tictactoe: align the heading in the middle of the page // kids.time/docs.reader/kids.tasks: please which season does december fall in | not understood (partial: kids.shapes: purple banana true => type=kids.shapes.thing ; seek=is_color ; where.name=banana ; where.is_color=purple || kids.time: please which season does december fall in => type=kids.time.monthinfo ; seek=season ; where.name=december) | purple banana true => type=kids.shapes.thing ; seek=is_color ; where.name=banana ; where.is_color=purple || align the heading in the middle of the page => action=doc.align ; arg.t="the heading" ; arg.how=center || please which season does december fall in => type=kids.time.monthinfo ; seek=season ; where.name=december | fallback |
| 7 | sop differs | kids / heldout | robot | cows say what | kids.animals/games.guess/kids.arith: cows say what | kids.animals: cows say what => kids.animals.animal ; kids.animals.animal.name=cow ; kids.animals.animal.sound=what | cows say what => type=kids.animals.animal ; seek=sound ; where.name=cow | wrong |
| 8 | sop differs | avatar/shell/editor / heldout | editor (2 msg) | can u make paragraph two bold | docs.editor/games.tictactoe/games.hangman: can u make paragraph two bold | docs.editor: can u make paragraph two bold => action=doc.format ; arg.t="paragraph two" ; arg.mark=bold | can u make paragraph two bold => action=doc.format ; arg.t="the second paragraph" ; arg.mark=bold | wrong |
| 9 | sop differs | music/draw/map/charts / heldout | draw | i want 5 stars added | art.draw/ui.avatar/games.chess: i want 5 stars added | art.draw: i want 5 stars added => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" ; arg.where="added" | i want 5 stars added => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | wrong |
| 10 | sop differs | games / heldout | chess (1 msg) | h8? | games.chess/games.tictactoe/games.hangman: h8? | games.chess: h8? => action=chess.move ; arg.tf=h ; arg.tr=8 | h8? => action=chess.square ; arg.ff=h ; arg.fr=8 | wrong |
| 11 | world not in candidates | documents / heldout | documents (1 msg) | hey look up oven | kids.common/ui.avatar/media.music: hey look up oven | not understood | hey look up oven => action=docr.search ; arg.q="oven" | fallback |
| 12 | segmentation wrong | multi-command / multi-command | editor | what animals still possible and then perfect please highlight the house pls | games.guess/kids.animals/games.hangman: what animals still possible // games.tictactoe/games.guess/games.chess: perfect // docs.editor/art.draw/games.tictactoe: please highlight the house pls | games.guess: what animals still possible => action=guess.remaining || games.tictactoe: perfect => action=ttt.level ; arg.level=perfect || docs.editor: please highlight the house pls => action=doc.format ; arg.t="the house pls" ; arg.mark=highlight | what animals still possible => action=guess.remaining || perfect please => action=ttt.level ; arg.level=perfect || highlight the house pls => action=draw.select ; arg.kind=house ; arg.kt="house" | fallback |
| 13 | wrong reading chosen | kids / heldout | robot | tell me about you, who are u | kids.common/ui.avatar/kids.animals: tell me about you // kids.common/ui.avatar/kids.animals: who are u | kids.common: tell me about you => action=chat.who || kids.common: who are u => action=chat.who | tell me about you, who are u => action=chat.who | wrong |
| 14 | world not in candidates | avatar/shell/editor / heldout | robot | I want a dish on top. | data.charts/docs.editor/games.tictactoe: I want a dish on top. | not understood | I want a dish on top. => action=avatar.setPart ; arg.part=top ; arg.value=dish ; arg.text="dish" | right |
| 15 | world not in candidates | music/draw/map/charts / heldout | music | hpy birthday on bels | kids.time/kids.arith/kids.common: hpy birthday on bels | not understood | hpy birthday on bels => action=music.playAny ; arg.title="Happy Birthday" ; arg.inst=bell | fallback |
| 16 | world not in candidates | games / heldout | guess (1 msg) | which are left in the list | kids.tasks/docs.editor/data.charts: which are left in the list | kids.tasks: which are left in the list => action=tasks.add ; arg.item="which are left" ; arg.list=to-do | which are left in the list => action=guess.remaining | wrong |
| 17 | wrong reading chosen | documents / heldout | documents (1 msg) | where does the story happen, list places | docs.reader/media.music/kids.time: where does the story happen // docs.reader/kids.tasks/data.charts: list places | docs.reader: where does the story happen => action=docr.places || docs.reader: list places => action=docr.places | where does the story happen, list places => action=docr.places | wrong |
| 18 | sop differs | multi-command / multi-command | editor | move it to the key of a minor then i want a violin sound | media.music/games.chess/docs.editor: move it to the key of a minor // media.music/ui.shell/games.chess: i want a violin sound | media.music: move it to the key of a minor => action=music.transposeTo ; arg.root=a ; arg.m=minor || media.music: i want a violin sound => action=music.instrument ; arg.inst=violin | move it to the key of a minor => action=music.transposeTo ; arg.root=a ; arg.m=minor || i want a violin sound => action=music.instrument ; arg.inst=flute | wrong |
| 19 | rule gap | kids / heldout | robot | legs on a spider | kids.animals/ui.avatar/kids.common: legs on a spider | not understood | legs on a spider => type=kids.animals.animal ; seek=legs ; where.name=spider | fallback |
| 20 | wrong reading chosen | avatar/shell/editor / heldout | editor (2 msg) | Read paragraph 2. | docs.reader/docs.editor/media.music: Read paragraph 2. | docs.reader: Read paragraph 2. => action=docr.read ; arg.u=paragraph ; arg.n=2 | Read paragraph 2. => action=doc.read ; arg.n=2 ; arg.kind=paragraph | right |
| 21 | wrong reading chosen | music/draw/map/charts / heldout | charts | spiders and cows legs bar chart | games.guess/data.charts/kids.animals: spiders // data.charts/ui.avatar/games.guess: cows legs bar chart | games.guess: spiders => action=guess.reveal ; arg.animal="spiders" || data.charts: cows legs bar chart => action=chart.fromText ; arg.text="cows legs bar" | spiders and cows legs bar chart => action=chart.fromLegs ; arg.what="spiders and cows" | wrong |
| 22 | wrong reading chosen | games / heldout | chess (1 msg) | make the engine stronger, level five | games.chess/games.tictactoe/ui.shell: make the engine stronger // games.chess/games.tictactoe/media.music: level five | games.chess: make the engine stronger => action=chess.level ; arg.name=stronger || games.chess: level five => action=chess.level ; arg.n=5 | make the engine stronger, level five => action=chess.level ; arg.n=5 | wrong |
| 23 | rule gap | documents / heldout | documents (1 msg) | start of the story? | docs.reader/docs.editor/media.music: start of the story? | not understood | start of the story? => action=docr.part ; arg.at=begin | fallback |
| 24 | world not in candidates | multi-command / multi-command | editor | Add cat food, ice cream and apples to my shopping list and then remove the lines pls | kids.tasks/docs.editor/kids.arith: Add cat food, ice cream and apples to my shopping list // docs.editor/ui.avatar/kids.tasks: remove the lines pls | not understood (partial: kids.tasks: Add cat food, ice cream and apples to my shopping list => action=tasks.add ; arg.item="cat food, ice cream and apples" ; arg.list="shopping") | Add cat food, ice cream and apples to my shopping list => action=tasks.add ; arg.item="cat food, ice cream and apples" ; arg.list="shopping" || remove the lines pls => action=geo.clearLines | wrong |
| 25 | sop differs | kids / heldout | robot | does a cow eat plants | kids.animals/kids.arith/kids.shapes: does a cow eat plants | kids.animals: does a cow eat plants => type=kids.animals.animal ; seek=food ; mode=exists ; where.name=cow ; where.food=plants | does a cow eat plants => type=kids.animals.animal ; seek=is_a ; where.name=cow ; where.is_a=herbivore | wrong |
| 26 | rule gap | avatar/shell/editor / heldout | editor (2 msg) | read number two paragraph pls | docs.editor/docs.reader/kids.tasks: read number two paragraph pls | not understood | read number two paragraph pls => action=doc.read ; arg.n=2 ; arg.kind=paragraph | fallback |
| 27 | rule gap | music/draw/map/charts / heldout | draw | more stars, like 5 | art.draw/data.charts/kids.arith: more stars, like 5 | not understood | more stars, like 5 => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | fallback |
| 28 | rule gap | games / heldout | chess (1 msg) | could you show what squares my queen can reach | games.chess/games.tictactoe/kids.shapes: could you show what squares // games.chess/games.tictactoe/games.hangman: my queen can reach | not understood (partial: games.chess: my queen can reach => action=chess.moves ; arg.piece=queen) | could you show what squares my queen can reach => action=chess.moves ; arg.piece=queen | fallback |
| 29 | world not in candidates | documents / heldout | documents (2 msg) | next match | games.tictactoe/games.chess/ui.shell: next match | not understood | next match => action=docr.searchStep ; arg.dir=next | right |
| 30 | wrong reading chosen | multi-command / multi-command | draw | Make your mouth bigger | ui.avatar/art.draw/kids.common: Make your mouth bigger | ui.avatar: Make your mouth bigger => action=avatar.resizePart ; arg.part=mouth ; arg.dir=bigger | Make your mouth bigger => action=draw.resize ; arg.t="your mouth" ; arg.d=bigger | right |

Reading the 30 (the sample is balanced over groups and causes, not proportional; the proportions are in the counts above): 11 rule gaps, 6 "sop differs", 6 world not in candidates, 6 wrong reading chosen, 1 segmentation. Rule gaps are the bulk of the real failures (about 69 % of the realistic ones): politeness and abbreviations (`pls`, `u`), numerals (`2nd`, `two`, `number two`), reordered phrasings (`legs on a spider`, `start of the story?`), typos. "sop differs" are texts the rules parse but only partly (`i want 5 stars added` keeps `where="added"`, `cows say what` becomes a statement, `h8?` is read as a move instead of a square) or where the paraphrase label is arguable; no dispatcher can fix them. "World not in candidates" are short or typo-ridden texts (`next match`, `hpy birthday on bels`, `which are left in the list`); in two of them (#14, #29) the rules alone read the message correctly, which is what the Brf fallback recovers. "Wrong reading chosen" are single sentences cut into two pieces that both parse (#13, #17, #22) and a wrong-world top-1 whose rules also parse and which validation therefore accepts (#20 `Read paragraph 2.` on the editor tab goes to docs.reader).

### ModernBERT (full) against DistilBERT

Same data, seeds, heads and validation. ModernBERT-base full fine-tune (149 M parameters, 698 s) against DistilBERT (66 M, 194 s, 63.9 MB int8). Trained on: as above, held-out not in training.

| dispatcher | world top-1 / top-3 (all positives) | held-out top-1 / top-3 | multi-command seg F1 | headline Br right / fallback / wrong | headline Brf right | Br exact SOP all |
|---|---|---|---|---|---|---|
| DistilBERT | 92.4 / 98.3 | 94.1 / 98.9 | 0.9874 | 68.5 / 22.8 / 8.7 | 69.1 | 78.5 |
| ModernBERT full | 91.8 / 98.0 | 94.1 / 98.3 | 0.9916 | 68.1 / 22.9 / 8.9 | 68.7 | 78.3 |


## F1 - paraphrase labels keep each variant's own parameters (review F1)

**Problem.** `labelVariant` copied the canonical's target onto every variant that the rules read differently or not at all, so a variant with other values got the canonical's values ("a key with 4 sharps?" was labelled `n=3, acc=flat`). **Fix** (spec 10 section 3): the operation family (goal, used for splits) is separated from the semantic instance (`instance_id`); a variant that the rules parse completely and whose slot values all occur in its text (and whose numbers are all used) is labelled with the rules' own SOP (`rules-own`); the canonical's target is inherited (`rules-differ` / `rules-fail`) only when the canonical's values match the variant's text; everything else is `needs_review` (no target, out of training, `label_reason` says why). Code: `scripts/collect-paraphrases.mjs` (`labelVariant`, `slotsOf`, `slotsFaithful`, `valuesMatch`). Audit: `scripts/audit-f1-labels.mjs` -> `training/results/f1-label-audit.json`. Tests: `tests/paraphrases.test.mjs` (the three music examples, minimal pairs with one changed argument for the time, shapes, shop, map, arithmetic and music families, and unit cases).

**Audit of the committed labels (old policy), train / held-out.**

| | train (7500 variants) | held-out (2100 variants) |
| --- | ---: | ---: |
| old targets copied from the canonical (`target_from=canonical`) | 2298 | 1104 |
| of which the canonical's values do not match the variant's text (**labelling errors**: wrong or unverifiable) | 801 (35%) | 267 (24%) |
| of those, the rules' current own reading is faithful to the text (**certainly wrong labels**) | 577 | 98 |
| of those, a number of the variant is missing from the canonical's values | 88 | 16 |
| variants the rules parse completely but read unfaithfully (**parser errors or lexicon normalizations**: "grow" -> `d=bigger` is counted too) | 430 | 207 |
| of those, a number of the text is dropped or changed (**real parser errors**, e.g. "rotate the car 45 degrees" -> flip) | 33 | 20 |
| variants the rules do not parse at all (**parser gaps**) | 357 | 129 |

Labelling errors are mostly tasks whose variants change the parameters (canonical "Draw a red house." with variants "draw me 3 trees", "a tiny green tree"): they are different instances, now `rules-own`. Parser errors are a small share (33+20 real number errors; the rest are mostly normalizations the faithfulness check cannot see and go to `needs_review` only when the canonical does not match either). The "before" figures below are the committed outputs, produced with older rules, so the shift mixes the new labelling with rule progress since those outputs (the old `rules-fail` rows that now parse become `rules-agree`).

**Counts per label status, before -> after (variants only; agree / own / differ / fail / unverified / needs_review; `trainable` = no review flag and a target).** T = `training/paraphrases/out`, H = `heldout/out` (both rerun, including the new `*.h5.json` and `docs.editor.h7.json` batches).

| set world | variants | before agree/own/differ/fail/unverified/needs_review | after (same order) |
| --- | ---: | --- | --- |
| H art.draw | 100 | 32/0/20/48/0/0 (trainable 100) | 83/11/0/1/0/5 (trainable 95) |
| H data.charts | 100 | 41/0/31/28/0/0 (trainable 100) | 87/13/0/0/0/0 (trainable 100) |
| H docs.editor | 100 | 29/0/24/47/0/0 (trainable 100) | 92/7/0/0/0/1 (trainable 99) |
| H docs.reader | 200 | 39/0/21/136/4/0 (trainable 150) | 141/4/0/31/24/0 (trainable 160) |
| H games.chess | 100 | 50/0/15/35/0/0 (trainable 100) | 96/4/0/0/0/0 (trainable 100) |
| H games.guess | 100 | 77/0/8/15/0/0 (trainable 100) | 98/0/0/0/0/2 (trainable 98) |
| H games.hangman | 100 | 62/0/12/26/0/0 (trainable 100) | 99/1/0/0/0/0 (trainable 100) |
| H games.tictactoe | 100 | 53/0/17/30/0/0 (trainable 100) | 80/5/0/0/0/15 (trainable 85) |
| H geo.map | 100 | 42/0/10/48/0/0 (trainable 100) | 96/4/0/0/0/0 (trainable 100) |
| H kids.animals | 100 | 42/0/12/46/0/0 (trainable 100) | 98/1/0/0/0/1 (trainable 99) |
| H kids.arith | 100 | 50/0/7/43/0/0 (trainable 100) | 95/1/0/3/0/1 (trainable 99) |
| H kids.common | 100 | 52/0/8/40/0/0 (trainable 100) | 92/4/0/4/0/0 (trainable 100) |
| H kids.shapes | 100 | 69/0/2/29/0/0 (trainable 100) | 100/0/0/0/0/0 (trainable 100) |
| H kids.shop | 100 | 57/0/7/36/0/0 (trainable 100) | 97/0/0/1/0/2 (trainable 98) |
| H kids.tasks | 100 | 40/0/27/33/0/0 (trainable 100) | 74/25/0/0/0/1 (trainable 99) |
| H kids.time | 100 | 69/0/1/30/0/0 (trainable 100) | 94/1/1/3/0/1 (trainable 99) |
| H media.music | 100 | 31/0/27/42/0/0 (trainable 100) | 89/9/0/1/0/1 (trainable 99) |
| H ui.avatar | 100 | 41/0/14/45/0/0 (trainable 100) | 91/9/0/0/0/0 (trainable 100) |
| H ui.help | 100 | 24/0/15/61/0/0 (trainable 100) | 89/11/0/0/0/0 (trainable 100) |
| H ui.shell | 100 | 46/0/18/36/0/0 (trainable 100) | 92/5/1/2/0/0 (trainable 100) |
| T art.draw | 520 | 133/0/134/133/0/0 (trainable 400) | 341/159/1/6/5/8 (trainable 502) |
| T data.charts | 520 | 175/0/122/103/0/0 (trainable 400) | 393/93/0/20/0/14 (trainable 506) |
| T docs.editor | 720 | 151/0/196/253/0/0 (trainable 590) | 241/306/11/118/0/44 (trainable 666) |
| T docs.reader | 120 | - | 65/18/0/37/0/0 (trainable 110) |
| T games.chess | 420 | 241/0/40/19/0/0 (trainable 300) | 322/57/3/26/0/12 (trainable 408) |
| T games.guess | 320 | 186/0/11/3/0/0 (trainable 200) | 264/32/1/17/0/6 (trainable 314) |
| T games.hangman | 320 | 182/0/13/5/0/0 (trainable 200) | 276/26/2/16/0/0 (trainable 320) |
| T games.tictactoe | 320 | 180/0/13/7/0/0 (trainable 200) | 283/25/0/10/0/2 (trainable 318) |
| T geo.map | 520 | 114/0/92/194/0/0 (trainable 400) | 405/103/0/0/0/12 (trainable 508) |
| T kids.animals | 320 | 156/0/8/36/0/0 (trainable 200) | 305/5/0/7/0/3 (trainable 317) |
| T kids.arith | 320 | 158/0/5/37/0/0 (trainable 200) | 238/12/1/63/0/6 (trainable 314) |
| T kids.common | 320 | 127/0/48/25/0/0 (trainable 200) | 248/67/0/5/0/0 (trainable 320) |
| T kids.shapes | 320 | 141/0/9/50/0/0 (trainable 200) | 312/1/0/5/0/2 (trainable 318) |
| T kids.shop | 320 | 150/0/13/37/0/0 (trainable 200) | 270/6/0/20/0/24 (trainable 296) |
| T kids.tasks | 320 | 89/0/56/55/0/0 (trainable 200) | 206/75/3/18/0/18 (trainable 302) |
| T kids.time | 320 | 171/0/5/24/0/0 (trainable 200) | 302/4/2/6/0/6 (trainable 314) |
| T media.music | 520 | 169/0/195/36/0/0 (trainable 400) | 308/190/2/0/0/20 (trainable 500) |
| T ui.avatar | 520 | 179/0/62/159/0/0 (trainable 400) | 291/116/9/81/0/23 (trainable 497) |
| T ui.help | 120 | - | 90/17/0/13/0/0 (trainable 120) |
| T ui.shell | 320 | 93/0/30/77/0/0 (trainable 200) | 213/58/0/40/0/9 (trainable 311) |
| TOTAL | 9600 | 3741/0/1348/2107/4/0 (trainable 7140) | 7256/1485/37/554/29/239 (trainable 9291) |

Commands to rebuild everything derived from these labels (not run here): `node scripts/export-training.mjs && node scripts/build-dataset.mjs`, then `node scripts/build-edit-tags.mjs` (usual options) and, once it exists (N1), `scripts/build-normalizer-pairs.mjs`, and re-run `node scripts/eval-rules.mjs --heldout` for the held-out rules metrics.

## Dialogue set audit (rules mode)
Audit of `training/eval/dialogues.jsonl` and the fixes of the system gaps it found: see `worker-log.md` ("Dialogue audit and system gaps") for the audit counts and the before / after numbers on the same audited set (395 dialogues).

## DIAG: the world `diagram.sketch` and the Diagram tab (2026-11-09)

Imported from diagram-vss-demo (commit 9900d34, AGPL-3.0, `imports/diagram-vss-demo/`); not its BERT or VSS models. The engine of the source (`engine/logic.js`, layout, templates) is the
state and the execution of the world (`worlds/diagram.sketch/engine/`, converted by `scripts/convert-diagram-engine.mjs`); 72 patterns (cue words of the legend through lang.common
lead macros and 40 world-local cue phrases, `scripts/build-diagram-patterns.mjs`) recognise the act and hand the sentence to the engine's own rules reader (`{segment}` emit
placeholder); `ops.mjs` wraps the engine (node, reply, Clarify / SOPError, `$new` / `mention(...)` through the shape made last). Tab: `docs/webchat/ui/tabs/diagram.mjs`.

**First measurement with the rules (no model), `node scripts/eval-diagram.mjs --jobs 20 --name first`, file `training/results/diagram/rules-first.json`.**
Scoring with the logic of `reference/bench-canon.js`: act = the act of the pattern that read the sentence against the gold act; args = the engine's reader against the gold args; right = both;
extras = args the reader adds beyond the gold (rows with the right act); wrong = another act or another world read it; unread = no request.

| bench set (single sentences) | n | right | act right | right act, wrong args | extras | wrong | unread | engine reader alone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hand | 40 | 95.0 | 97.5 | 2.5 | 5.0 | 2.5 | 0 | 97.5 |
| blind | 60 | 86.7 | 98.3 | 11.7 | 8.3 | 0 | 1.7 | 88.3 |
| broad | 118 | 95.8 | 96.6 | 0.8 | 0.8 | 3.4 | 0 | 98.3 |
| seen | 300 | 99.7 | 99.7 | 0 | 1.3 | 0.3 | 0 | 100 |
| new_identities | 300 | 100 | 100 | 0 | 1.7 | 0 | 0 | 100 |
| heldout_formulations | 300 | 99.7 | 100 | 0.3 | 0.7 | 0 | 0 | 99.7 |
| total | 1119 | 98.4 | 99.3 | 0.9 | 1.7 | 0.5 | 0.1 | 98.9 |

(Percent. `seen`, `new_identities` and `heldout_formulations` are generated from templates, so they are the easy sets; `hand`, `blind`, `broad` were written by people. The 10 multi-clause
rows of `broad` count with the messages. The patterns were tuned while looking at the bench sets, so bench is "seen" data.) Per act: `bench_per_act` in the result file.

| `data/test` (4,323 labelled messages, 17,560 wires, 12,675 wires with an exact span) | |
| --- | --- |
| wire level, act of the segment that covers the wire's span: right | 68.6% |
| wrong act (another diagram act) | 8.7% |
| another world read it | 4.1% |
| unread (no segment covers it as a request) | 18.6% |
| message level: every wire read exactly as gold by the engine's rules reader (their own reader, no segmentation of ours) | 29.4% (1,269 / 4,323) |

The test messages are long (1-20 sentences, typos, self-corrections, text that is not a request); the haiku / sonnet batches have no spans (4,885 wires), and the source reader alone gets
23 / 500 of the sonnet messages exactly: that is the engine's own limit, not the patterns'. These numbers are the first measurement before any training on `data/test`; no pattern was tuned on it.

**Other worlds (wrong must not rise).** Rules mode, before (main without the world) / after (with the world), same commands as the baseline:
operational set 1240: 95.4 / 1.8 / 0.5 / 2.3 -> 95.4 / 1.8 / 0.5 / 2.3 (right / partly / wrong / not understood, identical);
dialogue set 408 dialogues, 1961 turns: 96.4% / 88.0% -> 96.4% / 88.0%. Two lessons are in the code: world-local catch-alls poison the candidate-world scoring of the dialog layer ("hey can u search for oven pls" lost
its world to a diagram `Is ...` catch-all), so every yes/no pattern needs a diagram word (`checkword` lexicon); and `needsState=shapes` keeps the generic cue patterns out of other tabs' way (without it wrong rose
0.5 -> 1.6 on the operational set), except for connections and named shapes (`signal=true`, ungated).

**Routing.** `signal=true` (new pattern key, spec 03 section 4): "draw a rectangle called Api", "draw an arrow from A to B", "make an org chart with ..." go to the diagram on any tab and bring the Diagram tab forward;
"draw a rectangle" stays with the Drawing board on the Drawing tab and with no tab, and goes to the diagram on the Diagram tab. Tests: `tests/routing.test.mjs` (DIAG) and `tests/diagram.test.mjs`.

**Tests.** `worlds/diagram.sketch/tests.sop`: 775 tests (`scripts/build-diagram-tests.mjs`): 6 sentences per act / ask from the bench (gold args, checked when written; spans of the labelled training messages fill
acts the bench does not have), and the 11 reviewed example sessions of `data/examples/manual.json` turn by turn (shapes and connections after every turn must equal the reference program's; 10 of 11 scenarios
reproduce in full, `login` for 2 of 8 turns). `tests/diagram.test.mjs`: the gold args run the same operation as the sentence (at least 5 per kind, 28+ kinds).

**PERF.** The engine (470 KB source) is loaded when the Diagram tab is first shown or when the first state with shapes arrives, and by `prepare()` (new optional ops hook, awaited by the dialog layer) before the
first operation of the world, not at start-up; the page does not preload it (no modulepreload). `scripts/perf-webchat.mjs --runs 3 --mode rules`, localhost, 4x CPU, h2, cold, pairs run back to back
on the same machine (before = HEAD build, after = this build): ready 1792 / 1683 ms -> 1777 / 1771 ms, first answer 823 / 825 ms -> 799 / 782 ms; per-message medians unchanged (about 100 ms). `worlds/index.json`
grows by 125 KB (20 KB gzip: the lexicons and patterns of the world).

**Data for the dispatcher (not retrained: one combined run later).** `node scripts/convert-diagram-data.mjs` -> `training/diagram/`: `train.jsonl` 41,273 messages / 76,637 wires (301 files; 8,473 further lines of
the source are unlabelled message texts and were skipped), `test.jsonl` 4,314 messages / 17,548 wires (60 lines skipped, 17 pending-only wires dropped; kept as the first measurement), `segments-train.jsonl` /
`segments-test.jsonl` (multicmd format: 76,620 / 12,683 segments, every segment world `diagram.sketch`), `top-spans.json`, `report.json` (committed; the jsonl files are gitignored and reproducible).
`scripts/build-dataset.mjs` now ingests `training/diagram/train.jsonl` (verified with `--out-dir`, 13 minutes including `export-training`): world `diagram.sketch` 27,890 records after dedupe (train 21,192 / dev 3,834 /
test 2,864; 27,476 imported + 414 rule-derived from the pattern examples), routing 27,798 rows; 22 worlds in all. The dispatcher v4 does not know the world: in the browser a multi-clause diagram message
("Start, Check and Done") cannot take the fast path and goes through the model and the normalizer (6 s on localhost without throttle) until the retrain; single-clause messages and every message read by the rules in the candidate worlds (the open tab's world is always one) are fast.

## DIAG3: short ids, arrows as objects, arrow geometry, parity with the source (2026-11-09)

Spec: `specs/14-diagram.md`. Code: `worlds/diagram.sketch/ops.mjs` (ids, aliases, replies), `refs.mjs` (typos, arrow references, layout phrases), `arrows.mjs` (arrow geometry), tab `docs/webchat/ui/tabs/diagram.mjs` (ids, Ids toggle, selection halo). The engine of the source is unchanged.

**Parity with the source rules reader** (`node scripts/eval-diagram.mjs --jobs 12 --name diag3`, file `training/results/diagram/rules-diag3.json`). The same rows are read by the source (`imports/diagram-vss-demo/engine/logic.js`, `createSystem().formalize`) and by the world through the dialog. Percent of rows (bench) or of gold wires (messages).

| set | reader | act right | args right | right (both) | wrong | unread |
| --- | --- | --- | --- | --- | --- | --- |
| bench, 1119 single sentences | source rules | 99.2 | 98.9 | 98.9 | 0.4 | 0.4 |
| | ours | 99.3 | 98.9 | 98.4 | 0.6 | 0.0 |
| data/test, 12675 gold wires of 3313 fully spanned messages | source rules | 82.5 | 29.6 (message exact) | | 8.8 | 8.8 |
| | ours | 81.0 | 29.4 (message exact) | | 10.5 | 8.5 |

Bench: ours is at or above the source on act, equal on args (the remaining right-both gap, 0.5 point, are rows where both read the args alike but our act is another pattern: "Which things link to Process?" and "what is Done?"). Messages: ours is below the source by 1.5 points of act (the sample at stride 6 was at 81.8 vs 81.4 before the last fixes; the full set is not yet at parity): the largest groups left are `set` read as `move` (11 per 12,000 wires sample of 4/6), `connect` read as `create`, `label` read as `set`, `tofront / toback` read as `move`. Fixed in this task (groups of 10-15 wires per sample): "X should be left of Y" (move, not fact), "Is X to the right of Y?" (check, not move), "X is left of Y" (fact), "Which shape is the most connected" (extreme, not list), "a line between" no longer rewritten.

**Arrow geometry** (`tests/diagram-arrows.test.mjs`, 142 arrows of the 24 templates, the example sessions and crafted fans): minimum entry angle 30 degrees or a perpendicular stub, corner clearance at least 8 px, clearance from other shapes at least 8 px for all but 3 % of arrows (crowded layouts), parallel and opposite arrows 14 px apart.

**Dialogues** (family `real`, `training/eval/dialogues.jsonl`, `dlg.real#diag3-01..07`): the 15 expectations of `expectations-2026-11-09d.jsonl` plus "them / both / the two" and edge operations; 7/7 in the CLI (rules and encoder+n1). Headless webchat: `scripts/test-webchat-diagram3.mjs` (screenshots of ids, arrows, a column layout, a selected arrow).

**Other worlds**: operational set rules 95.5 % right / 0.5 % wrong on 1296 (as on origin/main); encoder+n1 98.5 % right / 0.3 % wrong (origin/main: 98.6 / 0.4 on its 1240 cases); dialogues rules 96.9 % turns, 89.5 % dialogues. data.charts#001-003 and media.music#068 are "partly" with encoder+n1 also on the unchanged tier T (checked on `data.charts`), so they are not from this change.

**Tier T for several clauses** (`src/dialog/dispatch-validate.mjs` tabFirst): a message of several clauses goes to the active tab's world when every clause is read by that world through a pattern with an explicit signal (named shape, arrow between names, diagram form); "draw a blue rectangle called Api and a green circle called Db" on an empty Diagram tab is the diagram's (`tests/dispatch-validate.test.mjs`, `scripts/test-webchat-diagram.mjs`).
