# World `real`: built from 2109 training messages (10215 requests with a span)

Front end learned from the same messages: 153 value n-grams, 1762 trigger rules, 0 segmenter weights; params {"seg_epochs": 8, "val_min_count": 5, "val_min_prec": 0.8, "trig_min_count": 2, "trig_share": 0.75, "trig_min_prec": 0.6}.

Rows: 10159. Dropped (cannot be trained): 56 {'no event token and no role (zero target)': 56}. Negative examples (text outside the spans with an action token): 0.

Kinds: 182; lexicon 316 words (legend value tokens 105, event tokens 44, own-kind tokens seen >= 8 times).

Own-kind tokens: a, about, active, again, along, also, an, and, another, any, anything, anywhere, are, around, arrow, arrows, as, at, axe, axis, back, be, bit, board, both, box, but, by, called, can, canvas, change, check, colour, come, connection, connections, corner, could, default, defaults, diagram, directly, do, does, each, earlier, evenly, every, everything, exist, far, feeds, first, flow, for, four, from, front, give, go, goes, hall, has, have, her, here, him, hmm, how, i, i'd, if, in, into, it, its, just, labeled, labelled, last, leads, like, line, lines, link, linked, links, list, little, long, loop, map, me, mean, more, my, named, new, no, node, not, now, of, old, on, once, one, ones, order, other, others, out, page, park, pixels, place, plan, please, put, remove, rules, same, set, shape, shapes, sheet, should, show, side, sits, so, stack, step, still, stop, tell, that, the, them, then, there, these, thing, things, this, those, three, throw, to, too, total, two, uh, undid, wait, want, way, we, well, what, what's, who, whole, with, you, zap

Roles left out because their words are not in the normalized span (rows kept):

| what | n |
|---|---|
| event token not found | 1260 |
| name | 949 |
| chain | 221 |
| rules | 94 |
| head | 72 |
| next_to | 66 |
| left_side | 41 |
| ring | 34 |
| shape | 22 |
| $new | 21 |
| circle | 21 |
| not_red | 16 |
| right | 14 |
| not_blue | 14 |
| two_way | 14 |
| right_of | 13 |
| horizontally | 13 |
| vertically | 12 |
| right_side | 11 |
| newest | 11 |
| not_green | 11 |
| 2 | 11 |
| left | 10 |
| not_gray | 10 |
| left_of | 9 |
| below | 8 |
| not_white | 8 |
| oldest | 7 |
| not_brown | 7 |
| not_black | 7 |
| rectangle | 6 |
| not_orange | 5 |
| triangle | 5 |
| 3 | 5 |
| 5 | 4 |
| gold | 4 |
| square | 4 |
| not_yellow | 3 |
| not_teal | 3 |
| not_navy | 3 |

| event | rows |
|---|---|
| connect | 1587 |
| set | 1471 |
| move | 1279 |
| extreme | 560 |
| create | 514 |
| check | 379 |
| fact | 340 |
| connected | 269 |
| list | 261 |
| count | 257 |
| path | 249 |
| nearest | 214 |
| arrange | 211 |
| duplicate | 162 |
| rename | 136 |
| property | 134 |
| exists | 132 |
| degree | 132 |
| resize | 131 |
| undo | 124 |
| describe | 122 |
| align | 122 |
| neighbors | 120 |
| swap | 112 |
| delete | 112 |
| rule | 112 |
| reachable | 112 |
| cycle | 111 |
| distribute | 108 |
| toFront | 103 |
| toBack | 101 |
| disconnect | 100 |
| label | 98 |
| forget | 98 |
| redo | 86 |
