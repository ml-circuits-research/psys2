// An authored circuit bypasses language inference and uses the same graph validator as a reader.
import {parse,serializeRequestGraph} from '../vendor/sopworld/sopworld.mjs';

export function isAuthoredRequest(text) {
  return typeof text==='string' && /^\s*@\S+\s+std\.request(?:\s|\.)/.test(text);
}

export function readAuthoredRequest(text) {
  if (text.length>65536) return {reason:'request-budget'};
  try {
    const wires=parse(text);
    const roots=wires.filter(w=>w.type==='std.request');
    if (roots.length!==1||wires.length>256) return {reason:'request-root'};
    if (wires.some(w=>w.pattern)) return {reason:'request-pattern'};
    const graph=serializeRequestGraph(text);
    return graph.ok?{candidate:{request:graph.request,wires:graph.wires}}:{reason:graph.issues[0]?.reason??'invalid-request'};
  } catch {return {reason:'invalid-request'};}
}
