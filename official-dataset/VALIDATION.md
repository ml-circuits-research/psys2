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

### ui-coverage-v2 (3,180 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 95 |
| warning:value-span-ambiguous | 54 |
| warning:target-name_span-ambiguous | 28 |
| warning:target-kind_span-ambiguous | 11 |
| warning:numeric-value-not-in-surface | 6 |

### ui-tiers-v1 (23 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 3 |

### ui-relations-v1 (5,374 rows)

| issue | rows |
| --- | ---: |
| class-value-outside-bank-unlabelled | 1,372 |
| warning:value-span-ambiguous | 2 |

### ui-comparatives-v1 (786 rows)

No issue found.

### ui-features-v1 (249 rows)

No issue found.

### ui-diagram-v2 (6,647 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 215 |
| warning:value-span-ambiguous | 64 |
| warning:numeric-value-not-in-surface | 50 |
| warning:target-name_span-ambiguous | 5 |
| warning:target-kind_span-ambiguous | 4 |

### ui-quantities-v1 (174 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 1 |

### human-adapted-v1-drawing (558 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 42 |
| warning:target-kind_span-ambiguous | 16 |
| warning:selector-with-empty-context | 4 |
| warning:value-span-ambiguous | 2 |
| warning:target-description_span-ambiguous | 1 |

### data-drop-v1 (1,228 rows)

| issue | rows |
| --- | ---: |
| class-value-outside-bank-unlabelled | 58 |
| warning:selector-not-in-context | 23 |
| warning:numeric-value-not-in-surface | 6 |
| warning:target-kind_span-ambiguous | 5 |

### human-adapted-v1-diagram (538 rows)

| issue | rows |
| --- | ---: |
| warning:value-span-ambiguous | 28 |
| warning:selector-not-in-context | 13 |
| warning:target-kind_span-ambiguous | 5 |
| warning:selector-with-empty-context | 2 |

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
| definite-description-name-to-kind | 280 |
| key-drawn.color-as-drawn.colour | 137 |
| absolute-degree-word-as-degree | 95 |
| class-value-outside-bank-unlabelled | 32 |
| key-meeting.duration-as-meeting.length | 18 |
| act-arrange-for-diagram.group.layout | 17 |
| key-part.color-as-part.colour | 9 |
| act-group-for-diagram.group.make | 7 |
| act-connect-for-diagram.link.make | 6 |
| text-target-for-document.write | 6 |
| act-arrange-for-diagram.node.layout | 5 |
| act-remove-for-diagram.selection.remove | 5 |
| act-ungroup-for-diagram.group.ungroup | 5 |
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
| definite-description-name-to-kind | 683 |
| qualitative-value-unlabelled | 329 |
| class-value-outside-bank-unlabelled | 151 |
| absolute-degree-word-as-degree | 110 |
| key-drawn.color-as-drawn.colour | 95 |
| comparative-as-delta-step | 61 |
| anchor-span-as-anchor-mention | 60 |
| act-arrange-for-diagram.node.layout | 46 |
| act-connect-for-diagram.link.make | 46 |
| act-remove-for-diagram.selection.remove | 45 |
| key-part.color-as-part.colour | 41 |
| key-meeting.duration-as-meeting.length | 40 |
| act-group-for-diagram.group.make | 23 |
| act-arrange-for-diagram.group.layout | 23 |
| act-ungroup-for-diagram.group.ungroup | 23 |
| text-target-for-document.write | 23 |

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

### ui-coverage-v2: 3,180 in, 3,180 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| definite-description-name-to-kind | 118 |
| comparative-as-delta-step | 55 |
| absolute-degree-word-as-degree | 50 |
| key-drawn.color-as-drawn.colour | 40 |
| anchor-span-as-anchor-mention | 26 |
| key-part.color-as-part.colour | 9 |
| avatar-length-value-as-part.length | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 92 |
| value-span-ambiguous | 57 |
| target-name_span-ambiguous | 28 |
| target-kind_span-ambiguous | 11 |
| numeric-value-not-in-surface | 6 |

### ui-tiers-v1: 23 in, 23 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| comparative-as-delta-step | 2 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 3 |

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

### ui-features-v1: 249 in, 247 kept

Dropped:

| reason | rows |
| --- | ---: |
| dropped:duplicate-text | 1 |
| dropped:conflicting-label-for-identical-text | 1 |

### ui-diagram-v2: 6,647 in, 6,639 kept

Dropped:

| reason | rows |
| --- | ---: |
| dropped:duplicate-text | 7 |
| dropped:conflicting-label-for-identical-text | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 215 |
| value-span-ambiguous | 64 |
| numeric-value-not-in-surface | 50 |
| target-name_span-ambiguous | 5 |
| target-kind_span-ambiguous | 4 |

### ui-quantities-v1: 174 in, 174 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| diagram-new-node-count-as-node.n | 25 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1 |

### human-adapted-v1-drawing: 558 in, 558 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| definite-description-name-to-kind | 1 |
| comparative-as-delta-step | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 42 |
| target-kind_span-ambiguous | 16 |
| selector-with-empty-context | 4 |
| value-span-ambiguous | 2 |
| target-description_span-ambiguous | 1 |

### data-drop-v1: 1,228 in, 1,228 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| class-value-outside-bank-unlabelled | 58 |
| anchor-span-as-anchor-mention | 57 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-with-empty-context | 31 |
| selector-not-in-context | 23 |
| value-span-ambiguous | 12 |
| numeric-value-not-in-surface | 6 |
| target-kind_span-ambiguous | 5 |

### human-adapted-v1-diagram: 538 in, 538 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| comparative-as-delta-step | 2 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| value-span-ambiguous | 28 |
| selector-not-in-context | 13 |
| target-kind_span-ambiguous | 5 |
| selector-with-empty-context | 2 |

### demo-tool-profile: 36,999 in, 27,524 kept

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
| dropped:conflicting-label-for-identical-text | 110 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1,597 |
| target-kind_span-ambiguous | 64 |
| value-span-ambiguous | 14 |
| target-name_span-ambiguous | 6 |

### main-synthetic: 26,670 in, 4,927 kept

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
| definite-description-name-to-kind | 115 |
| converted:block | 98 |
| converted:meeting | 86 |
| converted:compound | 32 |
| converted:document | 22 |
| key-drawn.color-as-drawn.colour | 7 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:avatar-label-or-text-nonsense | 8,717 |
| dropped:balance-cap-per-family | 3,615 |
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
| dropped:duplicate-text | 8 |
| dropped:compound-part-avatar-label-or-text-nonsense | 7 |
| dropped:compound-part-avatar-question-about-face-or-preset-not-parts | 5 |
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
- label conflicts between identical texts, resolved by source priority: {'ui-human-v1<-ui-features-v1': 1, 'ui-coverage-v2<-ui-diagram-v2': 1, 'ui-natural-v1<-demo-tool-profile': 5, 'ui-human-v1<-demo-tool-profile': 1, 'ui-diagram-v2<-demo-tool-profile': 1, 'demo-tool-profile<-demo-tool-profile': 103}
