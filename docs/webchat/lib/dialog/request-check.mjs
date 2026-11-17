// Read-only historical predicate checking; no reader or native invocation.
import {evaluateRequestPredicates,resolveRequestTargets,str,projectTemplates} from '../vendor/sopworld/sopworld.mjs?v=5c806a534f';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=463e762442';
import {selectNativeObjects} from './native-selection.mjs?v=2717ecb14d';
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
  const nativeCheck=(g,m)=>{
    if(!g)return unknown('missing-target-binding');
    const snapshots=data.observations.filter(o=>{tick();return o.instanceId===g.context.instanceId&&o.scope===g.context.scope&&o.version===g.context.version;});
    if(snapshots.length!==1)return unknown('ambiguous-observation');
    const objects=snapshots[0].objects.filter(o=>{tick();return o.source===g.subject.source&&o.id===g.subject.id&&o.sourceType===g.subject.sourceType&&o.version===g.subject.version;});
    if(objects.length!==1)return unknown('missing-historical-subject');
    const object=objects[0];
    for(const input of object.inputs){tick();if(input.binding===m.binding.id&&['dimension','unit','frame'].some(key=>Object.hasOwn(input,key)!==Object.hasOwn(m.binding,key)||input[key]!==m.binding[key]))return unknown('incompatible-native-dimension');}
    const result=selectedBudget(selectNativeObjects({...snapshots[0],objects:[object],complete:true},{scope:g.context.scope,kind:{native:{kind:object.kind,sourceType:object.sourceType},witness:{historicalSubject:{...g.subject}}},predicates:[{binding:m.binding,expected:m.expected}]},{budget:grant(2)}));
    const status=result.considered?.[0]?.status;
    return {truth:status==='match'?'true':status==='mismatch'?'false':'unknown',evidence:[{mapping:m,selection:result}],...(status==='match'||status==='mismatch'?{}:{reason:'unknown-native-predicate'})};
  };
  const evaluateConstraint=({constraint,bindings:ground})=>{
    tick();const a=constraint.attrs,m=data.predicateBindings[constraint.id];
    if(str(a.operator?.[0])!=='eq'||Object.keys(a).some(k=>!['request','target','concept','operator','value','character','polarity','source','source.start','source.end','unit'].includes(k)))return unknown('unsupported-predicate-semantics');
    if(!m||m.concept!==str(a.concept?.[0])||!Array.isArray(m.wireValues)||!m.expected?.witness||!m.binding)return unknown('missing-declared-predicate-binding');
    if(!equalMapping(a.value??[],m.wireValues))return unknown('incompatible-predicate-value-binding');
    if(a.unit&&str(a.unit[0])!==m.binding.unit)return unknown('incompatible-predicate-unit');
    return nativeCheck(ground[ref(a.target?.[0])],m);
  };
  const equalMapping=(actual,declared)=>{
    const guard=projectTemplates([{template:'mapping',context:{actual,declared}}],{templates:{mapping:{matched:true}},guards:{mapping:[{left:{$get:['actual']},right:{$get:['declared']}}]},budget:grant()});
    if(guard.truncated){exhausted=true;throw new Error('check-budget');}return guard.candidates.length===1;
  };
  const populations={},policies={},selected=new Map();
  for(const target of world.ofType('std.request.target')){
   tick();if(ref(target.attrs.request?.[0])!==request)continue;
   const plan=data.targetPlans[target.id];if(!plan||str(target.attrs.mode?.[0])!=='existing'||plan.semanticKind!==str(target.attrs.kind?.[0]))continue;
   const snapshots=data.observations.filter(o=>{tick();return o.instanceId===plan.instanceId&&o.scope===plan.selection?.scope&&o.version===plan.version;});
   if(snapshots.length!==1||!Array.isArray(plan.selection?.predicates)||plan.selection.predicates.length)continue;
   const selection=selectedBudget(selectNativeObjects(snapshots[0],plan.selection,{mode:'all',budget:grant(2)}));
   if(!selection.coverage)continue;selected.set(target.id,selection);policies[target.id]=plan.policy;
   populations[target.id]={kind:target.attrs.kind[0],context:{instanceId:selection.instanceId,scope:selection.scope,version:selection.version},complete:selection.complete,subjects:selection.objects.map(o=>({id:o.id,source:o.source,sourceType:o.sourceType,version:o.version})),evidence:[{selection}]};
  }
  const resolution=resolveRequestTargets(world,request,{populations,policies,budget:reserve(Math.max(1,Math.floor((budget-charged)/3))),evaluateConstraint,
   evaluateTarget:({target,binding})=>{
    tick();if(Object.keys(target.attrs).some(k=>!['request','mode','kind','name','selector','determiner'].includes(k)))return unknown('unsupported-target-semantics');
    const plan=data.targetPlans[target.id];
    if(target.attrs.determiner&&!equalMapping(target.attrs.determiner,plan?.determinerTokens??[]))return unknown('unresolved-determiner-policy');
    if(!target.attrs.name)return {truth:'true',evidence:[]};
    const m=plan?.nameBinding;
    if(!m?.binding||!m.expected?.witness||!Array.isArray(m.wireValues))return unknown('missing-name-binding');
    if(!equalMapping(target.attrs.name,m.wireValues))return unknown('incompatible-name-binding');
    return nativeCheck(binding,m);
   }});
  if(exhausted||resolution.issues?.some(i=>i.reason==='budget'))return refused('check-budget');
  if(!resolution.ok)return {...refused('target-resolution-failed'),resolution};
  const bindings={};for(const t of resolution.targets){tick();if(t.status==='resolved'&&policies[t.target]==='one'&&t.matches.length===1)bindings[t.target]=t.matches[0];}
  const evaluation=evaluateRequestPredicates(world,request,{budget:reserve(Math.max(1,Math.floor((budget-charged)/2))),bindings,evaluateConstraint,
   resolvePopulation:({target})=>{const t=resolution.targets.find(t=>{tick();return t.target===target.id;}),p=populations[target.id];return t&&p?{context:p.context,complete:t.status==='resolved',subjects:t.matches.map(g=>g.subject),evidence:[{resolution:t}]}:null;}});
  if(exhausted||evaluation.failures?.some(f=>f.reason==='budget'))return refused('check-budget');
  return {...evaluation,resolution,work:{charged,limit:budget,exhausted:false,accounting:'reserved subordinate ceilings plus adapter steps'},executable:false,semantics:'historical native property check; not a reply claim or effect assessment'};
 }catch{return refused(exhausted?'check-budget':'invalid-or-overbudget-check');}
}
