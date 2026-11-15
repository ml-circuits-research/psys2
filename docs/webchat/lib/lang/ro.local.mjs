// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Romanian this application keeps until the catalog world `w.lang.ro` has it (src/lang/ro.mjs loads these facts AFTER the catalog's, in the catalog's format; a catalog row of the
 * same lemma wins). Hand-maintained; every entry is a [KNOW] ask in questions.md ("w.lang.ro reply templates", reviewer 2026-11-15 03:15 item 2) and goes when the catalog publishes it.
 *
 *   templates   `w.lang.ro.template act= text=`: the REPLIES the application composes (a world's result carries `say: { act, roles }` next to its English text; spec 06 "Composed
 *               replies"). Filled by the library's `realise` (std.morph: article, number, case and adjective agreement from the dictionary). A role written `{x}` whose value is a
 *               count ({ n, noun, colour? }) or a list of counts is made by src/lang/ro.mjs `composeRo` from the same templates' words (no sentence is written there).
 *   dictionary  lemma rows (`lemma<TAB>class<TAB>gender<TAB>sense`) the replies need and the catalog lacks: the sense joins the lemma to the English word of the domain worlds.
 */
export const LANG_RO_LOCAL = {
  wires: `
@w.lang.ro.template.diagram_shaped w.lang.ro.template act=diagram.shaped text="am desenat o diagramă în formă de {thing:num=sg,case=nomacc,def=no}: {nodes} pe contur, unite în ordine"
@w.lang.ro.template.diagram_shaped_placed w.lang.ro.template act=diagram.shaped.placed text="am așezat cele {shapes} pe un contur în formă de {thing:num=sg,case=nomacc,def=no}, în sensul acelor de ceasornic, de sus"
@w.lang.ro.template.draw_scene w.lang.ro.template act=draw.scene text="am desenat o scenă însorită pentru tine: {things}. Poți schimba orice, de exemplu „fă {example:num=sg,case=nomacc,def=yes} {colour@example}”"
`,
  dictionary: {
    n: 'nod\tn.uri\tn\tk.words.node.noun.1',
  },
};
