# Label fixes for `llm_train/opus_tgt_1` (300 messages, ox-0001 .. ox-0300)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules and majorities as in `opus_gen_1/LABEL_FIXES.md`, `opus_gen_2/LABEL_FIXES.md` and `opus_tgt_2/LABEL_FIXES.md`. No reader, model, score, fresh2 data (beyond LABEL_FIXES.md) or feedback file was opened. Nothing committed or staged. `id`, `domain`, `names`, `text` unchanged (byte check against `texts/texts_01.jsonl`, section 5).

## 1. Counts

Messages 300. Wires before 941, now 941 (changed 22, added 0, removed 0). Messages with a change: 22 (ox-0009, 0013, 0021, 0032, 0050, 0097, 0101, 0111, 0142, 0151, 0156, 0160, 0177, 0178, 0185, 0186, 0189, 0238, 0244, 0245, 0255, 0291).

| kind | changed | added | removed |
|---|---|---|---|
| `extreme` with keys the legend does not allow (shape 14, target 8) -> superlative only | 22 | 0 | 0 |

## 2. Rulings used

- `extreme` takes `superlative` only (legend: "extreme: superlative = ..."). Majority: 1376 of 1376 extreme wires in sonnet_msg, haiku_msg, sonnet_msg2, haiku_msg2, sonnet_long have only `ask` + `superlative`; the writer's 14 `shape` and 8 `target` keys are the only exceptions. "Which circle is the biggest" -> superlative biggest; the yes/no form "Is Bay3 the bottommost shape" -> superlative bottommost (yes/no superlative -> `extreme` with the superlative only, 95 against 2 in the training sets). `nearest` keeps its optional shape / color (ox-0179).
- Checked, no change (in the order of the brief): (1) every wire read against its text, all 300 messages; (2) no consecutive `set` pair on one target (script); (3) no "connected to anything" question (script; "who's connected to Board", "What's Ballad connected to" are neighbors); (4) no `fact` with a canvas place (all 21 facts are attribute facts; moves for places such as ox-0094 etc. are already `move`); (5) the only rename with a later wire naming the shape is ox-0222 (already uses Mimic), no wire uses an old name (script); (6) no arrange followed by a place move of the same targets (ox-0134 and ox-0281 are different targets/requests); also: keys per action/question checked against the legend by script (no other violations); yes/no superlatives are `extreme`; "should be" commands, "is" facts; corrections folded (ox-0005, 0071, 0080, 0121, 0175, 0195, 0200, 0296); taken-back requests have no wire (ox-0091 Worker, ox-0259 Cover); chains / several-to-one / one-to-several as ONE connect; `$new` for created shapes and copies; "line" -> `arrow: none` (script: every connect whose span has line(s) and no "arrow" has `arrow: none`, and the reverse); "next to" in questions: none.
- ox-0291 "is Encore at the bottom, like below everything": `check` with position bottom and no anchor, as sl-0056 "Is the Singer in the center" and sm-0166; left.

## 3. Changes (id [kind]: before -> after)

All 22 wires: question extreme, key `shape` or `target` removed, `superlative`, span and trigger unchanged.

- shape removed (14): ox-0009 circle (smallest), ox-0013 hexagon (leftmost), ox-0021 circle (leftmost), ox-0050 square (leftmost), ox-0097 circle (topmost), ox-0101 circle (biggest), ox-0111 circle (rightmost), ox-0160 square (biggest), ox-0178 circle (bottommost), ox-0185 rectangle (biggest), ox-0186 circle (biggest), ox-0245 circle (smallest), ox-0255 square (smallest), ox-0291 circle (biggest).
- target removed (8): ox-0032 Membrane (biggest), ox-0142 Bay3 (bottommost), ox-0151 Returns (rightmost), ox-0156 Refund (leftmost), ox-0177 Users (biggest), ox-0189 Fridge (topmost), ox-0238 Dead (bottommost), ox-0244 Cdn (topmost).

## 4. Open cases (no clear majority; left as written)

1. ox-0137 «Fuse goes after the Battery in the loop»: no wire (could be a connect Battery -> Fuse; ordering statement, not a request); left.
2. ox-0273 «Duplicate Butter, we serve two pats»: duplicate without count (one copy gives two); left (as opus_tgt_2 ox-0596).
3. ox-0039 «connect Intro to Guest, then Ads to Outro», ox-0022 «Link Union to Dock. Dock to Mint»: separate connects (not one continuing sequence); left.
4. ox-0097 «Which city is the topmost circle»: now plain extreme topmost; the "circle" filter is dropped as in the majority.
5. ox-0004 «line everything up in a row»: arrange without target (= everything), as the convention; left.
6. ox-0122 «Every new table from here on should be medium»: rule with size only (table is not a legend shape); left.

## 5. Check

Byte identity of `id`, `domain`, `names`, `text` against `opus_tgt_1/texts/texts_01.jsonl`: 300 of 300. Script checks: every span is a substring of the text, every trigger is inside its span, file format unchanged (each line is `json.dumps(parsed, ensure_ascii=False)`), only the 22 lines listed differ.
