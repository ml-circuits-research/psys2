# Label fixes for `llm_train/opus_tgt_2` (300 messages, ox-0301 .. ox-0600)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules and majorities as in `opus_gen_1/LABEL_FIXES.md` and `opus_gen_2/LABEL_FIXES.md`. No reader, model, score, fresh2 data (beyond LABEL_FIXES.md) or feedback file was opened. Nothing committed or staged. `id`, `domain`, `names`, `text` unchanged (byte check against `texts/texts_01.jsonl`, section 5).

## 1. Counts

Messages 300. Wires before 1023, now 1023 (changed 6, added 0, removed 0). Messages with a change: 5 (ox-0377, ox-0387, ox-0406, ox-0453, ox-0489).

| kind | changed | added | removed |
|---|---|---|---|
| canvas statement -> move | 6 | 0 | 0 |

## 2. Rulings used

- A canvas place stated as "X is / sits / are on <place>" -> `move` (rule 4; opus_gen_2 og-0450, fresh1 22 moves against 0 facts with a canvas place). Attributes of the same sentence stay a `fact`. Also when the text adds "already", "that's intended" or "that's correct": the sentence still states a place with no anchor.
- Checked, no change: no "connected to anything" question (ox-0415 "anything connected to Printer" is a neighbors question, ox-0399 "anything in the bottom left" is exists); every consecutive pair of `set` wires on one target has a verb of its own in the second span (ox-0331, 0353, 0356, 0362, 0406, 0416, 0421, 0437, 0446, 0465, 0477, 0481, 0497, 0506, 0517, 0527, 0547); yes/no superlatives are `extreme` / `nearest`; "should be" is a command, "is" a fact (facts with an anchor, e.g. ox-0382 "Bass is next to Drums", stay facts); corrections folded (ox-0312, 0317, 0345, 0388, 0410, 0416, 0453, 0454, 0521, 0546, 0573 and others); taken-back requests have no wire (ox-0303 Review/Done, 0321, 0375, 0464, 0469, 0479, 0530, 0585 undo); chains and the closing connect (ox-0589); several-to-one / one-to-several as ONE connect; `$new` for created shapes and copies (ox-0373, 0513); "line" -> arrow none (script: every connect whose span has line(s) and no "arrow" has `arrow: none`, and none of the other arrow-none connects lacks line / plain / solid / dashed / dotted in its span); the only rename followed by later wires (ox-0582, ox-0586) already uses the new name; no arrange followed by a move; "next to" in questions: none.

## 3. Changes (id [kind]: before -> after)

- ox-0377 [canvas statement -> move]: fact target=Sample,Freezer position=left «Sample and Freezer are both on the left» -> command move, same args, trigger [are both on].
- ox-0387 [canvas statement -> move]: fact target=Panel1,Panel2 position=top «Panel1 and Panel2 sit at the top» -> command move, trigger [sit at].
- ox-0406 [canvas statement -> move]: fact target=Exit position=bottomRight «Exit is at the bottom right» -> command move, trigger [is at].
- ox-0453 [canvas statement -> move] (2 wires): fact Entrance bottom «Entrance is at the bottom» and fact Stage top «Stage at the top» -> command move each, triggers [is at] and [at the top] (elided verb: the position phrase).
- ox-0489 [canvas statement -> move]: fact target=Ghost position=topLeft «Ghost is at the top left already» -> command move, trigger [is at].

## 4. Open cases (no clear majority; left as written)

1. ox-0357 «Dock and Exit are where they belong», ox-0382 «Drums go center back, they're already there», ox-0453 «Bar and Toilets are fine»: no wire (no place or attribute is stated); left.
2. ox-0477 «connect Root to L1 and R1. L2 hangs under L1, so link L1 to L2. R2 is R1's child, link those too»: separate connects, a tree rather than one continuing sequence; left (as og-0440).
3. ox-0584 «connect Plant to both of them with thick... well, plain arrows»: no arrow key (plain arrow); left.
4. ox-0596 «Duplicate Lodge, we need two of those»: duplicate without count (one copy gives two in total); left.
5. ox-0339 «Link Central to North, South, East and West with two-way arrows — oh wait those already exist, skip that»: taken back, no wire; left.

## 5. Check

Byte identity of `id`, `domain`, `names`, `text` against `opus_tgt_2/texts/texts_01.jsonl`: 300 of 300. Script checks: every span is a substring of the text, every trigger is inside its span, only the 5 lines of the changed messages differ from the file before the check.
