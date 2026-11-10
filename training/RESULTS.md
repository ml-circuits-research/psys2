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


## FREEZE 4-5: voice soak test, dry run and ORT budget (2026-11-09)

Harness: `scripts/soak-webchat.mjs` (headless Chrome, 390x844, CPU 4x, fake always-on recogniser, the 67 real messages of `training/eval/real-phrases-2026-11-09e.jsonl` in order with their real gaps clamped to 4-45 s and scaled to the duration, plus random Romanian/English room talk every 2.5-6.5 s, encoder + normalizer models, a second tab opened at the midpoint). The 30-minute run was done through `heavy.sh` on commit `bf91173` (worktree branch, rebased on `ddd378b`). The speech.mjs rewrite (persisted mic removed, cross-tab lock, hidden-tab pause, recognizer reuse) and the NOISE task had NOT landed on main at that time, so the numbers below are the "before" picture for those two items; the two checks that depend on them fail, as expected.

| measure (30 min, 4x, 475 voice turns: 67 real + 408 room-talk utterances) | value | gate | result |
| --- | --- | --- | --- |
| heap (forced GC each 15 s), second quarter / last quarter | 117 MB / 138 MB (81 MB at 17 s, 141 MB at the end; about +2 MB per minute, the chat DOM holds 475 turns) | last <= 1.35 x second + 25 MB | pass, but a visible slope |
| page workers | 4 at the first sample and 4 at the end | not growing | pass |
| main-thread busy (CPU task time per wall second) | average 56 %, worst minute 75 %, worst 15 s sample 84 % | average and worst minute < 50 % | FAIL (room talk is still processed as full turns: ~16 turns a minute at 4x; fixed by NOISE) |
| watchdog endings ("That took too long") | 0 | 0 | pass |
| ORT restarts / pauses | 0 / 0 (5996 requests, 0 timeouts, 0 aborts) | <= 2 | pass |
| input echo at the end (key event to second paint) | median 22 ms (17 / 25 / 21 / 31 / 22) | < 100 ms | pass |
| first tab kept receiving while the second tab was open | 238 turns at the midpoint, 475 at the end | grows | pass |
| second tab never started listening | the second tab's recogniser DID start and its mic showed listening | never | FAIL (the always-on state is persisted; fixed by the speech.mjs rewrite) |

3-minute versions (`--minutes 3`, the same 67 messages squeezed into 3 minutes, so about ten times denser than reality): 93 % busy, echo 39 ms, 0 restarts, same second-tab failure. Run the gate version with `bash -c 'PUPPETEER_CORE=... node scripts/soak-webchat.mjs --minutes 3'`; `--rules` runs without the models.

**Dry run** (`scripts/measure-dryread.mjs`, 16 Romanian and English room-talk lines x 3 rounds, Node, unthrottled, one main thread): before 48.4 ms mean, p95 226 ms, max 545 ms (total 2324 ms for 48 calls); after 49.5 ms mean, p95 244 ms, max 457 ms (total 2378 ms). The unthrottled mean did not change: the rules reading itself is not shorter. What changed is the bound: a newer call or the caller's signal stops an older run at its next guard check (it no longer runs on after the 400 ms wait), at most one runs at a time, and long or vocabulary-free text costs under 2 ms (`unchiul`, `voi`, `faci tu`, `scuze` went from 5-24 ms to 0.5-1.4 ms). The saturation the user saw came from many overlapping runs; with one in flight and cancellation the dry-run load is at most one run at a time.

## TIER-T-LONG (2026-11-09): tier T restricted for long multi-command messages

Published dispatcher v4e + N1 (`eval-operational --mode encoder+n1`). Tier T (ADR-004) accepted long multi-command messages as one clause of the active tab; it now needs a `signal=true` pattern in every clause when the dispatcher cuts the message into several pieces, the message has more than 8 words and is not running text.

| measure | before | after |
| --- | --- | --- |
| long set (154) right / partly / wrong | 80.5 / 3.2 / 13.0 | 94.2 / 3.2 / 1.9 |
| 1296 operational right / wrong | 98.4 / 0.6 | 98.6 / 0.3 |
| eval-diagram test set, wire-level act right | 81.0 | 81.0 |

## NX2 (2026-11-10): model pilot, which labeler and which judge are good enough

Gold: `training/nx/gold/pilot-300.jsonl` = 150 rules-verified (operational / operational-long cases with outcome `right` in the rules run `rules-nomodel-2026-11-09-r3h-shipped`, 8 of them diagram.sketch pattern examples because diagram has no operational set), 100 paraphrase items (`rules-fail` / `rules-differ` with an inherited canonical target, spec 10) and 50 real phrases (09c, d, e; Romanian ones in their English translation). The 50 real labels are Sonnet's output checked by hand against the expectation lines; 9 were corrected (`scripts/build-nx-real50.mjs`), so Sonnet's real-subset score is slightly flattered. Batch mode: one request = one world, up to 25 sentences (the gold has 11-25 per world, 22 requests), system prompt = the world's operations with keys and their `ask`, fixed constants, lexicon heads and solved examples (`scripts/lib/nx-prompt.mjs`). `op` = wire type, `?type` for questions, the action name for requests; a slot is scored as (key, canonical value) after lowercasing and removing `$e.`.

| labeler | op acc | slot F1 | real subset op / F1 | span valid | JSON valid (batches) | invalid items | abstain | items/min | est. $ / 1000 items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Haiku 5.5 (subagent) | 95.3 % | 0.860 | 92 % / 0.74 | 100 % | 100 % | 0 | 2.3 % | 56 | 0.38 |
| Claude Sonnet 5.5 (subagent) | 95.0 % | 0.922 | 86 % / 0.92 | 99.3 % | 100 % | 0 | 3.3 % | 97 | 1.15 |
| Qwen3-30B-A3B-Instruct-2507-FP8 (vLLM 0.33, GB10, temp 0) | 87.7 % | 0.769 | 76 % / 0.42 | 93.6 % | 95.5 % (1 of 22 invalid) | 9 | 0.7 % | 57 generation only (model load 805 s) | 0 (GPU) |
| 70-120B quantized | not run: the disk had 49 GB free after the 30B download (a 120B MXFP4 checkpoint is about 65 GB) | | | | | | | | |

Cost is an estimate: tokens = characters / 4 (prompt + batch in, JSON out), list prices assumed at $3 / $15 (Sonnet) and $1 / $5 (Haiku) per million tokens, no batch discount (no API key). The subagent sessions themselves used 217k (Sonnet) and 304k (Haiku) total tokens for the 300 items.

| judge (on the 600 proposed labels of Sonnet and Haiku, 50 items per call) | recall of wrong labels | precision of its flags | false alarms | missed |
| --- | --- | --- | --- | --- |
| Haiku | 16.7 % | 59.4 % | 13 | 95 |
| Sonnet | 28.9 % | 80.5 % | 8 | 81 |

"Wrong" means the label differs from the single gold reading (114 of 600). Many of those are alternative valid readings (a key given twice as `arg.kt` and `arg.kind`, `kids.time` constants, `count=1` for "a", phrase vs split arguments for draw.move) that the judges rightly accept, so recall against this gold is a lower bound and precision the more meaningful number.

**Selection (rule applied, not reviewed):** labeler = **Claude Sonnet 5.5**: Haiku has op 95.3 % but slot F1 0.86 < 0.92; Qwen30 fails every threshold; Sonnet is the cheapest model with op >= 95 % (95.0), F1 >= 0.92 (0.922) and 0 invalid output. Both margins are thin (the gold is small: 300 items; one item is 0.33 points). Judge = **Sonnet, none qualifies** (no judge reaches 90 % recall at 80 % precision; Sonnet is the better of the two). Files: `training/results/nx2-pilot.json`, code `scripts/nx-pilot.mjs`, `scripts/build-nx-gold.mjs`, `scripts/build-nx-real50.mjs`, `training/nx/vllm_label.py`. Raw outputs are in `training/dataset/nx/pilot/` (outside git).

vLLM notes: `python3 -m venv training/.venv-vllm && pip install vllm` works on the GB10 (vllm 0.33.0, torch 2.14 cu130, 9 GB). Two environment fixes were needed: Triton compiles a C stub, so Python.h must be on `C_INCLUDE_PATH` (no root: the headers of `libpython3.12-dev` were unpacked with `dpkg -x` into `training/dataset/nx/pydev`), and `ninja` must be on `PATH` (the venv `bin`). Loading 29 GB took 805 s while the disk was busy.

## NX - encoder formalizer experiment (2026-11-10, Track 2 agent A)

Experiment only: no change to docs/webchat, src/ or worlds/. Format: `training/nx/README.md`. Data and checkpoints are outside git
(`training/dataset/nx`, `training/runs/nx-*`, `training/runs/export/nx-*`).

### NX1 - label format and free labels
Command: `node scripts/export-nx.mjs` (about 2.5 min, 6 workers; second pass learns surface forms for slots whose canonical value is not in the text).
Report: `training/results/nx-data-report.json`. Tests: `node --test tests/nx-export.test.mjs` (7 pass).

| item | value |
| --- | --- |
| segment records | 122,122 (complete 91,936, partial 9,919, filler 20,267) |
| splits | train 97,700, dev 15,075, test 9,347 (inherited from training/dataset, by group) |
| operations / slots | 498 operations, 192,561 slots, 168,862 with a span (87.7 %) |
| span sources | rules slot 56,692, aligned 97,520, lexicon 14,650, dup 1,894, none 21,805 |
| sources | training/dataset rows (rule-derived, generator-backed, paraphrase readings, relabelled, canonical-ok): 47,802; diagram source corpus (data/train only): 74,320 (including filler gaps) |
| protected records dropped | 4,608 (normalized text equal to a text of real-phrases-2026-11-09*, expectations-*, operational*.jsonl, dialogues.jsonl; diagram data/test and data/bench are never read) |
| phrase logs, feedback | none exist in the repo (training/phrase-logs has no .jsonl): counted 0 |

`partial` records (a slot value that no surface form located) train the operation head only. Labels of generator-backed and rule-derived rows are the
rules' own readings, so a model trained on them can at best reproduce the rules plus what the paraphrase and diagram labels add.

### NX4-A - heads on the frozen dispatcher v4 encoder
Base: `training/runs/dispatcher-distilbert-v4e/ckpt-step2448.pt` (the published v4, int8 export sha 6c41eb24). Code: `training/psys2_train/nx_heads.py`.
Commands (cwd `training`, `.venv` python): `python -m psys2_train.nx_heads train --mode A --out <abs>/training/runs/nx-a-seed1 --seed 1`;
`python -m psys2_train.nx_heads train --mode Aplus --epochs 10 --out <abs>/training/runs/nx-aplus-seed1 --seed 1`;
`python -m psys2_train.nx_heads export --run <run> --out <abs>/training/runs/export/<name>`. bf16, batch 256, A 8 epochs (18 s each), A+ 10 epochs (130-330 s each on the shared GPU).
Heads: operation (496 classes, [CLS], same input as the world head `tab: .. ; recent: .. ;; segment`) and BIO tag (667 labels over the tag families).
Numbers are against the NX labels (not yet the rules vs the model comparison; that is NX5).

| model | dev op acc | dev slot F1 | test op acc | test slot F1 | test exact (op + all slots, complete records) | trainable |
| --- | --- | --- | --- | --- | --- | --- |
| A (frozen encoder, heads only) | 0.8899 | 0.8153 | 0.7858 | 0.7402 | 0.4859 | heads only (0.4 M) |
| A+ (top 2 layers unfrozen + distillation replay) | 0.9494 | 0.8920 | 0.8698 | 0.8062 | 0.6183 | 2 layers + heads (14 M) |

Per world (test): `training/results/nx4-a.json` (`nx-a-seed1.test.worlds`, `nx-aplus-seed1.test.worlds`). A+ gains most in diagram.sketch (op .835 -> .942, slot F1 .709 -> .785),
kids.tasks, kids.arith, art.draw; ui.avatar (op .48 / .57) and ui.help (slot F1 .43 / .55) stay weak in both.

**Dispatcher outputs identical to v4 (A).** The exported ONNX has the dispatcher's three outputs in the same order plus `op_logits` and `tag_logits`.
On 400 inputs (300 routing inputs, 100 multi-command messages) the fp32 `seg_logits`, `world_logits`, `edit_logits` equal v4's fp32 export with max abs diff 0.0, and the int8 file equals the published
int8 (6c41eb24) with max abs diff 0.0 (all argmax the same). Size: int8 68.0 MB vs 67.1 MB published (+0.9 MB); one pass 13 ms at 1 thread and 5 ms at 4 threads on this host (CPU, onnxruntime).

**Forgetting check (A+), dispatcher metrics before / after** (6,000 routing test rows, 2,000 multi-command test messages):

| metric | v4 (before) | A+ (after) |
| --- | --- | --- |
| world top-1 | 0.9648 | 0.9656 |
| world top-1 agreement with v4 | 1.0 | 0.9738 (max abs logit diff 2.45) |
| segmentation boundary F1 | 0.8650 | 0.8682 |
| segmentation per-token agreement with v4 | 1.0 | 0.9982 |

The distillation replay (world, edit and segmentation logits against a frozen copy of v4) keeps accuracy: no forgetting in accuracy. But A+ is not a drop-in replacement: on the exported 400
inputs only 96 % keep the same world top-1, 76 % the same whole-message segmentation argmax and 64 % the same edit tags, so the simplification head and `edit_threshold` would need re-evaluation
through the operational set before A+ could replace v4. A leaves v4 untouched by construction.

### NX5-lite - operation agreement with the rules on the operational set
Commands: `node scripts/nx-eval-inputs.mjs` (operational.jsonl + operational-long.jsonl, 1,450 cases, rules reading per segment, rules outcomes from `training/results/operational/rules-nomodel-*.json`);
`python -m psys2_train.nx_eval_ops --runs nx-a-seed1,nx-aplus-seed1 --inputs training/results/nx5-inputs.jsonl --out training/results/nx5-ops.json`. Only cases whose rules outcome is `right` (verified
against the expected answer) and that have no setup messages are used: 829 cases, 1,097 segments, each given alone with `recent: none`. This measures **agreement of the model's operation with a
verified-correct rules reading**, not end-to-end correctness: no canonicalisation, wires, validator or interpreter run yet (full NX5 pipeline is not built). The operational set is protected: no
record of it was used for training (exact normalized texts dropped); near paraphrases may remain in the data (the data principle accepts overlap).

| model | op agreement | model answers `none` |
| --- | --- | --- |
| A (frozen) | 85.4 % | 1.4 % |
| A+ | 88.5 % | 1.4 % |

Weak worlds (A+): ui.avatar 58 % (n 98; `setPart` vs `setPartUnknown` / `resetPart`, 10 % `none`), docs.editor 59 % (n 29), games.hangman 40 % (n 5), geo.map 86 %. In kids.arith the operations
that the rules separate by arithmetic form (`calc` vs `double`, `receive` vs the leader question) are confused. Per world and 40 disagreements per model: `training/results/nx5-ops.json`.
Reading: on the same segments the rules are right by construction, so the model alone is about 11 points behind in the operation; the hybrid D (rules first, model as fallback) and the span part
are still to be measured.


### NX4-B - span extraction from the legend questions (world-agnostic), A seeds
Code `training/psys2_train/nx_spans.py`; operation docs `node scripts/export-nx-opdocs.mjs` (570 entries). Command (cwd `training`):
`python -m psys2_train.nx_spans train --out <abs>/training/runs/nx-b-seed1 --seed 1` (distilbert-base-uncased, 3 epochs, batch 128, lr 5e-5, 160k span examples with 1:1 no-answer asks, 229k operation pairs with 2 hard negatives; bf16; GPU shared with vLLM, 8-15 min per epoch).
Input `<ask> [SEP] <segment>` -> start/end or no answer; operation scored with `<operation doc + example> [SEP] <segment>`, the best of the world's candidate operations wins.
Held out of training (all splits): kids.shop, games.hangman, kids.time. The span metrics use the gold operation's asks; slots without a span are no-answer asks. Metrics: `training/results/nx4-b.json`.

| set | records | op acc | span P | span R | span F1 | record exact (op + all asks) |
| --- | --- | --- | --- | --- | --- | --- |
| test, seen worlds | 6742 | 0.8845 | 0.9347 | 0.9068 | 0.9205 | 0.7348 |
| held-out worlds (dev + test) | 1189 | 0.3953 | 0.6055 | 0.3054 | 0.4060 | 0.1421 |

Held-out per world: games.hangman op 0.292 / span F1 0.461; kids.shop 0.446 / 0.351; kids.time 0.451 / 0.443.
Reading: on seen worlds the question-conditioned reader is decent for spans (F1 .92) but its operation choice (.88) is worse than the NX4-A head (A+ .87 on a harder, larger candidate set is comparable) and
no-answer is weak (0.52: it fills slots that the label leaves empty). **On unseen worlds it does not generalise**: operation .40 (the operation docs of a new world are not enough), span F1 .41
with recall .31 (the legend question alone often does not point at the words: asks such as "What is the item of the tasks.add request?" are synthesized for `core.request.arg.*`, and `kids.shop` / `hangman` slots are short numbers and
letters). Browser cost: **40 encoder passes per segment on average on seen worlds** (14 on the held-out worlds), i.e. one per candidate operation plus one per ask, against one for A / A+
(measured one pass: 5 ms at 4 threads, 13 ms at 1 thread on this CPU; the browser harness figure is 60 ms at 1x / 300 ms at 4x, so about 2.4 s to 12 s per segment for B). Not usable at the same browser cost unless the operation comes from the dispatcher
or from head A and only the asks of that operation are run (about 3 passes).

**Seeds for A** (test op acc / slot F1): seed 1 .7858 / .7402, seed 2 .7849 / .7418, seed 3 .7847 / .7418 (spread 0.1 point: the frozen-encoder result is stable; the gap to A+ is far larger than the seed noise).

### NX5 - full evaluation: rules vs the model readings, through the whole pipeline (2026-11-10)
Code: `scripts/lib/nx-formalizer.mjs` (the model reading as a formalizer strategy, outside `src/`), `scripts/lib/nx-runtime.mjs` (the systems), `scripts/eval-nx.mjs` (one system over every set), `scripts/nx5-report.mjs` (tables). Tests: `node --test tests/nx-formalizer.test.mjs` (4 pass; the engine test needs `NX_ORT` and `NX_EXPORT`).
Commands (one system, all sets, 16 jobs, through the heavy lock): `node scripts/eval-nx.mjs --system <rules|A-only|Aplus-only|A-first|Aplus-first|A-hybrid|Aplus-hybrid|A3-...|Aplus3-...> --ort <onnxruntime-node entry> --jobs 16`; then `node scripts/nx5-report.mjs`. Per-item rows: `training/results/nx5/<system>.json` (not in git, 0.9 MB each; they hold every item's outcome); summaries: `training/results/nx5-summary.json`, `training/results/nx5-nx3-summary.json`.

**Pipeline of the model systems (model output -> spans and operation -> deterministic canonicalisation through the lexicon -> SOP wires -> validator -> interpreter).**
1. The NX ONNX (A: frozen v4 encoder + op head + BIO tag head; A+: top 2 layers unfrozen) gives, in the dispatcher's own pass, the segmentation (best of the beam), the operation distribution and the BIO tags of the segment.
2. Candidate operations: the 3 best (not `none`) that some pattern of the loaded worlds can emit; candidate patterns: the patterns whose emit makes that operation (the legend/pattern bank says which keys the operation has). BIO decoding is restricted to the keys of the candidate operation (one span per key).
3. Canonicalisation is the rules' own machinery, not a new one: a sentence is synthesized from the candidate pattern's match string with the predicted spans in the slots of those keys, the rule formalizer restricted to that operation reads it (number words, lexicon lemmas, agents and names, `{segment}`, constants of the emit), and the emit template builds the wires. A pattern whose emit has no value slot (the diagram.sketch family: operation only) is read on the real text, or on its own frame sentence. **The model never sees constants fixed by a pattern** (`where.op=plus`, `arg.list=to-do`): among patterns of one operation that use the same spans, the one whose frame words (its literal words and phrase alternatives, slots left out) best fit the segment wins. That is a pattern-bank choice made without a learned head; it is what made kids.arith work at all (operational 18 -> 30 right of the first 40 cases).
4. Validator: the legend check inside the formalizer, then the interpreter dry run on a fork of the session that already holds the wires accepted for the earlier segments of the message (an error status drops the reading, the next candidate is tried). Nothing left -> the segment is not understood.
The pre-processing of the engine (translator, filler stripping, meta/discourse layer, self-correction expansion) is shared by every system, since it is part of the pipeline the rules run in too.

Systems: **rules** = the shipped rule pipeline (spelling, partial understanding, best effort; `--mode rules` settings). **X-only** = the model's reading alone: a segment it cannot read validly is not understood, and there is no rules retry and no rule-based leniency (spelling, partial, best effort off). **X-first** = model first, the rules read what it could not (the engine's own retry, leniency on). **X-hybrid = D** = the rules first, as shipped *including their leniency* (the engine's `_formalize` is wrapped at run time, no change in `src/`); the model reads only the segments that still have no complete reading (unparsed, partial, ignored words, best-effort guess), the validator checks every model reading, and a segment the model cannot read validly keeps the rules' answer. (A first version of D let the model act before the rules' own spelling leniency; it lost 16 correct operational cases to confident wrong model readings of typos, which is why the leniency now comes first.)

Sets: operational (1,296) and operational-long (154): the expectation of the case holds. Dialogues (449): each turn's expectation. **gold** = `training/nx/gold/pilot-300.jsonl`, record level (the first reading's operation and every (key, value) equal the gold reading; `gold-rules` = 150 rules-verified, `gold-para` = 100 paraphrases where the rules fail or differ, `gold-real` = 50 real phrases). **nxtest** = NX1 records of the dev/test splits, record level: `rules-fail` (+ `rules-differ`), `generator-disagrees`, and a sample of 700 others. **real-09c/d/e**: the *world* named at the start of the expectation line reads the phrase (the lines are prose, so this is world level only; phrases whose line names no world are counted "unjudged" when answered). **mobile**: the 108 Romanian voice fragments of the phone export, English as logged: answered / abstained and world agreement with the logged rules reading when it was supported. **diagram bench** (imports/diagram-vss-demo/data/bench, 1,128 rows) with the source scorer `bench-canon.js`: the act must be the gold act (from the pattern the model's operation selects) and the args are read by the diagram world's reader exactly as in `scripts/eval-diagram.mjs` (so the model's part there is the act, not the args). Cells below: `correct / wrong (partly counted as wrong) / abstain (correct %)`.

**Selection effect to keep in mind.** `gold-para`, `nxtest-rules-fail` and `nxtest-gen-disagrees` were chosen *because* the rules fail or differ there, so the rules' 22 / 18 / 13 % is by construction; the model readings are not comparable between those sets and the neutral ones (operational, `nxtest-sample`). `nxtest-gen-disagrees` is a set where the rules answer confidently and (judged by the generator) wrongly: D cannot change it because the rules do not abstain.

Cells are `correct / wrong (partly counted as wrong) / abstain (correct %)`. n = items of the set.

| set | n | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| operational | 1296 | 1239 / 28 / 29 (95.6%) | 825 / 256 / 215 (63.7%) | 850 / 229 / 217 (65.6%) | 982 / 226 / 88 (75.8%) | 995 / 214 / 87 (76.8%) | 1237 / 38 / 21 (95.4%) | 1239 / 36 / 21 (95.6%) |
| operational-long | 154 | 87 / 49 / 18 (56.5%) | 49 / 92 / 13 (31.8%) | 55 / 81 / 18 (35.7%) | 62 / 85 / 7 (40.3%) | 73 / 72 / 9 (47.4%) | 89 / 54 / 11 (57.8%) | 89 / 53 / 12 (57.8%) |
| gold-rules | 150 | 147 / 1 / 2 (98.0%) | 116 / 27 / 7 (77.3%) | 119 / 24 / 7 (79.3%) | 121 / 27 / 2 (80.7%) | 124 / 24 / 2 (82.7%) | 147 / 1 / 2 (98.0%) | 147 / 1 / 2 (98.0%) |
| gold-para | 100 | 22 / 40 / 38 (22.0%) | 71 / 24 / 5 (71.0%) | 73 / 20 / 7 (73.0%) | 69 / 28 / 3 (69.0%) | 71 / 25 / 4 (71.0%) | 52 / 45 / 3 (52.0%) | 56 / 40 / 4 (56.0%) |
| gold-real | 50 | 23 / 18 / 9 (46.0%) | 15 / 31 / 4 (30.0%) | 16 / 29 / 5 (32.0%) | 16 / 31 / 3 (32.0%) | 16 / 30 / 4 (32.0%) | 24 / 23 / 3 (48.0%) | 24 / 23 / 3 (48.0%) |
| nxtest-rules-fail | 44 | 8 / 23 / 13 (18.2%) | 18 / 23 / 3 (40.9%) | 22 / 20 / 2 (50.0%) | 19 / 25 / 0 (43.2%) | 23 / 21 / 0 (52.3%) | 9 / 35 / 0 (20.5%) | 13 / 31 / 0 (29.5%) |
| nxtest-gen-disagrees | 97 | 13 / 84 / 0 (13.4%) | 40 / 8 / 49 (41.2%) | 41 / 17 / 39 (42.3%) | 47 / 50 / 0 (48.5%) | 48 / 49 / 0 (49.5%) | 13 / 84 / 0 (13.4%) | 13 / 84 / 0 (13.4%) |
| nxtest-sample | 700 | 679 / 18 / 3 (97.0%) | 454 / 191 / 55 (64.9%) | 490 / 179 / 31 (70.0%) | 498 / 199 / 3 (71.1%) | 515 / 182 / 3 (73.6%) | 680 / 17 / 3 (97.1%) | 680 / 17 / 3 (97.1%) |
| real-09c | 24 | 13 / 1 / 8 (+2 unjudged) (54.2%) | 13 / 3 / 6 (+2 unjudged) (54.2%) | 14 / 3 / 5 (+2 unjudged) (58.3%) | 15 / 2 / 5 (+2 unjudged) (62.5%) | 15 / 3 / 4 (+2 unjudged) (62.5%) | 15 / 2 / 5 (+2 unjudged) (62.5%) | 16 / 1 / 5 (+2 unjudged) (66.7%) |
| real-09d | 15 | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) |
| real-09e | 21 | 17 / 1 / 3 (81.0%) | 16 / 2 / 2 (+1 unjudged) (76.2%) | 15 / 3 / 2 (+1 unjudged) (71.4%) | 16 / 2 / 2 (+1 unjudged) (76.2%) | 16 / 3 / 1 (+1 unjudged) (76.2%) | 17 / 1 / 3 (81.0%) | 17 / 2 / 2 (81.0%) |
| diagram bench | 1128 | 1106 / 22 / 0 (98.0%) | 784 / 128 / 216 (69.5%) | 900 / 35 / 193 (79.8%) | 1005 / 123 / 0 (89.1%) | 1096 / 32 / 0 (97.2%) | 1106 / 22 / 0 (98.0%) | 1106 / 22 / 0 (98.0%) |

Operational sets: `partly` = the answer executed some but not all expected items (omission). Counted as wrong above; split here.

| set | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| operational | R 1239 / P 22 / W 6 / NU 29 | R 825 / P 53 / W 203 / NU 215 | R 850 / P 47 / W 182 / NU 217 | R 982 / P 39 / W 187 / NU 88 | R 995 / P 40 / W 174 / NU 87 | R 1237 / P 22 / W 16 / NU 21 | R 1239 / P 22 / W 14 / NU 21 |
| operational-long | R 87 / P 14 / W 35 / NU 18 | R 49 / P 59 / W 33 / NU 13 | R 55 / P 48 / W 33 / NU 18 | R 62 / P 46 / W 39 / NU 7 | R 73 / P 33 / W 39 / NU 9 | R 89 / P 18 / W 36 / NU 11 | R 89 / P 19 / W 34 / NU 12 |

Dialogues (449 dialogues): turns right / turns wrong / turns not understood, dialogues right.

|  | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| turns | 2109 / 33 / 35 (96.9%) | 1096 / 316 / 765 (50.3%) | 1123 / 381 / 673 (51.6%) | 1749 / 293 / 135 (80.3%) | 1682 / 364 / 131 (77.3%) | 2099 / 54 / 24 (96.4%) | 2101 / 54 / 22 (96.5%) |
| dialogues right | 402/449 (89.5%) | 93/449 (20.7%) | 93/449 (20.7%) | 263/449 (58.6%) | 230/449 (51.2%) | 397/449 (88.4%) | 398/449 (88.6%) |

Mobile export (108 Romanian voice fragments, English as logged): answered / abstained, and world agreement with the logged rules reading where that was supported (18).

|  | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| answered / abstained | 52 / 56 | 76 / 32 | 72 / 36 | 92 / 16 | 87 / 21 | 87 / 21 | 90 / 18 |
| world agrees on the 18 supported | 16/18 | 6/18 | 1/18 | 11/18 | 8/18 | 15/18 | 15/18 |

Operational set (1,296) by world: right % (n).

| world | n | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| art.draw | 99 | 88.9 | 14.1 | 14.1 | 65.7 | 59.6 | 88.9 | 88.9 |
| data.charts | 57 | 93.0 | 78.9 | 43.9 | 80.7 | 45.6 | 93.0 | 93.0 |
| docs.editor | 99 | 100.0 | 37.4 | 47.5 | 43.4 | 51.5 | 99.0 | 100.0 |
| docs.reader | 24 | 91.7 | 79.2 | 70.8 | 83.3 | 70.8 | 95.8 | 95.8 |
| games.chess | 41 | 95.1 | 82.9 | 82.9 | 92.7 | 92.7 | 95.1 | 95.1 |
| games.guess | 32 | 100.0 | 87.5 | 87.5 | 87.5 | 87.5 | 96.9 | 100.0 |
| games.hangman | 32 | 96.9 | 87.5 | 90.6 | 87.5 | 90.6 | 93.8 | 96.9 |
| games.tictactoe | 43 | 93.0 | 88.4 | 95.3 | 90.7 | 95.3 | 93.0 | 93.0 |
| geo.map | 94 | 94.7 | 56.4 | 60.6 | 71.3 | 78.7 | 94.7 | 94.7 |
| kids.animals | 80 | 96.3 | 88.8 | 91.3 | 91.3 | 92.5 | 96.3 | 96.3 |
| kids.arith | 145 | 98.6 | 52.4 | 57.9 | 71.7 | 73.1 | 97.9 | 97.9 |
| kids.common | 36 | 100.0 | 94.4 | 91.7 | 94.4 | 91.7 | 100.0 | 100.0 |
| kids.shapes | 62 | 90.3 | 87.1 | 91.9 | 98.4 | 96.8 | 91.9 | 91.9 |
| kids.shop | 43 | 100.0 | 39.5 | 44.2 | 83.7 | 86.0 | 100.0 | 100.0 |
| kids.tasks | 38 | 86.8 | 81.6 | 86.8 | 84.2 | 89.5 | 86.8 | 86.8 |
| kids.time | 97 | 95.9 | 77.3 | 78.4 | 82.5 | 84.5 | 95.9 | 95.9 |
| media.music | 82 | 95.1 | 70.7 | 73.2 | 72.0 | 79.3 | 95.1 | 93.9 |
| ui.avatar | 127 | 96.1 | 45.7 | 52.0 | 56.7 | 64.6 | 96.1 | 96.1 |
| ui.help | 20 | 100.0 | 95.0 | 95.0 | 95.0 | 95.0 | 100.0 | 100.0 |
| ui.shell | 45 | 100.0 | 80.0 | 84.4 | 84.4 | 88.9 | 100.0 | 100.0 |

All record-level sets together (gold-300, nxtest) by world: correct % (n).

| world | n | rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| art.draw | 107 | 91.6 | 29.9 | 31.8 | 53.3 | 50.5 | 92.5 | 92.5 |
| data.charts | 31 | 67.7 | 58.1 | 67.7 | 61.3 | 67.7 | 74.2 | 74.2 |
| diagram.sketch | 25 | 84.0 | 64.0 | 64.0 | 64.0 | 64.0 | 84.0 | 84.0 |
| docs.editor | 65 | 78.5 | 36.9 | 47.7 | 52.3 | 58.5 | 73.8 | 78.5 |
| docs.reader | 59 | 91.5 | 81.4 | 88.1 | 81.4 | 88.1 | 91.5 | 91.5 |
| games.chess | 41 | 80.5 | 87.8 | 90.2 | 87.8 | 90.2 | 80.5 | 82.9 |
| games.guess | 49 | 81.6 | 85.7 | 83.7 | 83.7 | 83.7 | 91.8 | 91.8 |
| games.hangman | 35 | 85.7 | 85.7 | 85.7 | 88.6 | 85.7 | 91.4 | 91.4 |
| games.tictactoe | 101 | 56.4 | 87.1 | 87.1 | 87.1 | 88.1 | 59.4 | 59.4 |
| geo.map | 39 | 89.7 | 61.5 | 71.8 | 61.5 | 71.8 | 89.7 | 89.7 |
| kids.animals | 50 | 88.0 | 92.0 | 94.0 | 92.0 | 94.0 | 94.0 | 96.0 |
| kids.arith | 48 | 85.4 | 72.9 | 79.2 | 79.2 | 81.3 | 89.6 | 89.6 |
| kids.common | 46 | 87.0 | 89.1 | 91.3 | 87.0 | 93.5 | 91.3 | 93.5 |
| kids.shapes | 76 | 92.1 | 69.7 | 73.7 | 78.9 | 71.1 | 94.7 | 94.7 |
| kids.shop | 19 | 57.9 | 78.9 | 84.2 | 78.9 | 84.2 | 68.4 | 68.4 |
| kids.tasks | 24 | 87.5 | 70.8 | 79.2 | 70.8 | 79.2 | 91.7 | 91.7 |
| kids.time | 64 | 90.6 | 35.9 | 34.4 | 34.4 | 34.4 | 90.6 | 90.6 |
| media.music | 66 | 92.4 | 59.1 | 68.2 | 60.6 | 69.7 | 93.9 | 93.9 |
| ui.avatar | 122 | 43.4 | 25.4 | 34.4 | 33.6 | 39.3 | 45.1 | 46.7 |
| ui.help | 35 | 82.9 | 71.4 | 71.4 | 74.3 | 74.3 | 91.4 | 91.4 |
| ui.shell | 39 | 61.5 | 79.5 | 79.5 | 79.5 | 79.5 | 74.4 | 74.4 |

**How the systems differ (operational set + long, 1,450 cases, against the rules).** model-first with rules fallback (A+): right -> wrong 183, right -> not understood 85, right -> partly 48 against wrong/not-understood -> right 32: the model-first systems are not usable as a replacement. **D (A+)**: of the 1,450 operational + long cases it turns 9 wrong / partial / not-understood cases into right (not understood -> right 5, partly -> right 3, wrong -> right 1) and 7 right ones into wrong or partial (right -> wrong 5, right -> partly 2): a net of +2 (rules 1,326 right, D(A+) 1,328, D(A) 1,326). On the cases where the rules fail by construction the same D gains: `gold-para` 22 -> 56 / 100, `nxtest-rules-fail` 8 -> 13 / 44, `real-09c` +3, and on the mobile export it answers 90 of 108 fragments (rules 52) but the world of the 18 supported ones agrees only 15 / 18 (rules 16 / 18 with themselves); abstentions of the rules are still abstentions in most cases, since an abstention in `gold-para` is where the model has something to say.

**Complementarity (model-first A+ against rules, per item).** Right in both / rules only / model only / neither: operational 1,010 / 316 / 58 / 66 (n 1,450); `gold-para` 20 / 2 / 51 / 27; `nxtest-rules-fail` 3 / 5 / 20 / 16; `nxtest-gen-disagrees` 13 / 0 / 35 / 49; `nxtest-sample` 513 / 166 / 2 / 19; `gold-real` 14 / 9 / 2 / 25. On paraphrases outside the rules' patterns the model is the better reader (71-73 % operation-and-slots exact on `gold-para` against the rules' 22 %), on the whole operational set the rules are right in 316 cases where it is not.

**Per-system counters** (how many segments the model read, by which route, how many it declined) are in the `nxStatsMaxPerWorker` field of every `training/results/nx5/<system>.json` and in `nx5-summary.json`.

### NX3 data in the models (retrain of A and A+ on NX1 + NX3)
Data: agent B's NX3 output `training/dataset/nx/final/*.jsonl` (13,082 Sonnet-labelled items after the deterministic gate and the judge; train 11,736 / dev 564 / test 782), minus the 17 items whose normalized text equals a protected text (`final-filtered/`), plus NX1's `free-*.jsonl`. Commands (cwd `training`): `python -m psys2_train.nx_heads train --mode A --out <abs>/training/runs/nx-a-nx3 --seed 1 --data '<abs>/training/dataset/nx/free-*.jsonl,<abs>/training/dataset/nx/final-filtered/*.jsonl'`, the same with `--mode Aplus --epochs 10 --out .../nx-aplus-nx3`, then `export` for both (exports `training/runs/export/nx-a-nx3`, `nx-aplus-nx3`; `--data` now takes comma-separated globs).

| model | test op acc | test slot F1 | test exact | test records | dispatcher outputs |
| --- | --- | --- | --- | --- | --- |
| A (NX1) | 0.7858 | 0.7402 | 0.4859 | 9,347 | identical to v4 |
| A3 (NX1 + NX3) | 0.8010 | 0.7428 | 0.5119 | 10,129 | identical to v4 (int8 max abs diff 0.0) |
| A+ (NX1) | 0.8698 | 0.8062 | 0.6183 | 9,347 | world top-1 0.9656, agreement with v4 0.9738 |
| A+3 (NX1 + NX3) | 0.8801 | 0.8068 | 0.6379 | 10,129 | world top-1 0.9656, agreement 0.9715, boundary F1 0.8684 |

(The two test columns are on different record sets: A3 / A+3 add the 782 NX3 test items.) End to end, NX5 with the retrained models (same commands, systems `A3-*`, `Aplus3-*`):

Cells are `correct / wrong (partly counted as wrong) / abstain (correct %)`. n = items of the set.

| set | n | rules | A-only | A3-only | Aplus-only | Aplus3-only | A-hybrid | A3-hybrid | Aplus-hybrid | Aplus3-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| operational | 1296 | 1239 / 28 / 29 (95.6%) | 825 / 256 / 215 (63.7%) | 811 / 282 / 203 (62.6%) | 850 / 229 / 217 (65.6%) | 819 / 267 / 210 (63.2%) | 1237 / 38 / 21 (95.4%) | 1231 / 45 / 20 (95.0%) | 1239 / 36 / 21 (95.6%) | 1231 / 43 / 22 (95.0%) |
| operational-long | 154 | 87 / 49 / 18 (56.5%) | 49 / 92 / 13 (31.8%) | 48 / 89 / 17 (31.2%) | 55 / 81 / 18 (35.7%) | 52 / 87 / 15 (33.8%) | 89 / 54 / 11 (57.8%) | 89 / 54 / 11 (57.8%) | 89 / 53 / 12 (57.8%) | 89 / 54 / 11 (57.8%) |
| gold-rules | 150 | 147 / 1 / 2 (98.0%) | 116 / 27 / 7 (77.3%) | 113 / 31 / 6 (75.3%) | 119 / 24 / 7 (79.3%) | 118 / 25 / 7 (78.7%) | 147 / 1 / 2 (98.0%) | 147 / 1 / 2 (98.0%) | 147 / 1 / 2 (98.0%) | 147 / 1 / 2 (98.0%) |
| gold-para | 100 | 22 / 40 / 38 (22.0%) | 71 / 24 / 5 (71.0%) | 75 / 22 / 3 (75.0%) | 73 / 20 / 7 (73.0%) | 82 / 15 / 3 (82.0%) | 52 / 45 / 3 (52.0%) | 59 / 39 / 2 (59.0%) | 56 / 40 / 4 (56.0%) | 63 / 34 / 3 (63.0%) |
| gold-real | 50 | 23 / 18 / 9 (46.0%) | 15 / 31 / 4 (30.0%) | 15 / 29 / 6 (30.0%) | 16 / 29 / 5 (32.0%) | 18 / 27 / 5 (36.0%) | 24 / 23 / 3 (48.0%) | 24 / 23 / 3 (48.0%) | 24 / 23 / 3 (48.0%) | 24 / 23 / 3 (48.0%) |
| nxtest-rules-fail | 44 | 8 / 23 / 13 (18.2%) | 18 / 23 / 3 (40.9%) | 22 / 21 / 1 (50.0%) | 22 / 20 / 2 (50.0%) | 29 / 13 / 2 (65.9%) | 9 / 35 / 0 (20.5%) | 12 / 32 / 0 (27.3%) | 13 / 31 / 0 (29.5%) | 15 / 28 / 1 (34.1%) |
| nxtest-gen-disagrees | 97 | 13 / 84 / 0 (13.4%) | 40 / 8 / 49 (41.2%) | 44 / 9 / 44 (45.4%) | 41 / 17 / 39 (42.3%) | 39 / 19 / 39 (40.2%) | 13 / 84 / 0 (13.4%) | 13 / 84 / 0 (13.4%) | 13 / 84 / 0 (13.4%) | 13 / 84 / 0 (13.4%) |
| nxtest-sample | 700 | 679 / 18 / 3 (97.0%) | 454 / 191 / 55 (64.9%) | 467 / 185 / 48 (66.7%) | 490 / 179 / 31 (70.0%) | 498 / 164 / 38 (71.1%) | 680 / 17 / 3 (97.1%) | 680 / 17 / 3 (97.1%) | 680 / 17 / 3 (97.1%) | 680 / 17 / 3 (97.1%) |
| real-09c | 24 | 13 / 1 / 8 (+2 unjudged) (54.2%) | 13 / 3 / 6 (+2 unjudged) (54.2%) | 15 / 3 / 3 (+3 unjudged) (62.5%) | 14 / 3 / 5 (+2 unjudged) (58.3%) | 15 / 2 / 4 (+3 unjudged) (62.5%) | 15 / 2 / 5 (+2 unjudged) (62.5%) | 15 / 2 / 5 (+2 unjudged) (62.5%) | 16 / 1 / 5 (+2 unjudged) (66.7%) | 15 / 2 / 5 (+2 unjudged) (62.5%) |
| real-09d | 15 | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) | 15 / 0 / 0 (100.0%) |
| real-09e | 21 | 17 / 1 / 3 (81.0%) | 16 / 2 / 2 (+1 unjudged) (76.2%) | 16 / 1 / 3 (+1 unjudged) (76.2%) | 15 / 3 / 2 (+1 unjudged) (71.4%) | 15 / 0 / 5 (+1 unjudged) (71.4%) | 17 / 1 / 3 (81.0%) | 17 / 1 / 3 (81.0%) | 17 / 2 / 2 (81.0%) | 17 / 1 / 3 (81.0%) |
| diagram bench | 1128 | 1106 / 22 / 0 (98.0%) | 784 / 128 / 216 (69.5%) | 817 / 134 / 177 (72.4%) | 900 / 35 / 193 (79.8%) | 951 / 32 / 145 (84.3%) | 1106 / 22 / 0 (98.0%) | 1106 / 22 / 0 (98.0%) | 1106 / 22 / 0 (98.0%) | 1106 / 22 / 0 (98.0%) |

Dialogues (449 dialogues): turns right / turns wrong / turns not understood, dialogues right.

|  | rules | A-only | A3-only | Aplus-only | Aplus3-only | A-hybrid | A3-hybrid | Aplus-hybrid | Aplus3-hybrid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| turns | 2109 / 33 / 35 (96.9%) | 1096 / 316 / 765 (50.3%) | 1153 / 423 / 601 (53.0%) | 1123 / 381 / 673 (51.6%) | 1168 / 442 / 567 (53.7%) | 2099 / 54 / 24 (96.4%) | 2100 / 54 / 23 (96.5%) | 2101 / 54 / 22 (96.5%) | 2098 / 60 / 19 (96.4%) |
| dialogues right | 402/449 (89.5%) | 93/449 (20.7%) | 111/449 (24.7%) | 93/449 (20.7%) | 103/449 (22.9%) | 397/449 (88.4%) | 397/449 (88.4%) | 398/449 (88.6%) | 395/449 (88.0%) |

Reading: the NX3 data helps where the data is aimed, the paraphrase sets (`gold-para` A+ 73 -> 82 %, `nxtest-rules-fail` 50 -> 66 %, the diagram bench act 79.8 -> 84.3 % for A+ alone, dialogues right 21 -> 25 % for A), and it costs a little on the sets of the rules' own phrasing (operational model-alone A 63.7 -> 62.6 %, A+ 65.6 -> 63.2 %): the LLM phrasings move the head toward paraphrase and away from the pattern-bank forms the operational set is made of. D barely moves (operational 95.4 -> 95.0 %, `gold-para` D(A+) 56 -> 63 %). A3 is still a drop-in for v4 (+0.9 MB); A+3 is not.

### NX4-C - per-world LoRA r=8 plus heads (diagram.sketch, media.music, art.draw)
Code `training/psys2_train/nx_lora.py`. Base: the frozen v4 encoder with the NX4-A heads (nx-a-seed1); trainable: LoRA r=8 on q, k, v, out, lin1, lin2 of the 6 layers **and on the two heads** (op head over 496 operations, BIO tag head over 667 labels), 0.685 M parameters, trained on the world's own NX1 records, 10 epochs, batch 128, lr 1e-3, bf16 (seconds to 7 minutes). Commands (cwd `training`): `python -m psys2_train.nx_lora train --world <world> --out <abs>/training/runs/nx-c-<world>`; `python -m psys2_train.nx_lora export --runs <run1>,<run2>,<run3> --out <abs>/training/runs/export/nx-c`. Metrics: `training/results/nx4-c-<world>.json`, export report `training/results/nx4-c-export.json`.

| world | train records | test op acc A -> C | test slot F1 A -> C | test exact A -> C | adapter |
| --- | --- | --- | --- | --- | --- |
| diagram.sketch | 59,983 | 0.8346 -> 0.9561 | 0.7085 -> 0.8497 | 0.4364 -> 0.7175 | 2.75 MB |
| media.music | 2,348 | 0.8061 -> 0.8776 | 0.7507 -> 0.8260 | 0.4473 -> 0.6255 | 2.75 MB |
| art.draw | 2,447 | 0.6862 -> 0.7938 | 0.6154 -> 0.7653 | 0.4441 -> 0.6166 | 2.75 MB |

(C also beats A+ on diagram.sketch: A+ test op .942 / slot F1 .785.) Export: one base graph `model.int8.onnx` (70.6 MB: int8 weights, the 76 LoRA matrices stay fp32 as overridable initializers, i.e. graph inputs that also have an initializer; the all-zero B matrices get a 1e-7 noise each because the exporter merges identical initializers) plus one `<world>.onnx_adapter` per world (`onnxruntime` `AdapterFormat`, the adapter carries the encoder deltas and the head deltas). **Browser check** (`training/experiments/browser-limits/nx-lora-run.mjs`, onnxruntime-web 1.31, `results-nx-lora.json`): `ort.LoraAdapter.create` takes 0.4-2.4 ms (1x) and the three adapters load in the same session; with `activeLoraAdapters` the browser's top-1 operation equals the Python onnxruntime result with the same adapter on 12 / 12 items of each world (the tag argmax is identical on 10-11 of 12; the others differ by an int8 tie), including the 1-2 items per world where the adapter changes the operation relative to the base; one pass of 32 tokens is 51-52 ms with or without an adapter at 1x and 210 ms at 4x, swapping adapters between runs costs nothing measurable (51.5 ms). Not done: NX5 end to end with the adapters (the per-world pass would be a second encoder pass after the dispatcher's world choice, and the pipeline of NX5 is the same as for A; the record-level numbers above are the C result).

### NX5 - browser cost of the real exported A model
`training/experiments/browser-limits/nx-run.mjs` (headless Chromium, onnxruntime-web 1.31, single thread like the webchat, host: this DGX, shared with other jobs): `PUPPETEER_CORE=<puppeteer-core> node nx-run.mjs --nx training/runs/export/nx-a-seed1 --disp docs/webchat/models/dispatcher/model.int8.onnx --ort docs/webchat/vendor/onnxruntime --ortnode <onnxruntime-node entry> --throttle 1,4`; results `results-nx-a.json`.

| | size | outputs | median ms, 16 / 24 / 32 / 48 / 64 tokens, 1x | same, 4x CPU throttle |
| --- | --- | --- | --- | --- |
| NX model A (int8) | 68.0 MB | seg, world, edit, op (496), tag (667 labels) | 28 / 39 / 50 / 73 / 95 | 90 / 151 / 172 / 301 / 389 |
| dispatcher v4 (published int8) | 67.1 MB | seg, world, edit | 27 / 39 / 50 / 72 / 94 | 102 / 185 / 177 / 294 / 384 |

The heads cost +0.9 MB and no measurable time (model creation 379 ms against 77 ms at 1x, 2178 ms against 474 ms at 4x on this host, where a first creation also compiles the kernels). Parity in the browser: on 10 real inputs the browser's op argmax equals onnxruntime-node's on 10 / 10 (tag argmax identical per token on 7 / 10; the others differ by int8 ties). A message of one command costs the passes the dispatcher already runs (segmentation + one per distinct piece of the 4 best segmentations, about 8 at 4x, the same passes now also carry the op and tag outputs); the readings of NX5 use only the best segmentation and one pass per segment. B (span extraction from the legend questions) was not measured in the browser: 40 passes per segment on seen worlds (NX4-B) is 2.4-12 s per segment by the harness figures.

### NX recommendation
1. **Do not replace the rules.** Whatever the head (A, A+, with the NX3 data), the model reading alone is 62-66 % on the operational set against the rules' 95.6 %, and 20-24 % on whole dialogues against 89.5 %; model-first with the rules as a fallback is 76-77 % and 51-59 %. The model's errors are mostly confident wrong readings in the worlds with arithmetic forms and constants fixed by a pattern (art.draw 14 %, kids.shop 40 %, kids.arith 52 %, ui.avatar 46 % model-alone), where the operation carries a constant the heads cannot see.
2. **The model is the better reader of what the rules do not know.** On paraphrases outside the patterns it is right on 71-82 % (A / A+, with and without NX3) where the rules are right on 22 %, and the diagram bench act is 84 % model-alone (A+3) against the rules' 98 % (the bench is the rules' own corpus). That is where it pays, not on the traffic the rules already read.
3. **D (rules first with their leniency, the model only for segments with no complete reading, validator always) is safe but gains little today:** operational 95.6 -> 95.6 % (A+) / 95.4 % (A), dialogues 96.9 -> 96.5 %, +3 on the real phrases 09c, +34 points on `gold-para`, 90 / 108 answered on the mobile export (52 rules). It recovers 9 of the 1,450 operational cases and loses 7 to wrong re-readings of segments the rules had answered partially. It would need a confidence gate (the model's operation probability and agreement of op and spans with the legend; the logs already have both) before it is worth shipping; with a gate that passes only high-confidence readings and keeps the rules' partial answers the loss side should go to zero.
4. **If one model goes to the browser, it is A3 (heads on the frozen encoder, +0.9 MB, same passes, dispatcher outputs identical to v4)**; A+ is 3 points better on the operation and slots but changes the dispatcher's own outputs (segmentation per-token agreement 0.998, world agreement 0.97), so it needs the operational re-evaluation of the simplifier thresholds first (NX4-A forgetting check) and is the only variant that gains on the operational model-alone number (+2 points). For the three worlds where the specialisation matters, **C (LoRA, 2.75 MB per world, +0 ms, one extra pass per message after the world is known)** gives diagram.sketch .956 op / .850 slot F1 (A .835 / .709), art.draw .794 / .765 (A .686 / .615), media.music .878 / .826 (A .806 / .751), and it works in onnxruntime-web 1.31.
5. **B does not work at the browser cost** (40 passes) **and does not generalise to unseen worlds** (op 0.40): drop it.
6. Next measurable step, if the user wants it: the confidence gate of D (recall of the 51 / 100 paraphrases the model reads and the rules do not, at a loss under 3 of 1,450), then the same with C adapters for the diagram world; and more NX3 data aimed at constants (arithmetic operator forms, `arg.list`, `arg.anim`), the weak worlds above.

Caveats: the real-phrase check is at the world level (the expectation lines are prose); the mobile export has no gold (answered / abstained and agreement with the rules only); the diagram bench counts the act only for the model (the args of the diagram world are produced by its own reader); `gold-real` labels were produced by Sonnet and corrected by hand for 9 of 50 items (NX2), the `gold-real` numbers are therefore slightly flattering to a reading that follows Sonnet's; and the rules' leniency (spelling, partial understanding, best effort) is included in "rules" and in D, but not in X-only.

### NX6 conditions against these numbers (reviewer's four conditions for integrating model A as a strategy parallel to the rules)
D here is built on the **rules** mode (no dispatcher, no normalizer); the comparison with the current webchat mode (encoder+n1: operational 98.6 % right, 0.4 % wrong on the 1,240-case file of the published run) would need D on top of encoder+n1, which was not built. With the numbers above:
1. Sets where the rules fail, D(A+) against the rules: `gold-para` +34 points (22 -> 56 %), `nxtest-rules-fail` +11 (18 -> 30 %; 8 -> 13 of 44), operational cases that were not right with the rules (124 of 1,450): 9 of them become right (+7 points of that subset), real phrases 09c +3 of 24 (+12 points). **Holds** (at least +3 points).
2. Operational set and long set, wrong rate: D(A+) 14 wrong of 1,296 (1.1 %) against the rules' 6 (0.5 %) and encoder+n1's 5 of 1,240 (0.4 %), i.e. **+0.6 points wrong: does not hold** (limit +0.2). The long set: 34 against 35 wrong.
3. Dialogues: right 96.9 -> 96.5 % turns (-0.4, inside the limit), wrong turns 33 -> 54 (+1.0 point of 2,177 turns: **does not hold**, limit +0.2); the Romanian set (`operational-ro.jsonl`) was not run through `eval-nx` (the model path is English-only, as the whole NX data).
4. Browser cost: **holds by construction** (model A: +0.9 MB, the same pass, 50 ms at 32 tokens against 50 ms for v4, 1x); the ready time in `scripts/perf-webchat.mjs` was not measured.
So the numbers are not clear for integration today: conditions 2 and 3 fail on the wrong rate (the model re-reads partial rule answers and typos wrongly; the unrecovered losses are 7 right -> wrong / partly and 7 not-understood -> wrong). A confidence gate (op probability, spans consistent with the pattern's frame) that keeps the rules' partial answers would be the first thing to try; D stays available only in `scripts/eval-nx.mjs` (`--system A-hybrid`, `Aplus-hybrid`).
## NX3 (2026-11-10): bulk generation with the chosen labeler (Claude Sonnet 5.5) and judge (Claude Sonnet 5.5)

Pipeline (every stage resumable, files in `training/dataset/nx/{seeds,gen,final}`, outside git): `scripts/nx-seeds.mjs` (7,181 labelled seeds over 22 worlds: rules-read pattern examples, paraphrase canonicals, and the 716 paraphrase items the rules fail on; 669 seeds equal to a protected-set text were dropped) -> `scripts/nx-gen.mjs prepare|collect` (a shard = 15 seeds x 20 phrasings = 300 items, one Sonnet session over 10-18 shard files; 16 English + 4 Romanian phrasings per seed; the phrasing keeps the seed's operation and parameter values, so labels are inherited and the model only writes the wording and the words that express each slot; Romanian phrasings go through `src/translate` ro-en and the spans are found again in the English text) -> `scripts/nx-validate.mjs` / `scripts/lib/nx-gate.mjs` (deterministic gate, 8 unit tests in `tests/nx-validate.test.mjs`) -> `scripts/nx-pipeline.mjs agree` (rules read every text) -> `judge-prepare` (all disagreements in batches of 50 plus a 3 % audit sample of the agreed) -> `finalize` (verdicts, NX1 records through `scripts/lib/nx3-format.mjs`, `scripts/export-nx.mjs --check` clean, split by group 90/5/5, protected-set texts removed) -> `scripts/nx-report.mjs` (`training/results/nx3-generation.json`, `training/nx/sample-200.jsonl`).

| stage | numbers |
| --- | --- |
| generated raw (110 shards, 20 per seed, 5 shard indices per world) | 31,131 candidates (content-hash ids, duplicates removed) |
| deterministic gate | 29,922 pass; drops: value-not-in-lexicon 855, unknown-op 234, unknown-key 120 (all three come from seeds the legend description does not cover) |
| rules agreement | 13,541 agreed (45 %), 16,381 disagreed: rules unparsed 7,273, other op 5,718, other value 1,818, several segments 1,565 |
| judge on the 16,381 disagreements | accept 15,605 (95.3 %), fix 368 (2.2 %), reject 408 (2.5 %): the rules' disagreements are mostly the rules' own gaps |
| audit of 392 agreed items | 8 non-accept = **1.3 % error rate of `agreed`** (5 rejects, 3 fixes) |
| final records | **29,111** (train 26,420 / dev 1,247 / test 1,444; about 1,100-1,450 per world; 391 records dropped because their text equals a protected evaluation text) |
| time | generation 7 sessions, 85 min of agent time (300-400 items/min per session, two sessions at a time); judging 3,739 s agent time over 13 sessions, about 255 items/min |
| cost | **estimated $26.6** of the $60 cap (generation $8.3, judge $18.3): sessions' total tokens at a blended $5 per million tokens, a conservative bound; no API key, so no real bill is visible |

Shortfall against the targets: 29k of about 50k, and about 1,300 instead of 2,000 per world, because generation stopped at shard index 4 (214 shards are prepared, so `node scripts/nx-gen.mjs prepare` already holds shards 005-008 and the pipeline continues by running them: about $4 of generation and $13 of judging for 20k more). The diagram has 1,428 generated items; the converted diagram corpus (about 49.7k messages) belongs to NX1 and is not counted here. The judge verdict files were mostly written by the judge agents through small helper scripts holding their per-item decisions (default accept, exceptions listed by hand); the 1.3 % audit error rate and the 2.5 % reject rate are the measure of that.


## NX7 (2026-11-10): confidence gate for D over encoder+n1, Romanian, recheck of the NX6 conditions
Code: `scripts/lib/nx-formalizer.mjs` (`gateFeatures`, `rulesCover`, `opOfWires`, `wrapSessionGated`), `scripts/lib/nx-runtime.mjs` (systems `enc-n1`, `<model>-d`, `<model>-dcov`, and `-dng` / `-dcovng` = gate off, features recorded), `scripts/eval-nx.mjs` (sets `nxdev`, `operational-ro`; `--tau-op --tau-frame --neg`), `scripts/nx7-sweep.mjs` (offline tau sweep). Unit tests: `node --test tests/nx-formalizer.test.mjs` (6 pass). Nothing in `src/`, `worlds/` or `docs/webchat` was touched.

### 1. The gate (D over `encoder+n1`, as shipped)
D is built over the shipped webchat mode: the session's own `_formalize` runs (dispatcher, validator, normalizer, rules retry, spelling, partial understanding, best effort); only then is the model asked, for the segments that came out `unparsed`.
- (c) the shipped pipeline gave **no reading at all** (`unparsed`). A partial, spelling-corrected or best-effort answer is kept.
- (a) the probability of the model's operation is at least `tau_op`.
- (b) every predicted span belongs to the candidate pattern and lies where the pattern puts its slot (between the pattern's frame words, in its order), and the share of the pattern's frame words found in the segment is at least `tau_frame`.
- The gate is applied to the first reading that passes the legend check and the interpreter dry run (not to later candidates); a reading that fails the gate leaves the segment as the shipped pipeline had it.
- Variant `-dcov`: a partial / ignored-words / best-effort answer is also replaced, only by a model reading of the **same operation** that covers **strictly more of the segment's words** (words inside the used spans plus the matched frame words, against the words the rules did not ignore), and passing the same gate.
- Extra guard (my addition, reported separately, `--neg on`): no model reading when the segment contains a negation (`not`, `no`, `never`, `without`, `n't`). The model heads do not model negation and the dev fillers show it ("Don't remind me about brush my teeth.", "It is not 7 o'clock." read at p = 0.99 as a reminder / a time statement).

### 2. Tuning, on dev only
Data (all `split = dev`; never operational, dialogues, gold or real): `nxdev-fail` 28 (NX1 rules-fail / rules-differ), `nxdev-nx3` 1,019 (NX3 LLM-written records), `nxdev-other` 1,500 (random sample of the other NX1 dev records), `nxdev-filler` 286 (negatives, nothing to read). Shipped mode on these: fail 8 / 28 right, nx3 576 / 1019, other 1448 / 1500, fillers 159 / 286 left unread (127 already read by the shipped pipeline).
Method: D was run once per model with the gate off (`-dng`) and the features of every model reading recorded; for a gate, an item takes the model run's outcome when its reading passes, else the shipped outcome. Gain = items not right under the shipped mode and right under D (fail + nx3 records); added wrong = items that were not wrong under the shipped mode and are wrong under D (a wrong reading instead of an abstention, a filler read, or a right answer broken).
Ungated (tau 0): A3 recovers 128 records and adds 183 wrong (115 of them fillers, 6 broken right answers); A+3 recovers 140 and adds 195. The wrong readings are confident: the curves below are gain / added wrong (spans-in-frame required).

A3 (variant none-only, spans-in-frame required): gain / added wrong, rows tau_op, columns tau_frame

| tau_op \ tau_frame | 0 | 0.34 | 0.5 | 0.67 | 0.8 | 0.9 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 95 / 160 | 87 / 144 | 86 / 142 | 65 / 88 | 57 / 82 | 46 / 68 | 46 / 68 |
| 0.5 | 88 / 117 | 82 / 112 | 81 / 111 | 62 / 80 | 54 / 75 | 44 / 65 | 44 / 65 |
| 0.7 | 76 / 90 | 71 / 87 | 70 / 86 | 54 / 67 | 46 / 63 | 36 / 54 | 36 / 54 |
| 0.8 | 69 / 69 | 64 / 66 | 63 / 65 | 50 / 51 | 43 / 47 | 34 / 40 | 34 / 40 |
| 0.9 | 51 / 52 | 48 / 50 | 47 / 49 | 38 / 43 | 33 / 39 | 25 / 32 | 25 / 32 |
| 0.95 | 43 / 39 | 40 / 38 | 39 / 38 | 31 / 34 | 27 / 31 | 21 / 24 | 21 / 24 |
| 0.98 | 30 / 19 | 28 / 18 | 27 / 18 | 20 / 16 | 18 / 15 | 14 / 11 | 14 / 11 |
| 0.99 | 20 / 11 | 19 / 11 | 19 / 11 | 14 / 11 | 12 / 10 | 10 / 7 | 10 / 7 |
| 0.995 | 13 / 4 | 12 / 4 | 12 / 4 | 9 / 4 | 7 / 3 | 5 / 2 | 5 / 2 |
| 0.999 | 4 / 0 | 3 / 0 | 3 / 0 | 3 / 0 | 3 / 0 | 1 / 0 | 1 / 0 |
| 0.9995 | 3 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 0 / 0 | 0 / 0 |
| 0.9999 | 2 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 |
| 0.99995 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

A3 (variant none-only, spans-in-frame required, negation guard): gain / added wrong, rows tau_op, columns tau_frame

| tau_op \ tau_frame | 0 | 0.34 | 0.5 | 0.67 | 0.8 | 0.9 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 91 / 84 | 84 / 72 | 83 / 70 | 63 / 27 | 55 / 21 | 46 / 8 | 46 / 8 |
| 0.5 | 86 / 55 | 80 / 51 | 79 / 50 | 61 / 22 | 53 / 17 | 44 / 7 | 44 / 7 |
| 0.7 | 74 / 39 | 69 / 36 | 68 / 35 | 53 / 18 | 45 / 14 | 36 / 5 | 36 / 5 |
| 0.8 | 68 / 31 | 63 / 28 | 62 / 27 | 49 / 15 | 42 / 11 | 34 / 4 | 34 / 4 |
| 0.9 | 50 / 23 | 47 / 21 | 46 / 20 | 37 / 14 | 32 / 10 | 25 / 3 | 25 / 3 |
| 0.95 | 42 / 17 | 39 / 16 | 38 / 16 | 30 / 12 | 26 / 9 | 21 / 2 | 21 / 2 |
| 0.98 | 29 / 9 | 27 / 8 | 26 / 8 | 19 / 6 | 17 / 5 | 14 / 1 | 14 / 1 |
| 0.99 | 19 / 4 | 18 / 4 | 18 / 4 | 13 / 4 | 11 / 3 | 10 / 0 | 10 / 0 |
| 0.995 | 12 / 2 | 11 / 2 | 11 / 2 | 8 / 2 | 6 / 1 | 5 / 0 | 5 / 0 |
| 0.999 | 3 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 1 / 0 | 1 / 0 |
| 0.9995 | 2 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 |
| 0.9999 | 2 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 |
| 0.99995 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Aplus3 (variant none-only, spans-in-frame required): gain / added wrong, rows tau_op, columns tau_frame

| tau_op \ tau_frame | 0 | 0.34 | 0.5 | 0.67 | 0.8 | 0.9 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 103 / 169 | 95 / 152 | 94 / 148 | 70 / 100 | 62 / 95 | 50 / 78 | 50 / 78 |
| 0.5 | 100 / 126 | 92 / 123 | 91 / 122 | 68 / 91 | 60 / 86 | 48 / 74 | 48 / 74 |
| 0.7 | 91 / 107 | 84 / 105 | 83 / 104 | 63 / 83 | 56 / 80 | 45 / 69 | 45 / 69 |
| 0.8 | 85 / 101 | 79 / 99 | 78 / 98 | 60 / 80 | 53 / 77 | 42 / 66 | 42 / 66 |
| 0.9 | 72 / 76 | 67 / 74 | 66 / 74 | 50 / 65 | 45 / 62 | 35 / 52 | 35 / 52 |
| 0.95 | 58 / 57 | 54 / 56 | 53 / 56 | 42 / 49 | 38 / 46 | 30 / 38 | 30 / 38 |
| 0.98 | 51 / 42 | 47 / 41 | 46 / 41 | 36 / 36 | 32 / 34 | 24 / 28 | 24 / 28 |
| 0.99 | 42 / 30 | 40 / 29 | 39 / 29 | 29 / 26 | 25 / 24 | 19 / 19 | 19 / 19 |
| 0.995 | 35 / 19 | 33 / 19 | 32 / 19 | 23 / 16 | 19 / 14 | 15 / 10 | 15 / 10 |
| 0.999 | 17 / 4 | 15 / 4 | 14 / 4 | 12 / 3 | 10 / 3 | 6 / 2 | 6 / 2 |
| 0.9995 | 11 / 0 | 10 / 0 | 10 / 0 | 10 / 0 | 8 / 0 | 5 / 0 | 5 / 0 |
| 0.9999 | 5 / 0 | 4 / 0 | 4 / 0 | 4 / 0 | 4 / 0 | 1 / 0 | 1 / 0 |
| 0.99995 | 3 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 0 / 0 | 0 / 0 |

Aplus3 (variant none-only, spans-in-frame required, negation guard): gain / added wrong, rows tau_op, columns tau_frame

| tau_op \ tau_frame | 0 | 0.34 | 0.5 | 0.67 | 0.8 | 0.9 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 99 / 83 | 92 / 67 | 91 / 63 | 68 / 30 | 60 / 25 | 50 / 8 | 50 / 8 |
| 0.5 | 96 / 52 | 89 / 49 | 88 / 48 | 66 / 24 | 58 / 19 | 48 / 7 | 48 / 7 |
| 0.7 | 89 / 41 | 83 / 39 | 82 / 38 | 62 / 21 | 55 / 18 | 45 / 7 | 45 / 7 |
| 0.8 | 84 / 37 | 78 / 35 | 77 / 34 | 59 / 20 | 52 / 17 | 42 / 6 | 42 / 6 |
| 0.9 | 71 / 27 | 66 / 25 | 65 / 25 | 49 / 17 | 44 / 14 | 35 / 4 | 35 / 4 |
| 0.95 | 57 / 22 | 53 / 21 | 52 / 21 | 41 / 14 | 37 / 11 | 30 / 3 | 30 / 3 |
| 0.98 | 50 / 15 | 46 / 14 | 45 / 14 | 35 / 9 | 31 / 7 | 24 / 1 | 24 / 1 |
| 0.99 | 41 / 11 | 39 / 10 | 38 / 10 | 28 / 7 | 24 / 5 | 19 / 0 | 19 / 0 |
| 0.995 | 34 / 9 | 32 / 9 | 31 / 9 | 22 / 6 | 18 / 4 | 15 / 0 | 15 / 0 |
| 0.999 | 16 / 2 | 14 / 2 | 13 / 2 | 11 / 1 | 9 / 1 | 6 / 0 | 6 / 0 |
| 0.9995 | 10 / 0 | 9 / 0 | 9 / 0 | 9 / 0 | 7 / 0 | 5 / 0 | 5 / 0 |
| 0.9999 | 4 / 0 | 3 / 0 | 3 / 0 | 3 / 0 | 3 / 0 | 1 / 0 | 1 / 0 |
| 0.99995 | 3 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 2 / 0 | 0 / 0 | 0 / 0 |

Chosen points (0 added wrong on dev, most gain; `spans` on, as the task's gate (b) requires), from `training/results/nx7-sweep-{A3,Aplus3}.json`:
| model | gate | tau_op | tau_frame | dev gain | dev added wrong | model readings used on dev |
| --- | --- | --- | --- | --- | --- | --- |
| A3 | as specified (a, b, c) | 0.999 | 0 | 4 | 0 | 4 |
| A3 | + negation guard | 0.99 | 0.9 | 10 | 0 | 12 |
| A+3 | as specified | 0.9995 | 0 | 11 | 0 | 12 |
| A+3 | + negation guard | 0.99 | 0.9 | 19 | 0 | 22 |
The `-dcov` variant picks the same points (the strictly-more-words replacement of a partial answer is rarely reachable on dev: 5 more model readings than none-only for A3, none of them gaining). Without the "spans inside the frame" condition the best A3 point is tau_op 0.999 with 6 gained; the frame score is not what separates right from wrong (tau_frame 0 is chosen unless the negation guard is on): the operation probability and the negation carry the gate. Dev is small (the shipped pipeline already reads most of it): the gain at the 0-added-wrong point is a few dozen records, so the full-set numbers below are what counts.

### NX7 steps 3-5: gated D over encoder+n1, Romanian, the NX6 conditions (full sets, 16 jobs)
Commands (through the heavy lock, from the worktree; per-item rows in `training/results/nx5/*.json`, not in git): `node scripts/eval-nx.mjs --system enc-n1|rules|A3-first|Aplus3-first --ort <ort> --sets operational,dialogues,gold,nxtest,real,mobile,diagram,operational-ro --jobs 16 --name full`; `node scripts/eval-nx.mjs --system A3-d --tau-op 0.999 --tau-frame 0 --name full` (A+3: `--tau-op 0.9995`), the guarded runs with `--tau-op 0.99 --tau-frame 0.9 --neg on --name neg-full`, `A3-dcov` with the tau of A3; tables: `node scripts/nx7-report.mjs --d <file> --json training/results/nx7-<file>.json`. The Romanian set goes through the translator inside the engine, so the model reads the English text like the rules.

**D = shipped mode (encoder+n1) with the gated model reading only the segments left not understood.** Everything else is the shipped answer, so D can only differ where the shipped mode abstains.
| set | rules | shipped (encoder+n1) | D A3, spec gate (0.999 / 0) | D A3 + negation guard (0.99 / 0.9) | D A+3 spec gate (0.9995 / 0) | D A+3 + guard |
| --- | --- | --- | --- | --- | --- | --- |
| operational 1,296 right / wrong | 1239 / 6 | 1278 / 4 | 1278 / 4 | 1278 / 4 | 1278 / 4 | 1277 / 5 |
| operational-long 154 right / wrong | 87 / 35 | 145 / 3 | 145 / 3 | 145 / 3 | 145 / 3 | 145 / 3 |
| operational + long wrong (of 1,450) | 41 incl. partly 36 | 7 | 7 | 7 | 7 | 8 |
| dialogues, turns right / wrong (2,177) | 2109 / 20 | 2105 / 28 | 2105 / 28 | 2105 / 28 | 2105 / 28 | same |
| operational-ro (2,480) right / wrong | 2035 / 61 | 2112 / 64 | 2117 / 64 | 2127 / 64 | 2122 / 64 | 2133 / 66 |
| gold-para 100 right | 22 | 33 | 34 | 38 | 37 | 38 |
| nxtest-rules-fail 44 right (test split 16) | 8 (5) | 17 (9) | 18 (9) | 19 (10) | 20 (10) | 19 (10) |
| real 09c / 09e world-correct | 13 / 17 | 13 / 18 | 13 / 18 | 13 / 18 | 13 / 18 | 14 / 18 |
| mobile answered of 108 | 52 | 67 | 67 | 67 | 67 | 67 |
Dialogues: D equals the shipped mode in every turn (the gate never fired there). `-dcov` (replace a partial answer when the model covers strictly more words at the same operation, A3, spec gate) gave exactly the spec-gate result: it replaced nothing that passed the gate. D never changes an operational outcome except one right -> wrong for A+3 with the guard (0.1 point of the set).

**The four NX6 conditions (D against the shipped mode; condition 1 against the rules as the task text says, and against the shipped mode).**
| condition | limit | A3 spec gate | A3 + guard | A+3 spec gate | A+3 + guard |
| --- | --- | --- | --- | --- | --- |
| 1. rules-fail sets: right points over the rules (gold-para + nxtest-rules-fail test, 116 items) | at least +3 | +13.8 | +18.1 | +17.2 | +18.1 |
| 1b. same, over the shipped mode (what D itself adds) | | +0.9 | +5.2 | +4.3 | +5.2 |
| 2. operational + long, wrong points over the shipped mode | at most +0.2 | +0.00 | +0.00 | +0.00 | +0.07 |
| 3a. dialogues turns, right / wrong points | right at least -0.5, wrong at most +0.2 | 0.00 / +0.00 | 0.00 / +0.00 | 0.00 / +0.00 | 0.00 / +0.00 |
| 3b. Romanian, right / wrong points | same | +0.20 / +0.00 | +0.60 / +0.00 | +0.40 / +0.00 | +0.85 / +0.08 |
| 4. browser cost | unchanged | holds by construction (A3 +0.9 MB, same pass); ready time not measured | same | A+3 is not integrated whatever the numbers | |
Note on condition 1: the literal comparison (D against the rules alone) is met by every variant, but most of that comes from the shipped dispatcher and normalizer, not from the model heads. D's own contribution over the shipped mode is +0.9 points (A3, spec gate: 1 of 100 gold-para, 1 of 44) to +5.2 points (A3 with the guard: gold-para +5, nxtest-rules-fail +2; Romanian +15 cases; 09c none). The A+3 spec-gate figure is +17.2 over the rules and +4.3 over the shipped mode.
**Verdict: all four conditions hold for A3, with the spec gate and with the guard (conditions 2 and 3 are met exactly: D adds no wrong answer anywhere). The price is that the gate is nearly closed: the real extra recovery over encoder+n1 is small (about +5 points on the rules-fail paraphrases, +0.6 points on Romanian, 0 on operational, dialogues and the real phrases).** The tuning is only as good as the dev set (small; 0 added wrong on 2,833 dev records), and the guard point passes 12 dev readings, so a slightly larger wrong rate on fresh data is possible; A+3 with the guard added 1 wrong on the operational set (+0.07, inside the limit). Nothing was integrated by this agent.

**Model-first over the encoder strategy slot (A3-first / A+3-first: the model reads every segment, the validator always checks, the rules read what it could not; the normalizer is not part of this path, as in NX5).** Without the gate this fails condition 2 and 3 by a wide margin: operational right 72.8 % (A3) / 74.1 % (A+3) against 98.6 % shipped, wrong 16.2 % / 15.4 % against 0.3 %; operational + long wrong +17.0 / +15.7 points; dialogues turns right 76.4 % / 75.5 % (-20.3 / -21.2 points), wrong +13.1; Romanian right -19.3 / -15.5 points. It does recover more on the rules-fail sets (gold-para 75 / 80 % against 33 % shipped; nxtest-rules-fail 22 / 29 of 44; real 09c 17 / 16 of 22; mobile answered 94 / 91 of 108 but world agreement on the supported 18 falls to 11 / 8), at the cost of 333 / 296 Romanian and 201 / 192 operational right -> wrong. So model-first is not a safe default; as a user-chosen strategy it is a recall mode that trades about 25 points of right on the sets we care about for about 40 more recovered paraphrases of 100.


## NX-INTEGRATION (2026-11-10): the NX encoder formalizer in the webchat, with a strategy setting
Decision record: `specs/decisions/ADR-009-nx-encoder-formalizer-in-the-webchat.md`; spec 03 section 7.16; spec 06 (reading strategy). Code: `src/formalizer/nx.mjs` (browser-safe port of `scripts/lib/nx-formalizer.mjs`), `src/formalizer/dispatcher-runtime.mjs` (the NX heads of the routing pass kept in its cache: one encoder pass), `src/dialog/index.mjs` (`_formalize` picks the strategy, `_formalizeShipped` is today's path), `src/dialog/runtime-config.mjs` (`nxStrategy`, the `engine.formalizers.nx` facade, `isPaused`), `docs/webchat` (Settings > Understanding > "Reading strategy", trace "Read by"). Tests: `tests/nx-strategy.test.mjs`, `tests/dispatcher-runtime.test.mjs`, `tests/ort-client.test.mjs`, `tests/webchat-nx.test.mjs` + `scripts/test-webchat-nx.mjs` (browser).

**Model.** A3 (`training/runs/export/nx-a-nx3`), int8, 68.0 MB, sha256 `56741a80...`, published in `docs/webchat/models/dispatcher/` (one commit). Dispatcher outputs against the previous published v4 (sha 6c41eb24): max abs diff **0.0** for seg, world and edit logits over 600 inputs (300 operational messages, raw and with the routing prefix). `meta.json` now carries `nx` (509 operations, 679 tag labels, trained worlds, the hybrid gate) and `version.checkpoint` / `sha256`.

**Strategies and defaults.** `hybrid` is the default (user decision 2026-11-10 after the NX7 numbers; one constant, `DEFAULT_NX_STRATEGY`). `hybrid`: the shipped path unchanged, the model reads only segments it left unparsed, NX7 gate tau_op 0.99, tau_frame 0.9, spans in frame, negation guard. `neural`: model first (negation guard, minimum word coverage 0.6 added after the first smoke test read "tom has 3 apples and eats 2. how many does he have" as only its first clause); any segment not read sends the whole message to the shipped path. `rules`: no model reading. `user.profile` is read by the rules only (no model candidate; in `neural` an untrained-world probe).

**Measured in the webchat configuration** (`node scripts/eval-nx.mjs --system webchat-<rules|hybrid|neural> --ort <onnxruntime-node> --sets operational,operational-ro,dialogues,gold,real,mobile --jobs 16`, then `node scripts/nx-integration-report.mjs`; `encoder+n1+fast`, the published A3 model; `rules` = the shipped pipeline as before; counts are right / wrong / abstain, `partly` = executed only part):

| set | n | rules | hybrid (default) | neural |
| --- | --- | --- | --- | --- |
| operational | 1296 | 1279 / 4 / 12 (+1 partly) | 1279 / 4 / 12 (+1 partly) | 1231 / 34 / 22 (+9 partly) |
| operational-long | 154 | 145 / 3 / 1 (+5 partly) | 145 / 3 / 1 (+5 partly) | 145 / 2 / 1 (+6 partly) |
| operational-ro (Romanian, translated) | 2480 | 2112 / 64 / 282 (+22 partly) | 2127 / 64 / 267 (+22 partly) | 2065 / 115 / 269 (+31 partly) |
| dialogues, dialogue right | 449 | 398 / 51 | 398 / 51 | 353 / 96 |
| dialogues, turns | 2177 | 2104 / 25 / 40 (+8 partly) | 2104 / 25 / 40 (+8 partly) | 2020 / 79 / 66 (+12 partly) |
| gold-para | 100 | 32 / 43 / 25 | 37 / 43 / 20 | 44 / 36 / 20 |
| gold-rules | 150 | 147 / 1 / 2 | 147 / 1 / 2 | 141 / 7 / 2 |
| gold-real | 50 | 24 / 18 / 8 | 24 / 18 / 8 | 24 / 19 / 7 |
| real phrases 09c / 09d / 09e (world level) | 24 / 15 / 21 | 13 / 1 / 8, 15 / 0 / 0, 18 / 0 / 3 | same | same |
| mobile export (answered / abstained) | 108 | 67 / 41 | 67 / 41 | 71 / 37 |

Readings: **hybrid adds no wrong answer anywhere** (operational wrong 4 = 0.3 %, same as shipped; the dialogues are identical) and recovers 5 of the 25 `gold-para` abstentions and 15 Romanian operational cases; model readings are rare (counters of the busiest of 16 workers: 5 read, 38 gate rejections, 8 `none`, 6 without a valid reading). **neural** is better where the phrasing is outside the patterns (`gold-para` 44 right against 32, wrong 36 against 43, mobile 71 answered against 67), and worse on traffic the rules already read: operational wrong 2.6 % (34 of 1,296; the NX7 model-first measurement was 16.2 %, the negation guard and the coverage rule remove most of it), dialogues right 78.6 % against 88.6 % (-10 points), `gold-rules` 94.0 % against 98.0 %. This is why the default is hybrid.

**Perf** (`node scripts/perf-webchat.mjs --mode encoder+n1 --nx <s> --throttle 4`, mobile viewport, 6 messages after the model is ready; ms):

| strategy | input | ready | first answer | model ready | p50 msg | p95 msg |
| --- | --- | --- | --- | --- | --- | --- |
| rules | 763 | 1981 | 444 | 5419 | 122 | 329 |
| hybrid | 714 | 1948 | 470 | 5428 | 117 | 336 |
| neural | 703 | 1930 | 302 | 5392 | 285 | 524 |

The model download is the same size class (68.0 MB against 67.1 MB). Neural is slower per message (about +160 ms p50 at 4x throttling): it runs a routing pass for every message, where the fast path skips the model when the rules read the whole message.
**Soak** (`node scripts/soak-webchat.mjs --minutes 3 --throttle 4 --nx <s>`, FREEZE-6 gate busy < 50 %): hybrid 10/10 checks (busy 17 % average, 21 % worst minute, heap 105 -> 109 MB, 0 ORT restarts, 0 watchdog endings, input echo 26 ms), neural 10/10 (busy 20 % / 25 %, heap 110 -> 114 MB, 0 restarts, echo 22 ms). The encoder pass runs in the ORT worker; the page thread only decodes the logits. The segmentation pass asks the worker for `seg_logits` only (no copy of the tag logits).

Caveats: single runs on a shared machine (perf and soak vary a lot, SOAK-BUSY); the NX7 tau values were tuned on dev data and the full-set hybrid numbers above are their first measurement in the shipped configuration (the model reads few segments: it adds nothing wrong and little right on the operational sets, its gain is on paraphrases); `gold-real` labels come from Sonnet (NX2); the Romanian rows go through the translator first.


## NX3b (2026-11-10): second generation round, retrain of A (A3b), NX7 evaluation again
Code: `scripts/nx3b-seeds.mjs` (seeds, allocation), `scripts/lib/nx3b-prompt.mjs` (prompt with the exact op ids, keys, fixed constants and the full lexicons), `scripts/nx3b-filter.mjs` (training sets), `scripts/nx3b-report.mjs`; `scripts/nx-gen.mjs` and `scripts/nx-pipeline.mjs` take `NX_GEN=gen2 NX_SEEDS=seeds2 NX_FINAL=final2` (data dir `training/dataset/nx/gen2`, outside git). Gate: `scripts/lib/nx-gate.mjs` (+1 unit test, 9 pass). Reports: `training/results/nx3b-generation.json` (per world gate / agreement / judge / audit), `nx3b-filter.json`, `nx7-sweep-A3b.json`, `nx3b-eval-summary.json`, `nx3b-A3*-d-*.json`.

**Why the NX3 gate dropped records, and the fix.** Every NX3 drop was a property of the seed, not of the generator: all 20 phrasings of a seed carry the seed's own op and values, so a seed that fails the gate loses 20 records (kids.tasks 319 `value-not-in-lexicon`, games.guess 234 `unknown-op`, kids.shapes 184 + 80, kids.animals, docs.editor). Two causes: (1) the gate applied the lexicon test to values the sentence does not state (a default such as `arg.list=to-do`, the `seek` of a question, a constant fixed by the pattern); that check now skips implied values, `seek` and fixed constants. (2) Seeds whose own label is outside the world (an item "do my homework" bound to a list lexicon, `kids.shapes.shape.corners`, "hen" not in the animal lexicon, `guess.hint`): every NX3b seed is **pre-gated** with the same gate before it can cost any token. The shard prompts also carry the exact operation ids, every key with its fixed values and the full lexicons (NX3 cut each lexicon at 10 words), and tell the generator to use only the seed's keys and lexicon words. Result: **0 gate drops in 19,842 candidates** (NX3: 1,209 of 32,400).

**Seeds (1,186, K = 20).** Allocated in proportion to 2,000 minus the NX3 count (target +20,000, yield 0.85). Mix: 110 constants seeds (kids.arith operator forms `where.op/op2`, all 50 ui.avatar seeds covering the part operations incl. `arg.anim`, `arg.list` seeds of kids.tasks), 33 rules-failure seeds (rules-fail / rules-differ paraphrases of `training/paraphrases/out` and `heldout/out`, train split only), then 611 NX3 phrasings the rules did not read and a real judge accepted (hard phrasings), 231 unused NX3 seeds and 201 agreed phrasings (at most 2 per original group). **Deviation from the task text:** texts of the gold set (`gold-para`) and of the NX dev/test records are not seeds and are removed from the training sets (`nx3b-filter.json`: 766 NX3 and 156 NX3b records), because otherwise the A3 / A3b comparison on `gold-para` and `nxtest` would be contaminated by 20 paraphrases of each evaluation item. The operational not-right cases are protected eval texts: they are not seeds, only their worlds guided the allocation. Protected texts (real phrases, expectations, operational*, dialogues, loose words) are excluded by normalised text as before; 48 generated records equal to a protected text were dropped at finalize.

**Generation and judging.** 90 shards, 12 Sonnet sessions (8 shards each, max 2 parallel); 27,000 phrasings written, 19,842 new and unique after the dedupe against NX3 (3,450 duplicates of NX3 texts). Rules agreement: 7,211 agreed, 12,631 disagreed. Judging: 269 calls of 50 in 26 shard files, 13 Sonnet sessions, **every item has its own verdict and reason**; no script filled verdicts (a verdict without a reason of 6+ characters, a reason "ok", or a call whose reasons are copied are rejected by finalize: 0 invalid, 0 copied-reason calls, 10,904 distinct reasons for 13,065 judged items). Items without an explicit verdict are dropped (0). 217 agreed items were re-judged (3 % audit): 1 reject (**audit error 0.5 %**, NX3: 1.3 %). Disagreed items: **accept 97.1 %, fix 1.0 %, reject 1.9 %** (12,260 / 126 / 245; NX3's 97.5 % accept had defaults in it). Per-world reject / fix rates are in the table; the judges write a reason per item, and rejected the same families as the audit shows (pan "a bit" without an amount, "cross off" read as remove, count questions read as lists, garbled romanian artifacts, statements read as questions).

**Hand check (50 random judged items, mine, against the world legends).** 50 items from the disagreed pool (seed 20261110): 49 verdicts are right; the one doubtful accept is `have we met, do you know me` read as `chat.myname`. I also checked 14 random fix / reject items: 12 are right or defensible, 2 questionable (a rejected symmetric `geo.compare` "comparison of italy and spain" because the slots follow the other order; a fix of `doc.size` that changes "title" to "heading"). **Error count: 0 clear errors in 50 judged items, 1 doubtful accept; 0 clear and 2 doubtful of 14 fix / reject.** The sample is 96 % accepts by nature, so the rejects are under-sampled there (the 14-item check covers them).

**Counts per world (final records, protected/eval texts removed in the last column).**

| world | NX3 | NX3b | total | training after filter | judged | fix | reject |
| --- | --- | --- | --- | --- | --- | --- | --- |
| diagram.sketch | 1428 | +707 | 2135 | 2112 | 673 | 2.7 % | 3.1 % |
| docs.editor | 1242 | +909 | 2151 | 2066 | 610 | 0.5 % | 3.8 % |
| games.tictactoe | 1421 | +741 | 2162 | 2022 | 478 | 0.0 % | 0.0 % |
| art.draw | 1384 | +783 | 2167 | 2040 | 454 | 0.2 % | 4.0 % |
| ui.help | 1317 | +859 | 2176 | 2094 | 644 | 0.8 % | 0.2 % |
| kids.shop | 1447 | +732 | 2179 | 2132 | 382 | 1.1 % | 1.1 % |
| kids.arith | 1409 | +776 | 2185 | 2092 | 473 | 0.4 % | 0.9 % |
| ui.shell | 1325 | +862 | 2187 | 2086 | 558 | 0.5 % | 1.2 % |
| geo.map | 1422 | +769 | 2191 | 2096 | 436 | 4.8 % | 5.1 % |
| data.charts | 1388 | +806 | 2194 | 2109 | 413 | 3.6 % | 0.7 % |
| kids.time | 1292 | +903 | 2195 | 2152 | 485 | 0.0 % | 6.2 % |
| kids.common | 1276 | +920 | 2196 | 2065 | 657 | 0.0 % | 3.2 % |
| kids.animals | 1302 | +903 | 2205 | 2129 | 545 | 0.0 % | 4.0 % |
| games.hangman | 1401 | +812 | 2213 | 2080 | 474 | 0.0 % | 2.5 % |
| media.music | 1383 | +830 | 2213 | 2168 | 444 | 2.5 % | 0.2 % |
| games.chess | 1399 | +815 | 2214 | 2093 | 441 | 0.0 % | 1.1 % |
| docs.reader | 1340 | +901 | 2241 | 2169 | 516 | 0.8 % | 1.4 % |
| ui.avatar | 1370 | +891 | 2261 | 2184 | 627 | 0.3 % | 0.5 % |
| kids.shapes | 1140 | +1122 | 2262 | 2196 | 627 | 4.5 % | 2.4 % |
| games.guess | 1096 | +1178 | 2274 | 2159 | 875 | 0.1 % | 0.2 % |
| user.profile | 1242 | +1071 | 2313 | 2289 | 1000 | 0.2 % | 1.2 % |
| kids.tasks | 1087 | +1258 | 2345 | 2298 | 819 | 0.7 % | 1.5 % |

Total NX3b 19,548 records (train 17,563); NX3 + NX3b 48,659; every world is above 2,000 (lowest diagram.sketch 2,135). After the filters: NX3 27,619 + NX3b 19,212 training records.

**Cost and speed (estimate at a blended $5 per million tokens; no API key, so not the real bill).** Generation 12 sessions, 1.35 M tokens, **$6.77**, 4,878 s of session time for 27,000 phrasings (19.9k phrasings per session hour, about 40k per hour with two in parallel). Judging 13 sessions, 2.60 M tokens, **$12.99**, 5,293 s for 12,848 items (8.7k items per session hour, about 17k per hour with two in parallel). Total **$19.76** (budget $17-20). Seeds, gate, agree, finalize, filter and the evaluation cost no tokens.

### A3b: retrain of A on NX1 + NX3 + NX3b
`python -m psys2_train.nx_heads train --mode A --seed 1 --out runs/nx-a-nx3b --data 'free-*.jsonl,final29-filtered/*.jsonl,final2-filtered/*.jsonl'` (cwd `training`, bf16, batch 256, 8 epochs, GPU), then `export`. A3all = the same without NX3b (the published A3 was trained on the first 13k NX3 records only, so A3all separates the effect of the other 14.5k NX3 records from NX3b). **Dispatcher outputs identical to v4:** fp32 and int8 `seg_logits`, `world_logits`, `edit_logits` max abs diff 0.0, argmax identical on 400 inputs; int8 68.1 MB (A3: 68.0), 515 operations, 715 tag labels, 5.3 ms per pass at 1 thread. Not published to `docs/webchat`.

| model | dev op acc | dev slot F1 | test op acc | test slot F1 | test exact | filler ok (test) | test records |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A3 (published, NX1 + 13k NX3) | 0.8927 | 0.8186 | 0.8010 | 0.7428 | 0.5119 | 0.934 | 10,129 |
| A3all (NX1 + 27.6k NX3) | 0.8972 | 0.8186 | 0.8158 | 0.7507 | 0.5400 | 0.913 | 10,705 |
| A3b (NX1 + NX3 + NX3b) | 0.8957 | 0.8168 | 0.8294 | 0.7500 | 0.5552 | 0.896 | 11,779 |

(Test columns are on different record sets, each model's own test split: more NX3 / NX3b test items each time. The dev op accuracy is on 15.6k / 16.3k / 17.2k records.) More data raises operation accuracy and exact match on the generated test split and leaves slot F1 flat; **the filler rate falls steadily (0.934 -> 0.913 -> 0.896): the model reads more non-requests as requests**, which is the risk the negation guard covers.

### NX7 evaluation again (full sets, same procedure, 16 jobs, `scripts/eval-nx.mjs`)
Commands: `--system rules|enc-n1|A3-only|A3b-only|A3-first|A3b-first|A3-d|A3b-d --sets operational,dialogues,gold,nxtest,real,mobile,diagram,operational-ro --jobs 16 --name full|neg-full`; dev runs `--system enc-n1|A3b-dng|A3b-dcovng --sets nxdev --name dev`, then `node scripts/nx7-sweep.mjs --model A3b`. Tau tuned on dev only (28 fail + 1,019 NX3 + 1,500 other + 286 fillers). **A3b is more confident than A3**: with the spans on, the best point with 0 added wrong on dev is tau_op 0.9999 / tau_frame 0 (gain 3), against A3's 0.999; A3's guard point (0.99 / 0.9 / negation guard) adds 2 wrong fillers on A3b's dev set (gain 5, added 2), so A3b has no guarded point at 0.99; it uses 0.9999 for both the spec gate and the guarded run. Baseline note: the shipped mode (`enc-n1`) is better than at NX7 (`gold-para` 46 right, was 33; operational 1278 right, 98.6 %) because the rules and normalizer moved on since, so the model has less headroom than in NX7; the old per-item rows are not on disk, so rules, enc-n1 and A3 were run again here with the current code.

**Model alone (`-only`: the model reading, nothing else). correct / wrong (partly as wrong) / abstain.**
| set | n | rules | shipped (enc-n1) | A3-only | A3b-only |
| --- | --- | --- | --- | --- | --- |
| operational | 1,296 | 1239 / 28 / 29 (95.6 %) | 1278 / 5 / 13 (98.6 %) | 811 / 282 / 203 (62.6 %) | 829 / 281 / 186 (64.0 %) |
| operational-long | 154 | 87 / 49 / 18 | 145 / 8 / 1 | 48 / 89 / 17 | 49 / 90 / 15 |
| operational-ro | 2,480 | 2035 / 109 / 336 (82.1 %) | 2127 / 86 / 267 (85.8 %) | 1249 / 658 / 573 (50.4 %) | 1414 / 630 / 436 (57.0 %) |
| dialogues, turns right | 2,222 | 2155 (97.0 %) | 2151 (96.8 %) | 1186 (53.4 %) | 1266 (57.0 %) |
| dialogues right | 464 | 418 (90.1 %) | 415 (89.4 %) | 119 (25.6 %) | 126 (27.2 %) |
| gold-para | 100 | 32 | 46 | 75 | 78 |
| gold-real | 50 | 23 | 24 | 15 | 15 |
| nxtest-rules-fail | 44 | 9 | 20 | 22 | 28 |
| nxtest-sample | 700 | 679 | 676 | 467 (66.7 %) | 480 (68.6 %) |
| diagram bench | 1,128 | 1106 | 905 | 817 (72.4 %) | 834 (73.9 %) |
| mobile answered | 108 | 52 | 67 | 83 | 91 |

Model-alone right % by constants world on the operational set (A3 -> A3b): art.draw 15.2 -> 16.2, kids.arith 50.3 -> 51.7, kids.shop 39.5 -> 53.5, ui.avatar 50.4 -> 51.2, kids.time 63.9 -> 59.8, geo.map 57.4 -> 57.4, docs.editor 29.3 -> 34.3. The constants data helps kids.shop (+14) and docs.editor (+5), and barely moves art.draw, kids.arith and ui.avatar: those worlds stay at 16 - 52 % alone, so the constants problem (the model never sees `where.op=plus`, `arg.list=to-do`, `arg.anim`) is not solved by more phrasings; the frame choice at read time stays the weak point.

**Model first (`-first`, the rules read what the model could not).** operational 944 -> 937 right (72.8 -> 72.3 %), wrong 259 -> 272; operational-ro 1634 -> 1680; dialogues turns right 1698 -> 1670 (76.4 -> 75.2 %), dialogues right 225 -> 214; gold-para 75 -> 79; nxtest-rules-fail 22 -> 28; mobile answered 94 -> 99. Still far from the shipped mode on the sets of the rules' own phrasing: not a safe default.

**D (gated model reading over the shipped mode) and the four NX6 conditions.** Gate: A3 0.999 / 0 (spec) and 0.99 / 0.9 + negation guard; A3b 0.9999 / 0, with and without the negation guard, and A3b at A3's guarded point as a check.
| item | A3 spec | A3 + guard | A3b spec | A3b + guard (0.9999) | A3b at A3's guard point (0.99 / 0.9 / neg) |
| --- | --- | --- | --- | --- | --- |
| 1. gold-para + nxtest-rules-fail test (116) right points over the rules | +16.4 | +16.4 | +16.4 | +16.4 | +16.4 |
| 1b. same, over the shipped mode (D's own gain) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| gold-para right (shipped 46) | 46 | 46 | 46 | 46 | 46 |
| nxtest-rules-fail right, 44 (shipped 20) | 21 | 20 | 21 | 21 | 20 |
| 2. operational + long wrong points over shipped (limit +0.2) | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 3a. dialogues turns right / wrong points | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| 3b. operational-ro right / wrong points | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | +0.20 / 0 |
| 4. browser cost | same pass, +0.1 MB over A3 | | | | |

All four conditions hold for A3 and A3b; D adds no wrong answer anywhere. **But D no longer adds anything measurable over the current shipped mode** (1b is 0.0 for both models: the shipped mode already reads what the gate lets through; the one nxtest case D recovers is the same for A3 and A3b). The model-alone and model-first numbers improve with the new data (the paraphrase sets, Romanian, the diagram bench), the gated hybrid number does not move. **A3b vs A3: a drop-in as A3 was (dispatcher identical), better model alone (+1.4 operational, +6.6 Romanian, +3.6 dialogue turns, `nxtest-rules-fail` 22 -> 28 of 44, `gold-para` 75 -> 78), model-first +0.5 .. +1.8 on paraphrase sets and -1.2 on dialogue turns, hybrid unchanged; lower filler rate and a higher required tau (0.9999). Recommendation: it is a small improvement of the model alone, no change for the shipped hybrid mode; the coordinator decides about publishing.**

Caveats: single runs; the per-item rows (`training/results/nx5/*.json`) are not in git; the judge is one model (Sonnet) and its accepts were hand-checked on 50 items only; gold-para / nxtest texts are not in the training sets, but their near neighbours (the same canonical sentences, other phrasings) may be.

<!-- sopworld1:begin -->
## SOPWORLD-1: the two reasoner strategies on the same sets

Written by `node scripts/eval-reasoner.mjs --reasoner ops|matrix` (rules formalizer, no model). Latest run per strategy: ops 2026-11-10, matrix 2026-11-10. JSON: `training/results/sopworld1-<strategy>-<date>.json`.

| | ops (default) | matrix |
| --- | --- | --- |
| (a) operational, three worlds | 219/226 right, 5 partly, 0 wrong, 2 not understood | 219/226 right, 5 partly, 0 wrong, 2 not understood |
| (a) operational, all other worlds | 1020/1070 right, 17 partly, 6 wrong, 27 not understood | 1020/1070 right, 17 partly, 6 wrong, 27 not understood |
| (a) operational-ro, three worlds | 397/452 right, 7 partly, 6 wrong, 42 not understood | 397/452 right, 7 partly, 6 wrong, 42 not understood |
| (a) operational-ro, all other worlds | 1638/2028 right, 41 partly, 55 wrong, 294 not understood | 1638/2028 right, 41 partly, 54 wrong, 295 not understood |
| (a) dialogues (turns), three worlds | 220/232 right, 0 partly, 4 wrong, 8 not understood | 217/232 right, 0 partly, 7 wrong, 8 not understood |
| (a) dialogues (turns), all other worlds | 1954/2009 right, 13 partly, 16 wrong, 26 not understood | 1954/2009 right, 13 partly, 16 wrong, 26 not understood |
| (a) cases whose outcome differs between the strategies | 4 | |
| (b) turns audited (session holds facts of the three worlds) | 761 | 745 |
| (b) turns that leave a violation (library check of the whole state) | 21 (2.8%) {"balance":2,"conflict":4,"domain":19} | 2 (0.3%) {"balance":2} |
| (c) coherence set passed / 30 (mechanical hints) | 17/30 (+3 with a hint for the reviewer) | 19/30 (+3 with a hint for the reviewer) |
| (c) kind contradiction | 6/7 | 5/7 |
| (c) kind missing-arg | 2/3 | 2/3 |
| (c) kind default-revision | 1/3 | 2/3 |
| (c) kind undo | 0/3 | 2/3 |
| (c) kind explain | 0/3 | 0/3 |
| (c) kind abduce | 0/2 | 1/2 |
| (c) kind stale | 3/3 | 3/3 |
| (c) kind assumption-visible | 3/3 | 3/3 |
| (c) kind deduce | 2/3 | 1/3 |
| (d) answers that relied on a default or a guess / said so | 0 / 0 (of 46 answers) | 0 / 0 (of 46 answers) |
| (e) ms per turn, three worlds p50 / p95 | 14.4 / 84.6 | 15.7 / 88 |
| (e) ms per turn, everything p50 / p95 | 11.5 / 69.6 | 12 / 72 |
| (e) lines of world code (three worlds: ops.mjs / matrix + fns + extras) | shop 148/243, arith 218/171, tasks 192/137 | shop 148/243, arith 218/171, tasks 192/151 |
| (e) bytes added to the webchat: library raw / gzip, host layer raw | 195858 / 55381, 17254 | 195858 / 55381, 17254 |

The audit tells the fact wires of the session (and its agents), in dialogue order, to a fresh library World and counts the wires it refuses (a deny, a conflict, a broken bound, a reference to an agent that is not there) and a refused balance. `ops`: every wire the operations replay. `matrix`: the wires the library holds; the ones it refused when told are not in its World and are counted apart (`audit.dropped_by_library` in the JSON, the largest number in one session). A purchase the library accepted that leaves the money negative is a violation of both columns: the matrix only says so when asked.

<!-- sopworld1:end -->
