# ui-quantities-v1

174 authored rows teaching the reader coordination of make requests and quantities (Drawing; Diagram in C7).
`generate.py` holds the paraphrases as inline-markup data (deterministic, no network); `validate.py` runs the official
`Validator` plus span/order/count checks (`python3 validate.py`, exit 0 = pass); `report.json` has the counts.
Not wired into the official build; the official-dataset owner adds it.

Cases (24-25 rows each): C1 two-thing coordination, C2 coordination with a count in a conjunct, C3 three-way lists,
C4 coordination with a shared relation tail, C5 numeral counts, C6 vague quantities, C7 diagram counts/coordination
("add three boxes in a row", "add a box and two circles").

Label decisions
- A coordination of N noun phrases is N requests, each with its own `span`, `determiner: indefinite`, `kind`/`kind_span` and
  optional `count`/`count_span`; all are `act: make`, `mood: do`, `mode: new`. Only the first request has a `trigger`; later
  conjuncts have none. The coordinators ("and", ",") belong to no request span. Words before the first verb ("can you",
  "please", "I want" with trigger `want`) stay inside the first span when they are part of the clause, as in existing rows.
- `kind_span` is the surface noun (plural kept: "dogs"); `kind` is the singular lemma ("dog", "box").
- Numerals ("2", "three") are `target.count_span`, `target.count` the normalized digit string ("2", "3"), as existing rows.
  "a"/"an" give no count (as in existing rows).
- Vague quantities (some, a few, several, many, a couple of, a handful of) are NOT numerals: no `count`, no `count_span`,
  no invented value. The noun phrase is an indefinite plural with its `kind_span`; the runtime reads the quantity words
  from knowledge (k.expect.amount). The format declares no non-numeric count representation.
- Shared tail ("near the lake" after a coordination): a request span belongs to one request, so the tail is attached to the
  LAST conjunct (its span includes the tail, and it carries `drawn.relation` plus the `drawn.anchor` selector as in ui-natural rows).
  Earlier conjuncts carry no relation; whether the relation applies to all conjuncts is left to the runtime.
- Diagram: target type `node`, kind from the node bank ("box" stays `box` as in existing rows); "in a row" is
  `node.layout=row` (operator eq, phase result) on the request it follows; it is a layout of the members, not a count.
- A few trigger-less single-request fragments ("two trees left of the house") exist, as the format allows.
- Typos/casual forms (drw, ad, kat, gimme, pls) appear in a minority of rows; kind typos keep the lemma in `kind`.
