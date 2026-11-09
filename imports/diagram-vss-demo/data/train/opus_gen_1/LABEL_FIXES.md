# Label fixes for `llm_train/opus_gen_1` (300 messages, og-0001 .. og-0300)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules: `LABEL_CONVENTIONS.md`, `llm_train/TRAIN_MSG_SPEC.md`, `llm_bench/SPEC.md`, the rulings of fresh1 / fresh2 opus_a-d / opus_train_a,b; majorities counted by script on the corrected sets sonnet_msg, haiku_msg, sonnet_msg2, haiku_msg2, sonnet_long. No reader, model, score, fresh2 data or feedback file was opened. Nothing committed or staged. `id`, `domain`, `names`, `text` unchanged (byte check against `texts/texts_01.jsonl`, section 5).

## 1. Counts

Messages 300. Wires before 1000, now 991 (changed 10, added 0, removed 9). Messages with a change: 10.

| kind | changed | added | removed |
|---|---|---|---|
| one verb, two attributes -> ONE set wire | 9 | 0 | 9 |
| name after a rename | 1 | 0 | 0 |

## 2. Rulings used

- One verb with two attributes ("Make Magma red and huge") -> ONE `set` with both keys; the second part has no verb of its own. Count in the training sets: 841 set wires with 2+ of color/shape/size against 10 splits, and every one of those 10 has its own verb ("make it large and turn it green"). The writer split 8 of these (and 2 more elided-verb cases). Splits with a verb of their own stay two wires (og-0003, 0005, 0057, 0077, 0106, 0115, 0140, 0185, 0201 "keep it small", 0230, 0274, 0281).
- After `rename A to B`, later wires use B (fresh1/sonnet; opus_a, c, d). Only og-0254 had a later wire; the writer's other renames come last in the text (og-0015, 0117, 0196, 0220, 0310 etc.).
- Checked, no change: "Is X connected to anything / anyone" -> degree (og-0110, 0148, 0200 already degree); yes/no superlative -> extreme / nearest (og-0013, 0044, 0291); "should be" -> command, "is" -> fact; canvas place with "X is/sits in <place>" -> move (og-0097, 0124, 0180, 0195 already move); "in a row <place>" -> one arrange (og-0224); corrections fold; taken-back requests have no wire; chain + closing connect; "line" -> arrow none (script: every line-without-arrow connect has arrow none); copies after duplicate -> `$new`; "next to" in a question -> list near.

## 3. Changes (id [kind]: before -> after)

- og-0067 [one set]: set Runway shape=rectangle «make it a rectangle» + set Runway size=huge «huge» -> ONE set shape=rectangle size=huge, span «make it a rectangle and huge», trigger «make».
- og-0127 [one set]: «Make Magma red» + «huge» -> ONE set color=red size=huge, span «Make Magma red and huge».
- og-0137 [one set]: «Make it white» + «tiny» -> ONE set Ghost color=white size=tiny, span «Make it white and tiny».
- og-0190 [one set]: «Exit should be lime» + «huge» -> ONE set Exit color=lime size=huge, span «Exit should be lime and huge», trigger «should be».
- og-0199 [one set]: «Make Moon gray» + «tiny» -> ONE set Moon color=gray size=tiny, span «Make Moon gray and tiny». («Sun huge» stays its own wire.)
- og-0250 [one set]: «Make Adoption green» + «large» -> ONE set color=green size=large, span «Make Adoption green and large».
- og-0253 [one set]: «Hut should be brown» + «small» -> ONE set Hut color=brown size=small, span «Hut should be brown and small».
- og-0268 [one set]: «Defeat gold» + «a star» -> ONE set Defeat color=gold shape=star, span «Defeat gold and a star», trigger «Defeat» (leading word, as for elided verbs).
- og-0271 [one set]: «Please make Control as navy color» + «size large» -> ONE set Control color=navy size=large, span «Please make Control as navy color and size large».
- og-0254 [rename follow-up]: set target=Coo shape=hexagon «turn it into a hexagon» -> target=Cos (text: «Rename Coo to Cos ... And turn it into a hexagon»).

## 4. Open cases (no clear majority; left as written)

1. og-0221 «Bus and Train both go to Metro. Make those two lines dotted.» The writer gave one connect and no wire for the restyle. The legend cannot restyle an existing link, but the links are made in the same message, so it could also fold into the connect (style dotted, arrow none). No precedent in the training sets.
2. og-0079 «make a blue circle call it Tube ... put it near Flask» (og-0079): create without position + a separate move of `$new`. 0 cases of this shape in the training sets (create with no position followed by move `$new`); separate-sentence follow-ups «Make it huge» after a create stay separate sets there (5 of 5), so the writer's version is the consistent reading; left.
3. og-0200 «Draw dashed arrows from Mid1 to Fwd and from Def1 to Mid1»: two pairs in reverse order, not a continuing sequence; kept as two connects.
4. og-0283 «Color Math blue, Science green, English red and Arts pink. Hmm, actually Arts should be magenta»: the correction of Arts lies in the next sentence; the writer gave one set Arts=magenta placed after English (order slightly off from the text, span in order); left (5 of 5 corrections fold).
5. og-0053 / og-0124 / og-0150 questions replaced by a follow-up («Actually, never mind that, just tell me ...», «Well, specifically, ...») keep only the final question; consistent with taken-back requests.

## 5. Check

Byte identity of `id`, `domain`, `names`, `text` against `opus_gen_1/texts/texts_01.jsonl`: 300 of 300. Script checks: every span is a substring of the text, spans in text order, triggers inside spans, no facts with a canvas place, no neighbors question with «anything», values inside the legend lists.
