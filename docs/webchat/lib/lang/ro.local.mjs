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
@w.lang.ro.reply.local.place_in_1 w.lang.ro.reply name=done.place.in count=one role=thing role=value text="am mutat {thing:def=yes} în {value:def=no}"
@w.lang.ro.reply.local.place_in_n w.lang.ro.reply name=done.place.in count=other role=thing role=number role=value text="am mutat {number} {thing:num=pl} în {value:def=no}"
@w.lang.ro.reply.local.place_next_1 w.lang.ro.reply name=done.place.next count=one act=place role=thing role=target text="am mutat {thing:def=yes} lângă {target:def=yes}"
@w.lang.ro.reply.local.place_next_n w.lang.ro.reply name=done.place.next count=other act=place role=thing role=number role=target text="am mutat cele {number} {thing:num=pl} lângă {target:def=yes}"
@w.lang.ro.reply.local.none_1 w.lang.ro.reply name=done.none count=one role=thing text="{thing:def=yes} este deja acolo"
@w.lang.ro.reply.local.none_n w.lang.ro.reply name=done.none count=other role=thing role=number text="cele {number} {thing:num=pl} sunt deja acolo"
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
@w.lang.ro.reply.local.missing_place w.lang.ro.reply name=refused.missing_value.place count=one role=key text="unde ar trebui să meargă? Poți spune, de exemplu, „mută copacul la stânga”, „pune pisica lângă casă” sau „mută-l în colțul din dreapta sus”"
@w.lang.ro.irregular.local.poveste.pl w.lang.ro.irregular lemma=poveste form=povești num=pl case=nomacc def=no
@w.lang.ro.irregular.local.poveste.pl_def w.lang.ro.irregular lemma=poveste form=poveștile num=pl case=nomacc def=yes
@w.lang.ro.irregular.local.cuvant.pl w.lang.ro.irregular lemma=cuvânt form=cuvinte num=pl case=nomacc def=no
@w.lang.ro.irregular.local.cuvant.pl_def w.lang.ro.irregular lemma=cuvânt form=cuvintele num=pl case=nomacc def=yes
@w.lang.ro.reply.local.cannot_key w.lang.ro.reply name=cannot.key count=one role=words text="încă nu pot face {words} aici"
@w.lang.ro.reply.local.no_things w.lang.ro.reply name=cannot.no_things count=one role=thing text="aici nu există {art@thing} {thing}"
@w.lang.ro.fill.local.no_things_art w.lang.ro.fill template=cannot.no_things role=art lemma=un
@w.lang.ro.reply.local.which w.lang.ro.reply name=ask.which count=one role=thing role=list text="la care {thing} te referi: {list}?"
@w.lang.ro.reply.local.undo_did w.lang.ro.reply name=done.undo.did count=one role=did text="am anulat ultima schimbare"
@w.lang.ro.reply.local.redo_did w.lang.ro.reply name=done.redo.did count=one role=did text="am refăcut ultima schimbare"
# The parts of a genre the knowledge names (sopworld 0.165 done.parts; Q102 [KNOW]: the catalog's w.lang.ro has no row, and the part names are said as the knowledge gives them until it has their Romanian words)
@w.lang.ro.reply.local.nothing_known w.lang.ro.reply name=refused.nothing_known count=one role=about text="încă nu știu nimic despre {about}"
@w.lang.ro.reply.local.knowledge_loading w.lang.ro.reply name=refused.knowledge_loading count=one text="cunoștințele încă se încarcă, deci nu pot spune încă. Mai încearcă într-o clipă"
@w.lang.ro.reply.local.unchanged w.lang.ro.reply name=refused.unchanged count=one role=thing text="nu am putut schimba nimic la {thing}"
# a length step (mai lung / mai scurt) the tool cannot carry out (sopworld 0.167; [KNOW]: the catalog lacks the rows)
@w.lang.ro.reply.local.same_limit w.lang.ro.reply name=nothing.same.limit count=one role=about role=made text="nu mai știu nimic despre {about}; rămâne la {made} de cuvinte"
@w.lang.ro.reply.local.same_length w.lang.ro.reply name=nothing.same.length count=one text="nu am putut schimba lungimea; rămâne cum era"
@w.lang.ro.reply.local.no_composer w.lang.ro.reply name=refused.no_composer count=one text="încă nu pot scrie compuneri: biblioteca nu are un compozitor (std.compose) în această versiune"
@w.lang.ro.reply.local.page w.lang.ro.reply name=done.page count=one text="iată o foaie nouă. Ce desenăm?"
@w.lang.ro.reply.local.page_kept w.lang.ro.reply name=done.page.kept count=one text="iată o foaie nouă! Desenul vechi este încă acolo dacă spui „anulează”."
@w.lang.ro.irregular.local.aseza.pres_3_sg_a w.lang.ro.irregular lemma=așeza form=așază tense=pres person=3 num=sg
@w.lang.ro.irregular.local.aseza.pres_3_pl_a w.lang.ro.irregular lemma=așeza form=așază tense=pres person=3 num=pl
@w.lang.ro.irregular.local.aseza.imper_2_sg_a w.lang.ro.irregular lemma=așeza form=așază tense=imper person=2 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_sg_a w.lang.ro.irregular lemma=reașeza form=reașază tense=pres person=3 num=sg
@w.lang.ro.irregular.local.reaseza.pres_3_pl_a w.lang.ro.irregular lemma=reașeza form=reașază tense=pres person=3 num=pl
@w.lang.ro.irregular.local.reaseza.imper_2_sg_a w.lang.ro.irregular lemma=reașeza form=reașază tense=imper person=2 num=sg
@w.lang.ro.reply.local.done_place_up w.lang.ro.reply name=done.place.up count=other role=things text="am mutat {things} în sus"
@w.lang.ro.reply.local.done_place_down w.lang.ro.reply name=done.place.down count=other role=things text="am mutat {things} în jos"
@w.lang.ro.reply.local.done_place_left w.lang.ro.reply name=done.place.left count=other role=things text="am mutat {things} la stânga"
@w.lang.ro.reply.local.done_place_right w.lang.ro.reply name=done.place.right count=other role=things text="am mutat {things} la dreapta"
@w.lang.ro.reply.local.person_know_none w.lang.ro.reply name=person.know.none count=other text="încă nu știu nimic despre tine"
# sopworld 0.163 (the names of src/lang/en.request.local.mjs): a value already there, a part already there, no default, and one thing named by a plural noun ("ochelari", "ochii") ([KNOW] Q101)
`,

  dictionary: {
    n: 'nod\tn.uri\tn\tk.words.node.noun.1\nnumăr\tn.e.ă\tn\tk.words.count.noun.1',
    // the keys the door's `assumed` reply names (count, layout, kinds: the library's keys), said in Romanian by their lemmas (questions.md [KNOW])
    f: 'formă\tf.ă\tf\tk.words.kinds.noun.1',
    l: 'lungime\tf.e\tf\tk.words.length.noun.1',
    // the translation gloss (reviewer 2026-11-15 10:10 item 2): verbs the machine model turned into non-words ("așează" -> "Assate"), with their senses; a second row of a lemma is a
    // second sense (așeza: sit, and arrange as in "așează elementele"). [KNOW] ask in questions.md: the catalog's w.lang.ro gets these rows and așeza its 3rd-person forms
    a: 'așeza\tv.a.ez\t\tk.actions.verb.group.arrange\naranjare\tf.e.alt\tf\tk.words.layout.noun.1\nargument\tn.e\tn\tk.words.argument.noun.1',
    r: 'reașeza\tv.a.ez\t\tk.actions.verb.group.rearrange\nrearanja\tv.a.ez\t\tk.actions.verb.group.rearrange\nraport\tn.e.oa\tn\tk.words.report.noun.1\nrezumat\tn.e\tn\tk.words.abstract.noun.1\nrezultat\tn.e\tn\tk.words.result.noun.1',
    e: 'exagera\tv.a.ez\t\tk.words.exaggerate.verb.1\neseu\tn.u\tn\tk.words.essay.noun.1',
    c: 'compune\tv.e.s.n\t\tk.actions.verb.make.compose\ncuvânt\tn.e\tn\tk.words.word.noun.1\ncoadă\tf.ă\tf\tk.words.ponytail.noun.1',   // coadă: the hair at the back (w.lang.ro words-k.faces hair_back), a lemma the catalog's dictionary lacks ([KNOW] Q101)
    // the kinds of text the Documents tool writes and the unit of a text's length (sopworld 0.159 short_of), so that its replies compose in Romanian (questions.md Q96 [KNOW])
    p: 'poveste\tf.e\tf\tk.words.story.noun.1\npoem\tn.e\tn\tk.words.poem.noun.1',
    // the key of a part's variant (k.faces.variant) in the door's `assumed` reply; k.words has no sense of `variant` yet ([KNOW] Q101)
    s: 'salut\tn.uri\tn\tk.words.greeting.noun.1\nsemnătură\tf.ă\tf\tk.words.signature.noun.1',
    c: 'corp\tn.uri\tn\tk.words.body.noun.1\nconcluzie\tf.ie\tf\tk.words.conclusion.noun.1\ncontraargument\tn.e\tn\tk.words.counterargument.noun.1',
    m: 'mesaj\tn.e\tn\tk.words.message.noun.1\nmetodă\tf.ă\tf\tk.words.method.noun.1',
    i: 'început\tn.uri\tn\tk.words.opening.noun.1\nîncheiere\tf.e.alt\tf\tk.words.closing.noun.1\nintroducere\tf.e.alt\tf\tk.words.introduction.noun.1',
    d: 'discuție\tf.ie\tf\tk.words.discussion.noun.1',
    // (the genre parts above, per first letter: salut, început, corp, încheiere, semnătură, mesaj, introducere, concluzie, rezumat, argument, rezultat, metodă, discuție: the words k.genres.part of w.lang.ro words-k.genres as lemmas with a class, so that done.parts says them in their number; [KNOW] the catalog has the words, not the dictionary rows)
    v: 'variantă\tf.ă\tf\tk.words.variant.noun.1',
  },
};
