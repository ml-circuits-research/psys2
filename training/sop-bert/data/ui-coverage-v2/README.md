# UI coverage, version 2

Systematic SOP-BERT reader data for **every function of the five tabs**: every operation of each tab's native interface,
every parameter case (operation x parameter, parameter combinations, closed-enum spreads) and every area control, form
field or toolbar button that sends a command. Each case has human paraphrases in three tiers:

- **equivalent**: the same values in other words;
- **complex**: more complex phrasing (a reason, a condition, hedging, chat context, a compound with another request);
- **simplified**: shorter or vaguer; it may leave out values the system is expected to fill from SOP world preferences
  and constraints ("add a boat" -> on the water; "schedule a meeting with Ana tomorrow" -> 30 minutes in a free slot;
  "make it bigger" -> one step from the current size).

Labels mark **only what the text says**. A value the text leaves out, a vague value ("reddish", "a bit later"), a relative
value ("bigger", "an hour later"), a region/relation/degree and a reference to the selection are recorded in
`completion.requirements` with the policy the world is expected to apply (`verifiedByThisDataset: false`), as in
`ui-natural-v1` and `ui-relations-v1`. Completion values are never text-extraction gold. `nativeTool` is `null`: the
rows are not execution-verified.

People do not write slot or tool ids: no text contains `o1`, `r2`, `b3`, `a1`, `hair_front` or `chart:1`. References
use names, kinds, descriptions and pronouns ("the fringe", "her bangs", "the Start box", "the arrow from Review to
Publish", "the second paragraph"); `context.existing` holds the referenced objects under human names. Mapping a word to
a slot or an object id is knowledge's job, not the label's.

## Result (measured)

3,180 rows (Drawing 651, Diagram 824, Calendar 642, Documents 648, Avatar 415; 1,188 equivalent, 836 complex,
1,156 simplified) over **241 cases** of 112 operations / 280 declared parameters and all 26 area controls plus the
Documents toolbar and inspector. Before, 77 cases had fewer than 20 human-named rows in the official dataset (51 had
none; 61 had fewer than 20 rows even counting rows with tool ids); each of them now has 22+ new rows, every other case
8+ new rows, and no case is below 20 human-named rows after (`coverage.md`). `validate.py`: 0 errors, 0 official-builder
errors or fixes, 0 near-duplicates, no text shared with the official dataset; the official builder's `ui_row`,
`anchors_fix` and `definite_description_fix` conversion was also run on every row with 0 errors.

## Files

| File | What it is |
| --- | --- |
| `cases.py` | The case catalogue: per operation the label template (act, mood, target type, mode, selector key), native parameter -> reader keys, the cases, completion policies, UI controls. `python3 cases.py` checks it against `worlds/<world>/native-interface.sop` and `area.sop`: every declared operation and parameter is mapped or listed in `EXCLUDED` with a reason. |
| `contexts.py` | Named model contexts (objects with human names) per tab. |
| `seeds/<tab>.jsonl` | The authored seeds: text, tier, case and compact surface annotations (format in the `build.py` docstring). |
| `build.py` | Expands the seeds into `examples.jsonl` (spans, values, label defaults, completion requirements). |
| `examples.jsonl` | The corpus, in the row shape `official-dataset/build.py` reads for `ui-natural-v1` / `ui-human-v1` / `ui-relations-v1`. |
| `validate.py` | Validation; writes `validation.json`; exit status 1 on any error. |
| `coverage.py` | Operation x parameter matrix before/after against the official dataset; writes `coverage.md`, `coverage.json`; `--quotas` writes `quotas.json`. |
| `quotas.json` | Rows authored per case: 22 where the official dataset had fewer than 20 human-named rows, 8 where it was covered. |

Rebuild: `python3 build.py && python3 validate.py && python3 coverage.py`.

## Row format

Each row: `id`, `world` (tab), `text`, `context` (`existing`, `previous: null`), `requests` (string spans: `span`,
`trigger`, `act`, `mood`, `target` with `type`/`mode`/`determiner`/`fill` and `kind_span`/`name_span`/
`description_span`/`ordinal`, `constraints` with `key`, `value`, `value_span`, `operator`, `phase`, `polarity`,
`character`, optional `anchor_span`), `question` for questions, `style` (`coverage-<tier>`), `tier`, `phase`, `cohort`
(`operation`, `case`, `recipeFamily`), `completion`, `nativeTool: null`, `provenance`. Vague values have no `value` and
carry `qualitative: true` (the official builder's convention for `ui-human-v1`); a mention without a class value (the
source group of a chart) carries `mention: true`. `cohort.recipeFamily` is `<case>#<0..3>` (hash of the text), so the
paraphrases of one case spread over the train/dev/test splits instead of landing in one.

To include the corpus, add a source to `official-dataset/build.py` `SOURCES`, e.g.
`('ui-coverage-v2', DATA / 'ui-coverage-v2' / 'examples.jsonl', 'systematic per-case coverage of every tab function')`;
the rows go through `ui_row` and `anchors_fix` like `ui-relations-v1`.

## Label conventions chosen where the existing corpora disagree

Where earlier sources label the same operation differently, this corpus follows the majority of the official dataset or
the semantically correct bank value, and keeps one convention throughout:

- definite descriptions by kind ("the house", "the second paragraph") are target `kind`/`kind_span` with
  `fill: description` and no selector (the official builder's `definite_description_fix`); names are `name_span` plus
  the operation's selector key;
- class-bank values follow the trainer inventory (`node.size` big/default for native large/medium; `page.mode`,
  `face.mode` temporary/always/off for the ID overlay);
- meeting duration is `meeting.length` (1,817 official rows; `meeting.duration` 27), participants `meeting.people`;
- document creation/composition/rewrite use target type `text` (`text.title`, `text.about`, `text.genre`, `text.words`,
  `text.chapters`, `text.tone`, `text.length`); a title change uses `document.title` (majority for that operation);
- avatar part selectors use `part.ids` (span copy of the human words), never the `part.id` slot bank; the slot of a new
  part (`avatar.part.add`) is `part.id` with the slot class as value and the human word as surface;
- acts: `connect` for links, `arrange` for node/group layouts, `group`/`ungroup` for grouping in both tabs, `remove` for
  deleting a node+link selection (earlier rows labelled it `select`).

## Known gaps (honest list)

- **Block destination**: `document.block.reorder` has no block-level order key in the reader inventory (only
  `section.order`). "Move the quote above the Budget table" labels the moved block; the destination is a completion
  note. Needs: a declared `block.order`/`block.order_anchor` key (or a general order relation for blocks).
- **Relative node placement**: the Diagram node operations have no relation/anchor key ("a triangle next to
  Approved?"); such placements are completion notes. Groups have no region key either.
- **Closed colour banks** for `group.colour` and `link.colour`: "light blue" cannot be labelled there (node colours copy
  the text). Removing a list item or table row is labelled as `block.items`/`block.rows` with negative polarity; "clear
  the formatting" (all marks) is a vague negative mark (`?`), since no mark class means "all".
- **Units**: `meeting.shift`/`meeting.length` values are the number as written, in the unit written (hours or minutes;
  earlier shifts negative); the reader inventory has no unit field (see `ui-natural-v1` README).
- `data.charts` operations (standalone chart widgets) are not one of the five tabs; the Diagram tab's charts are
  `diagram.group.chart.*` and are covered.
- Not execution-verified; completion requirements state the desired world behaviour, not measured results.
