# synth_rules_ops

Synthetic short commands for what the Rules reader detects beyond the legend of LABEL_CONVENTIONS.md: groups (`group`, `ungroup`, `members`,
`groupOf`, kind=group; the message's existing groups in the field `groups`), double positions (position2/anchor2, region), outline, x/y
coordinates (`at`), `linked` ("X is connected to Y", "add a star connected to X", "how many shapes are connected to X"), "remove all
connections" (disconnect quantifier=all), arrow labels (action=label with from/to; label="" removes; ask=property property=label with
from/to), shape label removal (label=""), create count + layout. 1340 messages, 1409 requests, kept only where the Rules (logic.js at
ca2850a) read exactly the gold. Made with synth_rules by `training/sketch/synth/gen_rules_cover.py`; everything about it (method, counts,
rejects, overlap, what is not covered) is in `../synth_rules/README.md`. Train it only where the converters read these keys (VSS:
DIAGRAM_OPS=1 for groups and double positions; llm_to_world.py does not read outline, at, linked, layout or label with from/to today).
