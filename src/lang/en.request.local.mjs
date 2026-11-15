// SPDX-License-Identifier: AGPL-3.0-only
// What the catalog's request words (w.lang.en.cue, catalog pin 0966924e) lack yet, in the catalog's own shape, told after the bundled facts (src/dialog/request.mjs requestLanguage).
// Each row goes when the catalog publishes a cue of that meaning (questions.md Q41 [KNOW]). Data only: no code reads these rows by name.
export const REQUEST_LOCAL = `
@w.lang.en.cue.local.reduce w.lang.en.cue name=reaction.reduce.more on=reaction value=reduce step=down lead="too long" lead="not so many" lead="not that many" lead="not so much" lead="shorter" lead="too large" lead="less of them" takes=none priority=3 example="not so many nodes"
@w.lang.en.cue.local.layout_nice w.lang.en.cue name=layout.better.more on=layout value=better lead="nice layout" lead="a nice layout" lead="good layout" lead="neat layout" lead="tidy layout" takes=none priority=4 example="arrows, nice layout"
@w.lang.en.cue.local.layers w.lang.en.cue name=layout.layers on=layout value=layers lead="in layers" lead="into layers" lead="break in" lead="break into" lead="split in" lead="split into" lead="divide into" lead="layers" takes=none priority=3 example="break in 3 layers: water, land and sky"
`;
