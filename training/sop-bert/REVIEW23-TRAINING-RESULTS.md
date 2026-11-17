# Review23 completed training

Ten epochs /45,170 updates completed, stopped on three primary-metric non-improvements. Selected checkpoint is epoch7: positive BIO+global exact1547/3994 (38.73%); target type2051/2234 (91.81%); mentionF1 81.94%. All-row partial exact1622/4076 includes75 empty rows. These are conditional teacher-cut subset metrics, not full-request exact or execution accuracy. Model/data/source/encoder hashes and encoded+decoded dataset counts were independently verified without loading/copying weights.

The selection evaluated the exact BF16 checkpoint snapshot round-tripped into FP32 with autocast disabled; this still does not establish q8/browser parity or admission calibration. Existing epoch1 deployed assets remain unchanged.

## Same35 weak keys

Derived reproducibly from the review-referenced original epoch4 report: defined mentionF1, presenceF1 or request-level present class accuracy below0.6. Metadata class accuracy is separately teacher-mention-conditioned. Every cell is mentionF1 / presenceF1 / present-class accuracy / gold-mention-class accuracy; n/a has no denominator. Full raw supports and counts, including absent presence accuracy, are retained in reports/review23-training-final.json. Original and current calibration corpus/precision profiles differ; this is not a paired causal gain table.

| Key | Original epoch4 | Selected epoch7 | Final epoch10 |
|---|---|---|---|
| calendar.meeting.end | 54.90% / 90.00% / n/a / n/a | 52.17% / 86.79% / n/a / n/a | 53.97% / 92.31% / n/a / n/a |
| calendar.meeting.length | 57.59% / 82.84% / n/a / 70.59% | 85.26% / 91.53% / n/a / 88.89% | 87.92% / 92.15% / n/a / 88.89% |
| calendar.meeting.relation_anchor | 41.38% / 58.82% / n/a / n/a | 48.78% / 59.46% / n/a / n/a | 37.50% / 51.28% / n/a / n/a |
| calendar.meeting.title | 44.74% / 46.67% / n/a / n/a | 51.28% / 55.71% / n/a / n/a | 47.92% / 62.50% / n/a / n/a |
| calendar.room.seats | 32.00% / 63.16% / n/a / n/a | 80.95% / 94.74% / n/a / n/a | 82.93% / 90.00% / n/a / n/a |
| conversation.turn.fragment | 48.65% / 55.41% / 54.95% / n/a | 83.87% / 65.54% / 62.59% / n/a | 66.67% / 62.95% / 73.38% / n/a |
| conversation.turn.objection | n/a / 67.26% / 22.03% / n/a | n/a / 77.19% / 52.33% / n/a | n/a / 73.51% / 53.49% / n/a |
| diagram.chart.horizontal | 42.86% / 89.36% / n/a / 70.00% | 64.29% / 96.77% / n/a / 100.00% | 60.61% / 98.46% / n/a / 100.00% |
| diagram.chart.labels | 51.16% / 88.89% / n/a / n/a | 62.50% / 90.91% / n/a / n/a | 72.41% / 88.24% / n/a / n/a |
| diagram.chart.legend | 51.61% / 97.44% / n/a / 73.33% | 65.38% / 98.25% / n/a / 83.33% | 75.00% / 96.55% / n/a / 83.33% |
| diagram.chart.show_values | 22.22% / 90.91% / n/a / 100.00% | 66.67% / 92.31% / n/a / 88.89% | 38.10% / 85.00% / n/a / 88.89% |
| diagram.chart.sort | 57.14% / 84.09% / n/a / 52.00% | 63.64% / 97.03% / n/a / 77.42% | 58.33% / 94.85% / n/a / 90.32% |
| diagram.chart.values | 36.84% / 44.44% / n/a / n/a | 71.64% / 78.57% / n/a / n/a | 80.00% / 82.76% / n/a / n/a |
| diagram.group.members | 28.07% / 42.11% / n/a / n/a | 52.00% / 43.48% / n/a / n/a | 57.14% / 60.87% / n/a / n/a |
| diagram.link.arrow | 72.73% / 49.06% / n/a / 90.00% | 71.43% / 88.57% / n/a / 87.10% | 70.00% / 86.84% / n/a / 83.87% |
| diagram.node.group | 53.85% / 64.00% / n/a / n/a | 80.60% / 90.32% / n/a / n/a | 71.43% / 92.31% / n/a / n/a |
| diagram.node.value | 73.68% / 40.00% / n/a / n/a | 93.75% / 96.97% / n/a / n/a | 88.89% / 86.49% / n/a / n/a |
| document.section.content | 51.72% / 33.33% / n/a / n/a | 67.57% / 77.78% / n/a / n/a | 55.70% / 76.19% / n/a / n/a |
| document.section.count | 47.06% / 34.78% / n/a / n/a | 74.29% / 76.19% / n/a / n/a | 72.73% / 74.42% / n/a / n/a |
| document.section.length | 46.15% / 60.61% / n/a / 62.50% | 74.07% / 75.00% / n/a / 88.89% | 68.97% / 76.92% / n/a / 88.89% |
| document.section.role | 55.15% / 60.06% / n/a / 36.71% | 61.77% / 66.48% / n/a / 88.76% | 60.87% / 72.34% / n/a / 87.64% |
| document.text.about | 58.82% / 80.13% / n/a / n/a | 62.67% / 81.17% / n/a / n/a | 64.12% / 81.56% / n/a / n/a |
| document.text.chapters | 89.66% / 51.43% / n/a / n/a | 94.12% / 94.12% / n/a / n/a | 100.00% / 96.97% / n/a / n/a |
| document.text.recipient | 58.76% / 70.00% / n/a / n/a | 77.46% / 80.26% / n/a / n/a | 79.45% / 82.35% / n/a / n/a |
| document.text.title | 55.00% / 64.00% / n/a / n/a | 80.00% / 86.49% / n/a / n/a | 73.68% / 86.49% / n/a / n/a |
| drawing.drawn.kind | 0.00% / n/a / n/a / n/a | 72.73% / 66.67% / n/a / n/a | 57.14% / 66.67% / n/a / n/a |
| drawing.drawn.size | 48.74% / 58.62% / n/a / 82.76% | 80.81% / 81.82% / n/a / 95.24% | 77.08% / 80.31% / n/a / 95.24% |
| drawing.face.feature | 80.00% / 0.00% / n/a / n/a | 85.71% / 81.25% / n/a / n/a | 88.89% / 87.50% / n/a / n/a |
| drawing.part.colour | 29.51% / 62.50% / n/a / n/a | 89.47% / 91.89% / n/a / n/a | 94.44% / 97.14% / n/a / n/a |
| drawing.part.part | 53.85% / 31.58% / n/a / n/a | 52.83% / 60.00% / n/a / n/a | 61.73% / 67.77% / n/a / n/a |
| drawing.part.variant | 72.73% / 27.91% / n/a / n/a | 72.29% / 70.59% / n/a / n/a | 76.92% / 71.58% / n/a / n/a |
| request.constraint.step | n/a / 57.69% / n/a / 36.00% | n/a / 76.60% / n/a / 61.76% | n/a / 76.06% / n/a / 67.65% |
| request.logic.group | n/a / 0.00% / n/a / 25.76% | n/a / 40.74% / n/a / 64.20% | n/a / 56.18% / n/a / 69.14% |
| request.target.count | 58.44% / 57.14% / n/a / n/a | 75.44% / 63.95% / n/a / n/a | 67.13% / 67.34% / n/a / n/a |
| request.target.description | 53.02% / 69.98% / n/a / n/a | 69.20% / 74.52% / n/a / n/a | 68.27% / 76.05% / n/a / n/a |

No calibration report or new application model is installed by this reporting change. Remaining weak keys and regressions are visible without filtering on improved scores.

Seven of the original35 keys still have at least one defined selected-checkpoint mention/presence/request-class score below0.6. Among32 keys with both old/new mentionF1 denominators,28 ratios rise and4 fall: calendar.meeting.end, diagram.link.arrow, drawing.part.part, drawing.part.variant. PresenceF1 falls for calendar.meeting.end. Teacher-mention-conditioned class accuracy falls for diagram.chart.show_values and diagram.link.arrow. These are descriptive changes across different calibration populations, not same-row gains. Last epoch10 has1512/3994 positive partial exact and81.45% mentionF1, lower than the selected epoch7; the report does not replace the selection with the final epoch. One training sample was truncated per epoch; calibration truncations were zero.
