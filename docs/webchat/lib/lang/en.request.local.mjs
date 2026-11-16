// SPDX-License-Identifier: AGPL-3.0-only
// What the catalog's request words (w.lang.en.cue, catalog pin b57c4633) lack yet, in the catalog's own shape, told after the bundled facts (src/dialog/request.mjs requestLanguage).
// The reply rows (w.lang.en.reply) say the door's acts on things and its honest answers (Q43 [KNOW]).
// Each row goes when the catalog publishes a cue of that meaning (questions.md Q41 [KNOW]). Data only: no code reads these rows by name.
export const REQUEST_LOCAL = `
@w.lang.en.cue.local.reduce w.lang.en.cue name=reaction.reduce.more on=reaction value=reduce step=down lead="too long" lead="not so many" lead="not that many" lead="not so much" lead="shorter" lead="too large" lead="less of them" takes=none priority=3 example="not so many nodes"
@w.lang.en.cue.local.praise w.lang.en.cue name=reaction.thanks.more on=reaction value=thanks lead="lovely" lead="beautiful" lead="wonderful" lead="gorgeous" lead="fantastic" lead="excellent" lead="very nice" lead="so nice" lead="looks good" lead="looks great" takes=none priority=1 example="lovely"
@w.lang.en.cue.local.layout_nice w.lang.en.cue name=layout.better.more on=layout value=better lead="nice layout" lead="a nice layout" lead="good layout" lead="neat layout" lead="tidy layout" takes=none priority=4 example="arrows, nice layout"
@w.lang.en.cue.local.range w.lang.en.cue name=count.range.more on=count bound=range between="until" between="up to" between="through" takes=range priority=2 example="6 until 8 nodes"
@w.lang.en.cue.local.without w.lang.en.cue name=without.more on=kind want=no lead="anything but" lead="everything but" lead="anything except" lead="other than" lead="but no" takes=kind priority=3 example="anything but circles"
@w.lang.en.cue.local.centre w.lang.en.cue name=place.centre.more on=place value=centre relation=in lead="to the middle" lead="to the centre" lead="to the center" lead="around the middle" lead="in the centre of" lead="the middle" lead="middle" takes=none priority=3 example="move summary to the middle"
@w.lang.en.cue.local.to_value w.lang.en.cue name=attribute.to on=attribute lead="to" lead="into" takes=value priority=1 example="change the colour of the circle to purple"
@w.lang.en.cue.local.attribute_of w.lang.en.cue name=attribute.of.thing on=kind lead="the colour of" lead="the color of" lead="colour of" lead="color of" lead="the size of" lead="size of" takes=kind priority=4 example="change the size of the sun to big"
@w.lang.en.cue.local.water w.lang.en.cue name=place.into on=place relation=in lead="into" takes=thing priority=2 example="move the cat into the water"
@w.lang.en.pron.local.all w.lang.en.pron text=all refers=all example="erase everything"
@w.lang.en.pron.local.any w.lang.en.pron text=something text=anything text="whatever you want" text="anything you want" text="whatever you like" text="what you want" refers=any example="draw something random"
@k.actions.verb.local.start k.actions.verb text=start act=make sense=1 gloss="bring into being; begin a new one" object=thing
@k.actions.verb.local.begin k.actions.verb text=begin act=make sense=1 gloss="start a new one" object=thing
@w.lang.en.reply.local.place_up_1 w.lang.en.reply name=done.place.up count=one act=place role=thing text="I moved the {thing} up."
@w.lang.en.reply.local.place_up_n w.lang.en.reply name=done.place.up count=other act=place role=thing role=number text="I moved the {number} {thing:num=pl} up."
@w.lang.en.reply.local.place_up_name w.lang.en.reply name=done.place.up act=place role=name text="I moved {name} up."
@w.lang.en.reply.local.place_down_1 w.lang.en.reply name=done.place.down count=one act=place role=thing text="I moved the {thing} down."
@w.lang.en.reply.local.place_down_n w.lang.en.reply name=done.place.down count=other act=place role=thing role=number text="I moved the {number} {thing:num=pl} down."
@w.lang.en.reply.local.place_down_name w.lang.en.reply name=done.place.down act=place role=name text="I moved {name} down."
@w.lang.en.reply.local.place_left_1 w.lang.en.reply name=done.place.left count=one act=place role=thing text="I moved the {thing} to the left side."
@w.lang.en.reply.local.place_left_n w.lang.en.reply name=done.place.left count=other act=place role=thing role=number text="I moved the {number} {thing:num=pl} to the left side."
@w.lang.en.reply.local.place_left_name w.lang.en.reply name=done.place.left act=place role=name text="I moved {name} to the left side."
@w.lang.en.reply.local.place_right_1 w.lang.en.reply name=done.place.right count=one act=place role=thing text="I moved the {thing} to the right side."
@w.lang.en.reply.local.place_right_n w.lang.en.reply name=done.place.right count=other act=place role=thing role=number text="I moved the {number} {thing:num=pl} to the right side."
@w.lang.en.reply.local.place_right_name w.lang.en.reply name=done.place.right act=place role=name text="I moved {name} to the right side."
@w.lang.en.reply.local.place_next_1 w.lang.en.reply name=done.place.next count=one act=place role=thing role=target text="I moved the {thing} next to the {target}."
@w.lang.en.reply.local.place_next_n w.lang.en.reply name=done.place.next count=other act=place role=thing role=number role=target text="I moved the {number} {thing:num=pl} next to the {target}."
@w.lang.en.reply.local.place_next_name w.lang.en.reply name=done.place.next act=place role=name role=target text="I moved {name} next to {target}."
@w.lang.en.reply.local.place_region_1 w.lang.en.reply name=done.place.region count=one act=place role=thing role=region text="I moved the {thing} to the {region}."
@w.lang.en.reply.local.place_region_n w.lang.en.reply name=done.place.region count=other act=place role=thing role=number role=region text="I moved the {number} {thing:num=pl} to the {region}."
@w.lang.en.reply.local.place_region_name w.lang.en.reply name=done.place.region act=place role=name role=region text="I moved {name} to the {region}."
@w.lang.en.reply.local.place_in_1 w.lang.en.reply name=done.place.in count=one role=thing role=value text="I moved the {thing} into the {value}."
@w.lang.en.reply.local.place_in_n w.lang.en.reply name=done.place.in count=other role=thing role=number role=value text="I moved {number} {thing:num=pl} into the {value}."
@w.lang.en.reply.local.place_on_1 w.lang.en.reply name=done.place.on count=one role=thing role=value text="I put the {thing} on the {value}."
@w.lang.en.reply.local.place_on_n w.lang.en.reply name=done.place.on count=other role=thing role=number role=value text="I put {number} {thing:num=pl} on the {value}."
@w.lang.en.reply.local.place_into_1 w.lang.en.reply name=done.place.into count=one act=place role=thing role=region text="I moved the {thing} into the {region}."
@w.lang.en.reply.local.place_into_n w.lang.en.reply name=done.place.into count=other act=place role=thing role=number role=region text="I moved the {number} {thing:num=pl} into the {region}."
@w.lang.en.reply.local.place_none_1 w.lang.en.reply name=done.none count=one role=thing text="The {thing} is already there."
@w.lang.en.reply.local.place_none_n w.lang.en.reply name=done.none count=other role=thing role=number text="The {number} {thing:num=pl} are already there."
@w.lang.en.reply.local.place_none_name w.lang.en.reply name=done.none role=name text="{name} is already there."
@w.lang.en.reply.local.added_band w.lang.en.reply name=done.added.band role=band text="There was no {band}, so I added it to the ground."
# done.change with its key (sopworld 0.153.0: a reply fact with a key is said by <name>.<key>); the library's proposal in examples/tool-app.mjs PROPOSED_EN, local until published (questions.md Q47 [KNOW])
@w.lang.en.reply.local.undo_did w.lang.en.reply name=done.undo.did count=one role=did text="OK, I undid it ({did})."
@w.lang.en.reply.local.redo_did w.lang.en.reply name=done.redo.did count=one role=did text="OK, I did it again ({did})."
@w.lang.en.reply.local.nothing_known w.lang.en.reply name=refused.nothing_known count=one role=about text="I know nothing about {about} in my knowledge yet."
@w.lang.en.reply.local.no_composer w.lang.en.reply name=refused.no_composer count=one text="I cannot write compositions yet: the library has no composer (std.compose) in this build."
# The slots of k.faces are named by plural nouns (eyes, glasses): their plural is the word itself (questions.md Q96 (5) [KNOW], w.lang.en.irregular)
@w.lang.en.irregular.local.eyes w.lang.en.irregular singular=eyes plural=eyes
@w.lang.en.irregular.local.ears w.lang.en.irregular singular=ears plural=ears
@w.lang.en.irregular.local.eyebrows w.lang.en.irregular singular=eyebrows plural=eyebrows
@w.lang.en.irregular.local.cheeks w.lang.en.irregular singular=cheeks plural=cheeks
@w.lang.en.irregular.local.glasses w.lang.en.irregular singular=glasses plural=glasses
@w.lang.en.irregular.local.earrings w.lang.en.irregular singular=earrings plural=earrings
@w.lang.en.irregular.local.shoulders w.lang.en.irregular singular=shoulders plural=shoulders
@w.lang.en.irregular.local.accessories w.lang.en.irregular singular=accessories plural=accessories
@w.lang.en.reply.local.page w.lang.en.reply name=done.page count=one text="Here is a fresh sheet of paper. What shall we draw?"
@w.lang.en.reply.local.page_kept w.lang.en.reply name=done.page.kept count=one text="Here is a fresh sheet of paper! Your old picture is still there if you say “undo”."
@w.lang.en.reply.local.change_name w.lang.en.reply name=done.change act=change role=name role=value text="{name} is {value} now."
@w.lang.en.reply.local.size_up_name w.lang.en.reply name=done.change.size.up act=change role=name text="{name} is bigger now."
@w.lang.en.reply.local.size_down_name w.lang.en.reply name=done.change.size.down act=change role=name text="{name} is smaller now."
@w.lang.en.reply.local.remove_name w.lang.en.reply name=done.remove act=remove role=name text="I removed {name}."
@w.lang.en.reply.local.no_things w.lang.en.reply name=cannot.no_things role=thing role=world text="There is no {thing} in the {world}."
@w.lang.en.reply.local.no_things_any w.lang.en.reply name=cannot.no_things role=world text="There is nothing like that in the {world}."
@w.lang.en.reply.local.no_place w.lang.en.reply name=cannot.no_place text="Where should it go? You can say, for example, \\"move the tree to the left\\", \\"put the cat next to the house\\" or \\"move it to the top right corner\\"."
@w.lang.en.reply.local.no_value w.lang.en.reply name=cannot.no_value text="What should change, and to what? The colour or the size."
@w.lang.en.reply.local.refused w.lang.en.reply name=cannot.refused text="I could not do that."
@w.lang.en.reply.local.which w.lang.en.reply name=ask.which role=thing role=list text="Which {thing} do you mean: {list}?"
@w.lang.en.reply.local.not_act w.lang.en.reply name=cannot.act role=act role=thing role=world text="I cannot {act} the {thing} in the {world} yet."
@w.lang.en.reply.local.not_key w.lang.en.reply name=cannot.key role=words role=world text="I cannot do \\"{words}\\" in the {world} yet."
# The questions the door answers by saying facts of the live world (sopworld 0.152.1 askWorld, WORLD_QUESTIONS) and their replies: the library's proposal for w.lang.en
# (soplang-words-lib examples/tool-app.mjs PROPOSED_EN, its questions.md Q87 1), local until the catalog publishes them ([KNOW]).
# The door's honest answers as reply facts (src/dialog/index.mjs _doorHonest; Q43 [KNOW]): what was not understood or cannot be done, said in every language by the same names.
@w.lang.en.reply.local.not_understood_here w.lang.en.reply name=not_understood.here count=one role=world text="I did not understand that as something to do in the {world}."
@w.lang.en.reply.local.not_understood_words w.lang.en.reply name=not_understood.words count=one role=words text="I did not understand {words} here."
@w.lang.en.reply.local.not_understood_part w.lang.en.reply name=not_understood.part count=one role=done role=words text="I understood {done}, but not {words}, so I did nothing."
@w.lang.en.reply.local.cannot_ask w.lang.en.reply name=cannot.ask count=one role=world text="I cannot answer questions about the {world} yet."
@w.lang.en.reply.local.cannot_make w.lang.en.reply name=cannot.make count=one role=world text="I could not make that in the {world}."
@w.lang.en.reply.local.cannot_plan w.lang.en.reply name=cannot.plan count=one role=words text="I could not plan {words} as you said, so I made nothing."
@w.lang.en.reply.local.cannot_revise w.lang.en.reply name=cannot.revise count=one role=world text="There is nothing in the {world} that I made and could change that way yet."
@w.lang.en.reply.local.cannot_act_kind w.lang.en.reply name=cannot.act.kind count=one role=act role=kind role=world text="I cannot {act} {kind} in the {world} yet."
@w.lang.en.reply.local.cannot_act_any w.lang.en.reply name=cannot.act.any count=one role=act role=world text="I cannot {act} in the {world} yet."
@w.lang.en.reply.local.not_understood_undo w.lang.en.reply name=not_understood.undo count=one role=words text="I did not understand {words} here, so I took nothing back."
@w.lang.en.reply.local.nothing_like w.lang.en.reply name=nothing.like count=one role=words text="I found nothing like {words} among what was done, so I took nothing back."
@w.lang.en.reply.local.missing_place w.lang.en.reply name=refused.missing_value.place count=one role=key text="Where should it go? You can say, for example, \\"move the tree to the left\\", \\"put the cat next to the house\\" or \\"move it to the top right corner\\"."
@w.lang.en.reply.local.cannot_do w.lang.en.reply name=cannot.do count=one role=words role=world text="I cannot do {words} in the {world} yet."
# sopworld 0.163: replies the library says in its own English when the language world has none (nothing.same.value, refused.already, refused.no_default) and the <reply>.plural
# sentences of one thing named by a plural noun (eyes, glasses), in the catalog's shape so that every language says them by the same names ([KNOW] questions.md Q101)
# sopworld 0.165 (Q102): the parts a genre of the knowledge names, and a step with no other value, in the catalog's shape so that every language says them by the same names ([KNOW])
`;
