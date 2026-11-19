// Exact interpreter for declared UI intent wires; it never guesses words or operations.
import{decodeCapabilityCall}from'../vendor/sopworld/capability-call.mjs?v=ed3b773c65';
import{parse,str}from'../vendor/sopworld/sopworld.mjs?v=851c80bc87';
import{copyHostData,validateNativeArguments}from'../../worlds/native-tool-arguments.mjs?v=6320f46276';
const identifier=/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$/;
const forbidden=new Set(['__proto__','constructor','prototype']);
const numberToken=v=>Object.is(v,-0)?'-0':String(v);
const primitive=v=>v===null||['string','number','boolean'].includes(typeof v);
const token=v=>typeof v==='string'?JSON.stringify(v):typeof v==='number'?numberToken(v):String(v);
const expandedRequired=(args,params={})=>Object.entries(args).some(([key,v])=>Array.isArray(v)?v.length===0||v.some(x=>!primitive(x)):v!==null&&typeof v==='object'||v===null&&params[key]?.type==='array');
function declaration(operation,compact=false){
 const op=copyHostData(operation);
 if(!op||!(compact?['id']:['id','act','on']).every(k=>typeof op[k]==='string'&&identifier.test(op[k]))||!op.params||Object.keys(op.params).some(k=>!identifier.test(k)||forbidden.has(k))||validateNativeArguments(op,{}).reason==='invalid-native-declaration-or-data')throw Error('invalid-control-declaration');
 return op;
}
function admitted(op,args){
 const result=validateNativeArguments(op,args);
 if(!result.ok)throw Error('invalid-control-arguments:'+result.reason);
 return result.args;
}
/** Repeated attributes are arrays only when the tool declaration says so. */
export function compactNativeIntent(operation,args,{id=operation?.act}={}){
 const op=declaration(operation),values=admitted(op,args);
 if(!identifier.test(id)||forbidden.has(id))throw Error('invalid-control-wire-id');
 if(expandedRequired(values,op.params))return null;
 let count=0;
 const fields=Object.entries(values).flatMap(([key,value])=>(Array.isArray(value)?value:[value]).map(v=>{if(++count>10000)throw Error('control-value-budget');return `${key}=${token(v)}`;}));
 const wire=`@${id} ${op.id}${fields.length?' '+fields.join(' '):''}`;
 if(wire.length>4000000)throw Error('invalid-control-intent');
 return wire;
}
function primitiveValue(token){
 if(typeof token!=='string')throw Error('invalid-control-token');
 if(token.startsWith('"'))return str(token);
 if(token==='null')return null;
 if(token==='true'||token==='false')return token==='true';
 if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token))throw Error('invalid-control-primitive');
 const value=Number(token);if(!Number.isFinite(value))throw Error('nonfinite-control-number');return value;
}
export function readNativeIntent(wires,{operation,operations}={}){
 if(typeof wires!=='string'||wires.length>4000000)throw Error('invalid-control-intent');
 const nodes=parse(wires);if(nodes.length>10000)throw Error('control-intent-budget');
 if(nodes.some(n=>n.pattern||Object.keys(n.attrs).some(k=>forbidden.has(k))))throw Error('invalid-control-wire');
 function matchingOperation(id,compact=false){
  if(operation)return declaration(operation,compact);
  if(!operations)return null;
  const matches=operations.filter(candidate=>candidate.id===id);
  if(matches.length!==1)throw Error('undeclared-native-control');
  return declaration(matches[0],compact);
 }
 if(nodes.some(node=>node.type==='std.capability.call')){
  // A tool accepts one concrete call and its owned values. Compiler reports have a separate owner.
  const call=decodeCapabilityCall(nodes);
  if(call.reason)throw Error(call.reason);
  if(call.wires.length!==nodes.length)throw Error('unowned-call-wire');
  const op=matchingOperation(call.operation,true);
  if(!op||op.id!==call.operation)throw Error('undeclared-native-control');
  return {operation:op.id,act:op.act,sourceType:op.on,args:admitted(op,call.args),text:null};
 }
 if(nodes.length===1){
  const node=nodes[0],op=matchingOperation(node.type,true),args={};let count=0;
  if(!op)throw Error('control-declaration-required');
  if(node.type!==op.id)throw Error('control-operation-mismatch');
  for(const [key,tokens]of Object.entries(node.attrs)){
   if(!Object.hasOwn(op.params,key))throw Error('unknown-control-parameter:'+key);
   if((count+=tokens.length)>10000)throw Error('control-value-budget');
   if(op.params[key].type!=='array'&&tokens.length!==1)throw Error('duplicate-control-parameter');
   args[key]=op.params[key].type==='array'?tokens.map(primitiveValue):primitiveValue(tokens[0]);
  }
  return {operation:op.id,act:op.act,sourceType:op.on,args:admitted(op,args),text:null};
 }
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
  if(kind==='object'){const pairs=children.map(n=>[value(n,'key'),decode(n,depth+1)]);if(pairs.some(([k])=>forbidden.has(k)))throw Error('invalid-control-object-key');if(new Set(pairs.map(([k])=>k)).size!==pairs.length)throw Error('duplicate-control-object-key');return Object.fromEntries(pairs);}
  throw Error('invalid-control-value-kind');
 };
 const root=intents[0],args={};for(const token of root.attrs.argument??[]){const n=ref(str(token));if(n.type!=='app.control.argument')throw Error('invalid-control-argument');const key=value(n,'parameter');if(forbidden.has(key))throw Error('invalid-control-parameter');if(Object.hasOwn(args,key))throw Error('duplicate-control-parameter');Object.defineProperty(args,key,{value:decode(ref(value(n,'value'))),enumerable:true,configurable:true,writable:true});}
 if(value(root,'mood')!=='do')throw Error('invalid-control-mood');
 const source=ref(value(root,'source'));if(source.type!=='app.control.source')throw Error('invalid-control-source');
 const result={operation:value(root,'operation'),act:value(root,'act'),sourceType:value(root,'on'),args,text:value(source,'text')};
 const op=matchingOperation(result.operation);
 if(!expandedRequired(args,op?.params))throw Error('compact-control-intent-required');
 if(op){if(result.operation!==op.id||result.act!==op.act||result.sourceType!==op.on)throw Error('control-operation-mismatch');result.args=admitted(op,args);}
 return result;
}
