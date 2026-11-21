// Application admission view, after public standard-request validation.
// Unsupported semantics remain explicit; this is not another request validator.
import { parse, str } from '../vendor/sopworld/sopworld.mjs?v=d86f897e0e';
const fields={
 'std.request':['act','mood','source','root'],
 'std.request.source':['text'],
 'std.request.target':['request','mode','kind','name','determiner','selector','source','source.start','source.end'],
 'std.request.constraint':['request','target','concept','operator','value','character','polarity','source','source.start','source.end'],
};
const one=(wire,key)=>wire.attrs[key]?.length===1?str(wire.attrs[key][0]):null;
const reference=(wire,key)=>wire.attrs[key]?.length===1&&wire.attrs[key][0].startsWith('$')?wire.attrs[key][0].slice(1):null;
export function flatRequestProjection(entry){
 let wires;try{wires=parse(entry.wires);}catch{return {ok:false,reason:'invalid-request-data'};}
 const unsupported=wires.flatMap(wire=>!fields[wire.type]?[{id:wire.id,type:wire.type}]:Object.keys(wire.attrs).filter(key=>!fields[wire.type].includes(key)).map(key=>({id:wire.id,key})));
 if(unsupported.length)return {ok:false,reason:'unsupported-semantic-fields',diagnostics:unsupported};
 const request=wires.find(w=>w.id===entry.request&&w.type==='std.request');
 if(!request)return {ok:false,reason:'missing-request'};
 const targets=wires.filter(w=>w.type==='std.request.target'),constraints=wires.filter(w=>w.type==='std.request.constraint');
 const selectorIds=new Set(targets.map(w=>reference(w,'selector')).filter(Boolean));
 const result=constraints.filter(w=>!selectorIds.has(w.id));
 const root=reference(request,'root');
 if(root&&(result.length!==1||result[0].id!==root))return {ok:false,reason:'unsupported-result-closure'};
 if(targets.some(t=>reference(t,'selector')&&!constraints.some(c=>c.id===reference(t,'selector'))))return {ok:false,reason:'unsupported-selector-closure'};
 const condition=wire=>({id:wire.id,target:reference(wire,'target'),concept:one(wire,'concept'),operator:one(wire,'operator'),value:one(wire,'value'),tokens:[...(wire.attrs.value||[])],character:one(wire,'character'),polarity:one(wire,'polarity'),wire});
 return {ok:true,request:{id:request.id,act:one(request,'act'),mood:one(request,'mood'),wire:request},
  targets:targets.map(w=>({id:w.id,mode:one(w,'mode'),kind:one(w,'kind'),name:one(w,'name'),determiner:one(w,'determiner'),selector:constraints.filter(c=>c.id===reference(w,'selector')).map(condition),wire:w})),
  results:result.map(condition),sources:wires.filter(w=>w.type==='std.request.source'),wires,
  fields:wires.flatMap(w=>Object.keys(w.attrs).map(k=>JSON.stringify([w.id,k])))};
}
