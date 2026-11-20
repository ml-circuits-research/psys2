// SPDX-License-Identifier: AGPL-3.0-only
// The determiners that make a noun phrase a definite reference ("the lake", "that tree"), read once from the
// language world's determiner facts (w.lang.en.det definite=yes). The raw-structure bridge uses them to read a
// relation anchor phrase as a kind lemma; nothing here names a word. With them, the declared question heads
// (query-reading-policy.sop app.query.read.head: "what" asks the values of a property, "how many" a count) that
// project an annotated question into a std.request.query.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=bd66855a30';
import QUERY_POLICY from '../../worlds/app.project/query-reading-policy-source.mjs?v=cf7b2d9297';
let table;
export function referenceProjection(){
 if(table)return table;
 const definite=parse(LANG_EN_FACTS.determiners).filter(wire=>str(wire.attrs.definite?.[0])==='yes').map(wire=>str(wire.attrs.text?.[0])).filter(Boolean);
 const concrete=token=>typeof token==='string'&&!token.startsWith('?')&&!token.startsWith('$');
 const queries=parse(QUERY_POLICY).filter(wire=>wire.type==='app.query.read.head'&&!wire.pattern&&['head','operation','property'].every(key=>concrete(wire.attrs[key]?.[0])))
  .map(wire=>Object.freeze({head:str(wire.attrs.head[0]),operation:str(wire.attrs.operation[0]),property:str(wire.attrs.property[0])==='true',declaration:wire.id}));
 table=Object.freeze({definite:Object.freeze([...new Set(definite)]),queries:Object.freeze(queries)});
 return table;
}
