// SPDX-License-Identifier: AGPL-3.0-only
// What the catalog's request words (w.lang.en.cue, catalog pin 0966924e) lack yet, in the catalog's own shape, told after the bundled facts (src/dialog/request.mjs requestLanguage).
// Each row goes when the catalog publishes a cue of that meaning (questions.md Q41 [KNOW]). Data only: no code reads these rows by name.
export const REQUEST_LOCAL = `
@w.lang.en.cue.local.reduce w.lang.en.cue name=reaction.reduce.more on=reaction value=reduce step=down lead="too long" lead="not so many" lead="not that many" lead="not so much" lead="shorter" lead="too large" lead="less of them" takes=none priority=3 example="not so many nodes"
@w.lang.en.cue.local.layout_nice w.lang.en.cue name=layout.better.more on=layout value=better lead="nice layout" lead="a nice layout" lead="good layout" lead="neat layout" lead="tidy layout" takes=none priority=4 example="arrows, nice layout"
@w.lang.en.cue.local.layers w.lang.en.cue name=layout.layers on=layout value=layers lead="in layers" lead="into layers" lead="break in" lead="break into" lead="split in" lead="split into" lead="divide into" lead="layers" takes=none priority=3 example="break in 3 layers: water, land and sky"
@w.lang.en.cue.local.range w.lang.en.cue name=count.range.more on=count bound=range between="until" between="up to" between="through" takes=range priority=2 example="6 until 8 nodes"
@w.lang.en.cue.local.without w.lang.en.cue name=without.more on=kind want=no lead="anything but" lead="everything but" lead="anything except" lead="other than" lead="but no" takes=kind priority=3 example="anything but circles"
@w.lang.en.cue.local.up w.lang.en.cue name=place.up.more on=place value=up relation=direction lead="up" lead="higher" lead="upwards" lead="upward" lead="further up" lead="a bit higher" lead="even higher" lead="up higher" lead="more up" takes=none priority=3 example="move results up"
@w.lang.en.cue.local.down w.lang.en.cue name=place.down.more on=place value=down relation=direction lead="down" lead="lower" lead="downwards" lead="downward" lead="further down" lead="a bit lower" lead="even lower" lead="more down" takes=none priority=3 example="move summary lower"
@w.lang.en.cue.local.centre w.lang.en.cue name=place.centre.more on=place value=centre relation=in lead="to the middle" lead="to the centre" lead="to the center" lead="around the middle" lead="in the centre of" lead="the middle" lead="middle" takes=none priority=3 example="move summary to the middle"
@w.lang.en.cue.local.left w.lang.en.cue name=place.left.more on=place value=left relation=direction lead="left" lead="further left" lead="more to the left" takes=none priority=2 example="move it left"
@w.lang.en.cue.local.right w.lang.en.cue name=place.right.more on=place value=right relation=direction lead="right" lead="further right" lead="more to the right" takes=none priority=2 example="move it right"
@w.lang.en.cue.local.to_value w.lang.en.cue name=attribute.to on=attribute lead="to" lead="into" takes=value priority=1 example="change the colour of the circle to purple"
@w.lang.en.cue.local.attribute_of w.lang.en.cue name=attribute.of.thing on=kind lead="the colour of" lead="the color of" lead="colour of" lead="color of" lead="the size of" lead="size of" takes=kind priority=4 example="change the size of the sun to big"
@w.lang.en.cue.local.water w.lang.en.cue name=place.into on=place relation=in lead="into" takes=thing priority=2 example="move the cat into the water"
@w.lang.en.pron.local.all w.lang.en.pron text=everything text=all text="all of it" text="all of them" text="every thing" refers=all example="erase everything"
@w.lang.en.pron.local.any w.lang.en.pron text=something text=anything text="whatever you want" text="anything you want" text="whatever you like" text="what you want" refers=any example="draw something random"
@k.actions.verb.local.start k.actions.verb text=start act=make sense=1 gloss="bring into being; begin a new one" object=thing
@k.actions.verb.local.begin k.actions.verb text=begin act=make sense=1 gloss="start a new one" object=thing
`;
