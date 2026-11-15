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
@w.lang.ro.reply.local.person_know_none w.lang.ro.reply name=person.know.none count=other text="încă nu știu nimic despre tine"
`,
  dictionary: {
    n: 'nod\tn.uri\tn\tk.words.node.noun.1',
    // the translation gloss (reviewer 2026-11-15 10:10 item 2): verbs the machine model turned into non-words ("așează" -> "Assate"), with their senses; a second row of a lemma is a
    // second sense (așeza: sit, and arrange as in "așează elementele"). [KNOW] ask in questions.md: the catalog's w.lang.ro gets these rows and așeza its 3rd-person forms
    a: 'așeza\tv.a.ez\t\tk.actions.verb.group.arrange',
    r: 'reașeza\tv.a.ez\t\tk.actions.verb.group.rearrange\nrearanja\tv.a.ez\t\tk.actions.verb.group.rearrange',
    e: 'exagera\tv.a.ez\t\tk.words.exaggerate.verb.1',
    c: 'compune\tv.e.s.n\t\tk.actions.verb.make.compose',
  },
};
