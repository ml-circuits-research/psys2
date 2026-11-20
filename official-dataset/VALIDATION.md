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
| warning:bank-extension-needed | 88 |
| warning:value-span-ambiguous | 45 |
| warning:target-name_span-ambiguous | 19 |

### ui-human-v1 (4,284 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 1,198 |
| warning:bank-extension-needed | 449 |
| warning:value-span-ambiguous | 302 |
| warning:target-name_span-ambiguous | 131 |
| measure_span-outside-request-removed | 20 |
| anchor_span-outside-request-removed | 15 |

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
| warning:bank-extension-needed | 1,372 |
| warning:value-span-ambiguous | 2 |

### ui-comparatives-v1 (786 rows)

No issue found.

### ui-features-v1 (249 rows)

No issue found.

### ui-diagram-v2 (6,668 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 214 |
| warning:value-span-ambiguous | 78 |
| warning:numeric-value-not-in-surface | 28 |
| warning:target-kind_span-ambiguous | 10 |
| warning:target-name_span-ambiguous | 3 |

### ui-diagram-v2-voice (93 rows)

| issue | rows |
| --- | ---: |
| warning:selector-not-in-context | 3 |

### ui-drawing-style-v1 (1,931 rows)

| issue | rows |
| --- | ---: |
| warning:numeric-value-not-in-surface | 153 |
| warning:value-span-ambiguous | 5 |
| warning:target-kind_span-ambiguous | 4 |
| warning:target-name_span-ambiguous | 4 |

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

### data-drop-v1 (16,934 rows)

| issue | rows |
| --- | ---: |
| warning:bank-extension-needed | 1,730 |
| warning:selector-not-in-context | 620 |
| warning:determiner-kept-open | 409 |
| trigger-not-in-span-removed | 288 |
| warning:value-span-ambiguous | 285 |
| warning:target-kind_span-ambiguous | 127 |
| constraint-with-span-outside-request-removed | 93 |
| warning:target-kind-without-source-span | 39 |
| warning:numeric-value-not-in-surface | 27 |
| warning:target-count_span-ambiguous | 13 |
| warning:target-description_span-ambiguous | 11 |
| warning:target-name_span-ambiguous | 5 |

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
| bank-extension-needed | 32 |
| target-name_span-ambiguous | 19 |

### ui-human-v1: 4,284 in, 4,284 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| definite-description-name-to-kind | 683 |
| qualitative-value-unlabelled | 329 |
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
| measure_span-outside-request-removed | 20 |
| constraint-with-span-outside-request-removed | 10 |
| anchor_span-outside-request-removed | 5 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1,119 |
| value-span-ambiguous | 303 |
| bank-extension-needed | 151 |
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
| chart.type-span-as-whole-kind-phrase | 23 |
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
| chart.type-span-as-whole-kind-phrase | 2 |
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

### ui-features-v1: 249 in, 249 kept

### ui-diagram-v2: 6,668 in, 6,668 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| chart.type-span-as-whole-kind-phrase | 43 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 214 |
| value-span-ambiguous | 78 |
| numeric-value-not-in-surface | 28 |
| target-kind_span-ambiguous | 10 |
| target-name_span-ambiguous | 3 |

### ui-diagram-v2-voice: 93 in, 92 kept

Dropped:

| reason | rows |
| --- | ---: |
| dropped:duplicate-text | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 3 |

### ui-drawing-style-v1: 1,931 in, 1,931 kept

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| numeric-value-not-in-surface | 153 |
| value-span-ambiguous | 5 |
| target-kind_span-ambiguous | 4 |
| target-name_span-ambiguous | 4 |

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

### data-drop-v1: 16,934 in, 16,934 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| anchor-span-as-anchor-mention | 1,291 |
| trigger-not-in-span-removed | 288 |
| constraint-with-span-outside-request-removed | 93 |
| comparative-as-delta-step | 79 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| bank-extension-needed | 1,723 |
| selector-not-in-context | 663 |
| determiner-kept-open | 409 |
| value-span-ambiguous | 319 |
| target-kind_span-ambiguous | 127 |
| target-kind-without-source-span | 39 |
| selector-with-empty-context | 31 |
| numeric-value-not-in-surface | 27 |
| target-count_span-ambiguous | 13 |
| target-description_span-ambiguous | 11 |
| target-name_span-ambiguous | 5 |

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

### demo-tool-profile: 36,999 in, 33,297 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| anchor-span-as-anchor-mention | 2,274 |
| absolute-degree-word-as-degree | 48 |
| definite-description-name-to-kind | 2 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:duplicate-text | 3,702 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| selector-not-in-context | 1,597 |
| target-kind_span-ambiguous | 64 |
| value-span-ambiguous | 14 |
| target-name_span-ambiguous | 6 |

### main-synthetic: 26,670 in, 21,254 kept

Fixed or converted:

| fix | rows |
| --- | ---: |
| trigger-replaced-by-verb-span | 16,135 |
| converted:drawing | 10,816 |
| converted:avatar | 5,445 |
| trigger-removed-no-verb-in-text | 5,414 |
| converted:diagram | 2,131 |
| absolute-degree-word-as-degree | 2,080 |
| converted:document | 1,745 |
| converted:calendar | 551 |
| converted:drawn | 414 |
| converted:node | 206 |
| key-meeting.duration-as-meeting.length | 193 |
| definite-description-name-to-kind | 115 |
| act-arrange-for-diagram.group.layout | 100 |
| converted:block | 98 |
| converted:meeting | 86 |
| act-arrange-for-diagram.node.layout | 67 |
| act-group-for-diagram.group.make | 66 |
| converted:compound | 57 |
| text-target-for-document.write | 57 |
| act-remove-for-diagram.selection.remove | 36 |
| act-connect-for-diagram.link.make | 31 |
| act-ungroup-for-diagram.group.ungroup | 9 |
| key-drawn.color-as-drawn.colour | 7 |

Dropped:

| reason | rows |
| --- | ---: |
| dropped:avatar-label-without-part-slot | 3,314 |
| dropped:avatar-label-or-text-nonsense | 623 |
| dropped:avatar-rewritten-span-ambiguous | 608 |
| dropped:duplicate-text | 245 |
| dropped:avatar-preset-shape | 187 |
| dropped:avatar-part-shape | 136 |
| dropped:operation-without-target-template | 116 |
| dropped:avatar-question-about-face-or-preset-not-parts | 72 |
| dropped:make-without-single-kind | 47 |
| dropped:unregistered-key | 32 |
| dropped:target-type-not-in-area | 14 |
| dropped:compound-part-avatar-label-or-text-nonsense | 5 |
| dropped:compound-part-avatar-question-about-face-or-preset-not-parts | 5 |
| dropped:avatar-selector-not-face | 4 |
| dropped:conflicting-label-for-identical-text | 4 |
| dropped:compound-part-avatar-label-without-part-slot | 2 |
| dropped:compound-part-rewritten-or-cross-area | 1 |
| dropped:compound-part-operation-without-target-template | 1 |

Kept with a warning (not an error; see README):

| warning | rows |
| --- | ---: |
| bank-extension-needed | 230 |
| selector-not-in-context | 3 |
| value-span-ambiguous | 3 |
| target-name_span-ambiguous | 2 |

## Final check of the written splits

- unresolved errors: **0**
- families present in more than one split: **2797**
- label conflicts between identical texts, resolved by source priority: {'main-synthetic<-main-synthetic': 4}
