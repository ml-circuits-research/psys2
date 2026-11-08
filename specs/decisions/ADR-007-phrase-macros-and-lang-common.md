# ADR-007: Phrase macros and the shared world `lang.common`

Status: accepted (L2-L4 of the reusable symbolic library; L9 amends the ranking decision)

## Context
An analysis of the 20 worlds found that 82 % of the pattern match text was verbatim copies of the same lead-in, suffix and filler lists (124 distinct lead-in lists, 233 suffix lists, 180 filler lists; one 187-alternative lead-in copied 808 times), and that about 7 % of the alternatives can never match because the tokenizer already drops those words. The copies cost matcher time, 7 MB of shipped patterns, and they distort routing: a longer copied lead-in adds literal words and steals sentences from patterns with fewer literals.

## Decision
- **Phrase macros.** A new wire type `core.phrase` (in `lexicon.sop`) names a list of literal alternatives; a pattern uses it as `[$id]`, `[$id]?` or `[$id|lit]?`. Expansion is at compile time to an ordinary alternative element (shared array), so SOP Lang, `core.pattern`, the matcher and the emit templates stay as they are. Phrase wires are `phrase.<id>`; the macro id is the rest.
- **Shared world.** `worlds/lang.common` (`status=fixture`, no patterns, `summary=""`) holds the phrase groups (union of the per-world lists minus unreachable alternatives) and shared lexicons. It is imported by `kids.common`, so every world sees it. Lexicons gain `extends=` and `exclude=`, resolved at load.
- **Ranking is unchanged for now.** The matcher counts macro words in `literals` exactly as before and also reports `frameLiterals`. Dropping frame words from the specificity (L9) is a measured, separate decision, because it changes routing.
- **Checks.** `checkPattern` rejects unknown macro ids and macros of worlds the pattern's world does not import.
- **Migration is mechanical.** `scripts/migrate-macros.mjs` rewrites a world's patterns; each world migrates in its own commit and must keep the operational and `eval-rules` numbers.

## Consequences
- Patterns shrink (ui.avatar by more than 60 %), new phrasing is added once in `lang.common`, and typo-correction vocabulary is unchanged (macro words are still counted for every use).
- Alternatives inside a macro are tried in phrase order; phrases list longer alternatives first so an inline group's behaviour is kept.
- Deleting an alternative from a phrase affects every world: a phrase edit must run the whole operational set.
