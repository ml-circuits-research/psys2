// SPDX-License-Identifier: AGPL-3.0-only
// The determiners that make a noun phrase a definite reference ("the lake", "that tree"), read once from the
// language world's determiner facts (w.lang.en.det definite=yes). The raw-structure bridge uses them to read a
// relation anchor phrase as a kind lemma; nothing here names a word.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=915a9d5c18';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=cbef8f4212';
let table;
export function referenceProjection(){
 if(table)return table;
 const definite=parse(LANG_EN_FACTS.determiners).filter(wire=>str(wire.attrs.definite?.[0])==='yes').map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 table=Object.freeze({definite:Object.freeze([...new Set(definite)])});
 return table;
}
