# Label fixes for `llm_train/opus_gen_2` (300 messages, og-0301 .. og-0600)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules and majorities as in `opus_gen_1/LABEL_FIXES.md`. No reader, model, score, fresh2 data or feedback file was opened. Nothing committed or staged. `id`, `domain`, `names`, `text` unchanged (byte check against `texts/texts_01.jsonl`, section 5).

## 1. Counts

Messages 300. Wires before 1094, now 1094 (changed 3, added 0, removed 0). Messages with a change: 3 (og-0335, og-0369, og-0450).

| kind | changed | added | removed |
|---|---|---|---|
| connected to anything -> degree | 2 | 0 | 0 |
| canvas statement -> move | 1 | 0 | 0 |

## 2. Rulings used

- "Is X connected to anything" -> `degree` (sl-0025, sl-0071; fresh2 opus_c, d; opus_train_a, b).
- A canvas place stated as "X is / sits in <place>" -> `move`, the attributes of the same sentence stay a `fact` (fresh1 22 moves against 0 facts with a canvas place; opus_train_b ot-0394, 0448, 0544).
- Checked, no change: this writer already merges one verb + several attributes into one `set` (e.g. og-0312 gold star, 0368, 0447, 0534); two verbs stay two wires (og-0353 «should be like navy blue ... make it large», og-0523); loops = chain + closing connect (og-0566); several-to-one / one-to-several as ONE connect; chains from «A to B and B to C»; `$new` for created shapes and copies; «Is X ...? It should be.» without an extra wire; conditionals as plain commands; corrections folded (og-0324, 0378, 0402, 0482, 0561, 0586); taken-back requests without a wire (og-0353 Whale, 0371 «keep it», 0378 Swamp, 0421 men/women squares, 0541); renames: all renames in this file come after the wires that use the old name (og-0371, 0389, 0474, 0489, 0521, 0585, 0600), none needed a change; «line» -> arrow none (script clean).

## 3. Changes (id [kind]: before -> after)

- og-0335 [degree]: question neighbors target=Server «Is the Server connected to anything» -> ask=degree target=Server.
- og-0369 [degree]: question neighbors target=Dj «is the Dj connected to anything» -> ask=degree target=Dj.
- og-0450 [canvas statement -> move]: fact target=Pond position=center «sits in the center» [sits] -> command move target=Pond position=center, same span, trigger [sits in]. «Pond is blue» stays a fact.

## 4. Open cases (no clear majority; left as written)

1. og-0546 «connect Ace with Bolt and Comet with Dash using plain lines»: the first wire's span «connect Ace with Bolt» carries `arrow: none` while the word «plain lines» lies in the second span; both wires are correct in meaning (one «using plain lines» governs both), left.
2. og-0432 / og-0585 «Connect Inbound to Qc. Connect Qc to Store.» (two consecutive sentences continuing a sequence) stay separate connects (fresh1 open case 8; opus_train_a).
3. og-0440 «Commit should go into Build, and Build splits into UnitTest and Lint. ... Package to Deploy»: a long continuing sequence written as four connects (fan-outs make a single chain impossible); left.

## 5. Check

Byte identity of `id`, `domain`, `names`, `text` against `opus_gen_2/texts/texts_01.jsonl`: 300 of 300. Script checks as in opus_gen_1 (spans, order, triggers, values): clean after the changes.
