# Dialogue phenomena catalogue (DLG, G7)

The operational set (`operational.jsonl`) is single messages. `dialogues.jsonl` is the second headline: multi-turn dialogues (3-8 turns), each with an initial state and, after EVERY turn, the expected state / answer in the operational check format (`scripts/lib/operational-check.mjs`). Run with `node scripts/eval-dialogues.mjs --mode rules|encoder|encoder+n1`.

One family per line. Each family is tagged on the dialogues (`families`); a dialogue may carry several. Counts are generated into `training/results/dialogues/` reports and listed in RESULTS.md; the per-family counts below are the minimum targets (5 each) and the worlds where the family makes sense.

| Family | What it tests | Worlds where it makes sense |
| --- | --- | --- |
| `reference` | pronouns (it/them), demonstratives (that one), attributes (the red one), ordinals (the second, the last), quantifiers (both, all, each), the object just created | art.draw, docs.editor, kids.shapes, kids.tasks, kids.shop, kids.animals, geo.map, data.charts, media.music, games.chess |
| `ellipsis` | "and X?", "what about X", "X too", "now bigger", "again", "the same for X", "one more" | kids.arith, kids.time, kids.shop, kids.animals, geo.map, art.draw, media.music, data.charts, ui.avatar, docs.reader |
| `clarification` | incomplete command, the system asks, the user answers ("Draw" - "a cat"); choice clarification ("which one?" - "the first") | art.draw, geo.map, media.music, docs.editor, data.charts, kids.tasks |
| `correction` | "no, I meant ...", "actually ...", "not that one", cancellation ("never mind"), undo/redo chains | art.draw, ui.avatar, docs.editor, kids.tasks, games.tictactoe, data.charts, geo.map, media.music |
| `degree` | "a bit more", "much bigger", "twice as", "the same size as" | art.draw, media.music (tempo, volume), ui.avatar, docs.editor (sizes) |
| `multistep` | list entry mode ("milk" ... "that's all"), building a drawing / document step by step, a game over many turns | kids.tasks, kids.shop, art.draw, docs.editor, games.hangman, games.tictactoe, games.chess, games.guess, data.charts |
| `confirmation` | yes / no / sure / maybe later to system offers, answers to yes/no questions | ui.avatar, games.*, user.profile, kids.tasks |
| `explain` | "what did you do?", "why?", "what's on the board?", "what?" / "say again" | art.draw, games.chess, games.tictactoe, kids.arith, docs.editor, geo.map, media.music |
| `feedback` | "thanks", "great", "that's wrong", "not what I asked" | every world |
| `topic` | topic switches and returns ("let's draw", "back to chess", "where were we?"), cross-world references ("chart what Tom has", "put that song in the document") | games.chess + any, art.draw + any, docs.editor + any, geo.map + data.charts, media.music + docs.editor |
| `userfacts` | user facts used later ("my name is Ana" ... "what's my name?"), profile interview, correction, deletion | user.profile, ui.avatar, kids.* |
| `noise` | typos, voice fillers, run-ons, two commands in one turn, inside a dialogue | every world |

## G7 additions (tag `g7`)

- `user.profile`: interview (the system asks, the user answers), correction of a stored fact, deletion of a fact, switching tab and back (the profile state survives, the interview resumes or is not forced), no unrequested actions (small talk must not store or change anything).
- Long-range returns: scenarios that return to an earlier topic after more than 6 messages. The encoder validator rebuilds context from a limited history, so the expectations are full state snapshots (`state` items on fields that were set early and must still hold, plus the answer of the return turn). Tag `long-return`.

## Check format (per turn)

`{"message": "...", "expect": {"state": ["world:path=value"], "answer": ["substring"], "answer_any": [..], "effects": [..], "forbid_state": [..], "status": "supported", "none": true}}`. Items already true before the turn are not counted (as in the operational set), unless they are the only ones. `none: true` means the turn must neither act nor be understood.

## Dialogue record

`{"id":"dlg.<group>#NNN","world":"<primary world>","group":"<world group>","tab":"<tab or null>","init":{"<world>":{patch}},"families":[..],"tags":[..],"turns":[{message, expect}]}`
