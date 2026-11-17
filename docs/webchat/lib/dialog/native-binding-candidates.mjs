// Preserve declared alternatives for reversible best-effort interpretation; the strict bridge can still abstain.
export function nativeKindCandidates(bindings) {
 return [...(bindings.kinds??[]),...(bindings.families??[]).filter(f=>f.nativeFamilyBinding).map(f=>({...f,lemma:f.type,familyIdentity:true})),...(bindings.unresolved??[]).filter(r=>r.family==='kinds'&&r.reason==='ambiguous-canonical-kind'&&r.rawDescriptor).flatMap(r=>(r.candidates??[]).filter(c=>c.nativeFamilyBinding).map(c=>({...c,area:r.rawDescriptor.area,type:r.rawDescriptor.type,lemma:r.rawDescriptor.kind})))];
}

/** Canonical identity joins a declared native family and its compatible constructors. */
export function nativeCreationCandidates(bindings,operations,area){
 return nativeKindCandidates(bindings).filter(mapping=>mapping.area===area&&mapping.nativeFamilyBinding).flatMap(mapping=>{
  const declared=operations.find(operation=>operation.id===mapping.nativeFamilyBinding.operation);if(!declared)return [];
  return operations.filter(operation=>operation.act==='make'&&!operation.requires?.length&&operation.on===declared.on&&(operation.id===declared.id||operation.knowledgeInputs?.length)).filter(operation=>!operation.params.kind||operation.params.kind.enum?.includes(mapping.lemma)).map(operation=>({mapping,operation}));
 });
}
