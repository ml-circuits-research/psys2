// SPDX-License-Identifier: AGPL-3.0-only
import {parse, str} from '../lib/vendor/sopworld/sopworld.mjs?v=7950b62b94';
import {readNativeIntent} from '../lib/dialog/native-intent-reader.mjs?v=347d66630a';
import {copyHostData, validateNativeArguments, validHostId as text, checkOperation} from './native-tool-arguments.mjs?v=6320f46276';
export {copyHostData, validateNativeArguments, nativeToken} from './native-tool-arguments.mjs?v=6320f46276';

export function toolInvocationContext(invocation, expectedVersion) {
 if (!text(invocation) || !text(expectedVersion)) throw Error('invalid-tool-invocation');
 return '@invoke app.control.invocation id=' + JSON.stringify(invocation) + ' version=' + JSON.stringify(expectedVersion);
}

function readInvocation(context) {
 if (typeof context !== 'string' || context.length > 65536) throw Error('invalid-tool-invocation');
 const nodes = parse(context);
 const node = nodes[0];
 if (nodes.length !== 1 || node.pattern || node.type !== 'app.control.invocation' ||
     Object.keys(node.attrs).length !== 2) throw Error('invalid-tool-invocation');
 return ['id','version'].map(key => {
  const tokens = node.attrs[key];
  if (tokens?.length !== 1 || !tokens[0].startsWith('"')) throw Error('invalid-tool-invocation');
  const value = str(tokens[0]);
  if (!text(value)) throw Error('invalid-tool-invocation');
  return value;
 });
}

export function createNativeToolHost({state,instanceId,scope,operations,toolInterface,handlers,view,spatial=null,measure=null,identityRegistry=new Map(),validate=null,maxObjects=10000,maxBytes=4000000}={}) {
 if(measure!==null&&typeof measure!=='function')throw new TypeError('invalid-spatial-measurement');
 if(spatial!==null&&typeof spatial!=='function')throw new TypeError('invalid-spatial-observer');
 if(validate!==null&&typeof validate!=='function')throw new TypeError('invalid-policy-validator');
 if(!Number.isSafeInteger(maxObjects)||maxObjects<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('invalid-host-budget');
 if(!text(instanceId)||!text(scope)||!state||Object.getPrototypeOf(state)!==Object.prototype)throw new TypeError('host-identity-required');
 const copy=value=>copyHostData(value,{maxBytes});const declared=copy(toolInterface?.bindings??operations),byId=new Map();
 if(!Array.isArray(declared)||!handlers||typeof handlers!=='object'||typeof view!=='function')throw new TypeError('invalid-tool-declaration');
 for(const op of declared){checkOperation(op);if(!text(op.id)||byId.has(op.id)||!handlers[op.id]||typeof handlers[op.id]!=='function')throw new TypeError('invalid-tool-declaration');byId.set(op.id,op);}
 if(!identityRegistry.has(scope))identityRegistry.set(scope,{sequence:0,live:new Map()});
 const identity=identityRegistry.get(scope),{live}=identity;
 let fingerprint,revision=0;const receipts=new Map();
 const snapshot=()=>{
  const data=copy(state),mark=JSON.stringify(data);if(mark.length>maxBytes)throw new RangeError('host-data-budget');
  const records=copy(view(data));if(!Array.isArray(records)||records.length>maxObjects)throw new TypeError('host-population-budget');
  const ids=new Set();for(const row of records){if(!text(row.id)||!text(row.kind)||!text(row.sourceType)||ids.has(row.id)||(row.inputs!==undefined&&!Array.isArray(row.inputs)))throw new TypeError('invalid-host-identity');ids.add(row.id);}
  if(fingerprint!==undefined&&fingerprint!==mark)revision++;fingerprint=mark;
  for(const id of live.keys())if(!ids.has(id))live.delete(id);
  const version=String(revision),objects=records.map(row=>{if(!live.has(row.id))live.set(row.id,++identity.sequence);const source=JSON.stringify([instanceId,scope,row.id,live.get(row.id)]);return {...row,source,version,inputs:(row.inputs||[]).map(input=>({...input,source,sourceType:row.sourceType,version}))};});
  return {instanceId,version,scope,complete:true,objects};
 };
 const invoke=(sop,context)=>{
  const refuse=reason=>({status:'refused',reason,verification:'unverified'});
  let call;
  try {
   const [invocation,expectedVersion] = readInvocation(context);
   const {operation,args} = readNativeIntent(sop,{operations:declared});
   call = {invocation,expectedVersion,operation,args};
  } catch (error) {
   const message = String(error.message);
   return refuse(message.startsWith('invalid-control-arguments:') ? message.slice('invalid-control-arguments:'.length) : message);
  }
  const payload=JSON.stringify(call),previous=receipts.get(call.invocation);if(previous)return previous.payload===payload?{...copy(previous.receipt),replayed:true}:refuse('invocation-reused');
  if(receipts.size>=10000)return refuse('receipt-budget');const op=byId.get(call.operation);if(!op)return refuse('undeclared-operation');
  const admitted=validateNativeArguments(op,call.args,{maxBytes});if(!admitted.ok)return refuse(admitted.reason);
  const args=admitted.args;
  let before,staged,result,validation=null,effects=[];
  try{before=snapshot();if(before.version!==call.expectedVersion)return refuse('stale-observation');staged=copy(state);result=handlers[call.operation]({state:staged,request:(name,args)=>effects.push({name,args}),effect:(name,args)=>effects.push({name,args})},args,call.invocation);if(!result||result.status!=='supported')return refuse(result?.code||result?.reason||'native-refusal');copy(staged);if(validate){validation=copy(validate(copy(staged)));if(typeof validation?.ok!=='boolean')return refuse('invalid-policy-result');if(!validation.ok)return {...refuse(validation.code||'policy-denied'),validation};}if(JSON.stringify(staged).length>maxBytes)return refuse('host-data-budget');const projected=view(copy(staged));if(!Array.isArray(projected)||projected.length>maxObjects)return refuse('host-population-budget');const ids=new Set();for(const row of projected){if(!text(row.id)||!text(row.kind)||!text(row.sourceType)||ids.has(row.id)||(row.inputs!==undefined&&!Array.isArray(row.inputs)))return refuse('invalid-host-identity');ids.add(row.id);}copy(projected);copy(effects);copy(result.changed||[]);copy(result.data??null);}
  catch{return refuse('native-error');}
  const changed=JSON.stringify(staged)!==fingerprint;
  if(changed){
   for(const key of Reflect.ownKeys(state)){const d=Object.getOwnPropertyDescriptor(state,key);if(!Object.hasOwn(staged,key)?!d.configurable:!d.writable)return refuse('immutable-state');}
   if(!Object.isExtensible(state)&&Object.keys(staged).some(k=>!Object.hasOwn(state,k)))return refuse('immutable-state');
   for(const key of Object.keys(state))if(!Object.hasOwn(staged,key))delete state[key];
   for(const [key,value] of Object.entries(staged)){const d=Object.getOwnPropertyDescriptor(state,key);Object.defineProperty(state,key,{value,enumerable:true,writable:true,configurable:d?d.configurable:true});}
  }
  const after=snapshot(),receipt={status:changed?'changed':'unchanged',verification:'unverified',invocation:call.invocation,operation:call.operation,instanceId,beforeVersion:before.version,afterVersion:after.version,before,after,validation,changed:copy(result.changed||[]),effects:copy(effects),data:copy(result.data??null)};
  receipts.set(call.invocation,{payload,receipt});return copy(receipt);
 };
 const geometryLease=spatial?globalThis.crypto.randomUUID():null;
 const readSpatialRevision=observation=>geometryLease+':'+observation.version;
 const observeSpatial=()=>{
  const observation=snapshot();
  const geometry=copy(spatial(copy(state),observation.objects));
  const tag={frame:geometry.frame,instance:observation.instanceId,revision:readSpatialRevision(observation)};
  return {observation,...geometry,revision:tag.revision,
   boxes:geometry.boxes.map(box=>({...tag,...box})),
   points:(geometry.points??[]).map(point=>({...tag,...point})),
   relations:(geometry.relations??[]).map(relation=>({...tag,...relation})),
  };
 };
 snapshot();return Object.freeze({observe:()=>copy(snapshot()),invoke,bindings:()=>copy(declared),
  ...(toolInterface?{capabilityFacts:scope=>copy(toolInterface.capabilityFacts(scope))}:{}),
  ...(measure?{measureSpatial(sop){
   const {operation,args}=readNativeIntent(sop,{operations:declared});
   return measure(operation,args);
  }}:{}),
  ...(spatial?{observeSpatial,spatialRevision:()=>readSpatialRevision(snapshot())}:{})});
}
