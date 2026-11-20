// Typed UI intent capture. No language parser, model inference or optimistic effect claims.
import {budget} from './budget.mjs?v=00bce6e369';
import {copyHostData,validateNativeArguments,toolInvocationContext} from '../../worlds/native-tool-host.mjs?v=f5de6de16f';
import {compactNativeIntent} from './native-intent-reader.mjs?v=ee1685a128';

import {historyControlQuery} from './history-control-query.mjs?v=227273ef37';

// The page calls this with its gesture and the active editor's declared interface.
export async function editorGestureSop(operation,args,loadDeclarations){
 const history=historyControlQuery(operation);
 if(history)return history;
 const declaration=(await loadDeclarations()).find(entry=>entry.id===operation);
 if(!declaration)throw Error('undeclared-native-control');
 return historyControlQuery(declaration.act)??describeNativeControl({operation:declaration,args}).wires;
}

export const NATIVE_CONTROL_INTENT_FORMAT='psys2.native-control-intent/1';
export const NATIVE_CONTROL_INTENT_SCHEMA=`
@app.control.invocation core.type of=app.control.invocation closed=true
@app.control.invocation.id core.slot of=app.control.invocation key=id kind=string present=true
@app.control.invocation.version core.slot of=app.control.invocation key=version kind=string present=true
@app.control.source core.type
@app.control.source.text core.slot of=app.control.source key=text kind=string required=true
@app.control.intent core.type
@app.control.intent.operation core.slot of=app.control.intent key=operation kind=string required=true
@app.control.intent.act core.slot of=app.control.intent key=act kind=string required=true
@app.control.intent.mood core.slot of=app.control.intent key=mood kind=string required=true
@app.control.intent.on core.slot of=app.control.intent key=on kind=string required=true
@app.control.intent.source core.slot of=app.control.intent key=source type=app.control.source required=true
@app.control.intent.instance core.slot of=app.control.intent key=instance kind=string
@app.control.intent.version core.slot of=app.control.intent key=version kind=string
@app.control.intent.argument core.slot of=app.control.intent key=argument type=app.control.argument many=true
@app.control.intent.target core.slot of=app.control.intent key=target type=app.control.target many=true
@app.control.argument core.type
@app.control.argument.parameter core.slot of=app.control.argument key=parameter kind=string required=true
@app.control.argument.value core.slot of=app.control.argument key=value type=app.control.value required=true
@app.control.argument.start core.slot of=app.control.argument key=source.start kind=integer min=0
@app.control.argument.end core.slot of=app.control.argument key=source.end kind=integer min=0
@app.control.argument.origin core.slot of=app.control.argument key=source.origin kind=string
@app.control.value core.type
@app.control.value.kind core.slot of=app.control.value key=kind kind=string required=true
@app.control.value.string core.slot of=app.control.value key=string kind=string
@app.control.value.number core.slot of=app.control.value key=number kind=number
@app.control.value.boolean core.slot of=app.control.value key=boolean kind=boolean
@app.control.value.member core.slot of=app.control.value key=member type=app.control.value many=true
@app.control.value.index core.slot of=app.control.value key=index kind=integer min=0
@app.control.value.key core.slot of=app.control.value key=key kind=string
@app.control.value.observed core.slot of=app.control.value key=observed.id kind=string
@app.control.value.observedSource core.slot of=app.control.value key=observed.source kind=string
@app.control.target core.type
@app.control.target.mode core.slot of=app.control.target key=mode kind=string required=true
@app.control.target.id core.slot of=app.control.target key=id kind=string
@app.control.target.on core.slot of=app.control.target key=on kind=string required=true
@app.control.target.source core.slot of=app.control.target key=source kind=string
@app.control.target.version core.slot of=app.control.target key=version kind=string
`;
const own=(o,k)=>Object.hasOwn(o,k),quote=value=>JSON.stringify(value);
function canonical(value,depth=0){
 if(depth>32)throw Error('native-intent-comparison-depth');
 return Array.isArray(value)?value.map(v=>canonical(v,depth+1)):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],depth+1)])):value;
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const readable=value=>typeof value==='string'?quote(value):typeof value==='number'&&Object.is(value,-0)?'-0':JSON.stringify(value);
const words=value=>String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[._-]+/g,' ').toLowerCase();
const verbs={group:'Group',ungroup:'Ungroup',make:'Create',change:'Update',place:'Move',remove:'Delete',pick:'Select',ask:'Show',undo:'Undo',redo:'Redo'};
const validObservation=o=>!!o&&o.complete===true&&typeof o.instanceId==='string'&&typeof o.version==='string'&&Array.isArray(o.objects);
const resultIdentity=(op,args)=>{const key=Object.hasOwn(op.result??{},'identityParameter')?op.result.identityParameter:'id';return key===null?undefined:args[key];};
const selectedIds=(op,args)=>op.act==='make'?[]:typeof args.id==='string'?[args.id]:Array.isArray(args.ids)&&args.ids.every(x=>typeof x==='string')?[...args.ids]:[];
const observationValue=token=>{try{return {ok:true,value:JSON.parse(token)};}catch{return {ok:false};}};

/** Exact UI gesture -> human command and declaration-driven SOP command.
 * The expanded trace retains nested arguments, observations and source ranges. */
export function describeNativeControl({operation,args={},before,parameterBindings=[]}={}){
 const op=copyHostData(operation),input=copyHostData(args),observation=before?copyHostData(before):null,bindings=copyHostData(parameterBindings);
 if(!op||typeof op.id!=='string'||typeof op.act!=='string'||typeof op.on!=='string'||!Array.isArray(bindings))throw Error('invalid-native-intent-declaration');
 const admitted=validateNativeArguments(op,input),values=admitted.ok?admitted.args:input;
 const objects=validObservation(observation)?observation.objects:[],ids=selectedIds(op,values),targets=ids.map(id=>{
  const found=objects.find(o=>o.id===id&&o.sourceType===op.on);
  return {mode:'existing',id,on:op.on,...(found?{source:found.source,version:found.version}:{})};
 });
 if(op.act==='make')targets.push({mode:'new',on:op.on,...(typeof resultIdentity(op,values)==='string'?{id:resultIdentity(op,values)}:{})});
 const displayName=id=>{
  const object=objects.find(o=>o.id===id),label=['label','title','name'].map(key=>object?.inputs?.find(i=>i.key===key&&i.values?.length===1&&typeof observationValue(i.values[0]).value==='string'&&observationValue(i.values[0]).value.trim()!=='')).find(Boolean),decoded=label?observationValue(label.values[0]):null;
  return decoded?.ok?decoded.value:null;
 };
 const type=op.intent?.subject??words(op.on.split('.').at(-1)),targetText=ids.length?ids.map(id=>readable(displayName(id)??id)).join(', '):`${op.intent?.determiner??(/^[aeiou]/i.test(type)?'an':'a')} ${type}`;
 let text=`${op.intent?.verb??verbs[op.act]??'Apply'} ${targetText}`,ranges=[];
 const fields=Object.entries(values).filter(([key,value])=>(!['id','ids'].includes(key)||op.intent?.parameters?.[key]?.role==='source')&&op.intent?.parameters?.[key]?.hidden!==true&&!(op.intent?.parameters?.[key]?.hiddenIfEmpty&&(value===''||Array.isArray(value)&&value.length===0)));
 const modifiers={name:'named',label:'named',title:'titled',colour:'coloured',color:'coloured',kind:'of kind',type:'of type'};
 for(const [index,[parameter,value]]of fields.entries()){
  text+=index?', ':' ';
  const metadata=op.intent?.parameters?.[parameter],modifier=metadata?.label??modifiers[parameter]??'with '+words(parameter);
  text+=modifier+' ';let rendered=readable(value),origin='text';
  if(metadata?.reference===true&&typeof value==='string'&&displayName(value)!==null){rendered=readable(displayName(value));origin='observed-identity-label';}
  else if(metadata?.reference===true&&Array.isArray(value)){rendered=value.map(v=>readable(displayName(v)??v)).join(', ');origin='observed-identity-labels';}
  else if(metadata?.format==='unix-ms'&&Number.isSafeInteger(value)){rendered=quote(new Date(value).toISOString());origin='declared-time-format';}
  else if(metadata?.format==='duration-ms'&&typeof value==='number'){rendered=`${value/60000} minutes`;origin='declared-duration-format';}
  const start=Array.from(text).length;text+=rendered;ranges.push({parameter,start,end:Array.from(text).length,rendered,origin});
 }
 text+='.';
 const lines=[`@control.source app.control.source text=${quote(text)}`],valueRows=[];let sequence=0;
 const encode=(value,extra='')=>{
  const id=`control.value.${sequence++}`,kind=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(sequence>10000)throw Error('native-intent-value-budget');
  let attrs=`kind=${quote(kind)}${extra}`;
  if(kind==='string'){
   attrs+=` string=${quote(value)}`;
   const found=objects.find(o=>o.id===value);if(found)attrs+=` observed.id=${quote(found.id)} observed.source=${quote(found.source)}`;
  }else if(kind==='number')attrs+=` number=${Object.is(value,-0)?'-0':value}`;
  else if(kind==='boolean')attrs+=` boolean=${value}`;
  else if(kind==='array')for(const [index,child]of value.entries())attrs+=` member=$${encode(child,` index=${index}`)}`;
  else if(kind==='object')for(const [key,child]of Object.entries(value))attrs+=` member=$${encode(child,` key=${quote(key)}`)}`;
  valueRows.push(`@${id} app.control.value ${attrs}`);return id;
 };
 const argumentsRows=Object.entries(values).map(([parameter,value],index)=>{
  const range=ranges.find(r=>r.parameter===parameter),id=`control.argument.${index}`,valueId=encode(value);
  lines.push(`@${id} app.control.argument parameter=${quote(parameter)} value=$${valueId}${range?` source.start=${range.start} source.end=${range.end} source.origin=${quote(range.origin)}`:''}`);return id;
 });
 const targetRows=targets.map((target,index)=>{const id=`control.target.${index}`;lines.push(`@${id} app.control.target ${Object.entries(target).map(([k,v])=>`${k}=${quote(v)}`).join(' ')}`);return id;});
 lines.push(...valueRows,`@control.intent app.control.intent operation=${quote(op.id)} act=${quote(op.act)} mood="do" on=${quote(op.on)} source=$control.source${validObservation(observation)?` instance=${quote(observation.instanceId)} version=${quote(observation.version)}`:''}${argumentsRows.map(id=>` argument=$${id}`).join('')}${targetRows.map(id=>` target=$${id}`).join('')}`);
 const expandedWires=lines.join('\n'),compact=admitted.ok?compactNativeIntent(op,values,{id:(verbs[op.act]??op.act).toLowerCase()}):null;
 return {format:NATIVE_CONTROL_INTENT_FORMAT,text,wires:compact??expandedWires,expandedWires,schema:compact?op.id:'app.control.intent',semantics:'exact declared tool command; execution requires its matching declaration',expected:{operation:op.id,act:op.act,sourceType:op.on,args:values,providedArgs:input,defaults:admitted.defaults??[],validArguments:admitted.ok,argumentIssue:admitted.ok?null:admitted.reason,declaration:op,targets,parameterBindings:bindings,before:validObservation(observation)?{instanceId:observation.instanceId,version:observation.version}:null},sourceRanges:ranges};
}

/** Compare exact intended arguments with independently read native effects.
 * Unobservable fields, aggregate codecs and history meanings remain unverified. */
export function verifyNativeControlEffect({intent,before,after,receipt}={}){
 const checks=[],add=(parameter,status,detail={})=>checks.push({parameter,status,...detail});
 const finish=(status,reason)=>({status,reason,checks,modelInvoked:false});
 if(intent?.format!==NATIVE_CONTROL_INTENT_FORMAT||!intent.expected)return finish('unverified','missing-typed-intent');
 const expected=intent.expected;
 if(!validObservation(before)||!validObservation(after)||before.instanceId!==after.instanceId||expected.before?.instanceId!==before.instanceId||expected.before?.version!==before.version)return finish('unverified','observation-source-mismatch');
 if(receipt?.operation!==undefined&&receipt.operation!==expected.operation)return finish('mismatch','different-tool-operation');
 if(receipt?.instanceId!==undefined&&receipt.instanceId!==before.instanceId)return finish('unverified','receipt-source-mismatch');
 if(receipt?.beforeVersion!==undefined&&receipt.beforeVersion!==before.version||receipt?.afterVersion!==undefined&&receipt.afterVersion!==after.version)return finish('unverified','receipt-version-mismatch');
 if(receipt?.status==='refused'||receipt?.ok===false){
  if(!equal(before,after))return finish('mismatch','refusal-changed-observed-state');
  return finish('refused',receipt.reason??receipt.issue?.code??'tool-refused');
 }
 if(!['changed','unchanged','executed','supported'].includes(receipt?.status))return finish('unverified','missing-successful-receipt');
 if(!expected.validArguments)return finish('mismatch','invalid-arguments-were-applied');
 if(expected.declaration.effectScope?.projection==='composite'){add('$scope','unknown',{reason:'declared-composite-effect-needs-independent-projection'});return finish('unverified','composite-effect-needs-independent-projection');}
 const op=expected.declaration,args=expected.args,ids=selectedIds(op,args),old=new Map(before.objects.map(o=>[o.id,o])),next=new Map(after.objects.map(o=>[o.id,o]));
 const selectionPolicy=op.act==='pick'?op.effectScope?.selection:null;
 let targets=[];
 if(op.act==='make'){
  targets=after.objects.filter(o=>o.sourceType===op.on&&!old.has(o.id)&&(resultIdentity(op,args)===undefined||o.id===resultIdentity(op,args)));
  add('$target',targets.length===1?'met':targets.length===0?'failed':'unknown',{reason:'created-source-type-and-identity',ids:targets.map(o=>o.id)});
 }else if(ids.length){
  for(const id of ids){const a=old.get(id),b=next.get(id);if(!a||a.sourceType!==op.on){add('$target','unknown',{id,reason:'target-not-observed-before'});continue;}
   if(op.act==='remove')add('$target',b?'failed':'met',{id,reason:'removed-observed-identity'});
   else{add('$target',b&&b.sourceType===op.on&&b.source===a.source?'met':'failed',{id,reason:'same-observed-identity'});if(b)targets.push(b);}
  }
 }else if(op.act==='ask')add('$observation','met',{reason:'complete-observation-available'});
 else add('$target','unknown',{reason:'no-exact-target-mapping'});
 for(const [parameter,wanted]of Object.entries(args)){
  if(['id','ids'].includes(parameter))continue;
  if(op.act==='remove'){add(parameter,'unknown',{reason:'unprojected-removal-argument'});continue;}
  if(!targets.length){add(parameter,'unknown',{reason:'no-observed-target'});continue;}
  const binding=expected.parameterBindings.find(b=>b.parameter===parameter);
  // An amount parameter (effectScope amounts: add, subtract) moves an observed number: after = before + sign x amount.
  const amount=op.effectScope?.amounts?.[parameter];
  if(amount&&typeof amount.key==='string'&&Number.isFinite(Number(amount.sign))&&typeof wanted==='number'){
   for(const target of targets){
    const value=o=>{const f=(o?.inputs??[]).filter(i=>i.key===amount.key);if(f.length!==1||f[0].values.length!==1)return null;const v=observationValue(f[0].values[0]);return v.ok&&typeof v.value==='number'?v.value:null;};
    const a=value(old.get(target.id)),b=value(target);
    if(a===null||b===null){add(parameter,'unknown',{target:target.id,reason:'amount-base-not-observed'});continue;}
    const want=a+Number(amount.sign)*wanted;
    add(parameter,Math.abs(b-want)<=1e-9*Math.max(1,Math.abs(want))?'met':'failed',{target:target.id,key:amount.key,expected:want,actual:b});
   }
   continue;
  }
  for(const target of targets){
   if(parameter==='kind'&&!binding){add(parameter,target.kind===wanted?'met':'failed',{target:target.id,expected:wanted,actual:target.kind});continue;}
   const inputs=(target.inputs??[]).filter(i=>binding?.binding?i.binding===binding.binding:i.key===(binding?.key??parameter));
   if(inputs.length===0&&wanted===null&&op.params[parameter]?.nullable){add(parameter,'met',{target:target.id,reason:'optional-value-cleared'});continue;}
   if(inputs.length!==1){add(parameter,'unknown',{target:target.id,reason:inputs.length?'ambiguous-observed-key':'parameter-not-observed'});continue;}
   const decoded=inputs[0].values.map(observationValue);if(decoded.some(v=>!v.ok)){add(parameter,'unknown',{target:target.id,reason:'unrecognized-native-value-token'});continue;}
   const raw=decoded.map(v=>v.value),actual=op.params[parameter]?.type==='array'?raw:raw.length===0?null:raw.length===1?raw[0]:raw;
   const same=binding?.mode==='set'&&Array.isArray(wanted)&&Array.isArray(actual)?equal(wanted.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),actual.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))):equal(wanted,actual);
   add(parameter,same?'met':'failed',{target:target.id,binding:inputs[0].binding,key:inputs[0].key,expected:wanted,actual});
  }
 }
 if(typeof selectionPolicy?.key==='string')for(const object of after.objects.filter(o=>o.sourceType===op.on)){
  const fields=(object.inputs??[]).filter(input=>input.key===selectionPolicy.key);
  if(fields.length!==1||fields[0].values.length!==1){add('$selection','unknown',{target:object.id,reason:'selection-not-observable'});continue;}
  const actual=observationValue(fields[0].values[0]),wanted=ids.includes(object.id);
  add('$selection',actual.ok&&typeof actual.value==='boolean'&&actual.value===wanted?'met':'failed',{target:object.id,expected:wanted,actual:actual.value});
 }
 const ancestorPolicy=op.effectScope?.ancestors,ancestors=new Set();
 if(Array.isArray(ancestorPolicy?.via)&&Array.isArray(ancestorPolicy?.keys)){
  const queue=[...ids],seen=new Set(ids);
  for(let cursor=0;cursor<queue.length;cursor++){
   budget.tick('control-effect.ancestors');
   if(cursor>before.objects.length)throw Error('native-effect-scope-budget');
   const object=old.get(queue[cursor]);
   for(const relation of ancestorPolicy.via){const raw=object?.relations?.[relation]??object?.[relation];for(const id of Array.isArray(raw)?raw:raw==null?[]:[raw])if(typeof id==='string'&&old.has(id)&&!seen.has(id)){seen.add(id);ancestors.add(id);queue.push(id);}}
  }
 }
 const stateObject=o=>({id:o.id,kind:o.kind,sourceType:o.sourceType,inputs:(o.inputs??[]).map(({source,version,sourceType,...i})=>i)});
 if(ids.length&&op.act!=='remove')for(const object of after.objects)if(object.sourceType===op.on&&!ids.includes(object.id)&&old.has(object.id)&&!equal(stateObject(old.get(object.id)),stateObject(object))){
  const policies=(op.effectScope?.related??[]).filter(r=>r.id===object.id&&(!r.when||Array.isArray(args[r.when.parameter])&&args[r.when.parameter].includes(r.when.includes)&&Object.hasOwn(args,r.when.provided)));
  const allowed=new Set([...policies.flatMap(r=>r.keys??[]),...(ancestors.has(object.id)?ancestorPolicy.keys:[])]),prior=stateObject(old.get(object.id)),current=stateObject(object);
  const oldInputs=new Map(prior.inputs.map(i=>[i.key,i])),nextInputs=new Map(current.inputs.map(i=>[i.key,i]));
  const changedKeys=[...new Set([...oldInputs.keys(),...nextInputs.keys()])].filter(k=>!equal(oldInputs.get(k)??null,nextInputs.get(k)??null));
  if(selectionPolicy&&prior.kind===current.kind&&changedKeys.length>0&&changedKeys.every(key=>key===selectionPolicy.key)){add('$scope','met',{target:object.id,reason:'declared-selection-state',changedKeys});continue;}
  // reflow: the keys every other object of the source type may change when the area lays itself out again (a diagram's
  // automatic layout moves its unpinned nodes): a declared consequence of the operation, not an unintended effect.
  const reflow=op.effectScope?.reflow?.keys??[];
  if(reflow.length&&prior.kind===current.kind&&changedKeys.length>0&&changedKeys.every(key=>reflow.includes(key))){add('$scope','met',{target:object.id,reason:'declared-reflow',changedKeys});continue;}
  const declared=prior.kind===current.kind&&changedKeys.length>0&&changedKeys.every(k=>allowed.has(k));
  add('$scope',declared?'unknown':'failed',{target:object.id,reason:declared?'declared-dependent-layout-needs-independent-verification':'unselected-peer-object-changed',changedKeys});
 }
 if(checks.some(c=>c.status==='failed'))return finish('mismatch','observed-effect-differs-from-intent');
 if(checks.some(c=>c.status==='unknown'))return finish('unverified','some-intended-values-are-not-observable');
 return finish('verified','all-expressed-observable-effects-match');
}

/** Author a tool instruction for a programmatic control, then use the same SOP entry point as chat. */
export function invokeToolCommand(host,{operation,args,invocation,expectedVersion}) {
 const declaration = host.bindings().find(op => op.id === operation);
 if (!declaration) return {status:'refused',reason:'undeclared-operation',verification:'unverified'};
 const admitted = validateNativeArguments(declaration,args);
 if (!admitted.ok) return {status:'refused',reason:admitted.reason,verification:'unverified'};
 const wires = describeNativeControl({operation:declaration,args}).wires;
 return host.invoke(wires,toolInvocationContext(invocation,expectedVersion));
}
