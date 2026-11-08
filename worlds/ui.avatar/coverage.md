# ui.avatar rule coverage

**S** = supported (pattern `example=`, `tests.sop` test or `datagen.mjs` family), **U** = unsupported (reason). Earlier tolerance work (commit 861565b: colour/should-be/word-order colour phrasings, comparative size forms, become/make-me characters, noun-first parts, lip colour refusal, clause split) is kept; this sweep adds the rows marked **new**.
Noise handled by the new patterns (`gen`-style prefix and suffix): fillers (`pls`, `plz`, `thx`, `lol`, `rn`, `right now thank you`), modal/wish prefixes (`u should`, `can i have`, `would like`, `i wanna see`), chat abbreviations (`u`, `ur`, `r`, `wat`, `whats`).

| Operation | Request shape | Status | Example |
| --- | --- | --- | --- |
| `setPart` (wear an option) | imperative / wish | S | `wear sunglasses`, `give yourself glasses 3` |
| | chat / statements | S (new) | `u should wear sunglasses lol`, `wear sunglasses right now thank you` |
| | very short | S (new) | `sunglasses pls`, `shades on you please`, `put some sunnies on` (synonyms map to `sunglass`) |
| | on a part | S (new) | `can i have a dish on top of u`, `would like a dish on the top`, `a dish on top would be nice`, `i wanna see a dish on top`, `put a dish up top` |
| `setColor` / `setPartColored` | all earlier phrasings | S | see commit 861565b |
| | misspelt colour (`bleu`) | U | a colour word the lexicon does not know; typo correction does not fix 2 edits in 4 letters |
| `askColor` | question | S | `what colour are your eyes` |
| | chat / word order | S (new) | `wat colour r ur eyes`, `which color are your eyes`, `can you say what color your eyes are`, `tell me the color of your eyes please` |
| `askPart` (kind of hair etc.) | question | S | `what kind of hair do you have` |
| | chat / short (new) | S | `what hair u got`, `hair types?`, `hairstyle?`, `whats ur hair like`, `which hairstyle do you have now`, `tell me ur hair style`, `could u tell me what hair u have` (hair, hairstyle, hair style, haircut all give part `hair`) |
| `hasThing` | question | S | `do you have glasses` |
| | chat (new) | S | `r u wearing glasses`, `u got glasses?`, `is there glasses on you`, `you have glasses or not`, `do u have glasses on` |
| | `glasses on you?` | U | indistinguishable from the command `glasses on you` (no punctuation in matching) |
| `checkMood` | question | S | `are you happy` |
| | synonyms (new) | S | `are u smiling?` (smiling, grinning, beaming map to `happy`) |
| `setMood` | imperative | S | `look surprised` |
| | chat (new) | S | `look surprised pls`, `make ur face surprised`, `i want to see you surprised`, `be surprised please`, `can u make a surprised face` |
| | `show surprise`, `surprise face` | S | kept on the earlier part/surprise patterns |
| `resetPart` | imperative | S | `reset your mouth` |
| | to default (new) | S | `mouth back to normal`, `can u reset ur mouth to default`, `mouth to default please`, `go back to the normal mouth`, `i want the default mouth again` |
| | undo of a change (new) | S | `undo the mouth change` |
| `step` next/previous | imperative | S | `next hairstyle`, `previous mouth` |
| | previous (new) | S | `prev mouth`, `back one for the mouth`, `go to the mouth before this one`, `mouth previous one pls`, `can you go back to the last mouth`, `mouth one step back`, `the mouth from before, please` |
| | next (new) | S | `next hair please`, `try the following hair`, `next hair style for me` (hair forms give part `hairstyle`) |
| `resizePart` | comparatives | S | see commit 861565b |
| `explainSwitch` | `why did you change it` | S | the verbs `do`/`did` were removed from this pattern so that `how come you did not get it` reaches the help world |
| characters, seed, name, animate, listOptions, describe, undo | earlier patterns | S | unchanged |
| negation / undo | `do not change the colour`, `undo` | S | unchanged |

Known gaps: the held-out labels of `show surprise`, `surprise face` and similar ask for `setPart value=surprise` while the world test suite and the person character use `setMood`; the rules keep `setMood` (tests `n47`, `u10`).
