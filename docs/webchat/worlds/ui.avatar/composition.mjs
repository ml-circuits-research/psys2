// Knowledge-driven composition helpers. No emotion or character names are encoded here.
export function expressionParts(data,face,name){
 const expression=data.expressions[name];if(!expression)return null;
 if(!expression.goals?.length)return {...expression.over};
 const grouped=new Map();for(const goal of expression.goals){if(!grouped.has(goal.slot))grouped.set(goal.slot,[]);grouped.get(goal.slot).push(goal);}
 const over={};for(const [slot,goals]of grouped){const candidates=(data.slots.find(s=>s.name===slot)?.variants??[]).filter(v=>v.parts?.length&&goals.every(goal=>(v.features?.[goal.property]??[]).includes(goal.value)));if(!candidates.length)return null;const current=face.expressionParts?.[slot]??face.slots[slot];over[slot]=candidates.find(v=>v.name===current)?.name??candidates[0].name;}
 return over;
}
export function compositionOverrides(data,face){
 const base=data.presets[face.base],explicit=face.explicit??{slots:[],roles:[],paint:[]};
 return {slots:[...new Set([...explicit.slots,...Object.entries(face.slots).filter(([key,value])=>value!==(base?.slots[key]??'none')).map(([key])=>key)])],roles:[...new Set([...explicit.roles,...Object.entries(face.colours).filter(([key,value])=>value!==base?.colours[key]).map(([key])=>key)])],paint:[...new Set([...explicit.paint,...Object.keys(face.paint??{})])]};
}
export function compositionBase(data,face,{kind,base},available){
 if(base)return data.presets[base]&&(!kind||data.presets[base].kind===kind)?base:null;
 const choices=available.filter(name=>data.presets[name].kind===kind);if(!choices.length)return null;
 return [...choices].sort((a,b)=>{const score=name=>Object.entries(data.presets[name].slots).filter(([slot,value])=>face.slots[slot]===value).length;return score(b)-score(a);})[0];
}
