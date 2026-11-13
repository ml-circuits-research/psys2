# 05 — Translation at the boundary

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

## Language selection (LANG-FIXED)
`detectLanguage` is **not** part of a turn in the interactive host. A host passes an explicit `language` (`'en'` | `'ro'`, the one the person selected) and the dialog engine reads every message in it: no detection, no evidence override, no switch of the host's selector (`switchedLanguage` was removed). English words in a Romanian message (names, "ok", "stop") are handled by the Romanian pipeline, not by switching language. Only the CLI and the server may pass `'auto'`, which keeps the RD5 behaviour (strong evidence, a weak Romanian reading must repeat). In the webchat the detectors (browser `LanguageDetector`, the rules detector and `evidence`) serve one purpose: the one-line, button-only hint after a typed message that is clearly in the other language (spec 06). The language changes only through the selector or an explicit switch command.

## Approach (rules, no model)
1. **Normalization**: Unicode NFC; both comma-below and cedilla forms of ș/ț; diacritic-less input (`cate mere are Ion`) accepted through a diacritic-insensitive lexicon lookup.
2. **Morphology**: strip Romanian definite articles and case endings to a lemma (`mărul`, `merele`, `merelor` → `măr`), detect plural, map verb forms to lemma + person + tense for the verbs in the lexicon (`are`, `au`, `avea`, `dă`, `a dat`, `primește`, `mănâncă`, `cumpără`).
3. **Phrase table first**: multi-word expressions and question frames (`câte … are X` → `how many … does X have`, `cât costă` → `how much does … cost`, `cât face` → `what is`, `ce culoare are` → `what color is`, `câte picioare are` → `how many legs does … have`).
4. **Word-by-word fallback** with a bilingual lexicon (`src/translate/lexicon.ro-en.mjs`) and English re-inflection (plural nouns after numbers > 1, third-person -s, `does … have` frames for questions).
5. **Back translation (en → ro)** for answers uses the same lexicon in reverse plus answer templates per world, so displayed answers are grammatical enough to be understood.

## Strategies (ADR-002)
The rule translator above is the `rules` strategy. `mt-small` (a small CPU machine-translation model) and `browser-api` (the browser's on-device translator, demo only) implement the same interface and are wrapped by a checker that falls back to `rules` when numbers, names, negation or question form are not preserved.

## Open questions
- Whether to keep this as a boundary step, or train language-specific encoder profiles later (vision §5 asks for an explicit profile per language).
- How to evaluate meaning preservation: round-trip formalization equality (the Romanian test produces the same wires as its English twin) is the proposed metric.

## Romanian voice additions (RP5, MOBILE-VOICE 4-5)
- **Sound-alikes.** Before translation a Romanian message gets tab-aware corrections for words the recogniser confuses with a word of the open tab's world (`un sare` on the Drawing tab is `un soare`), and the game name `x și zero` is read as `x și 0` ("pornește" becomes "începe" before it). Implemented in `src/dialog/index.mjs` (`soundAlikes`).
- **Unchanged output.** When the active translator returns the Romanian text unchanged and a rules translator is available (`translator.rules`), the message is retried through the rules translator.
- **Grammar.** Coordinated post-nominal adjectives (`un pește mic și albastru` is "a small blue fish"); the definite plural of an invariant noun keeps its number (`peștii` is "all the fish").
- **Vocabulary.** Mood adjectives (`bucuros`, `vesel`, `nervos`, `speriat`, `supărat`), `liniuță` (dash), and the diminutives `inimioară`, `căsuță`, `norișor`, `peștișor`, `șoricel`, `floricică`, `copăcel`, `pisicuță`, `păsărică`, `steluță`, `bărcuță`, `mașinuță` map to the base noun.
- **Elliptic "one" (ELLIPSIS).** `una|unul|alta|altul` + a colour or adjective, optionally after `încă`, keeps the English ellipsis for the formalizer: "fă o casă verde și una galbenă" is "Make a green house and a yellow one", "și una mare" is "and a big one" (not "a sea"), "și încă una galbenă" / "și alta galbenă" is "and another yellow one". The formalizer then repeats the earlier command (spec 03 section 1c, one-anaphora).
- **Replies.** The interjections of the opener lists are in the phrase table ("Voila!" is "Poftim!", "Look at that!" is "Uite!"); the avatar refusals and the "cannot draw" reply have phrase entries; the Drawing world says which animals it can draw when it cannot draw the one asked for.

## RP5b: tab names, avatar descriptions and reply families (Romanian)

- **Tab names.** `deschide|arată|afișează|mergi la|treci pe ... tabul|fila|pagina <name>` (and the bare `deschide <name>`) open a tab by its Romanian name and the usual voice variants: `desen`, `desenat`, `diagramă`, `grafic`, `grafice`, `hartă`, `muzică`, `editor`, `șah`, `spânzurătoarea`, `x și zero`, `ghicește animalul`, `documente`, `avatar`, `profil` (`TAB_NAMES_RO` in `phrases.commands.ro-en.mjs`); any other noun the grammar knows goes through the generic `<tab noun> {np}` frame. The replies are "Bine, iată fila Desen." / "Ești deja pe fila Avatar." (slot `{tab}`).
- **"diagramă".** `diagramă`, `diagrame` translate to "diagram" (not "chart"); `grafic` stays "chart". "în diagramă" names the Diagram world (`pat.diagram.sketch.create.in`, a `signal` pattern), so "desenează trei cercuri în diagramă" is a diagram request on any tab.
- **Avatar descriptions** (`src/translate/avatar.en-ro.mjs`). The part phrases the avatar builds from its generated vocabulary have authored Romanian phrases for the robot, emoji, person, cartoon and kid characters ("collared clothes" is "haine cu guler", "a grill mouth" is "o gură grătar"); slots `{avl}` (a list of part phrases), `{chr}` (a character name) and `{optX}` (the options of one part: "Gura mea poate fi grătar, difuzor ..."). A phrase outside the table keeps the whole reply in English. The `{avl}` entries are tried before the generic `{np}` ones.
- **Other families** with authored entries: the mouth-size refusal (the parts without a size ladder; the robot and the emoji take the widest or narrowest mouth instead, RP5c), "I can not find {np} in your picture." (plural noun phrase for "all the red circles", RP5c), the tic-tac-toe start, the missing-place prompt of the drawing tab with its examples, the chart "no numbers" help, "Drew 3 circles." (the {shapes} slot) and the random-diagram reply, "I drew N things at the bottom.", moving a thing into the water.
- **The English reading.** The "I took that as" line (best effort, spec 03 7.15) is only produced when no rule or frame reads the sentence; the tab commands above are read by frames, so their replies carry no English quote.
- **Check.** `node scripts/check-ro-replies.mjs [--families N]` lists the replies still kept in English by family (quoted text, numbers and ids blanked), largest first.

## Keep-list for the on-device model (ROUND-TRIP-MINING step 3)

The on-device model (Bergamot) sometimes changes what must stay: the currency "lei" becomes "rents", a song title is translated word by word, a name is declined. `src/translate/keep-list.mjs` protects the app's own words as placeholders around the model (protect before, restore after), in every direction, on the engine worker's backend (`docs/webchat/ui/engine-worker.mjs`) and in the Node adapter (`scripts/lib/mt-node.mjs`, option `keep`). The list is derived from the worlds' English side, not written per language:

- **names**: every lexicon of class `name` (people, pets), protected only when written with a capital letter and when no other lexicon holds the same word; plus the names the user told this session (`sessionNames`);
- **verbatim**: every lexicon that carries `keep=verbatim` (the money unit of `kids.shop`), and the `title` and `aka` values of knowledge entities that have a `title` (song titles), whatever the case;
- **tabs**: the `tab`, `tabTitle` and `tabAlias` of every manifest, only in the form "the <name> tab" (a bare "draw" is a verb);
- numbers need no placeholder (the checker requires them); place names are not kept (a model translates "Germany" and "Allemagne" correctly).

Placeholders are letters only (`Zorqa`, `Zorqb`, ...). When the model loses or changes a placeholder, the unprotected translation is used (the checker of the translation layer still judges it). Tests: `tests/keep-list.test.mjs`. Limit: a real user writes the localized label of a tab, so the tab part only helps a user who types the English word.
