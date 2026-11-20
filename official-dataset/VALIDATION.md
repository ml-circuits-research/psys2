# Validation

Produced by `build.py`; every number below is measured on this build.

## Checks

- every labelled surface (request span, trigger, kind/name/description/count span, value span, measure/anchor span) occurs verbatim in the text (request span) or in its request span (the others);
- the trigger is a span of the request, not the canonical act;
- act, mood, target type (per area), mode, determiner, fill, operator, phase, polarity, character, scope and question kind belong to the trainer's label inventory (`inventory.json`), every constraint key is registered for its area, and class-bank values are in their bank;
- numbers: a numeric value occurs in its surface (digits or number words);
- selectors: a selector phrase matches an object of the row context (name or kind);
- identical texts carry identical labels; duplicates are removed;
- after the split no paraphrase family appears in two splits.

## Sources as delivered

Issue counts on the untouched source rows (per request or constraint where the issue is local). `warning:` rows are reported, not errors.

### ui-natural-v1 (1,474 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 144 |
| class-value-outside-bank-unlabelled | 88 |
| warning:value-span-ambiguous | 45 |
| warning:target-name_span-ambiguous | 19 |

### ui-human-v1 (4,284 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 1,198 |
| class-value-outside-bank-unlabelled | 449 |
| warning:value-span-ambiguous | 302 |
| warning:target-name_span-ambiguous | 131 |
| measure_span-not-in-span | 20 |
| anchor_span-not-in-span | 15 |

### ui-relations-v1 (5,374 rows)

| issue | rows |
| --- | ---: |
| class-value-outside-bank-unlabelled | 1,372 |
| warning:value-span-ambiguous | 2 |

### ui-comparatives-v1 (786 rows)

No issue found.

### demo-tool-profile (36,999 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 1,597 |
| warning:target-kind_span-ambiguous | 64 |
| warning:value-span-ambiguous | 14 |
| warning:target-name_span-ambiguous | 6 |

### main-synthetic (26,670 rows)

| issue | rows |
| --- | ---: |
| spans-are-offset-arrays | 26,314 |
| empty-context | 26,243 |
| unregistered-key | 21,426 |
| trigger-not-a-text-span | 14,832 |
| selector-with-empty-context | 14,430 |
| target-type-not-in-area | 10,375 |
| avatar-part-selector-is-a-document-label | 8,120 |
| placeholder-value-for-non-name-key | 1,863 |
| act-not-in-bank | 1,229 |
| numeric-value-not-in-surface | 293 |
| avatar-slot-id-written-in-text | 173 |

## What the build did

### ui-natural-v1: 1,474 in, 1,474 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| definite-description-name-to-kind | 224 |
| absolute-degree-word-as-degree | 95 |
| class-value-outside-bank-unlabelled | 88 |
| comparative-as-delta-step | 3 |
| anchor-span-as-anchor-mention | 3 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 136 |
| value-span-ambiguous | 45 |
| target-name_span-ambiguous | 19 |

### ui-human-v1: 4,284 in, 4,249 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| definite-description-name-to-kind | 504 |
| class-value-outside-bank-unlabelled | 330 |
| qualitative-value-unlabelled | 329 |
| absolute-degree-word-as-degree | 110 |
| comparative-as-delta-step | 61 |
| anchor-span-as-anchor-mention | 60 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:measure_span-not-in-span | 20 |
| dropped:value-span-not-in-span | 10 |
| dropped:anchor_span-not-in-span | 5 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1,119 |
| value-span-ambiguous | 303 |
| target-name_span-ambiguous | 131 |

### ui-relations-v1: 5,374 in, 5,374 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| anchor-span-as-anchor-mention | 5,374 |
| relation-value-renamed-to-bank | 1,372 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| value-span-ambiguous | 2 |

### ui-comparatives-v1: 786 in, 786 kept

### demo-tool-profile: 36,999 in, 27,525 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| anchor-span-as-anchor-mention | 2,274 |
| absolute-degree-word-as-degree | 48 |
| definite-description-name-to-kind | 2 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:duplicate-text | 9,365 |
| dropped:conflicting-label-for-identical-text | 109 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1,597 |
| target-kind_span-ambiguous | 64 |
| value-span-ambiguous | 14 |
| target-name_span-ambiguous | 6 |

### main-synthetic: 26,670 in, 4,928 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| converted:drawing | 9,283 |
| trigger-replaced-by-verb-span | 7,364 |
| trigger-removed-no-verb-in-text | 3,828 |
| converted:diagram | 785 |
| converted:drawn | 414 |
| converted:avatar | 266 |
| converted:node | 206 |
| absolute-degree-word-as-degree | 171 |
| definite-description-name-to-kind | 99 |
| converted:block | 98 |
| converted:meeting | 86 |
| converted:compound | 32 |
| converted:document | 22 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:avatar-label-or-text-nonsense | 8,717 |
| dropped:balance-cap-per-family | 3,617 |
| dropped:mechanical-keyword-text-for-existing-object | 2,644 |
| dropped:balance-cap-per-operation | 2,628 |
| dropped:avatar-variant-not-attested-for-slot | 1,007 |
| dropped:placeholder-value-for-color | 943 |
| dropped:operation-without-written-selector-template | 617 |
| dropped:calendar-placeholder-values-not-text-evidence | 551 |
| dropped:avatar-preset-shape | 187 |
| dropped:value-not-in-class-bank | 169 |
| dropped:numeric-selector-without-referent | 157 |
| dropped:make-generic-object-with-placeholder-name | 142 |
| dropped:avatar-part-shape | 136 |
| dropped:avatar-question-about-face-or-preset-not-parts | 72 |
| dropped:make-without-single-kind | 47 |
| dropped:numeric-value-not-in-surface | 16 |
| dropped:placeholder-value-for-nodes | 15 |
| dropped:placeholder-value-for-edges | 15 |
| dropped:target-type-not-in-area | 14 |
| dropped:compound-part-operation-without-written-selector-template | 9 |
| dropped:compound-part-calendar-placeholder-values-not-text-evidence | 8 |
| dropped:compound-part-avatar-label-or-text-nonsense | 7 |
| dropped:compound-part-avatar-question-about-face-or-preset-not-parts | 5 |
| dropped:duplicate-text | 5 |
| dropped:avatar-selector-not-face | 4 |
| dropped:compound-part-make-generic-object-with-placeholder-name | 3 |
| dropped:compound-part-numeric-selector-without-referent | 2 |
| dropped:compound-part-placeholder-value-for-color | 2 |
| dropped:compound-part-avatar-variant-not-attested-for-slot | 1 |
| dropped:compound-part-value-not-in-class-bank | 1 |
| dropped:compound-part-placeholder-value-for-edges | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| value-span-ambiguous | 2 |
| target-name_span-ambiguous | 1 |

## Final check of the written splits

- unresolved errors: **0**
- families present in more than one split: **0**
- label conflicts between identical texts, resolved by source priority: {'ui-natural-v1<-demo-tool-profile': 5, 'ui-human-v1<-demo-tool-profile': 1, 'demo-tool-profile<-demo-tool-profile': 103}
