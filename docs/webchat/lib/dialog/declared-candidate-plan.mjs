// Read-only lifecycle admission. Native policies and effects are deferred.
import {World,parse,str,prepareRequestBatch,resolveRequestTargets,projectTemplates} from '../vendor/sopworld/sopworld.mjs?v=327fb3cf41';
import {copyHostData,validateNativeArguments,nativeToken} from '../../worlds/native-tool-host.mjs?v=7abe128286';
import {selectNativeObjects} from './native-selection.mjs?v=12aae830ed';
const ref=x=>typeof x==='string'&&x.startsWith('$')?x.slice(1):null;
const one=(w,k)=>w.attrs[k]?.length===1?str(w.attrs[k][0]):null;
const proof=x=>x&&['sourceWorld','sourceWire','moduleVersion'].every(k=>typeof x[k]==='string'&&x[k])&&/^[a-f0-9]{64}$/.test(x.sourceSnapshotSHA??'');
const keys={
 'std.request':['act','mood','source','root'],
 'std.request.source':['text'],
 'std.request.target':['request','mode','kind','name','determiner','selector','source','source.start','source.end'],
 'std.request.constraint':['request','target','concept','operator','value','character','polarity','source','source.start','source.end','unit'],
 'std.request.group':['request','operator','member'],'std.request.not':['request','of'],
};
/** Registry functions are trusted host capabilities; declarations are inert data. */
export function planDeclaredCandidates(batch,{registry={},capabilities=[],evaluateSelector=null,budget=200000,subBudget=100000,maxBytes=4000000}={}){
 let steps=0;const unresolved=[],plans=[];const refusal=reason=>({ok:false,unresolved:[...unresolved,{reason}],plans:[],executable:false,steps});
 try{
  if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(subBudget)||subBudget<1||maxBytes>4000000||maxBytes<1||evaluateSelector!==null&&typeof evaluateSelector!=='function')return refusal('invalid-planning-options');
  const copy=x=>copyHostData(x,{maxBytes});
  const libraryCopy=x=>copy(JSON.parse(JSON.stringify(x)));
  const declared=copy(capabilities),tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('planning-budget');};
  const prepared=prepareRequestBatch(batch,{budget:subBudget});if(!prepared.ok)return {...refusal('invalid-request-batch'),validation:prepared};
  const equal=(left,right)=>{const result=projectTemplates([{template:'equal',context:{left,right}}],{templates:{equal:{equal:true}},guards:{equal:[{left:{$get:['left']},right:{$get:['right']}}]},subBudget});if(result.truncated)throw Error('mapping-budget');return result.candidates.length===1;};
  const fieldList=w=>Object.keys(w.attrs).map(k=>JSON.stringify([w.id,k]));
  for(const entry of prepared.plan.entries){
   tick();const wires=parse(entry.wires),byId=new Map(wires.map(w=>[w.id,w])),request=byId.get(entry.request),targets=wires.filter(w=>w.type==='std.request.target');
   if(targets.length!==1||!request||request.type!=='std.request'||one(request,'mood')!=='do')throw Error('unsupported-lifecycle-request-shape');
   const target=targets[0],act=one(request,'act'),mode=one(target,'mode');
   if(mode==='new'&&target.attrs.selector)throw Error('unsupported-new-target-selector');
   if(!(['make','remove'].includes(act))||mode!==(act==='make'?'new':'existing'))throw Error('unsupported-lifecycle-act-mode');
   for(const w of wires){tick();if(!keys[w.type]||Object.keys(w.attrs).some(k=>!keys[w.type].includes(k)))throw Error('unsupported-semantic-field');}
   const matches=declared.filter(c=>{tick();return c.act===act&&c.mode===mode&&c.semanticKind===one(target,'kind');});
   if(matches.length!==1||!proof(matches[0]))throw Error('missing-or-ambiguous-capability');const cap=matches[0],host=registry[cap.host];
   if(typeof cap.id!=='string'||!cap.id||typeof host?.bindings!=='function'||typeof host?.observe!=='function'||!cap.arguments||!cap.nativeKind||!cap.sourceType||!cap.scope)throw Error('invalid-capability-registry');
   const operations=copy(host.bindings()),ops=operations.filter(o=>o.id===cap.operation);if(ops.length!==1||ops[0].act!==act||ops[0].on!==cap.sourceType)throw Error('incompatible-native-operation');const operation=ops[0];
   const observation=copy(host.observe());if(observation.scope!==cap.scope)throw Error('observation-scope-mismatch');
   const selection=selectNativeObjects(observation,{scope:cap.scope,kind:{native:{kind:cap.nativeKind,sourceType:cap.sourceType},witness:cap},predicates:[]},{mode:'all',budget:subBudget});if(!selection.coverage)throw Error('invalid-native-population');
   const selector=new Set(),queue=ref(target.attrs.selector?.[0])?[ref(target.attrs.selector[0])]:[];
   {const budget={tick};for(let cursor=0;cursor<queue.length;cursor++){budget.tick();const id=queue[cursor];if(selector.has(id))continue;selector.add(id);const node=byId.get(id);if(!node)throw Error('missing-selector-node');const edges=node.type==='std.request.not'?node.attrs.of:node.type==='std.request.group'?node.attrs.member:[];for(const token of edges??[])queue.push(ref(token));}}
   const results=wires.filter(w=>w.type==='std.request.constraint'&&!selector.has(w.id));
   for(const w of wires)if(['std.request.group','std.request.not'].includes(w.type)&&!selector.has(w.id))throw Error('unsupported-result-logic');
   if(ref(request.attrs.root?.[0])&&(results.length!==1||results[0].id!==ref(request.attrs.root[0])))throw Error('unsupported-result-root');
   if(act==='remove'&&results.length)throw Error('removal-result-not-admitted');
   const resultUsed=new Set(),selectorConsumed=new Set(),witnesses=[];let subjects=[],resolution=null,nameUsed=false;
   if(target.attrs.determiner){const allowed=cap.determiners??[];if(allowed.filter(d=>proof(d)&&d.policy===(mode==='new'?'new':cap.policy??'one')&&equal(target.attrs.determiner,d.tokens)).length!==1)throw Error('undeclared-determiner-policy');}
   if(mode==='existing'){
    const world=new World();world.load('@u core.use world=std.request');world.load(entry.wires);
    resolution=libraryCopy(resolveRequestTargets(world,entry.request,{budget:subBudget,populations:{[target.id]:{kind:target.attrs.kind[0],context:{instanceId:observation.instanceId,scope:observation.scope,version:observation.version},complete:selection.complete,subjects:selection.objects.map(o=>({id:o.id,source:o.source,sourceType:o.sourceType,version:o.version})),evidence:[{declaration:cap,selection}]}},policies:{[target.id]:cap.policy??'one'},
     evaluateTarget:({binding})=>{
      if(!target.attrs.name)return {truth:'true',evidence:[]};nameUsed=true;const b=cap.nameBinding;
      if(!proof(b)||!b.binding)return {truth:'unknown',evidence:[],reason:'missing-declared-name-binding'};
      const objects=observation.objects.filter(o=>o.source===binding.subject.source),chosen=selectNativeObjects({...observation,objects,complete:true},{scope:cap.scope,kind:{native:{kind:cap.nativeKind,sourceType:cap.sourceType},witness:cap},predicates:[{binding:b.binding,expected:{values:[nativeToken(one(target,'name'))],witness:b}}]},{budget:subBudget});
      const status=chosen.considered?.[0]?.status;return {truth:status==='match'?'true':status==='mismatch'?'false':'unknown',evidence:[{nameBinding:b,selection:chosen}]};
     },evaluateConstraint:input=>{
      if(!evaluateSelector)return {truth:'unknown',evidence:[],reason:'missing-selector-evaluator'};
      const evaluated=evaluateSelector(libraryCopy(input),{observation:copy(observation),capability:copy(cap)}),expected=fieldList(input.constraint).sort();
      if(!evaluated||!Array.isArray(evaluated.consumed)||!equal([...evaluated.consumed].sort(),expected))return {truth:'unknown',evidence:[],reason:'incomplete-selector-consumption'};
      for(const field of evaluated.consumed)selectorConsumed.add(field);return {truth:evaluated.truth,evidence:evaluated.evidence,...(evaluated.reason?{reason:evaluated.reason}:{})};
     }}));
    const resolved=resolution.targets?.find(t=>t.target===target.id);if(!resolution.ok||resolved?.status!=='resolved'||!resolved.matches.length){unresolved.push({reason:'target-resolution',target:target.id,resolution});throw Error('unresolved-native-target');}subjects=resolved.matches;
    for(const id of selector)if(byId.get(id).type==='std.request.constraint'&&fieldList(byId.get(id)).some(f=>!selectorConsumed.has(f)))throw Error('unconsumed-selector-field');
   }
   const context={};
   for(const [parameter,descriptor]of Object.entries(cap.arguments)){
    tick();if(!Object.hasOwn(operation.params,parameter))throw Error('undeclared-native-parameter');
    if(descriptor.from==='kind')context[parameter]=cap.nativeKind;
    else if(descriptor.from==='name'){if(!target.attrs.name)continue;if(!proof(descriptor))throw Error('missing-name-mapping-proof');context[parameter]=one(target,'name');nameUsed=true;}
    else if(descriptor.from==='subjects'){if(!subjects.length)throw Error('missing-subject-arguments');if(descriptor.representation==='ids')context[parameter]=subjects.map(g=>g.subject.id);else if(descriptor.representation==='id'&&subjects.length===1)context[parameter]=subjects[0].subject.id;else throw Error('unsupported-subject-representation');}
    else if(descriptor.from==='result'){
     if(!proof(descriptor))throw Error('missing-result-mapping-proof');const found=results.filter(c=>one(c,'concept')===descriptor.concept);
     if(!found.length)continue;if(found.length!==1)throw Error('ambiguous-result-parameter');const c=found[0];
     if(ref(c.attrs.target?.[0])!==target.id||one(c,'operator')!=='eq'||one(c,'character')!=='requirement'||one(c,'polarity')!=='positive'||c.attrs.unit)throw Error('unsupported-result-semantics');
     const values=(descriptor.values??[]).filter(m=>proof(m)&&equal(c.attrs.value??[],m.tokens));if(values.length!==1)throw Error('missing-or-ambiguous-value-mapping');
     if(descriptor.reference){const refs=values[0].references;if(!Array.isArray(refs))throw Error('missing-native-reference-witness');for(const g of refs){tick();if(g.context?.instanceId!==observation.instanceId||g.context?.scope!==observation.scope||g.context?.version!==observation.version||g.subject?.sourceType!==descriptor.reference.sourceType||!observation.objects.some(o=>o.id===g.subject.id&&o.source===g.subject.source&&o.sourceType===g.subject.sourceType&&o.version===g.subject.version))throw Error('stale-native-reference');}const projected=descriptor.reference.representation==='ids'?refs.map(g=>g.subject.id):descriptor.reference.representation==='id'&&refs.length===1?refs[0].subject.id:descriptor.reference.representation==='nullable-id'&&refs.length===0?null:undefined;if(projected===undefined||!equal(projected,values[0].value))throw Error('incompatible-native-reference-value');}
     context[parameter]=copy(values[0].value);resultUsed.add(c.id);witnesses.push({constraint:c.id,parameter,mapping:values[0],declaration:descriptor});
    }else throw Error('unsupported-argument-projection');
   }
   if(target.attrs.name&&!nameUsed||results.some(c=>!resultUsed.has(c.id)))throw Error('unconsumed-request-field');
   const projected=projectTemplates([{template:'arguments',context}],{templates:{arguments:Object.fromEntries(Object.keys(context).map(k=>[k,{$get:[k]}]))},budget:subBudget});if(projected.truncated||projected.candidates.length!==1)throw Error('argument-projection-failed');
   const admitted=validateNativeArguments(operation,projected.candidates[0].value,{maxBytes});if(!admitted.ok)throw Error(admitted.reason);
   const consumed=wires.flatMap(fieldList);plans.push({id:entry.id,request:entry.request,after:entry.after,hostId:cap.host,operation:operation.id,args:admitted.args,expectedVersion:observation.version,instanceId:observation.instanceId,scope:observation.scope,subjects,consumed,declaration:cap.id,mapping:{capability:cap,results:witnesses,defaults:admitted.defaults,resolution},policy:'pending-native-validation',verification:'unverified'});
  }
  return {ok:true,plans:copy(plans),unresolved:[],executable:false,steps,validation:prepared.plan};
 }catch(error){return refusal(String(error?.message??'planning-failed'));}
}
