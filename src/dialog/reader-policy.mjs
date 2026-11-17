// Owner decisions, Review29. One application policy; empirical rates are not individual confidence.
export const READER_POLICY=Object.freeze({
  maxErrorRate:0.05,destructiveMaxErrorRate:0.01,
  destructiveActs:Object.freeze(['remove','delete','overwrite','clear']),
  clarification:'never',uncalibratedAction:'reversible-best-effort',
});
export function destructiveRequest(candidate,parse,str) {
  return parse(candidate.wires).some(w=>w.type==='std.request'&&READER_POLICY.destructiveActs.includes(str(w.attrs.act?.[0])));
}
