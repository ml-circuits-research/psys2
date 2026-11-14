# Proposal: the library functions that read Romanian into act + roles (and write English or Romanian from them)

Companion of `handover/lang.en/std-grammar.md` (the chart / rule-driven parser over `w.lang.en`). Nothing here is specific to Romanian: it is what `std.grammar` + `std.morph` need so that **any** language world in the same notation (`w.lang.ro`, later `w.lang.fr`...) reads its text into the SAME act + roles as `w.lang.en` does, and so that a reply can be written in the language. Romanian is the case that exercises it (cases, enclitic article, clitics, agreement). English only in this file; Romanian words appear only as examples of data.

## The functions

```
std.morph.analyse(world, surface)             -> [{ lemma, pos, class, features, sense, folded }]     all analyses of a word form: closed classes first, then dictionary lemma + paradigm rules;
                                                                                                       diacritics folded (`fold` wires), the clitic hyphen split (`split`), several readings kept
std.morph.generate(world, lemma, features)    -> surface                                              the forms are made by the class endings of the lemma's dictionary row; irregular rows override
std.grammar.read(world, text, ctx)            -> { readings: [{ act, frame, roles, lead, negated, rest, trace, abstain }] }
std.grammar.realise(world, reading|{act,roles,shape}, {style}) -> text                                from act + roles to text with the world's `template` wires (articles, case, agreement)
std.grammar.translate(from, to, text, ctx)    = realise(to, read(from, text))                         meaning-first translation through the shared reading, only where both worlds have the frame
```

`read` returns **the shape the English reading has** (`act` = the k.actions act, `frame` = the w.lang.en frame name, `roles` = `{ thing, rel, place, value, amount, ... }`), so the host's reading glue (the code that today turns a `w.lang.en` reading into the wires a world's patterns match) is **not duplicated per language**: a Romanian reading goes through the same glue. Each role filler is `{ sense, text, features }`: `sense` is the join to the domain worlds (a k.words sense id, a k.actions verb id, a k.colours colour, a k.geo place), `text` the English gloss of that sense (what the world's English patterns match), `features` the Romanian ones (num, def, case, gender) that a reply needs.

## How `read` works (the algorithm the prototype `src/translate/grammar-ro.mjs` already follows for a few shapes)

1. **Segment**: fold diacritics, split clitics at the hyphen (`fă-ți` = `fă` + `ți`), drop the skipped classes (`lead` wires: politeness, desire, filler) and remember them (`lead`).
2. **Analyse** every word with `std.morph.analyse`; closed classes (determiners, numerals, prepositions, wh words, negation) come from the wires, open classes from the dictionary and the paradigm rules. A word with several analyses keeps them all; typed without diacritics `casa` is the definite of `casă` or the indefinite: a determiner before it decides (indefinite), none means definite.
3. **Chunk noun phrases**: `det? numeral? noun adj* (genitive NP)?` with agreement by unification (gender, number, case of the adjective with the noun; the case a preposition governs). The chunk is a role filler candidate; its head noun's dictionary row gives the `sense`.
4. **Match frames** by priority (`w.lang.ro.frame` + `part`): the verb in the imperative (or the subjunctive after a lead-in), the roles in Romanian order, the preposition's `rel` (the same relation names as `w.lang.en.prep`, k.layouts), `nu` before the verb as `negated`. The first complete frame wins; two complete frames of equal priority are returned as alternatives with their traces.
5. **Abstain, never guess**: a sentence outside every frame returns `abstain` with the first part that failed (`trace`). The host then falls to the next path (rules translator, on-device model); `abstain` is what makes the grammar path safe next to open-text MT.

## Why a reading and not a translation

Meaning first, fluency second (questions.md Q13): the output of `read` is judged by whether the **reading** equals the reading of the reference English (`training/eval/ro-en-meaning`), so the generated English (`realise(w.lang.en, ...)`) only has to be a phrasing the English reader reads; it is a debugging view, and the path that skips English entirely (hand the reading to the acts) is the same call without `realise`.

## What the library has to add to its notation (asks, [LIB])

- **Alternation of the stem per dictionary row** (`carte` -> `cărți`, `masă` -> `mese`, `floare` -> `flori`): a row's optional `alt` code selects a named alternation of the class (the notation already allows `alt` on a class; the ask is several per cell and per-row selection).
- **Agreement by unification across a chunk**, not only between two roles (an adjective after a noun after a numeral: `două case roșii`: the numeral takes the noun's gender, the adjective its number and gender).
- **A role filled by a chunk in a case the frame names** (`part case=gendat`: `capitala Franței`), and a preposition that governs a case (`govern=gen`).
- **`abstain` with a trace** from `read`, and a `coverage(world, texts)` call (share of texts with a complete reading, per frame) so that a language world is measured before it is trusted.
- **One-anaphora and elided objects** (`una verde`, `și mai sus`) through the same `ellipsis` wires as `w.lang.en`; the focus stays with the host (`session.dialogue`).
- **The numeral rule** (`de` before the noun from 20: `20 de case`) as a part of a class of numerals, not code.

## Measured today (prototype, not the library: see handover/w.lang.ro/README.md and docs/lessons.md for the table)

The prototype answers 19.7 % of 9,328 Romanian sentences of the app's kinds; when it answers, the reading equals the reference reading 85.9 % of the time (the rules translator 79.7, the on-device model with the M4 choice 74.0, the raw model 58.8 on the same rows). On the shapes both cover the rules translator is as precise (81.8 against 83.1), so the grammar path is worth its cost as the first reader in a chain (grammar, then the M4 candidates: 55.7 % to 58.0 % kept overall) and, above all, as the only path that can also WRITE Romanian from a frame. Coverage is the limit and the way to grow it is more frames and a bigger dictionary, not code.
