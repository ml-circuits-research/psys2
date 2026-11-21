// SPDX-License-Identifier: AGPL-3.0-only
// The determiners that make a noun phrase a definite reference ("the lake", "that tree"), read once from the
// language world's determiner facts (w.lang.en.det definite=yes). The raw-structure bridge uses them to read a
// relation anchor phrase as a kind lemma; nothing here names a word. With them, the declared question heads
// (query-reading-policy.sop app.query.read.head: "what" asks the values of a property, "how many" a count) that
// project an annotated question into a std.request.query.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=f6a0b10be9';
import QUERY_POLICY from '../../worlds/app.project/query-reading-policy-source.mjs?v=219c267031';
import {en} from '../lang/en.mjs?v=d028d63371';
let table;
export function referenceProjection(){
 if(table)return table;
 const definite=parse(LANG_EN_FACTS.determiners).filter(wire=>str(wire.attrs.definite?.[0])==='yes').map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 const concrete=token=>typeof token==='string'&&!token.startsWith('?')&&!token.startsWith('$');
 const queries=parse(QUERY_POLICY).filter(wire=>wire.type==='app.query.read.head'&&!wire.pattern&&['head','operation','property'].every(key=>concrete(wire.attrs[key]?.[0])))
  .map(wire=>Object.freeze({head:str(wire.attrs.head[0]),operation:str(wire.attrs.operation[0]),property:str(wire.attrs.property[0])==='true',declaration:wire.id}));
 // The indefinite ones (w.lang.en.det definite=no: "a", "an"): "next to a tree" names a kind as well.
 const indefinite=parse(LANG_EN_FACTS.determiners).filter(wire=>str(wire.attrs.definite?.[0])==='no').map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 // The coordinators of a list of things ("Start and Bake", "the tree and plane"): one anchor phrase naming several.
 const coordinators=[...en.words('coord.sep','things')].filter(word=>typeof word==='string'&&word.trim());
 // The list marks (w.lang.en.joiner kind=list-or-clause: ","): "the tree, the plane" lists things too.
 const listMarks=parse(LANG_EN_FACTS.clauses??'').filter(wire=>wire.type==='w.lang.en.joiner'&&String(str(wire.attrs.kind?.[0])).startsWith('list')).map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 // The place deictics (w.lang.en.pron deictic=place: "there", "here"): "the tree there" is the tree.
 const deictics=parse(LANG_EN_FACTS.pronouns??'').filter(wire=>str(wire.attrs.deictic?.[0])==='place').map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 // The property a question about one named object of a family lists when it asks none (app.query.read.listed).
 const listed=parse(QUERY_POLICY).filter(wire=>wire.type==='app.query.read.listed').map(wire=>Object.freeze({family:str(wire.attrs.family[0]),key:str(wire.attrs.key[0]),declaration:wire.id}));
 table=Object.freeze({definite:Object.freeze([...new Set(definite)]),indefinite:Object.freeze([...new Set(indefinite)]),coordinators:Object.freeze(coordinators),listMarks:Object.freeze(listMarks),deictics:Object.freeze([...new Set(deictics)]),queries:Object.freeze(queries),listed:Object.freeze(listed)});
 return table;
}
