# PSys2 architecture review: sopworld and knowledge-world integration (read-only)

Reviewed tree: `/tmp/review-psys2`, a copy of `/tmp/wt2` at commit `f8442845` (HEAD has since moved to `1c927f67`, which only adds an owner export and edits worker-tasks.md). Library reference: `/home/claude/soplang-words-lib` at 0.118 (`7249fd3`); catalog reference: `/home/claude/sop-knowledge-worlds` (`93a5e26`). Nothing was committed. The copy's `.git` pointer (it pointed into the shared worktree gitdir of wt2) was removed so that nothing here could touch wt2; history was read with `git -C /home/claude/psys2 show`.

What I ran here: `scripts/real-set.mjs run` three times (matrix twice, ops once), the fast suite (`run-tests.mjs --no-changed --jobs 2`, seed 2026-11-15, 2,417 s), the smoke suite (215 s, exit 0), `scripts/knowledge-inventory.mjs` against the live catalog, and `scripts/build-lang-en.mjs --check` against the catalog head. Other agents were loading the machine at the same time (load average 9 to 10 on 2 cores), so the timings and timeouts below are inflated.

## Summary (ten lines)

1. **The real-set drop from 201/253 to 142/253 is a change in what the set contains, not a regression.** All 59 rows that went from right to wrong (plus 2 partly to wrong and 1 right to partly) test deleted tabs or worlds: get-to-know-me/profile, tic-tac-toe, hangman, guess the animal, chess. On the 180 judged rows that do not depend on a deleted world, the score is 132 right before the cut and 133 after (134 in my reruns). Retire 73 rows.
2. **The headline does not measure the shipped app.** It runs the `rules` formalizer, not the shipped `encoder` one. It reads a two-folder `knowledge/` copy, not the live catalog. Its random choices are unseeded: my two runs give 143/15/95, the committed file gives 142/16/95.
3. **Some judges pass for the wrong reason, and the outcome classes hide new keyword theft.** media.music now answers the Romanian "o" with a note name and the Romanian "move" on the Drawing tab with a transpose prompt. The outcome classes count both as gains.
4. **The catalog is not pinned.** The app reads the live GitHub Pages head, while about 2.2 MB of bundles and the generated worlds come from older catalog commits that are not recorded. `en.facts.generated.mjs` is stale against the catalog head (`--check` exits 1).
5. **`npm test` fails at HEAD:** 7 new failures (including stale meta.worlds cards) and 128 known ones. The known-failures list hides 135 failing cases from the exit code, and it names 2 test files that no longer exist.
6. **The two reasoners give the same answers on the real set** (my run: 1 outcome of 649 differs), yet each matrix world keeps both `ops.mjs` and `fns.mjs` + `matrix.sop`. Separately, the host keeps a second parser, interpreter, acts executor, catalog reader (even named `createCatalog`), router, ellipsis/fill layer, ledger, and about 35 plural/singular helpers.
7. **Six reading voices are on by default with no measured gain** ("no row changes", "within noise"). There are 41 `PSYS2_*`/`PSYS_*` switches, about 10 of them dead.
8. **There is no single world contract.** I count five world shapes and more than 40 world-id literals in shared pipeline code (5 copies of `BUILTIN_TAB`, 7 special cases for `kids.common`, avatar cases inside the rule formalizer).
9. **kids.\* worlds are hard dependencies of tab worlds.** Opening Charts fetches 1.47 MB, of which 1.09 MB is kids worlds; Documents fetches 766 KB, of which 549 KB is kids. This blocks the kids generalisation plan. 155 of the 470 dialogues (33%) and the A/B gate's smoke sample still target deleted worlds.
10. **Another application would have to copy about 15 PSys2 modules** to use the worlds (engine host, loaders, catalog source and cache, runtime config, translation switch, budget and guard). Some of them live in the generated `docs/webchat/ui/`, and the evaluation scripts import from there.

Findings: **7 serious errors, 23 structural, 8 cosmetic** (38 in total).

---

## Item 6: measurement integrity, the real set (its own section)

Set: `training/eval/real-2026-11-15.jsonl`, 649 turns, 253 judged. Compared row by row:

- pre-cut: the result committed in `f947d19b` (22:11, before the tab cut merged at 22:28 to 22:31);
- after the cut: the result committed in `8d9e0206`, which is the file in the tree, identical row for row;
- my two reruns at f8442845 (matrix) and one ops rerun.

**Why 201 became 142.** The 201/253 file was not stale for its own tree: it was measured before the cut, with the chess, tic-tac-toe, hangman, guess and profile worlds present. The tab cut removed those worlds, and 73 judged rows test them.

Judged rows whose verdict changed, pre-cut to after-cut (63 rows):

| cause | rows | change |
| --- | ---: | --- |
| tab `profile` (get to know me: r0485-r0505) | 21 | right -> wrong |
| tab `tictactoe` (r0537-r0540, r0601-r0617) | 16 | right -> wrong |
| tab `tictactoe` (r0618 "hint") | 1 | right -> partly |
| check world or expectation `user.profile` (r0507, r0509, r0637-r0640, r0647-r0649) | 9 | right -> wrong |
| check world `user.profile` (r0510, r0643) | 2 | partly -> wrong |
| tab `hangman` (letters r0157-r0162) | 6 | right -> wrong |
| tab `guess` (r0534-r0536) | 3 | right -> wrong |
| tab `chess` (r0619-r0621) | 3 | right -> wrong |
| "start a hangman game" on the editor tab (r0154, an owner regress check) | 1 | right -> wrong |
| live row r0066 "muta si mai la stinga" (draw tab) | 1 | wrong -> right (a false right, see finding 3) |
| **total** | **63** | right -> wrong 59, partly -> wrong 2, right -> partly 1, wrong -> right 1 |

Check: 201 - 59 - 1 + 1 = 142. **No judged row outside the deleted worlds regressed.**

**Retirement set (73 judged rows):** tab profile 21, tab tictactoe 19, check world `user.profile` 15, tab hangman 11, tab guess 3, tab chess 3, "start a hangman game" 1.

- At HEAD these 73 rows score 9 right, 1 partly, 63 wrong.
- The 9 "right" are false rights: music answers "a" and "e" with note names (r0155, r0156); "There is no profile tab" (r0506); "Sorry, I did not understand" passes a forbid-only check (r0628, r0629); and generic turns (r0603, r0606 "thanks", r0630 "hello", r0641 "draw a house").
- The four generic turns may be kept if they are moved to a live tab.

| tree | all 253 judged: right / partly / wrong | live 180: right / partly / wrong | retired 73: right / partly / wrong |
| --- | --- | --- | --- |
| pre-cut (f947d19b) | 201 / 17 / 35 | 132 / 15 / 33 | 69 / 2 / 2 |
| after cut, committed (8d9e0206) | 142 / 16 / 95 | 133 / 15 / 32 | 9 / 1 / 63 |
| my reruns at f8442845 (matrix, two runs agree) | 143 / 15 / 95 | 134 / 14 / 32 | 9 / 1 / 63 |
| my rerun, ops | 143 / 15 / 95 | identical to matrix except r0122 (outcome other_world -> asked, still wrong) | |

The one-row difference between the committed file and my runs is r0564. A diagram session starts with "create a diagram", whose random template is not seeded, so later arrows connect different shapes. Thirteen replies differ between my two runs (random songs and diagrams); the verdicts happen not to.

**Outcome classes of all 649 turns:** 85 changed class.

- 56 on removed tabs. These cannot recur.
- 29 on live tabs. Of these, 11 went from executed to not_understood: game and profile replies on other tabs, which were keyword theft before.
- 6 went from not_understood to executed. These are **new theft by media.music**, counted as improvements: "o" (Romanian "a") answered "A has no common second name" (r0314, r0323, r0326, r0344, r0351), and "inimioară" (heart) drawn on the map tab (r0316).
- "muta capra mai in dreapta" ("move the goat further right") and r0066 now get media.music's "Which way: up or down, by an octave..." (not_understood -> refused).

**Do the ledger, the learning curve and the result files agree?**

- **The result files agree with each other.** `training/results/real-2026-11-15-{matrix,ops}.json`, the tables in `training/eval/real-failures-2026-11-15.json` (142/16/95, 255 failing turns) and the last curve point (142/253) match.
- **The curve point's build stamp is wrong.** The 142 point in `training/eval/learning-curve.jsonl` is stamped `build: b4241aff` but was written by 7d4712ae, and its note describes 7d4712ae's typed worlds.
- **A commit message contradicts the committed file.** b4241aff says "real set unchanged (matrix right 142/253)", while the result file committed at that time still said 201.
- **The curve shows a 59-point drop on the headline series with no note** that the set's meaning changed.
- **The curve file is not in date order, and one series has two names.** Points are not chronological (a 2026-11-15 point precedes 2026-11-14 points), and the same series is stored as `cousinsReal` and `relatedReal`.
- **The ledger is not the real-set work list.** `training/eval/failures.jsonl` holds 2,820 rows, of which 109 are `real: true`, against 255 failing real-set turns.
- **Rows of deleted worlds are left open in the ledger.** About 195 ledger rows name a removed world, tab or class; none is closed (no `retired` field exists, and only 25 rows carry `fixed`).

---

## Findings (ordered by severity)

### Serious errors

**1. The headline series dropped 59 points because of what the set contains, and nobody retired the rows.**
- Evidence:
  - `training/eval/real-2026-11-15.jsonl` (rows listed above);
  - `scripts/real-set.mjs:144` (an owner `ok` row is "right" if anything executes);
  - `training/eval/learning-curve.jsonl` (last point 142/253);
  - commit b4241aff message.
- Why it matters: the owner's priority list and the learning curve read a regression that does not exist. On live rows the system went 132 -> 133.
- Fix: add `retired: "tab-cut 2026-11-15"` to the 73 rows and have `tableOf` skip them. Restate the curve point as 133/180, with a note that the set changed and the old denominator was 253.

**2. The real set does not measure the shipped configuration, and it is not repeatable.**
- Evidence:
  - `scripts/real-set.mjs:110` uses `settingsForMode('rules')`, while `src/dialog/runtime-defaults.mjs:7` ships `formalizer: 'encoder'` (`runtime-config.mjs:29` `DEFAULT_MODE = 'encoder'`);
  - `scripts/real-set.mjs:103-108` reads `knowledge/`, which holds only `k.objects` and `art.draw.kinds` (216 KB), while the webchat reads the live catalog (`docs/webchat/ui/engine-worker.mjs:103`);
  - no seed is set, so r0564 flips between the committed run and mine, and 13 replies differ between two of my runs.
- Why it matters: Talk questions over k.animals, k.geo and so on are judged without the catalog the user has. Random draws make single-row changes meaningless.
- Fix: give `run` a `--mode` that defaults to the shipped mode, a pinned catalog checkout (finding 4), and a fixed seed passed to the session's random source. Record mode, catalog commit and seed in the result file.

**3. Some judges pass for the wrong reason, and the outcome classes count keyword theft as a gain.**
- Evidence:
  - r0043 is "right" with the reply "I did not understand ..." because its only check is `reply_not: hangman` (owner-log a, `training/eval/owner-log-checks.json`); r0047 and r0051 likewise only forbid hangman;
  - r0066 is "right" because media.music answers a draw-tab move ("Which way: up or down, by an octave");
  - r0155 and r0156 are "right" because music names the letter;
  - `scripts/real-set.mjs:144` counts any `executed` as right;
  - the outcome changes not_understood -> executed of r0314, r0323, r0326, r0344, r0351 ("o" -> "A has no common second name").
- Why it matters: a deleted world's keyword theft was replaced by media.music's, and the measurement reports it as progress.
- Fix: add `world_is: <tab world>` (or `world_not: media.music` off the music tab) to owner-log a checks. Count `executed` by a world other than the tab's world (non-meta) as wrong for regress checks. Ledger the six theft rows (`causeOf` "arbitration: media.music").

**4. The knowledge catalog is not pinned, and no bundle records its source commit.**
- Evidence:
  - the runtime fetches the moving Pages head, and the URL is defined three times: `docs/webchat/ui/engine-worker.mjs:103`, `docs/webchat/ui/avatar.mjs:10`, `docs/webchat/ui/tabs/draw.mjs:9`;
  - bundles in `src/knowledge/bundled-*.mjs` (compose 551 KB, geo 289 KB, animals 160 KB, diagrams 154 KB, values 43 KB, ...) and `src/lang/en.facts.generated.mjs` (428 KB) state a catalog world version at best, never a commit;
  - `node scripts/build-lang-en.mjs /home/claude/sop-knowledge-worlds/docs/worlds --check` prints "src/lang/en.facts.generated.mjs is stale" (exit 1);
  - worker-log.md:2367 records that a newer catalog head made the generated schema worlds stale, so the alternations bundle was pinned at a52dbec by hand;
  - tests read `tests/fixtures/catalog`, a third copy.
- Why it matters: a catalog commit can change the frames' priorities or vocabulary under the shipped page while bundles, `typed.json` and schema worlds stay older. Nobody can tell which catalog a measurement used.
- Fix: one `catalog.pin.json` (commit, version, URL of a versioned path), read by the worker, the build scripts and the tests. Stamp the commit into every generated header. Add a `--check` of every bundle against the pin to the full suite.

**5. `npm test` fails at HEAD, and the known-failures list hides 135 failing cases.**
- Evidence:
  - fast suite at f8442845: `== KNOWN FAILURES (do not fail the run): 128`, `== NEW FAILURES: 7`, exit 1 (`/tmp/rv/fast.log`);
  - new failures:
    - `meta-worlds.test.mjs` "the cards are generated, not stale" (the merged tree did not run `build-world-cards.mjs --write`);
    - `geo-places.test.mjs` (whole file; pre-existing per worker-log.md:1821);
    - `diagram-knowledge` random diagrams;
    - `reasoner.test.mjs` parity gate (730 s, a timeout under load);
    - `ort-client` HANG2 (timing);
    - `pilot-avatar` ops decline (turn budget; the worker calls it flaky at HEAD);
    - `ro-rp5` RO-PHONE 4;
  - `tests/known-failures.json` has 105 entries matching 128 failures, 2 of them for deleted files (`reasoner-chess-music.test.mjs`, `surprise.test.mjs`);
  - AGENTS.md: "`npm test` must pass before committing".
- Why it matters: the green smoke run (13 files, exit 0 here too) is reported as the landing check while the suite the rules name is red. 135 language cases accumulate silently.
- Fix: regenerate the cards in the merge commit and drop the 2 dead entries. Cap `known-failures.json` (fail the run when it grows), and give each entry an expiry or a ledger row id.

**6. The dialogue sets and the A/B gate still measure deleted worlds.**
- Evidence:
  - `training/eval/dialogues.jsonl`: 155 of 470 dialogues have `world` in {games.chess 20, games.tictactoe 18, games.hangman 13, games.guess 14, docs.reader 39, user.profile 51};
  - `tests/ab-gate.test.mjs:15-21`: the smoke sample has `dlg.gms#002` and `dlg.gms#006` (chess) and the full sample 3 chess dialogues. The gate only asserts "ops not better", so it passes when both reasoners fail;
  - `tests/dialogues.test.mjs` fails "every dialogue is valid" on `dlg.kidsA#021`... ("unknown world in user.profile:...").
- Why it matters: the gate that guards the default reasoner is partly vacuous, and every dialogue-based rate is diluted by a third.
- Fix: move the 155 dialogues to a `retired` file. Replace the chess dialogues in the gate's sample with live-tab dialogues where the reasoners differ in undo and redo. Port the 13 kidsA name dialogues to `kids.common`'s user name.

**7. The ledger and the curve disagree with the result files and keep dead rows.**
- Evidence: see item 6 above, in particular:
  - the curve point stamped `b4241aff` but written by 7d4712ae;
  - 109 real ledger rows against 255 failing real turns;
  - about 195 ledger rows of removed worlds still open (worker-log.md:2456 counted 125 by tab plus 60 to 70 thefts).
- Why it matters: there are two work lists, and the curve's build stamp cannot reproduce the point.
- Fix: `real-set.mjs record` should stamp the measured commit (`git rev-parse HEAD` of the run), and `report` should append the failing real turns to the ledger with `real: true` (one list). Add a `retired` field and a `ledger retire --world <id>` command.

### Structural

**8. Two reasoners that give the same answers, plus a second SOP parser and interpreter.**
- Evidence:
  - `src/soplang/index.mjs` (252 lines) next to the library's `parse/serialize`;
  - `src/interpreter/` (index 624, render 159, memory, lang) and `src/legends/index.mjs` (307) next to the library `World`;
  - `src/reasoner/index.mjs:16` converts between the two wire formats (`libWire`);
  - every matrix world ships both paths: `worlds/kids.{animals,arith,shapes,shop,tasks,time}`, `ui.help` and `ui.shell` each have `ops.mjs` plus `fns.mjs` + `matrix.sop`;
  - real set: ops = matrix except r0122 (my runs); worker-log.md:2436 says the same.
- Why it matters: every behaviour of eight worlds is written twice, and the parity gate costs 730 s per run.
- Fix: make matrix the only path for these worlds (delete their `ops.mjs`, `operations.sop` and the `PSYS2_REASONER` switch). Then retire `src/interpreter` for the ops-only worlds by giving them matrices or schemas.
- What the library lacks: nothing for the matrix worlds (`compat/psys2/mapping.sop` exists per the library's `docs/host-contract.md`). The ops-only worlds (talk, kids.common, session.things) have no matrix yet.

**9. Host acts executor, space and things modules next to `std.acts`, `std.boxes` and views.**
- Evidence:
  - `worlds/acts/acts.mjs` (974 lines) `createExecutor` runs every schema world (e.g. generated `worlds/plan.seating/ops.mjs:2-4`);
  - `worlds/space/space.mjs` (1,006 lines), `solver.mjs` and `pieces.mjs`;
  - `worlds/session.things/` (things 167, view 153 lines);
  - the library contract (`soplang-words-lib/docs/host-contract.md`, table "What the host must not rebuild") lists acts, diff, undo and why, relations and boxes, and views as library jobs;
  - `docs/host-boundary.md` marks all three "lib".
- Why it matters: the schema worlds act through host code, so a second application must copy `worlds/acts` too (finding 30).
- Fix: generate schema worlds that call `world.act` of a library `World` built from `schema.sop`. Delete `createExecutor` once art.draw's hooks run on it.
- What the library lacks: the per-world hooks PSys2 uses (`hooks.mjs`/`own.mjs`: renderer glue, `thingsOf`) need a documented `actions`/effect hook in `std.schema`.

**10. A host `createCatalog` with the library's name, and a host lookup layer.**
- Evidence: `src/knowledge/catalog.mjs:69` `export function createCatalog({ vocab, readShard })` is a different function from the library's `createCatalog({ index, read, cache, lemma })` (library `index.d.ts:469`). Other host copies: `src/knowledge/facts.mjs` (402 lines), `src/loaders/knowledge-source.mjs`, `knowledge-cache.mjs`, `src/knowledge/bundled-source.mjs`. The library's `bundleReader` and `tools/build-bundle.mjs` are vendored but the bundles are built by 7 host scripts (`scripts/build-bundled-*.mjs`).
- Why it matters: two functions with one established name. The catalog cache and the layered offline subset are exactly the "host kit" another app would need.
- Fix: rename the host one now (`createObjectCatalog`). Then move `facts.wires` and the layering onto the library's `createCatalog`/`bundleReader`, and the 7 bundle scripts onto `tools/build-bundle.mjs`.
- What the library lacks: a layered source (bundled subset under live catalog) and the `vocab` bucket index of `scripts/build-catalog-vocab.mjs`.

**11. Four routing layers where the library has `route` and `choose`.**
- Evidence:
  - `src/formalizer/routing.mjs` (331 lines, tiers, `inTier`, `BARE_SETTING_YIELDS` :142, game rules :127-160);
  - `src/dialog/meta-worlds.mjs:192` (its own `route`, over `worlds/meta.worlds/matrix.sop`);
  - `src/dialog/symbolic-router.mjs:32`;
  - library `choose` installed as a tie-breaker at `src/dialog/index.mjs:1814`;
  - `src/formalizer/rules/index.mjs:475-477` (avatar rule inside the formalizer).
- Why it matters: four places decide which world reads a clause. A change in one is undone by another, as in the "put them in a circle" arbitration (worker-log, Q15).
- Fix: route through the library's `route(world, request, { scores })` with the meta.worlds cards as the world facts and the encoder as `scores`. Delete the tier code in `routing.mjs` once test-world holds.
- What the library lacks: the tab and ambient prior (open tab, ambient avatar) as a declared ranking input.

**12. A host ellipsis and fill layer next to `continueAct` and `std.fill`.**
- Evidence:
  - `src/dialog/discourse.mjs` (1,299 lines), `src/dialog/dialogue.mjs` (554, `fill`), `src/dialog/continuation.mjs`, `src/formalizer/rules/expand.mjs` (199, `oneAnaphora`, `sharedArgument`);
  - worker-log.md (Q15 "Not wired"): "`continueAct` (0.104) ... need a typed library World; matrix worlds have none at runtime". Typed worlds now exist (`worlds/*/typed.json`, `src/formalizer/typed-world.mjs`);
  - 22 known failures are of class "continuation / ellipsis / self-correction -> session.dialogue".
- Why it matters: this is the largest host reader, and the class with the most known failures.
- Fix: wire `continueAct` on the typed worlds behind one switch. Measure it on the real set (retired rows removed). Delete `discourse.ellipsis` and `expand.mjs`'s anaphora if it holds.
- What the library lacks: per the kids plan and the Q18 asks, nothing for acts; ellipsis over question frames (Talk) is untested.

**13. Morphology and similarity written about 40 times.**
- Evidence:
  - plural/singular helpers: `worlds/acts/acts.mjs:65`, `worlds/space/space.mjs:153,834`, `worlds/talk/ops.mjs:44,742`, `worlds/session.things/view.mjs:13`, `worlds/docs.editor/hooks.mjs:16`, `editor.mjs:36`, `target.mjs:16`, `worlds/data.charts/chart.mjs:52,197`, `worlds/diagram.sketch/engine/logic.mjs:558`, `worlds/kids.arith/ops.mjs:9`, `fns.mjs:7`, `worlds/kids.tasks/ops.mjs:21`, `worlds/media.music/music.mjs:38`, `src/dialog/world-aware.mjs:136`, `src/knowledge/animals.mjs:53`, `docs/webchat/ui/state-diff.mjs:25`, `docs/webchat/ui/tabs/draw.mjs:81`, `ui/tabs/editor.mjs:14`, and `const plural` in all 11 `datagen.mjs`;
  - stems: `src/dialog/value-check.mjs:250`, `worlds/ui.help/ops.mjs:153`, `worlds/session.things/things.mjs:138`;
  - `lemma`: `src/dialog/meta-worlds.mjs:30`, `src/formalizer/rules/lemma.mjs:12`;
  - edit distance: `src/formalizer/rules/normalize.mjs:347`, `worlds/ui.help/ops.mjs:163`, `worlds/diagram.sketch/refs.mjs:21`, `docs/webchat/ui/speech.mjs:14`.
- Why it matters: "one way to do each thing". Each copy has different exceptions (person -> people only in space.mjs:834 and draw.mjs:81).
- Fix: everything calls `src/lang/en.mjs` (`en.singular`, plus a `plural` built on the library's `generate` over w.lang.en morphology) and one `editDistance` (move normalize.mjs:347 into `src/lang`).
- What the library lacks: an exported edit distance and similarity (the library has none in `index.d.ts`; it is generic enough to belong there).

**14. Host word-problem reader next to `storyState`.**
- Evidence: `worlds/kids.arith/ops.mjs` (344), `fns.mjs`, `patterns.sop` (2,093 lines); library 0.118 "storyState reads real word problems (subject, refusal, unknown start, comparisons, turns)" (library git log `233a7eb`). PSys2 vendors 0.114 and no host code calls `storyState` (grep: none).
- Why it matters: the kids plan's L1 is satisfied upstream, but the host cannot use it until it re-vendors.
- Fix: vendor 0.118 and route kids.arith word problems to `storyState` (step 3 of `docs/kids-generalisation-plan.md`).

**15. Host failure-ledger tooling next to `ledgerAppend`/`ledgerGroups`.**
- Evidence: `scripts/build-failure-ledger.mjs`, `scripts/analyze-failures.mjs`, `scripts/lib/failure-cause.mjs`, `scripts/ingest-failures.mjs`. The library's `ledgerAppend`, `ledgerGroups` and `stageOf` are never called (grep: none). `docs/host-boundary.md` ("lib (tools/): format and grouper").
- Why it matters: a second format and grouper.
- Fix: keep `failure-cause.mjs` as the host's `signals`, and use `ledgerGroups(rows, { signals })` and `ledgerAppend` for the rest.

**16. Six reading voices on by default, none with a measured gain.**
- Evidence:
  - `src/dialog/variants.mjs:229-234` (form-operator, canonical, alternation, near, slot-types, run-on) and :261 (ensemble);
  - `src/dialog/index.mjs:786-800` (typed step);
  - other readers: best-effort (`index.mjs:686`), reader-route (`:733`), nx/encoder, normalizer, edit head;
  - measurements in worker-log.md: alternations, near and slots "within the run-to-run noise" (worker-log.md:2200); "Ensemble on vs off: no row changes on any set" (line 2475); typed step "paraphrases-rt 14/85 both; typos ... identical" (line 2185; only synthetic dice and grid gains).
- Why it matters: each voice is a path that can steal a reading, and none earns its place on the real set.
- Fix: measure each voice on the retired-row real set in the shipped mode. Delete those with no gain, keeping at most the library's `readEnsemble` with the typed reader and run-on.

**17. Three paths for Romanian, and Romanian data in the host.**
- Evidence:
  - the rules translator `src/translate/` (7,733 lines: `ro-en.mjs` 1,730, `lexicon.ro-en.mjs` 1,321, `en-ro.mjs` 977, `canonical.en-ro.mjs` 787, `replies.en-ro.mjs` 588, `places.ro-en.mjs` 112) is the default;
  - the browser MT (Bergamot / Translator API);
  - the grammar voice `src/translate/voice-ro.mjs` with `src/lang/ro.mjs` over w.lang.ro is off. Worker-log: "no real turn better or worse with it (rules 95 -> 95, model 89 -> 89)" (worker-log.md:2481);
  - `src/dialog/index.mjs:223-227` holds Romanian sound-alikes for art.draw.
- Why it matters: w.lang.ro (catalog) and `lexicon.ro-en.mjs` (host) are two homes for Romanian words, which breaks "one home per fact".
- Fix: decide on one reader. Until then, freeze `lexicon.ro-en.mjs` and `places.ro-en.mjs` (no additions) and move new words to w.lang.ro and k.geo. Delete `SOUND_ALIKES` (a w.lang.ro sound-alike class).

**18. Old hand patterns next to generated frames, and generators that are off.**
- Evidence:
  - hand `patterns.extra.sop` in schema worlds: `worlds/geo.map` 1,714 lines, `media.music` 1,624, `data.charts` 1,299 (plus `docs.editor` and `diagram.sketch` extras);
  - `describe.sop` (5,322 lines in 11 worlds) is read only behind `PSYS_GEN_PATTERNS` (`src/worlds/index.mjs:24`) or `PSYS2_READER` (`:26`), both off. The webchat ships only its `slot=` lines (`scripts/build-webchat.mjs:33`).
- Why it matters: three ways to make a pattern (hand, frames, descriptions). The extras are where the "keyword theft" readings live.
- Fix: count, per extra pattern, the tests it alone wins (the method of worker-log.md:1800), delete those that never win, and ask w.lang.en for the frames of the rest. Delete `describe.sop` and the E3 generator unless a measurement backs it.

**19. Host data that belongs in the knowledge repository.** Each item, with the catalog world that should own it:

| host item | evidence | owner |
| --- | --- | --- |
| number words for reasons | `src/reasoner/index.mjs:30-31` (ORDINALS, COUNTS); `src/knowledge/bundled-values.mjs` already has 222 number words | k.values |
| ignorable or filler words | `src/dialog/world-aware.mjs:42` `FILLER` (about 70 words); `src/lang/en.local.mjs` `fn`, `neg` | w.lang.en |
| local frames and priority tune | `src/lang/en.local.mjs` (frames acts.text, acts.facts, own; `tune`) | w.lang.en (catalog priorities) |
| demonyms | `worlds/geo.map/map.mjs:94` `DEMONYM` (55) | k.geo |
| region aliases and boxes | `worlds/geo.map/regions.mjs` (header says "what k.geo lacks") | k.geo |
| Romanian place names | `src/translate/places.ro-en.mjs` | k.geo (ro names) or w.lang.ro |
| Romanian lexicon | `src/translate/lexicon.ro-en.mjs` | w.lang.ro |
| built-in drawings | `worlds/art.draw/scene.mjs:144` `BUILTIN` (198 words, k.objects 97%); also `things.catalog.mjs` and `src/knowledge/bundled-objects.mjs`, two generated copies of k.objects | k.objects (one bundle) |
| animal names | `lex.kids.animals.names` (68, k.animals 100%) | k.animals |
| non-names, family words | `worlds/kids.common/ops.mjs` `NOT_A_NAME` (96), `datagen.mjs` `FAM` (65) | w.lang.en / k.people |
| direction and layout words | `worlds/acts/acts.mjs` `DIR_WORDS`, `lex.acts.layout` (26, k.layouts 92%) | k.values / k.layouts |
| diagram topic words | `lex.diagram.sketch.topic` (717) | k.words |
| sample prices | `worlds/kids.shop/kb.sop` | stays (sample data, decided) |

The inventory against the live catalog lists 271 items (`node scripts/knowledge-inventory.mjs --catalog <skw>/docs/worlds`; output `/tmp/rv/inv.md`). Many are false positives (`ops.mjs:SCHEMA`), but the table above is checked by hand. Fix: move each to its owner and delete it here, in the order of the table.

**20. Special cases by world id in shared pipeline code.**
- Evidence:
  - `BUILTIN_TAB` five times: `src/dialog/index.mjs:231` and `:500`, `src/dialog/discourse.mjs:34`, `src/astra/session.mjs:10`, `src/formalizer/routing.mjs:72`;
  - `kids.common` seven times: `index.mjs:547`, `discourse.mjs:29,32`, `dialogue.mjs:451`, `conversation.mjs:70`, `variants.mjs:90`, `src/astra/registry.mjs:13`;
  - `ui.avatar`: `src/formalizer/rules/index.mjs:475-477`, `src/dialog/dispatch-validate.mjs:230`;
  - `src/formalizer/completeness.mjs:40` `CATALOG_WORLDS = {'art.draw','talk'}` (its comment says the fact is in meta.worlds cards);
  - `src/dialog/index.mjs:223` (art.draw sound-alikes), `routing.mjs:142` (`media.music`), `dialogue.mjs:453` (`geo.map` state fields), `conversation.mjs:17,83` and `textgen.mjs:47` (`session.things`), `world-aware.mjs:318` (`ui.shell.lang`);
  - in total 37 literals in `index.mjs` alone (grep).
- Why it matters: removing kids.common (the plan's H2) breaks seven files. A new world cannot get a built-in tab without editing five.
- Fix: declare `tab=` in docs.editor's and ui.avatar's `world.sop` (avatar: `ambient=true` already exists) and delete `BUILTIN_TAB`. Add `role=shell|help|smalltalk|catalog` manifest keys and read them instead of ids.

**21. No single world contract.** Five shapes of world are loaded by the same loader (`src/worlds/index.mjs:17-21`, fields at :33-70):
- (a) schema-generated: `plan.seating` (schema.sop only), `plan.timeline` (plus hooks);
- (b) schema plus hand engine: `art.draw` (engine.mjs 2,301 lines), `data.charts`, `diagram.sketch` (engine/ 5,012 lines), `docs.editor`, `geo.map`, `media.music`, `ui.avatar` (`schema.host.sop`);
- (c) matrix rule worlds with both `ops.mjs` and `fns.mjs` (finding 8);
- (d) matrix only: `common.sense`, `session.conversation`; meta.worlds has a `matrix.sop` but is read by `src/dialog/meta-worlds.mjs`, not by the reasoner;
- (e) hand ops only: `kids.common`, `talk`, `session.things`. `acts`, `space`, `core`, `lang.common` and `session.dialogue` are code libraries posing as worlds.

`typed.json` exists for 20 worlds. Renderers live outside the worlds in `docs/webchat/ui/tabs/*.mjs`. Fix: one contract, `schema.sop` (or `matrix.sop`) + `typed.json` + generated patterns + an optional effect hook and renderer, documented in spec 02. Mark (e) and the library-like worlds as migration targets and move `acts`, `space` and `session.things` out of `worlds/`.

**22. kids.\* worlds are imports of the tab worlds.**
- Evidence: `worlds/data.charts/world.sop:6-10` imports kids.common, arith, shop, tasks, animals. `worlds/docs.editor/world.sop:6-9` imports kids.common, tasks, animals, arith. `art.draw` imports kids.shapes (`world.sop:7`), and 12 worlds import kids.common. Built index `docs/webchat/worlds/index.json`, bytes beyond boot to open a tab:

| tab | total | kids.\* part |
| --- | ---: | ---: |
| Charts | 1,470,860 | 1,091,573 |
| Documents | 765,510 | 548,647 |
| Map | 588,046 | 0 |
| Music | 451,524 | 0 |
| Drawing | 165,918 | 36,459 |
| Diagram | 164,811 | 0 |
| avatar | 71,571 | 0 |
| Seating | 40,994 | 0 |
| Timeline | 37,128 | 0 |
| boot (`always`) | 467,627 | 73,612 (kids.common) |

- Why it matters: the kids plan cannot delete a kids world while a tab imports it. Three quarters of the Charts download is kids content.
- Fix: replace each import by the knowledge the tab actually reads (catalog lookups) before step 3 of the plan, then measure boot bytes again.

**23. Inert tab-cut plumbing and tests of deleted worlds.**
- Evidence:
  - about 130 references to removed games or profile in live code (grep `hangman|chess|tic.?tac|games\.|activeGame|user\.profile|docs\.reader`): `src/translate/replies.en-ro.mjs` 26, `src/dialog/index.mjs` 16, `src/formalizer/routing.mjs` 7 (`GAME_CONTROL_ACTIONS` :127), `src/dialog/world-aware.mjs` 6 (`no-game` veto kind :32), `worlds/ui.shell/patterns.sop` 7, `worlds/ui.help/lexicon.sop` 8;
  - `src/dialog/index.mjs:225` rewrites "x și zero" for tic-tac-toe;
  - failing tests of deleted worlds still in the suite: `voice-repair` rp3-12, rp3-13, rp3-14 (guess, tic-tac-toe), a map test "bare coordinate ... yes starts tic-tac-toe", and others (8 failing cases mention a game);
  - ADR-010 keeps the plumbing on purpose.
- Why it matters: dead branches still take part in routing and vetoes (`no-game` is a default veto kind).
- Fix: delete the game-control plumbing and the `no-game` kind. Re-add a generic board-game mechanism only when a game world returns. Delete or port the 8 tests.

**24. Switches: 41 environment switches, about 10 of them dead.** All found by grep in src, worlds, scripts, tests and docs/webchat/ui.

| switch | read at | default | backed by a measurement? | status |
| --- | --- | --- | --- | --- |
| PSYS2_REASONER | src/dialog/index.mjs:1810 | matrix | real set: no difference (finding 8) | remove with ops path |
| PSYS2_WORLD_AWARE | index.mjs:286 (default `world-aware.mjs:26` veto) | veto | user decision 2026-11-12, spec 16 s6 | keep |
| PSYS2_WA_KINDS | world-aware.mjs:35 | unset | experiment | dead |
| PSYS2_READER (also `globalThis.PSYS2_READER`) | index.mjs:288, worlds/index.mjs:26 | off | yes: fill loses 2 dialogue turns and 10 typos (runtime-defaults.mjs:16) | dead path |
| PSYS2_COMPLETE | completeness.mjs:19 | hold | yes: test-world 59->58, diagram gap 44->48, real unchanged | keep |
| PSYS2_COMPLETE_SRC | completeness.mjs:25 | typed | heuristic not measured on real set | dead alternative |
| PSYS2_COMPLETE_FOREIGN | completeness.mjs:42 | off | yes, no gain | dead |
| PSYS2_RUNON | variants.mjs:234,292 | on (with COMPLETE≠off) | no separate measurement found | unbacked |
| PSYS2_ENSEMBLE | variants.mjs:261 | on | "no row changes on any set" | unbacked |
| PSYS2_ALTERNATIONS | variants.mjs:231,285 | on | within noise | unbacked |
| PSYS2_NEAR | variants.mjs:232,286 | on | within noise | unbacked |
| PSYS2_SLOTS | variants.mjs:233,291 | on | "reads nothing on the paraphrase set" | unbacked |
| PSYS2_TYPED | index.mjs:788 | on | synthetic only (grid holes 4->2, dice 199->206/207) | partly |
| PSYS2_FORMOPS (+_FILE, _ALL, _CATALOG) | variants.mjs:229,279; scripts/lib/formops-host.mjs:48-52 | off | gain only in training third, held-out unchanged | dead |
| PSYS2_CANON | variants.mjs:230,284 | off | "no row read through a canonical rewrite" | dead |
| PSYS_FRAME_RANK | routing.mjs:307 | off | identical tables (old-worker-log.md:833-840) | dead |
| PSYS_GEN_PATTERNS | worlds/index.mjs:24 | off | none | dead (finding 18) |
| PSYS2_PILOT_ROOTS, PSYS2_T1_ROOTS | fs-loader.mjs:15, scripts/exp-transfer.mjs:16 | unset | `worlds-pilot/` deleted (worker-log.md:1480) | dead |
| PSYS2_KNOWLEDGE | loaders/knowledge-source.mjs:7 | unset = no catalog | config | keep (pin it, finding 4) |
| PSYS2_DEBUG_OPS | interpreter/index.mjs:274 | unset | debug | keep |
| PSYS2_SUITE, _SAMPLE_SEED, _CHANGED_WORLDS, _NET_LOG, _FAILURES_OUT, _KNOWN_FAILURES, _HELDOUT_DIR, _EVAL_DIR, _MT_CACHE, _MT_NETWORK, _ORT | scripts/run-tests.mjs:89-106, tests/helpers.mjs:50-55, scripts | infra | n/a | keep |

Browser globals `__psys2LazyRoEn`, `__psys2Ort*`, `__psys2Url`, `__psys2Fault`, `__psys2StartHang` and `__psys2MtOff` are test or host hooks. Fix: delete the dead rows, and turn the unbacked "on" rows off or delete them after finding 16's measurement.

**25. The library is loaded every turn, so "ops" is not a library-free fallback.**
- Evidence:
  - `src/dialog/index.mjs:1450` imports `../vendor/sopworld/sopworld.mjs` in every `_sendCore`; `:1814` installs the library's `choose` in both reasoner modes;
  - `meta-worlds.mjs:65`, `plan/host.mjs:52`, `knowledge/diagram-world.mjs:17`, `lang/ro.mjs:31` load it too;
  - `src/vendor/LICENSES.md:10` still says "Loaded lazily ... only when the Reasoner setting is `matrix`".
- Why it matters: the doc misleads, and the ops/matrix comparison does not isolate the library.
- Fix: correct LICENSES.md, and drop the ops mode (finding 8).

**26. Webchat host code lives in the generated publish folder, and the evaluations import it.**
- Evidence:
  - `docs/webchat/app.mjs` (2,081 lines) and `docs/webchat/ui/*.mjs` (8,611 lines with tabs) are hand-written source inside `docs/webchat`, which `scripts/build-webchat.mjs` also writes;
  - `scripts/real-set.mjs:91` imports `../docs/webchat/ui/translation.mjs` (`createSwitchTranslator`), as do 26 scripts in all;
  - `docs/webchat/build-info.json` says `"commit": "f5ed9431-dirty"` (built from an uncommitted tree);
  - the freshness test only covers `lib/` and `worlds/` (`tests/smoke.test.mjs:66`).
- Why it matters: measurement depends on UI files that no freshness test covers, and a dirty build was published.
- Fix: move `ui/translation.mjs`, `engine-worker` host logic and `knowledge` wiring into `src/host/` (finding 30). Make the build refuse `-dirty` unless forced.

**27. Vendoring is partial, and the pin is four versions behind.**
- Evidence:
  - `src/vendor/LICENSES.md:5-9`: 0.114.0 at `85c6032`, sha256 `07704c1c...`, checked by `tests/reasoner.test.mjs:20-26` (the full suite only, not smoke);
  - the library head is 0.118.0 (`docs/version.md`);
  - `src/vendor/sopworld/src/` holds only `knowledge.mjs`, so library tools that import `parser.mjs` cannot run here (worker-log, k.music note: "a refresh needs the library tool which is not vendored whole");
  - `docs/webchat/lib/vendor/sopworld/sopworld.mjs` is byte-identical to the vendored file (checked with cmp).
- Why it matters: the bundles cannot be rebuilt with the vendored tools, so they are rebuilt from a library checkout of unknown version.
- Fix: vendor `tools/` with the `src/` modules they import, and put the pin test in smoke.

**28. The smoke suite does not cover the integration seams.** Smoke (13 files, 215 s under load, exit 0) has none of the following:
- the vendor pin (`reasoner.test.mjs`);
- meta.worlds card freshness (failing now);
- `typed.json` freshness (`completeness.test.mjs`);
- the w.lang.en bundle against a catalog;
- the knowledge inventory;
- dialogue validity (failing now);
- the real set;
- test-world;
- Romanian.

Fix: add the three cheap freshness checks (cards, typed.json, vendor pin) to smoke, plus a 20-turn real-set sample with a fixed seed.

**29. Slow and flaky tests (fast suite, loaded machine, wall times).**
- Slow:
  - `reasoner.test.mjs` parity gate 730 s (failed by timeout);
  - `system-map` 119 s;
  - `art.draw` world tests 116 s;
  - "switch off answers exactly as before" 112 s;
  - `cli` test-world all 83 s;
  - owner-log summary 72 s;
  - kids.arith world 69 s;
  - A/B gate 64 s;
  - data.charts 61 s;
  - every-turn-gets-a-reply (ops) 59 s.
- Flaky at HEAD: `ort-client` HANG2 and `pilot-avatar` ops decline (both depend on timing or turn budgets); the worker also reports `astra-session` "a single discussion per world" failing alone.
- Fix: the parity gate goes with finding 8. Make the timing tests use injected clocks (like `garbleCandidates`).

**30. Reuse: what another application must copy from PSys2 to use the worlds (move it to the library as a host kit).**
- engine host and turn: `src/dialog/index.mjs` (1,873 lines), `runtime-config.mjs`, `runtime-defaults.mjs`, `budget.mjs`, `budget-limits.mjs`, `time-limits.mjs`, `src/formalizer/guard.mjs`;
- loaders: `src/loaders/bundle-loader.mjs`, `fs-loader.mjs`, `knowledge-source.mjs`, `knowledge-cache.mjs`, `src/knowledge/bundled-source.mjs`, `facts.mjs`, `catalog.mjs`;
- world model: `src/worlds/index.mjs` (420), `validate.mjs`, `lexicon.mjs`, `src/formalizer/typed-world.mjs`;
- schema runtime: `worlds/acts/`, `worlds/session.things/`, `worlds/space/`, and `scripts/build-schema-world.mjs` and `scripts/build-typed-worlds.mjs`;
- browser host: `docs/webchat/ui/engine-worker.mjs`, `engine-client.mjs`, `translation.mjs`;
- English: `src/lang/en.mjs` and its generated bundle.

Of these, the library contract (`docs/host-contract.md`) already claims the schema runtime, catalog access, routing and fill. The rest (budget over a turn, the layered offline source, the worker protocol) is a reusable host kit. Fix: start a `host/` folder in the library with the loader contract, the layered catalog source and the engine-worker protocol, and import it back here.

### Cosmetic

**31.** `src/dialog/index.mjs:285` says world-aware is "'off' (default)", but the default is `veto` (`src/dialog/world-aware.mjs:26`). Fix the comment.

**32.** `KNOWLEDGE_URL` is written three times (`docs/webchat/ui/engine-worker.mjs:103`, `avatar.mjs:10`, `tabs/draw.mjs:9`). Fix: one constant (with the pin, finding 4).

**33.** `tests/known-failures.json` has entries for the deleted files `reasoner-chess-music.test.mjs` and `surprise.test.mjs`. Delete them.

**34.** `docs/webchat/ui/engine-worker.mjs:116` has the comment "agent B's step budget, when this build has it" and a try/catch for a module that always exists. Simplify.

**35.** The prefixes are inconsistent: `PSYS_GEN_PATTERNS`, `PSYS_FRAME_RANK` and `globalThis.PSYS2_READER` sit next to `PSYS2_*` env vars. Fix: one prefix, read through one `flag()` helper.

**36.** `docs/host-boundary.md` still lists `games.*`, `docs.reader`, `user.profile` and `worlds-pilot/` as present. `docs/library-reuse-report.md` is a copy at an old PSys2 commit (78d9db7f). Refresh or mark them historical.

**37.** `worlds/talk/world.sop:13-15` still declares `tab=talk` "Talk", but the Talk tab was merged into the chat (worker-log, mobile layout). The real set still has 5 judged turns typed on `talk`. Drop the tab declaration or alias it to chat.

**38.** The learning-curve series is renamed mid-file (`cousinsReal` -> `relatedReal`) and the points are not in date order (`training/eval/learning-curve.jsonl`). Sort on write and keep one series name (the reader already aliases it).
