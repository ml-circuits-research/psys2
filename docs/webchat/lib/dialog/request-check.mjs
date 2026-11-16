// Read-only historical predicate checking; no reader or native invocation.
import {evaluateRequestPredicates,str,projectTemplates} from '../vendor/sopworld/sopworld.mjs?v=d97cc2c645';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=34e8c452f9';
import {selectNativeObjects} from './native-selection.mjs?v=cf5edb681d';
const ref=v=>typeof v==='string'&&v.startsWith('$')?v.slice(1):null;
const unknown=reason=>({truth:'unknown',evidence:[],reason});
/** Plans and mappings are declared semantic bindings, not model truth predictions. */
export function checkRequest(world,request,{observations=[],targetPlans={},predicateBindings={},budget=100000,subBudget=1024,maxBytes=4000000}={}){
 let charged=0,exhausted=false;
 const refused=reason=>({work:{charged,limit:budget,exhausted},ok:false,truth:'unknown',reason,evidence:[],executable:false});
 try{
  if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(subBudget)||subBudget<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4000000)return refused('invalid-budget');
  const data=copyHostData({observations,targetPlans,predicateBindings},{maxBytes}),r=world.get(request);
  if(!r||r.type!=='std.request'||str(r.attrs.mood?.[0])!=='check')return refused('check-request-required');
  const reserve=cost=>{if(!Number.isSafeInteger(cost)||cost<1||charged+cost>budget){exhausted=true;throw new Error('check-budget');}charged+=cost;return cost;};
  const tick=()=>reserve(1);
  const grant=(multiplier=1)=>{reserve(subBudget*multiplier);return subBudget;};
  const selectedBudget=result=>{if(result.reason==='selection-budget'||result.evaluation?.truncated){exhausted=true;throw new Error('check-budget');}return result;};
  const selected=new Map(),bindings={};
  for(const target of world.ofType('std.request.target')){
   tick();if(ref(target.attrs.request?.[0])!==request)continue;
   const plan=data.targetPlans[target.id];if(!plan)continue;
   // This adapter does not pretend to resolve names, determiners or selectors.
   if(Object.keys(target.attrs).some(k=>!['request','mode','kind'].includes(k))||str(target.attrs.mode?.[0])!=='existing'||plan.semanticKind!==str(target.attrs.kind?.[0]))continue;
   const snapshots=data.observations.filter(o=>{tick();return o.instanceId===plan.instanceId&&o.scope===plan.selection?.scope&&o.version===plan.version;});
   if(snapshots.length!==1||!Array.isArray(plan.selection?.predicates)||plan.selection.predicates.length)continue;
   const selection=selectedBudget(selectNativeObjects(snapshots[0],plan.selection,{mode:'all',budget:grant(2)}));
   if(!selection.coverage)continue;selected.set(target.id,selection);
   if(selection.complete&&selection.objects.length===1){const o=selection.objects[0];bindings[target.id]={context:{instanceId:selection.instanceId,scope:selection.scope,version:selection.version},subject:{id:o.id,source:o.source,sourceType:o.sourceType,version:o.version}};}
  }
  const evaluation=evaluateRequestPredicates(world,request,{budget:reserve(Math.max(1,Math.floor((budget-charged)/2))),bindings,
   resolvePopulation:({target})=>{const s=selected.get(target.id);return s?{context:{instanceId:s.instanceId,scope:s.scope,version:s.version},complete:s.complete,subjects:s.objects.map(o=>({id:o.id,source:o.source,sourceType:o.sourceType,version:o.version})),evidence:[{selection:s}]}:null;},
   evaluateConstraint:({constraint,bindings:ground})=>{
    tick();const a=constraint.attrs,m=data.predicateBindings[constraint.id];
    if(str(a.operator?.[0])!=='eq'||Object.keys(a).some(k=>!['request','target','concept','operator','value','character','polarity','source','source.start','source.end','unit'].includes(k)))return unknown('unsupported-predicate-semantics');
    if(!m||m.concept!==str(a.concept?.[0])||!Array.isArray(m.wireValues)||!m.expected?.witness||!m.binding)return unknown('missing-declared-predicate-binding');
    const guard=projectTemplates([{template:'mapping',context:{actual:a.value??[],declared:m.wireValues}}],{templates:{mapping:{matched:true}},guards:{mapping:[{left:{$get:['actual']},right:{$get:['declared']}}]},budget:grant()});
    if(guard.truncated){exhausted=true;throw new Error('check-budget');}
    if(guard.candidates.length!==1)return unknown('incompatible-predicate-value-binding');
    if(a.unit&&str(a.unit[0])!==m.binding.unit)return unknown('incompatible-predicate-unit');
    const g=ground[ref(a.target?.[0])];if(!g)return unknown('missing-target-binding');
    const snapshots=data.observations.filter(o=>{tick();return o.instanceId===g.context.instanceId&&o.scope===g.context.scope&&o.version===g.context.version;});
    if(snapshots.length!==1)return unknown('ambiguous-observation');
    const objects=snapshots[0].objects.filter(o=>{tick();return o.source===g.subject.source&&o.id===g.subject.id&&o.sourceType===g.subject.sourceType&&o.version===g.subject.version;});
    if(objects.length!==1)return unknown('missing-historical-subject');
    const object=objects[0];
    for(const input of object.inputs){tick();if(input.binding===m.binding.id&&['dimension','unit','frame'].some(key=>Object.hasOwn(input,key)!==Object.hasOwn(m.binding,key)||input[key]!==m.binding[key]))return unknown('incompatible-native-dimension');}
    const result=selectedBudget(selectNativeObjects({...snapshots[0],objects:[object],complete:true},{scope:g.context.scope,kind:{native:{kind:object.kind,sourceType:object.sourceType},witness:{historicalSubject:{...g.subject}}},predicates:[{binding:m.binding,expected:m.expected}]},{budget:grant(2)}));
    const status=result.considered?.[0]?.status;
    return {truth:status==='match'?'true':status==='mismatch'?'false':'unknown',evidence:[{mapping:m,selection:result}],...(status==='match'||status==='mismatch'?{}:{reason:'unknown-native-predicate'})};
   }});
  if(exhausted||evaluation.failures?.some(f=>f.reason==='budget'))return refused('check-budget');
  return {...evaluation,work:{charged,limit:budget,exhausted:false,accounting:'reserved subordinate ceilings plus adapter steps'},executable:false,semantics:'historical native property check; not a reply claim or effect assessment'};
 }catch{return refused(exhausted?'check-budget':'invalid-or-overbudget-check');}
}
