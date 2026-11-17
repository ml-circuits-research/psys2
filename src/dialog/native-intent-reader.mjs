// Exact interpreter for declared UI intent wires; it never guesses words or operations.
import{parse,str}from'../vendor/sopworld/sopworld.mjs';
export function readNativeIntent(wires){
 if(typeof wires!=='string'||wires.length>4000000)throw Error('invalid-control-intent');
 const nodes=parse(wires);if(nodes.length>10000)throw Error('control-intent-budget');
 const byId=new Map(nodes.map(n=>[n.id,n]));if(byId.size!==nodes.length)throw Error('duplicate-control-node');
 const intents=nodes.filter(n=>n.type==='app.control.intent');if(intents.length!==1)throw Error('one-control-intent-required');
 const value=(n,key)=>{const vs=n?.attrs?.[key];if(!Array.isArray(vs)||vs.length!==1)throw Error('missing-control-field:'+key);return str(vs[0]);};
 const ref=token=>{if(typeof token!=='string'||!token.startsWith('$')||!byId.has(token.slice(1)))throw Error('invalid-control-reference');return byId.get(token.slice(1));};
 let visited=0;const decode=(node,depth=0)=>{
  if(depth>32||++visited>10000||node?.type!=='app.control.value')throw Error('control-value-budget');
  const kind=value(node,'kind');
  if(kind==='null')return null;if(kind==='string')return value(node,'string');
  if(kind==='number'){const n=Number(value(node,'number'));if(!Number.isFinite(n))throw Error('nonfinite-control-number');return n;}
  if(kind==='boolean'){const b=value(node,'boolean');if(!['true','false'].includes(b))throw Error('invalid-control-boolean');return b==='true';}
  const children=(node.attrs.member??[]).map(t=>ref(str(t)));
  if(kind==='array'){const indexes=children.map(n=>Number(value(n,'index')));if(indexes.some((n,i)=>n!==i))throw Error('invalid-control-array-order');return children.map(n=>decode(n,depth+1));}
  if(kind==='object'){const pairs=children.map(n=>[value(n,'key'),decode(n,depth+1)]);if(new Set(pairs.map(([k])=>k)).size!==pairs.length)throw Error('duplicate-control-object-key');return Object.fromEntries(pairs);}
  throw Error('invalid-control-value-kind');
 };
 const root=intents[0],args={};for(const token of root.attrs.argument??[]){const n=ref(str(token));if(n.type!=='app.control.argument')throw Error('invalid-control-argument');const key=value(n,'parameter');if(Object.hasOwn(args,key))throw Error('duplicate-control-parameter');Object.defineProperty(args,key,{value:decode(ref(value(n,'value'))),enumerable:true,configurable:true,writable:true});}
 if(value(root,'mood')!=='do')throw Error('invalid-control-mood');
 const source=ref(value(root,'source'));if(source.type!=='app.control.source')throw Error('invalid-control-source');
 return {operation:value(root,'operation'),act:value(root,'act'),sourceType:value(root,'on'),args,text:value(source,'text')};
}
