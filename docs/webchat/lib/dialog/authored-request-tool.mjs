// An authored circuit bypasses language inference and uses the same graph validator as a reader.
import {parse,readValue,serializeRequestGraph} from '../vendor/sopworld/sopworld.mjs?v=14e619cf45';

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
    const act=roots[0].attrs.act?.[0];
    if (['undo','redo'].includes(act) && (roots[0].attrs.mood?.[0]!=='do' ||
      wires.some(w=>!['std.request','std.request.source'].includes(w.type)))) return {reason:'history-scope'};
    const nodes=wires.map(({id,type,attrs})=>({id,type,attrs:Object.fromEntries(
      Object.entries(attrs).map(([key,values])=>[key,values.map(token=>{
        const {kind,v}=readValue(token);
        return {kind:kind==='atom'?'literal':kind,value:v};
      })])
    )}));
    const graph=serializeRequestGraph({request:roots[0].id,nodes});
    return graph.ok?{candidate:{request:roots[0].id,wires:graph.wires}}:{reason:graph.issues[0]?.reason??'invalid-request'};
  } catch {return {reason:'invalid-request'};}
}
