# E2: world-aware veto as the default (2026-11-12)

User decision 2026-11-12: `worldAware` unset means `veto`; explicit `off` turns it off (spec 16). Same sets as `e2-world-aware-2026-11-12b.md` (about 8,430 messages), collected with `scripts/e1-collect.mjs --world-aware off|veto` and compared with `scripts/e2-world-aware.mjs`, after the false-veto fixes below.

| mode | off (right / wrong / not understood, partly) | veto |
| --- | --- | --- |
| rules | 7281 / 427 / 736, 80 | 7279 / 412 / 753, 80 |
| encoder+n1 | 7455 / 476 / 561, 27 | 7455 / 463 / 574, 27 |

Case by case against off: rules 11 wrong to not understood, 4 wrong to right, 1 not understood to right, 7 right to not understood, **0 new wrong**; encoder+n1 10 / 3 / 0 / 3, **0 new wrong**. (A first encoder+n1 run made while Chrome and the world tests ran at the same time showed one "new wrong" ("Mkae it a pie chart."): a time-budget effect under load, not the veto; a clean rerun of the whole set and of `typos` alone gives 0.)

What the fixes changed. Before them, with veto as the default, 21 unit tests and 75 world tests failed (no-game vetoes of game moves the router takes into a game, and no-referent vetoes of "connect A to B with a line", "Link each square to the next one", "Connect CEO to CTO, CFO and COO", and of names made by an earlier clause of the same message). After: all pass. In the measurement the `no-game` veto now fires on 6 of the 8,430 messages (a message that names the game, or whose game move the open tab cannot read, never fires it); the first measurement vetoed every game move from another tab.
