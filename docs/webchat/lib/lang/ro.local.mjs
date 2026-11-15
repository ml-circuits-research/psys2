// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Romanian replies this application composes and the catalog world `w.lang.ro` does not have yet, IN THE CATALOG'S KEY SHAPE (`w.lang.ro.reply name= count= role= text=`, reviewer
 * 2026-11-15 05:30): src/lang/ro.mjs loads them after the catalog's facts and `composeRo` reads them like the catalog's own. Three reply names, each a [KNOW] ask in questions.md (Q29 K1), and the lemma `nod` (its sense, Q29 K2);
 * each goes when the catalog publishes a reply of that meaning. diagram.shaped is said by the catalog's done.make.shape when the dictionary has `diagramă` with its sense (not yet), by the local reply until then.
 */
export const LANG_RO_LOCAL = {
  wires: `
@w.lang.ro.reply.local.diagram_shaped w.lang.ro.reply name=diagram.shaped count=other role=thing role=nodes text="am desenat o diagramă în formă de {thing:num=sg,case=nomacc,def=no}: {nodes} pe contur, unite în ordine"
@w.lang.ro.reply.local.diagram_shaped_placed w.lang.ro.reply name=diagram.shaped.placed count=other role=thing role=shapes text="am așezat cele {shapes} pe un contur în formă de {thing:num=sg,case=nomacc,def=no}, în sensul acelor de ceasornic, de sus"
@w.lang.ro.reply.local.draw_scene w.lang.ro.reply name=draw.scene count=other role=things role=example role=colour text="am desenat o scenă însorită pentru tine: {things}. Poți schimba orice, de exemplu „fă {example:num=sg,case=nomacc,def=yes} {colour@example}”"
`,
  dictionary: {
    n: 'nod\tn.uri\tn\tk.words.node.noun.1',
  },
};
