# docs.editor rule coverage

**S** = supported (pattern `example=`, `tests.sop` test or `datagen.mjs` family, checked by `npm test` / `test-world`), **U** = unsupported (reason). New rows of this sweep are marked **new**.
Noise: fillers, modal and wish prefixes (`can u`, `i want`, `i need`, `hey`), suffixes (`pls`, `plz`, `thx` after free text, `for me`), ordinal and numeral variants. Digit ordinals are tokenized as `2` + `nd`, number words as digits (`paragraph two` = `paragraph 2`); patterns are written for both.

| Operation | Request shape | Status | Example |
| --- | --- | --- | --- |
| `doc.addHeading` | imperative | S | `add a heading Shopping` |
| | wish / modal (new) | S | `i want a heading that reads Shopping`, `could you insert a header named Shopping` |
| | noun last (new) | S | `add Shopping as a heading` |
| | very short | S (new) | `new heading Shopping`; bare `heading Shopping` is U (it collides with `heading list` of the reader) |
| `doc.addParagraph` | imperative | S | `add a paragraph We went to the park` |
| | wish / chat (new) | S | `i want a paragraph that says ...`, `new paragraph ... pls`, `add ... as a paragraph` |
| `doc.addList` | imperative | S | `add a list with milk, eggs and bread` |
| | chat (new) | S | `new list containing milk, eggs and bread`, `add the items milk, eggs and bread in a list`, `put milk, eggs and bread into a list pls`, `i need a list with ... on it` |
| | reordered items / canonical text | U | gold rewrites the item order or punctuation (`list: milk, eggs, bread`), not derivable |
| `doc.delete` ordinal | imperative | S | `delete the second paragraph` |
| | numerals and chat (new) | S | `delete 2nd paragraph`, `cut out the second heading`, `second paragraph should go`, `2nd paragraph delete` |
| `doc.read` ordinal / numeral | imperative | S | `read the second paragraph` |
| | numerals (new) | S | `read para 2`, `read the 2nd paragraph`, `read number two paragraph pls`, `can u read paragraph two out loud`, `say paragraph 2`, `second paragraph read please` (emitted as `n=2`) |
| | `read me the second one` | S (new) | assumes paragraph |
| `doc.goto` ordinal | imperative | S | `go to the second heading` |
| | numerals / chat (new) | S | `jump to 2nd heading`, `take me to the second heading`, `go to heading number 2`, `heading two please`, `second heading go`, `scroll to the 2nd heading` |
| `doc.select` block | imperative (new) | S | `pick the second paragraph`, `grab the second paragraph`, `select 2nd para` |
| | wish / noun first (new) | S | `i want the second paragraph selected`, `make a selection of the second paragraph` |
| | `select paragraph 2` | S | text kept as typed (`paragraph 2`) |
| `doc.select` word | imperative (new) | S | `pick the word cat`, `select the cat word`, `i want to select the word cat`, `highlight cat so i can select it` |
| `doc.whatSelected` | question (new) | S | `which bit is selected`, `what have I selected so far`, `what am I selecting`, `tell me the selection`, `what part is my selection covering`, `wat is selected atm`, `remind me what I have selected`, `which text did I pick out` |
| | two-sentence form | U | `is anything selected? what is it` is two sentences |
| `doc.format` block marks | imperative (new) | S | `bolden the second paragraph`, `bold the 2nd paragraph`, `italicize paragraph 2` |
| | chat / noun first (new) | S | `second para bold pls`, `can u make paragraph two bold`, `i want the second paragraph in bold`, `make para 2 bold please`, `hey make the second one bold` |
| `doc.format` highlight with colour | imperative | S | `highlight the word milk in green` |
| | chat / reorder (new) | S | `highlight milk green pls`, `milk green highlight`, `green highlight on milk`, `milk should be highlighted green`, `color the word milk green please`, `could you put a green highlight on milk` |
| | `make milk green` | U | `make X <colour>` is a drawing/avatar command in other worlds; only the forms with the word `word` or `highlight` are claimed |
| `doc.link` | imperative | S | `add a link to example dot com on the word example` |
| | chat / reorder (new) | S | `link example to example dot com pls`, `example should link to example dot com`, `put a link on example pointing to example dot com`, `word example link example dot com`, `hey make example link to example dot com` |
| `doc.align` | imperative | S | `center the heading` |
| | chat (new) | S | `put the heading in the center`, `i want the heading in the middle`, `middle align the heading`, `shift the heading to center alignment`, `could you line the heading up in the centre`, `heading to the middle`, `heading centred please` |
| `doc.addTable` | imperative | S | `add a table with 3 columns: animal, legs, food` |
| | chat (new) | S | `table 3 columns animal legs food`, `make a table animal legs food`, `3 column table animal legs food`, `new table animal legs food pls`; `ops.mjs` now splits column names written without commas |
| | canonical spec | U | gold normalises the spec to `3 columns: animal, legs, food`; the rules keep the user's words |
| `doc.addTask` | imperative | S | `add a task buy bread` |
| | chat (new) | S | `new task buy bread pls`, `add buy bread as a task`, `put a task buy bread in the doc`, `could you add a task called buy bread`, `task buy bread`, `todo buy bread` |
| `doc.countTasks` open | question | S | `how many tasks are left` |
| | chat / reorder (new) | S | `how many unfinished tasks are there`, `number of open tasks?`, `open tasks count pls`, `how many tasks not finished yet`, `tasks not done how many`, `how many tasks have i not done` |
| `doc.stats` | very short | S | `word count`, `wordcount pls`, `number of words in the doc?` |
| | `how many words` | S (as count) | stays `doc.count kind=word` as in the training data; `count the words` is left to docs.reader |
| other ops (clear, replace, move, title, newDoc, undo, redo, copy, download, count, mentions, isEmpty, dictate, fromList, report, holdings, rows/columns, cells, check/uncheck, rule, quote) | earlier patterns | S | unchanged (see tests) |
| negation / undo | `undo`, `redo`, `unbold`, `remove the bold from ...` | S | unchanged |

Notes: the new patterns that capture free text use `words(N)` followed by an optional `pls|plz|thx`, so a chat suffix is not captured into the text. Several shapes of the held-out labels (table spec, list item punctuation) are canonical rewrites and cannot be met by rules.
