// Preserve declared alternatives for reversible best-effort interpretation; the strict bridge can still abstain.
export function nativeKindCandidates(bindings) {
 return [...bindings.kinds,...(bindings.unresolved??[]).filter(r=>r.family==='kinds'&&r.reason==='ambiguous-canonical-kind'&&r.rawDescriptor).flatMap(r=>(r.candidates??[]).filter(c=>c.nativeFamilyBinding).map(c=>({...c,area:r.rawDescriptor.area,type:r.rawDescriptor.type,lemma:r.rawDescriptor.kind})))];
}
