// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Romanian replies this application composes and the catalog world `w.lang.ro` does not have yet, IN THE CATALOG'S KEY SHAPE (`w.lang.ro.reply name= count= role= text=`, reviewer
 * 2026-11-15 05:30): src/lang/ro.mjs loads them after the catalog's facts and `composeRo` reads them like the catalog's own. Four reply names, each a [KNOW] ask in questions.md (Q29 K1; person.know.none: the w.person ask, 2026-11-15), and the lemma `nod` (its sense, Q29 K2);
 * each goes when the catalog publishes a reply of that meaning. diagram.shaped is said by the catalog's done.make.shape when the dictionary has `diagramă` with its sense (not yet), by the local reply until then.
 */
export const LANG_RO_LOCAL = {
  wires: `
@w.lang.ro.reply.local.diagram_shaped w.lang.ro.reply name=diagram.shaped count=other role=thing role=nodes text="am desenat o diagramă în formă de {thing:num=sg,case=nomacc,def=no}: {nodes} pe contur, unite în ordine"
@w.lang.ro.reply.local.diagram_shaped_placed w.lang.ro.reply name=diagram.shaped.placed count=other role=thing role=shapes text="am așezat cele {shapes} pe un contur în formă de {thing:num=sg,case=nomacc,def=no}, în sensul acelor de ceasornic, de sus"
@w.lang.ro.reply.local.draw_scene w.lang.ro.reply name=draw.scene count=other role=things role=example role=colour text="am desenat o scenă însorită pentru tine: {things}. Poți schimba orice, de exemplu „fă {example:num=sg,case=nomacc,def=yes} {colour@example}”"
# The door's reply facts the catalog's w.lang.ro does not have yet (the names of src/lang/en.request.local.mjs, Q43 / Q47 [KNOW]): its acts on things, the questions about the state and the capabilities, and the honest answers.
@w.lang.ro.reply.local.place_next_1 w.lang.ro.reply name=done.place.next count=one act=place role=thing role=target text="am mutat {thing:def=yes} lângă {target:def=yes}"
@w.lang.ro.reply.local.place_next_n w.lang.ro.reply name=done.place.next count=other act=place role=thing role=number role=target text="am mutat cele {number} {thing:num=pl} lângă {target:def=yes}"
@w.lang.ro.reply.local.none_1 w.lang.ro.reply name=done.none count=one role=thing text="{thing:def=yes} este deja acolo"
@w.lang.ro.reply.local.none_n w.lang.ro.reply name=done.none count=other role=thing role=number text="cele {number} {thing:num=pl} sunt deja acolo"
@w.lang.ro.reply.local.change_size_up_1 w.lang.ro.reply name=done.change.size.up count=one act=change role=thing text="{thing:def=yes} este mai mare acum"
@w.lang.ro.reply.local.change_size_down_1 w.lang.ro.reply name=done.change.size.down count=one act=change role=thing text="{thing:def=yes} este mai mic acum"
@w.lang.ro.reply.local.state_count_one w.lang.ro.reply name=state.count count=one role=kind role=number text="este {art@kind} {kind}"
@w.lang.ro.reply.local.state_count_few w.lang.ro.reply name=state.count count=few role=kind role=number text="sunt {number} {kind:num=pl}"
@w.lang.ro.reply.local.state_count_other w.lang.ro.reply name=state.count count=other role=kind role=number text="sunt {number} de {kind:num=pl}"
@w.lang.ro.fill.local.state_count_art w.lang.ro.fill template=state.count role=art lemma=un
@w.lang.ro.reply.local.state_empty w.lang.ro.reply name=state.empty count=one text="aici nu este încă nimic"
@w.lang.ro.reply.local.nothing_same w.lang.ro.reply name=nothing.same count=one text="asta este deja acolo"
@w.lang.ro.reply.local.no_place w.lang.ro.reply name=cannot.no_place count=one text="unde să fie? poți spune, de exemplu, „mută copacul la stânga”"
@w.lang.ro.reply.local.no_value w.lang.ro.reply name=cannot.no_value count=one text="ce să schimb și în ce? culoarea sau mărimea"
@w.lang.ro.reply.local.refused w.lang.ro.reply name=cannot.refused count=one text="nu am putut face asta"
@w.lang.ro.reply.local.not_understood_here w.lang.ro.reply name=not_understood.here count=one text="nu am înțeles asta ca pe ceva de făcut aici"
@w.lang.ro.reply.local.not_understood_words w.lang.ro.reply name=not_understood.words count=one role=words text="nu am înțeles {words} aici"
@w.lang.ro.reply.local.not_understood_part w.lang.ro.reply name=not_understood.part count=one role=done role=words text="am înțeles {done}, dar nu {words}, așa că nu am făcut nimic"
@w.lang.ro.reply.local.cannot_ask w.lang.ro.reply name=cannot.ask count=one text="încă nu pot răspunde la întrebări despre asta"
@w.lang.ro.reply.local.cannot_make w.lang.ro.reply name=cannot.make count=one text="nu am putut face asta aici"
@w.lang.ro.reply.local.cannot_plan w.lang.ro.reply name=cannot.plan count=one role=words text="nu am putut plănui {words} cum ai spus, așa că nu am făcut nimic"
@w.lang.ro.reply.local.cannot_revise w.lang.ro.reply name=cannot.revise count=one text="aici nu este încă nimic făcut de mine care să se poată schimba așa"
@w.lang.ro.reply.local.cannot_do w.lang.ro.reply name=cannot.do count=one role=words text="încă nu pot face {words} aici"
@w.lang.ro.reply.local.cannot_act w.lang.ro.reply name=cannot.act count=one text="încă nu pot face asta aici"
@w.lang.ro.reply.local.cannot_act_kind w.lang.ro.reply name=cannot.act.kind count=one role=kind text="încă nu pot face asta cu {kind:num=pl} aici"
@w.lang.ro.reply.local.cannot_act_any w.lang.ro.reply name=cannot.act.any count=one text="încă nu pot face asta aici"
@w.lang.ro.reply.local.not_understood_undo w.lang.ro.reply name=not_understood.undo count=one role=words text="nu am înțeles {words} aici, așa că nu am anulat nimic"
@w.lang.ro.reply.local.nothing_like w.lang.ro.reply name=nothing.like count=one role=words text="nu am găsit nimic ca {words} printre ce am făcut, așa că nu am anulat nimic"
@w.lang.ro.reply.local.cannot_key w.lang.ro.reply name=cannot.key count=one role=words text="încă nu pot face {words} aici"
@w.lang.ro.reply.local.no_things w.lang.ro.reply name=cannot.no_things count=one role=thing text="aici nu există {art@thing} {thing}"
@w.lang.ro.fill.local.no_things_art w.lang.ro.fill template=cannot.no_things role=art lemma=un
@w.lang.ro.reply.local.which w.lang.ro.reply name=ask.which count=one role=thing role=list text="la care {thing} te referi: {list}?"
@w.lang.ro.reply.local.change_place_1 w.lang.ro.reply name=done.change.place count=one role=thing role=value text="am mutat {thing:def=yes} la {value:def=yes}"
@w.lang.ro.reply.local.change_place_n w.lang.ro.reply name=done.change.place count=other role=thing role=number role=value text="am mutat {number} {thing:num=pl} la {value:def=yes}"
@w.lang.ro.reply.local.change_size_1 w.lang.ro.reply name=done.change.size count=one role=thing role=value text="{thing:def=yes} este acum {value@thing}"
@w.lang.ro.reply.local.change_size_n w.lang.ro.reply name=done.change.size count=other role=thing role=number role=value text="am făcut {number} {thing:num=pl} {value:num=pl@thing}"
@w.lang.ro.reply.local.size_up_n w.lang.ro.reply name=done.change.size.up count=other act=change role=thing role=number text="cele {number} {thing:num=pl} sunt mai mari acum"
@w.lang.ro.reply.local.size_down_n w.lang.ro.reply name=done.change.size.down count=other act=change role=thing role=number text="cele {number} {thing:num=pl} sunt mai mici acum"
@w.lang.ro.reply.local.can_make w.lang.ro.reply name=can.make count=one role=kinds text="pot face: {kinds}"
@w.lang.ro.reply.local.can_say_make w.lang.ro.reply name=can.say.make count=one role=keys text="când fac ceva, poți spune {keys}"
@w.lang.ro.reply.local.can_remove w.lang.ro.reply name=can.remove count=one role=kinds text="pot șterge: {kinds}"
@w.lang.ro.reply.local.can_say_remove w.lang.ro.reply name=can.say.remove count=one role=keys text="când șterg ceva, poți spune {keys}"
@w.lang.ro.reply.local.can_place w.lang.ro.reply name=can.place count=one role=kinds text="pot muta: {kinds}"
@w.lang.ro.reply.local.can_say_place w.lang.ro.reply name=can.say.place count=one role=keys text="când mut ceva, poți spune {keys}"
@w.lang.ro.reply.local.can_change w.lang.ro.reply name=can.change count=one role=kinds text="pot schimba: {kinds}"
@w.lang.ro.reply.local.can_say_change w.lang.ro.reply name=can.say.change count=one role=keys text="când schimb ceva, poți spune {keys}"
@w.lang.ro.reply.local.can_arrange w.lang.ro.reply name=can.arrange count=one role=kinds text="pot aranja: {kinds}"
@w.lang.ro.reply.local.can_say_arrange w.lang.ro.reply name=can.say.arrange count=one role=keys text="când aranjez ceva, poți spune {keys}"
@w.lang.ro.reply.local.can_connect w.lang.ro.reply name=can.connect count=one role=kinds text="pot lega: {kinds}"
@w.lang.ro.reply.local.can_say_connect w.lang.ro.reply name=can.say.connect count=one role=keys text="când leg ceva, poți spune {keys}"
@w.lang.ro.irregular.local.aseza.pres_3_sg_ea w.lang.ro.irregular lemma=așeza form=așează tense=pres person=3 num=sg
@w.lang.ro.irregular.local.aseza.pres_3_pl_ea w.lang.ro.irregular lemma=așeza form=așează tense=pres person=3 num=pl
@w.lang.ro.irregular.local.aseza.imper_2_sg_ea w.lang.ro.irregular lemma=așeza form=așează tense=imper person=2 num=sg
@w.lang.ro.irregular.local.aseza.subj_3_sg_ea w.lang.ro.irregular lemma=așeza form=așeze tense=subj person=3 num=sg
@w.lang.ro.irregular.local.aseza.pres_3_sg_a w.lang.ro.irregular lemma=așeza form=așază tense=pres person=3 num=sg
@w.lang.ro.irregular.local.aseza.pres_3_pl_a w.lang.ro.irregular lemma=așeza form=așază tense=pres person=3 num=pl
@w.lang.ro.irregular.local.aseza.imper_2_sg_a w.lang.ro.irregular lemma=așeza form=așază tense=imper person=2 num=sg
@w.lang.ro.irregular.local.aseza.subj_3_sg_a w.lang.ro.irregular lemma=așeza form=așeze tense=subj person=3 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_sg_ea w.lang.ro.irregular lemma=reașeza form=reașează tense=pres person=3 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_pl_ea w.lang.ro.irregular lemma=reașeza form=reașează tense=pres person=3 num=pl
@w.lang.ro.irregular.local.reaseza.imper_2_sg_ea w.lang.ro.irregular lemma=reașeza form=reașează tense=imper person=2 num=sg
@w.lang.ro.irregular.local.reaseza.subj_3_sg_ea w.lang.ro.irregular lemma=reașeza form=reașeze tense=subj person=3 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_sg_a w.lang.ro.irregular lemma=reașeza form=reașază tense=pres person=3 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_pl_a w.lang.ro.irregular lemma=reașeza form=reașază tense=pres person=3 num=pl
@w.lang.ro.irregular.local.reaseza.imper_2_sg_a w.lang.ro.irregular lemma=reașeza form=reașază tense=imper person=2 num=sg
@w.lang.ro.irregular.local.reaseza.subj_3_sg_a w.lang.ro.irregular lemma=reașeza form=reașeze tense=subj person=3 num=sg
@w.lang.ro.reply.local.done_place_up w.lang.ro.reply name=done.place.up count=other role=things text="am mutat {things} în sus"
@w.lang.ro.reply.local.done_place_down w.lang.ro.reply name=done.place.down count=other role=things text="am mutat {things} în jos"
@w.lang.ro.reply.local.done_place_left w.lang.ro.reply name=done.place.left count=other role=things text="am mutat {things} la stânga"
@w.lang.ro.reply.local.done_place_right w.lang.ro.reply name=done.place.right count=other role=things text="am mutat {things} la dreapta"
@w.lang.ro.reply.local.person_know_none w.lang.ro.reply name=person.know.none count=other text="încă nu știu nimic despre tine"
`,
  dictionary: {
    n: 'nod\tn.uri\tn\tk.words.node.noun.1\nnumăr\tn.e.ă\tn\tk.words.count.noun.1',
    // the keys the door's `assumed` reply names (count, layout, kinds: the library's keys), said in Romanian by their lemmas (questions.md [KNOW])
    f: 'formă\tf.ă\tf\tk.words.kinds.noun.1',
    l: 'lungime\tf.e\tf\tk.words.length.noun.1',
    // the translation gloss (reviewer 2026-11-15 10:10 item 2): verbs the machine model turned into non-words ("așează" -> "Assate"), with their senses; a second row of a lemma is a
    // second sense (așeza: sit, and arrange as in "așează elementele"). [KNOW] ask in questions.md: the catalog's w.lang.ro gets these rows and așeza its 3rd-person forms
    a: 'așeza\tv.a.ez\t\tk.actions.verb.group.arrange\naranjare\tf.e.alt\tf\tk.words.layout.noun.1',
    r: 'reașeza\tv.a.ez\t\tk.actions.verb.group.rearrange\nrearanja\tv.a.ez\t\tk.actions.verb.group.rearrange',
    e: 'exagera\tv.a.ez\t\tk.words.exaggerate.verb.1',
    c: 'compune\tv.e.s.n\t\tk.actions.verb.make.compose',
  },
};
