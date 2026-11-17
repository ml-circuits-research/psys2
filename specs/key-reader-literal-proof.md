# Literal proof in the key reader

A DOMAIN categorical head can propose a value different from its correctly extracted source span. The source span and a declared closed value bank provide stronger, independently checkable evidence when the entire span exactly equals one canonical string entry.

The decoder scans the declared bank, considering only `state:value` entries with string values. Exactly one strict, case-sensitive, whitespace-preserving string match supplies the emitted value. Duplicate matches, aliases, substrings, booleans and numbers do not establish this proof. Without proof the existing categorical classifier and unresolved-proof path remain. This rule applies to every declared domain, including unfamiliar ones.

Proof diagnostics retain the key, source range/literal, bank index, classifier alternative/state/index and selected softmax probability, and whether it disagrees with the source proof. They remain outside the closed SOP request. Presence/BIO contradictions and unrelated errors remain visible. Source proof is not model calibration or empirical execution admission.

The existing global count routes (`target.count`, `turn.repeat_count`) additionally accept a complete positive ASCII integer literal, bounded by JavaScript's maximum safe integer. They emit the typed integer and preserve the exact source string in the existing span field. Signs, decimals, exponents, units, whitespace, zero and unsafe integers retain unresolved numeric normalization. A numeric value receives no string source range; its original span does. Proof records identify this explicit typed conversion.

## Generic-method review

Candidate methods and local sources: probability arbitration (`src/dialog/model-selection-score.mjs`); schema unification against declared enumeration banks (`training/sop-bert/heads/inventory.json` and the active inventory); additional learned categorical normalization (`training/sop-bert/train-key-reader.py`). Schema unification is sufficient for this bounded failure: it is deterministic, needs no training, and does not alter cases without unique exact membership. No world, sentence, translation, spelling repair or vocabulary table is introduced. It survives new worlds and languages because comparison is exact Unicode string identity. It costs one bounded bank scan per predicted categorical mention. Bank duplicates deliberately lose proof rather than guessing. New-language aliases and semantic paraphrases still need their existing mechanisms.

Acceptance compares Python/browser fixtures and the same 100 full utterances with unchanged epoch-5 weights. The original complete TRAIN measurement remains historical evidence; this change is not new training and the 100-row result is not a complete TRAIN or application execution claim.

## Artifact layouts and frozen identity

Runtime layouts derive from validated registry keys, BIO/global/metadata roles, class bank widths and declared target families. Core format-1 artifacts can derive families from domain registry ownership; candidate format-2 artifacts retain their explicit family declarations and codec markers. Key/area/bank counts are bounded, never fixed to one model. Target-type bank membership must exactly cover the declared family union. Context/token lengths remain artifact-declared and bounded. Unknown roles, invalid bank states, bank/registry value disagreement, duplicate canonical bank entries, undeclared keys, unsafe/unknown or conflicting routes, and changed frozen hashes still fail.

A core artifact without an embedded `preparerSha256` must supply `dataManifestJSON` in the runtime manifest. Its exact byte digest must equal the trained config's `dataManifestSha256`, and its `scriptSha256` must equal the runtime manifest's preparer hash. This preserves the training/preparer chain without modifying frozen model configs. Decoder version 3 and the literal-proof contract participate in runtime identity; unchanged weights do not imply unchanged decoder identity.

## Bounded hierarchical context

Decoder version 4 adds `utterance-first-context/1` to the composite runtime identity. The whole utterance remains unchanged. Context is measured with the actual artifact tokenizer and reduced only when the combined sequence exceeds the declared model length: ranked existing entities retain a fitting prefix, an individually oversized display name can be omitted while retaining its kind, and the complete previous message is retained only when it fits. Diagnostics retain original/fitted token counts, omitted names, previous-message omission and included entity count. An utterance that still exceeds the budget with empty optional context follows the existing explicit truncation refusal.

The application model view ranks actual observations using declared `in`, `parent` and `members` links, explicit label/role mentions, current selection and recency. Unmentioned unselected constituents remain in the full observation rather than consuming the context of every request. Selected or explicitly referenced parts remain eligible, and multiple root alternatives remain available. This does not change the full observation, the Worlds inspector, native object identities or the complete display-name index used during execution. No request-word table or domain-specific kind substitution is introduced.
