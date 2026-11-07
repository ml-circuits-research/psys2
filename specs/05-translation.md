# 05 — Translation at the boundary (draft for discussion)

Everything stored by PSys2 is English (AGENTS.md). Input in another language is translated to English before formalization; answers can be translated back for display. The goal is **meaning preservation for formalization**, not literary quality: an English sentence that the rule patterns (and later the encoder) read correctly, with every meaning-bearing element kept and traceable to the source.

Implementation: `src/translate/` (browser-safe), first language pair Romanian ⇄ English.

## Interface
```js
detectLanguage(text) -> { lang: 'en' | 'ro' | 'unknown', confidence }
translate(text, { from: 'ro', to: 'en' }) -> {
  text,                     // English text
  alignment: [{ src: [s, e], tgt: [s, e] }],   // spans, so core.source can point into the original
  unknown: [{ word, span }],                    // source words the translator could not map
  notes: [string],                              // e.g. "gender of 'el' kept as 'he'"
  confidence                                    // share of source content words that were mapped
}
```
- Proper names, numbers and units pass through unchanged and are always aligned.
- Unknown content words are **not dropped**: they are passed through and reported in `unknown`; the dialog layer can tell the user which word it did not understand.
- Negation, quantifiers, conditionals (`dacă` → `if`), question words and tense of events must always be translated; a sentence whose negation or question word cannot be mapped is reported as untranslatable rather than translated without it.

## Approach (rules, no model)
1. **Normalization**: Unicode NFC; both comma-below and cedilla forms of ș/ț; diacritic-less input (`cate mere are Ion`) accepted through a diacritic-insensitive lexicon lookup.
2. **Morphology**: strip Romanian definite articles and case endings to a lemma (`mărul`, `merele`, `merelor` → `măr`), detect plural, map verb forms to lemma + person + tense for the verbs in the lexicon (`are`, `au`, `avea`, `dă`, `a dat`, `primește`, `mănâncă`, `cumpără`).
3. **Phrase table first**: multi-word expressions and question frames (`câte … are X` → `how many … does X have`, `cât costă` → `how much does … cost`, `cât face` → `what is`, `ce culoare are` → `what color is`, `câte picioare are` → `how many legs does … have`).
4. **Word-by-word fallback** with a bilingual lexicon (`src/translate/lexicon.ro-en.mjs`) and English re-inflection (plural nouns after numbers > 1, third-person -s, `does … have` frames for questions).
5. **Back translation (en → ro)** for answers uses the same lexicon in reverse plus answer templates per world, so displayed answers are grammatical enough to be understood.

## Open questions (to discuss)
- Whether to keep this as a boundary step, or train language-specific encoder profiles later (vision §5 asks for an explicit profile per language).
- How to evaluate meaning preservation: round-trip formalization equality (the Romanian test produces the same wires as its English twin) is the proposed metric.
