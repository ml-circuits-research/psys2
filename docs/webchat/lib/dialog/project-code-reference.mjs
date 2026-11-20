// SPDX-License-Identifier: AGPL-3.0-only
// A request that names an observed object by its code ("make e1 dashed", "make the line e1 look better", "delete n2")
// refers to that object whatever family the reader gave it: the code is the object's identity in the instance. The
// reading is re-bridged with the object's own family (a node for n2, a link for e1), its identity restatements
// (an `ids` selector with the code) dropped, and the object as the declared context target; the reply says how the
// code was taken. Nothing here inspects words: only the reader's name span and the observed codes.
import {NATIVE_AREAS} from './app-reader-context.mjs?v=b82f8fc380';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=d58e992e52';
import {bridgeRawStructure} from './raw-structural-bridge.mjs?v=1a37877b02';
import {comparativeSteps} from './comparative-projection.mjs?v=7f194e56fb';
import {referenceProjection} from './reference-projection.mjs?v=9430fd808a';

// Reader diagnostics that only concern the identity heads the code replaces, or a constraint the reader could not
// form (its metadata without a key); every other unresolved head keeps the reading incomplete.
// The target's own kind head is replaced too: the code names the object, whose kind is observed.
const identityHead=detail=>typeof detail?.key==='string'&&(/\.ids?$/.test(detail.key)||detail.key==='request.target.kind');
const absorbed=row=>row?.reason==='incomplete-provider-coverage'||row?.reason==='provider-unresolved'&&
 (identityHead(row.detail)||row.detail?.reason==='metadata-presence-inconsistent'&&/^request\.constraint\./.test(row.detail.key??''));

export async function projectCodeReference(proposal,session,{bindings,view}={}){
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 const bindingSha256=proposal?.provenance?.bindingsSha256;
 if(!area||!bindings||!bindingSha256||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||!r?.target||r.target.mode!=='existing')return null;
 const code=r.target.name_span;
 if(typeof code!=='string'||!code)return null;
 if(!(raw.unresolved??[]).every(absorbed))return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'code-'+globalThis.crypto.randomUUID()});
 const object=host.observe().objects.find(o=>String(o.id)===code);
 if(!object)return null;
 // The object's own family: the reader types whose kinds the object's tool family makes; the exact kind name first.
 const mappings=nativeKindCandidates(bindings).filter(m=>m.area===readerArea&&m.nativeFamilyBinding?.sourceType===object.sourceType);
 // Kind rows name the family that makes the object; a family identity read as another class (a chart point read as
 // a diagram node, app.interpret.family) only counts when no kind row does.
 const own=mappings.filter(m=>!m.familyIdentity),types=[...new Set((own.length?own:mappings).map(m=>m.type))];
 if(types.length!==1)return null;
 const [type]=types,exact=mappings.filter(m=>m.lemma===object.kind),family=bindings.families?.find(f=>f.area===readerArea&&f.type===type);
 const canonical=[...new Set(exact.map(m=>m.canonical))].length===1?exact[0].canonical:family?.canonical;
 if(!canonical)return null;
 // Constraints restating the code (an ids selector) are the same reference; keys of the reader's family move to the
 // object's family when that family declares the same property.
 const keyOf=key=>{const [prefix,...rest]=String(key).split('.'),moved=type+'.'+rest.join('.');
  return prefix!==type&&rest.length&&bindings.properties?.some(p=>p.area===readerArea&&p.key===moved)?moved:key;};
 const restates=c=>/\.ids?$/.test(String(c?.key))&&typeof c.value==='string'&&code.startsWith(c.value);
 const kept=[],renumber=new Map();
 for(const [index,c] of (r.constraints??[]).entries()){if(restates(c))continue;renumber.set(String(index),String(kept.length));kept.push({...c,key:keyOf(c.key)});}
 const target={...r.target,type,fill:'context'};delete target.name_span;
 // A kind word the object's family does not have ("the line e1" read as a node) is the reader's family, not the object's.
 const keepsKind=typeof target.kind==='string'&&bindings.kinds?.some(k=>k.area===readerArea&&k.type===type&&k.lemma===target.kind&&k.canonical===canonical);
 if(!keepsKind){delete target.kind;delete target.kind_span;}
 const ranges=(raw.ranges??[]).flatMap(row=>{
  const [, , field,index]=row.path;
  if(field==='target'&&(index==='name_span'||!keepsKind&&['kind','kind_span'].includes(index)))return [];
  if(field!=='constraints')return [row];
  return renumber.has(index)?[{...row,path:[...row.path.slice(0,3),renumber.get(index),...row.path.slice(4)]}]:[];
 });
 const retyped={...raw,coverage:{complete:true,truncated:false},unresolved:[],ranges,requests:[{...r,target,constraints:kept}]};
 const bridged=bridgeRawStructure(retyped,{bindings,bindingSha256,comparatives:comparativeSteps(),references:referenceProjection(),contextTarget:{kind:canonical,declaration:object.source}});
 if(!bridged||bridged.diagnostics.length||bridged.decoded?.candidates?.length!==1||bridged.decoded.issues?.length)return null;
 const corrected=r.target.type!==type?' (the reader took it as a '+r.target.type+')':'';
 const note='I took '+JSON.stringify(code)+' as the '+object.kind+' '+code+corrected+'.';
 return {proposal:{...proposal,candidates:bridged.decoded.candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-code-reference/1',note,chosen:{id:object.id,kind:object.kind,canonical,type},readerType:r.target.type,unresolved:proposal.failures}},
  focus:object.id,rewind:null};
}
