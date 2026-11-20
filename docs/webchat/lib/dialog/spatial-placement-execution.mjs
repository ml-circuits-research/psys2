// Assemble trusted native observations and dispatch the compiler's SOP call.
import {World,parse,serialize,str,quote} from '../vendor/sopworld/sopworld.mjs?v=4cf6e60057';
import SOURCE from './new-engine-source.mjs?v=d2bc21d7bc';
import {readPlacementProfile,rememberPlacement} from '../../worlds/app.project/spatial-profile.mjs?v=2cdfa2e4b2';
import {placementInterfaceSop} from '../../worlds/native-spatial-interface.mjs?v=f1f08b66d7';
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs?v=01e44f5b60';
import {identityRegistryFor,instanceIdFor} from './instance-identity.mjs?v=024ef1ca83';
import {nativeKindCandidates,nativeCreationCandidates} from './native-binding-candidates.mjs?v=8423e98bc7';
import {invokeObservedNativeTool} from './native-tool-activity.mjs?v=9e7d8073a0';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs?v=999c87cd52';
import {placementSearchProvider,z3Status} from './placement-search-provider.mjs?v=0675893eb5';
import {en} from '../lang/en.mjs?v=40d8d7165d';
import {placementHypotheses} from './placement-default-policy.mjs?v=75fb3f0237';
import {identityConcepts} from './capability-plan-adapter.mjs?v=1b494105bc';
import {executeNativeCapability,drawnAs} from './capability-plan-execution.mjs?v=4f85674d61';
import {budget} from './budget.mjs?v=00bce6e369';
import {executionPolicyWorld} from './execution-policy.mjs?v=fc7a8e4440';

const read = (row,key) => row?.attrs[key]?.length===1 ? str(row.attrs[key][0]) : undefined;
const ref = (row,key) => {
 const value = row?.attrs[key]?.[0];
 return row?.attrs[key]?.length===1 && value.startsWith('$') ? value.slice(1) : undefined;
};
let placementWorld;
export function inspectSpatialPlacementWorld() {
 return SOURCE.spatial?{loaded:!!placementWorld,policy:SOURCE.spatial.policy,knowledge:SOURCE.spatial.facts,schema:SOURCE.spatial.schema,
  knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin}:null;
}

function baseWorld() {
 if(placementWorld)return placementWorld;
 if(!SOURCE.spatial)return null;
 const world=new World({library:{'k.spatial2d':SOURCE.spatial.schema}});
 world.load('@placement.request core.use world=std.request\n@placement.compiler core.use world=std.placement\n@placement.objective core.use world=std.objective\n@placement.geometry core.use world=k.spatial2d');
 world.load(SOURCE.spatial.facts);
 world.load(SOURCE.spatial.policy);
 placementWorld=world;
 return world;
}

const activity=(session,area,details)=>{
 try{session.engine?.onWorldActivity?.({nodeIds:['interpreter:'+area.world,'instance:'+area.world,'knowledge-world:k.spatial2d','execution:placement-geometry','execution:placement-policy',...(area.stateWorld?[]:['native:'+area.world])],world:area.world,operation:'std.placement',...details});}
 catch{/* Inspection does not affect execution. */}
};
const reply=(text,supported,trace={},state={},effects=[])=>({text,parts:[{text,translate:false}],statuses:[supported?'supported':'unsupported'],answers:[],segments:[],state,effects,newEngine:true,trace:{legacy:false,engine:'new',...trace}});

// A target picked by its identity (a selector on a concept the policy fills with the target's own code: "drag n4
// near n2", node.ids = n4) is the object of that code or name: the placement compiler matches a target's name with an
// observed name or entity, so the selector becomes the target's name.
function identitySelectorsAsNames(wires,identity){
 if(!identity.size)return wires;
 const rows=parse(wires),byId=new Map(rows.map(row=>[row.id,row])),drop=new Set();
 for(const target of rows.filter(row=>row.type==='std.request.target')){
  const c=byId.get(ref(target,'selector'));
  if(!c||c.type!=='std.request.constraint'||read(c,'operator')!=='eq'||read(c,'polarity')!=='positive'||!identity.has(read(c,'concept')))continue;
  const value=read(c,'value');if(typeof value!=='string'||!value||read(target,'name')!==undefined&&read(target,'name')!==value)continue;
  target.attrs.name=[c.attrs.value[0].startsWith('"')?c.attrs.value[0]:JSON.stringify(value)];delete target.attrs.selector;drop.add(c.id);
 }
 return drop.size?serialize(rows.filter(row=>!drop.has(row.id))):wires;
}
// "after"/"before" in a flow (relation next/previous): the side the observed flow direction gives (app.execution.flow).
// "between A and B" (relation between, said for each anchor): a side of each, from where the anchors are: across the
// larger of their horizontal and vertical separations, right of the first and left of the second (or below and above).
function betweenRelations(wires,spatial,kindRows=[]){
 const rows=parse(wires),between=rows.filter(w=>w.type==='std.request.constraint'&&read(w,'relation')==='between');
 if(!between.length)return wires;
 if(between.length!==2)return wires;
 const target=id=>rows.find(w=>w.id===id);
 // An anchor is the one observed object of its name (label, name or code), else of its kind (the kind's lemmas).
 const boxOf=t=>{const name=read(t,'name'),kind=read(t,'kind'),lemmas=new Set(kindRows.filter(m=>m.canonical===kind&&!m.familyIdentity).map(m=>m.lemma));
  const ids=spatial.observation.objects.filter(o=>name!==undefined?(o.inputs?.some(i=>['label','name'].includes(i.key)&&str(i.values?.[0]??'')===name)||o.id===name):lemmas.has(o.kind)).map(o=>o.id);
  const boxes=spatial.boxes.filter(b=>ids.includes(b.entity));return boxes.length===1?boxes[0]:null;};
 const [a,b]=between.map(c=>boxOf(target(ref(c,'goal'))));
 if(!a||!b)return wires;
 const dx=(b.min_x+b.max_x)/2-(a.min_x+a.max_x)/2,dy=(b.min_y+b.max_y)/2-(a.min_y+a.max_y)/2;
 const [toA,toB]=Math.abs(dx)>=Math.abs(dy)?(dx>=0?['right','left']:['left','right']):(dy>=0?['below','above']:['above','below']);
 between[0].attrs.relation=[toA];between[1].attrs.relation=[toB];
 return serialize(rows);
}
function flowRelations(wires,observation){
 const rows=parse(wires),flows=executionPolicyWorld().ofType('app.execution.flow');
 const relations=rows.filter(w=>w.type==='std.request.constraint'&&['next','previous'].includes(read(w,'relation')));
 if(!relations.length||!flows.length)return wires;
 for(const c of relations){
  const flow=flows.find(f=>{const page=observation.objects.find(o=>o.sourceType===read(f,'sourceType'));
   const dir=page?.inputs?.find(i=>i.key==='direction')?.values?.[0];return dir!==undefined&&str(dir)===read(f,'direction');});
  if(!flow)return wires;
  c.attrs.relation=[read(flow,read(c,'relation'))];
 }
 return serialize(rows);
}
export async function executeSpatialPlacement(session,candidate,options={}) {
 budget.tick('spatial-placement.anchor-hypothesis');   // recursion: once, for the anchor hypothesis (options.anchorMade)
 const {bindings,view}=options;let anchorRule=null;
 const area=NATIVE_AREAS[view],state=area&&session.isession.state[area.world];
 const fail=(reason,details={})=>reply(reason==='stale-observation'
  ?'The scene changed before I could apply the placement.'
  :'I could not apply the requested placement. Nothing changed.',false,{reason,reading:candidate,...details});
 if(!state||!bindings)return fail('spatial-instance-unavailable');
 const started=performance.now();
 let host,spatial,sop,proposal,hypotheses=null,solver=null;
 // The words a canonical kind is read from (its lemmas), for the reply about a kind drawn as another.
 let lemmasOf=kind=>[kind];
 try{
  const hostOptions={state,instanceId:instanceIdFor(session,area.world),identityRegistry:identityRegistryFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge};
  host=await createAreaHost(area,hostOptions);
  if(!host.observeSpatial)return fail('spatial-observation-unavailable');
  const areaId=bindings.readerAreaByView?.[view]??area.area;
  {const named=identitySelectorsAsNames(candidate.wires,identityConcepts(bindings,areaId));if(named!==candidate.wires)candidate={...candidate,wires:named};}
  {const flowed=flowRelations(candidate.wires,host.observe());if(flowed!==candidate.wires)candidate={...candidate,wires:flowed};}
  const concepts=new Set(parse(candidate.wires).filter(wire=>wire.type==='std.request.target').map(wire=>read(wire,'kind')).filter(Boolean));
  const constructors=nativeCreationCandidates(bindings,host.bindings(),areaId).filter(pair=>pair.mapping.area===areaId&&concepts.has(pair.mapping.canonical));
  // A constructor that reads declared knowledge for its kind argument (a catalog drawing by name) gets it loaded for
  // the request's kinds first, the way a UI control's preparation does, so their extents can be measured.
  const lookups={},knowledgeErrors=[];
  for(const {mapping,operation} of constructors){
   const key=operation.spatial?.kindKey,inputs=(operation.knowledgeInputs??[]).filter(input=>input.argument===key);
   if(!key||!inputs.length)continue;
   (lookups[key]??=[]).push(mapping.lemma);
   for(const input of inputs){
    try{await session.engine?.knowledge?.[input.load]?.call(session.engine.knowledge,mapping.lemma);}
    catch(error){if(error?.name==='BudgetExceeded'||error?.name==='TurnAborted')throw error;knowledgeErrors.push({lemma:mapping.lemma,load:input.load,error:String(error?.message??error)});}
   }
  }
  if(Object.keys(lookups).length)host=await createAreaHost(area,{...hostOptions,args:lookups});
  spatial=host.observeSpatial();
  const {observation,revision,frame,scope,unknown,occupants}=spatial;
  if(unknown.some(entity=>occupants.includes(entity)))return fail('unknown-peer-geometry',{unknown});
  const context=baseWorld()?.fork();
  if(!context)return fail('spatial-world-unavailable');
  const mappings=nativeKindCandidates(bindings).filter(mapping=>mapping.area===areaId&&mapping.nativeFamilyBinding);
  lemmasOf=kind=>[kind,...mappings.filter(mapping=>mapping.canonical===kind&&typeof mapping.lemma==='string').map(mapping=>mapping.lemma)];
  {const placedBetween=betweenRelations(candidate.wires,host.observeSpatial(),nativeKindCandidates(bindings).filter(m=>m.area===areaId));if(placedBetween!==candidate.wires)candidate={...candidate,wires:placedBetween};}
  // The declared default of a kind argument (std.capability.seed source=value phase=missing on a family's class).
  const defaults=executionPolicyWorld().ofType('std.capability.seed').filter(w=>read(w,'source')==='value'&&read(w,'phase')==='missing'&&read(w,'kind')&&read(w,'operation'))
   .map(w=>({canonical:read(w,'kind'),operation:read(w,'operation'),parameter:read(w,'parameter'),value:read(w,'value')}));
  const native=placementInterfaceSop(host,spatial,mappings,candidate.request,{constructors,concepts,defaults});
  const profile=readPlacementProfile(session,spatial);
  const admitted=context.tell(native.configuration+'\n'+profile,{factsOnly:true});
  if(!admitted.ok)return fail('spatial-context-rejected',{diagnostics:admitted.violations});
  activity(session,area,{phase:'start',label:'Compile placement from observed geometry',instance:observation.instanceId,revision,frame,scope,participants:boxesForTrace(spatial),
   // The regions of observed things (the water of a lake, a road): where a relation puts a thing, what a kind keeps out of.
   regions:(spatial.regions??[]).map(({entity,kind,holds,min_x,min_y,max_x,max_y})=>({entity,kind,holds,min_x,min_y,max_x,max_y})),profile,...(knowledgeErrors.length?{knowledgeErrors}:{})});
  // Z3 solves the placement problem where the page can run it (loaded on the first one); otherwise the call
  // stays synchronous with the library's internal search.
  const provider=placementSearchProvider();
  const compile=async wires=>{
   const t0=performance.now();
   const out=provider?await context.compileRequest(wires+'\n'+native.context,{provider}):context.compileRequest(wires+'\n'+native.context);
   // Which search placed it: z3 or internal for a placement problem (std.problem), the declared method's ranked
   // directions otherwise; with the solver's status, so a fallback from Z3 is disclosed in the trace.
   const result=parse(out).find(wire=>['std.placement.result','std.compile.result'].includes(wire.type));
   solver={provider:read(result,'provider')??(read(result,'status')==='compiled'?'declared-method':null),compileMs:Math.round(performance.now()-t0),z3:z3Status()};
   return {sop:out,proposal:parse(out).find(wire=>['std.placement.result','std.compile.result'].includes(wire.type))};
  };
  ({sop,proposal}=await compile(candidate.wires));
  // Ranked hypotheses (placement-default-policy.sop app.placement.hypothesis): a definite description that names no
  // object on the page ("put the sun above the house" with no sun) also reads as asking for one, placed as requested.
  // The reading as given ranks first; a declared hypothesis is tried, in rank order, only when the given one fails
  // for its declared reason, and its use is disclosed (and can be undone).
  if(read(proposal,'status')!=='compiled'){
   for(const rule of placementHypotheses().filter(rule=>rule.when===read(proposal,'reason'))){
    if(rule.role==='anchor'){if(!options.anchorMade&&!anchorRule&&anchorCandidate(candidate,rule))anchorRule=rule;continue;}
    const alternative=rewriteHypothesis(candidate,rule);
    if(!alternative)continue;
    const second=await compile(alternative.wires);
    hypotheses={given:{reason:read(proposal,'reason'),placement:sop},creating:{rule:rule.id,status:read(second.proposal,'status'),reason:read(second.proposal,'reason')}};
    if(read(second.proposal,'status')==='compiled'){({sop,proposal}=second);candidate=alternative;hypotheses.used='creating';break;}
   }
  }
  activity(session,area,{phase:'end',label:'Compiled placement from observed geometry',durationMs:performance.now()-started,status:read(proposal,'status'),
   provider:solver?.provider,search:solver?.z3,sop,...(hypotheses?{hypotheses}:{})});
 }catch(error){
  if(error?.name==='BudgetExceeded'||error?.name==='TurnAborted')throw error;
  return fail('spatial-compilation-error',{error:String(error?.message??error),solver});
 }
 // The anchor hypothesis: an anchor named by its kind alone that no object on the page is ("a house next to a tree"
 // with no tree) is drawn first, then the subject is placed as asked; when that still fails, the anchor is undone.
 if(read(proposal,'status')!=='compiled'&&anchorRule){
  const made=anchorCandidate(candidate,anchorRule);
  if(made){
   const saved=structuredClone(session.isession.state[area.world]);
   const drawn=await executeNativeCapability(session,made.candidate,{bindings,view,readKnowledge:options.readKnowledge});
   if(drawn?.statuses?.[0]==='supported'){
    const placed=await executeSpatialPlacement(session,candidate,{bindings,view,readKnowledge:options.readKnowledge,anchorMade:true});
    if(placed?.statuses?.[0]==='supported'){
     const note=' There was no '+made.kind+' on the page, so I drew one first ('+anchorRule.name+').';
     placed.text=drawn.text.replace(/\s*You can undo this( change)?\.\s*$/,'')+' '+placed.text+note;placed.parts=[{text:placed.text,translate:false}];
     placed.trace={...placed.trace,anchorHypothesis:{rule:anchorRule.id,made:made.kind}};
     return placed;
    }
   }
   session.isession.state[area.world]=saved;
  }
 }
 if(read(proposal,'status')!=='compiled')return fail(read(proposal,'reason')??'spatial-compiler-unavailable',{placement:sop,solver});
 if(session.isession.state[area.world]!==state)return fail('stale-observation',{placement:sop});
 // Several subjects solved in the one problem (a count: "three houses near the lake"): one call each.
 if((proposal.attrs.call?.length??0)>1)return executeSpatialGroup(session,{area,host,sop,proposal,candidate,view,solver,state,fail,lemmasOf});
 let result;
 try{result=await invokeSpatialPlacementSop(session,{area,host,sop});}
 catch(error){return fail('invalid-compiled-placement',{placement:sop,error:String(error?.message??error)});}
 const {receipt,operation,args,before}=result;
 if(receipt.status==='refused')return fail(receipt.reason,{receipt,placement:sop,controlIntent:result.sop});
 // An area that lays itself out again after the call (effectScope reflow) may move the anchor away from the relation:
 // the anchor is put back where it was (the area's own place operation, which pins it), so the relation holds.
 let pinned=null;
 if(receipt.status==='changed'&&operation.effectScope?.reflow){
  const option=parse(sop).find(wire=>wire.type==='std.placement.option'&&wire.id===ref(proposal,'choice')),anchorId=read(option,'anchor');
  const was=spatial.boxes.find(box=>box.entity===anchorId),now=host.observeSpatial().boxes.find(box=>box.entity===anchorId);
  const place=host.bindings().find(op=>op.act==='place'&&op.on===operation.on&&op.spatial?.idsKey&&op.spatial?.xKey&&op.spatial?.yKey);
  if(was&&now&&place&&(Math.abs(was.min_x-now.min_x)>1e-6||Math.abs(was.min_y-now.min_y)>1e-6)){
   const cx=(was.min_x+was.max_x)/2,cy=(was.min_y+was.max_y)/2,current=host.observe();
   const call=`@pin.call ${place.id} ${place.spatial.idsKey}=${quote(anchorId)} ${place.spatial.xKey}=${cx} ${place.spatial.yKey}=${cy}`;
   try{pinned=await invokeObservedNativeTool(session,{area,host,invocation:globalThis.crypto.randomUUID(),expectedVersion:current.version,sop:call,includeCall:true});}
   catch(error){pinned={status:'refused',reason:String(error?.message??error)};}
  }
 }
 const observed=host.observeSpatial(),after=observed.observation;
 const intent=describeNativeControl({operation,args,before}),verification=verifyNativeControlEffect({intent,before,after,receipt});
 const targets=operation.act==='make'?after.objects.filter(object=>object.sourceType===operation.on&&!before.objects.some(prior=>prior.id===object.id)):
  after.objects.filter(object=>object.sourceType===operation.on&&args[operation.spatial.idsKey]?.includes(object.id));
 const target=targets.length===1?targets[0]:null,bounds=observed.boxes.find(box=>box.entity===target?.id);
 const choices=parse(sop).filter(wire=>wire.type==='std.placement.option');
 const winner=choices.find(option=>option.id===ref(proposal,'choice'));
 const plannedBounds=winningBounds(winner),geometryVerified=!!bounds&&plannedBounds.every(([key,wanted])=>
  Number.isFinite(wanted)&&Math.abs(wanted-bounds[key])<=1e-9*Math.max(1,Math.abs(wanted)));
 activity(session,area,{phase:'end',label:'Observe placement effect',status:geometryVerified?'verified':'mismatch',
  sop,receipt:{operation:receipt.operation,beforeVersion:receipt.beforeVersion,afterVersion:receipt.afterVersion},bounds,geometryVerified,verification});
 const trace={assessment:receipt.status,receipt,reading:candidate,placement:sop,solver,effectVerification:verification,observedBounds:bounds,geometryVerified,controlIntent:result.sop,
  ...(hypotheses?{hypotheses,uncertainty:hypotheses.used?['created-absent-target']:[]}:{})};
 const changed=receipt.status==='changed',worldState={[area.world]:structuredClone(state)},effects=changed?[{operation:operation.id}]:[];
 const observedLocation=bounds?' at ('+((bounds.min_x+bounds.max_x)/2)+', '+((bounds.min_y+bounds.max_y)/2)+')':'';
 // A kind drawn as another (a stand-in or its closest drawable relative): the reply keeps the kind asked for.
 const asked=read(parse(candidate.wires).find(wire=>wire.type==='std.request.target'&&read(wire,'mode')==='new'),'kind');
 const substituted=operation.act==='make'?lemmasOf(asked).map(kind=>drawnAs(target,kind)).find(Boolean):null;
 const effect=target?(operation.act==='make'?'Created ':'Moved ')+(substituted?.kind??target.kind)+' '+target.id+observedLocation+'. '+(substituted?substituted.note+' ':''):'';
 if(!target||!geometryVerified||verification.status==='mismatch'){
  const message=effect+'The observed geometry differs from the compiled placement.'+(changed?' You can undo this change.':'');
  return reply(message,false,trace,worldState,effects);
 }
 session.newEngineFocus={...session.newEngineFocus,[view]:target.id};
 const participants=new Set(choices.filter(option=>read(option,'status')!=='rejected').map(option=>read(option,'anchor')).filter(Boolean));
 const anchor=read(winner,'anchor');
 const relation=parse(candidate.wires).find(wire=>wire.type==='std.request.constraint'&&read(wire,'operator')==='relation');
 if(changed)rememberPlacement(session,observed,target.id,anchor,read(relation,'relation'));
 const loose=(proposal.attrs?.relaxed??[]).map(str);
 const note=(participants.size>1&&anchor?' I used '+anchor+' as the anchor.':'')+
  (loose.length?' No place keeps it close for every relation, so I placed it as close as the scene allows ('+loose.join(', ')+').':'')+
  (hypotheses?.used==='creating'?' There was no '+target.kind+' on the page, so I drew a new one.':'');
 const message=changed?effect.trim()+note+' You can undo this change.':target.id+' is already'+observedLocation+'.'+note;
 return reply(message,true,trace,worldState,effects);
}

/**
 * The calls of a placement solved for several subjects at once, made in order through the same native intent reader
 * as one call; each new object is checked against the geometry the problem gave it. The reply says how many were
 * made and whether some relation could not be kept close (relaxed).
 */
async function executeSpatialGroup(session,{area,host,sop,proposal,candidate,view,solver,state,fail,lemmasOf=kind=>[kind]}){
 const nodes=parse(sop),byId=new Map(nodes.map(wire=>[wire.id,wire])),calls=proposal.attrs.call.map(token=>byId.get(token.slice(1)));
 const options=nodes.filter(wire=>wire.type==='std.placement.option'&&!wire.id.includes('.alternative.'));
 const first=host.observe();
 if(calls.some(call=>!call||!host.bindings().some(op=>op.id===call.type&&op.spatial))||read(proposal,'instance')!==first.instanceId||read(proposal,'revision')!==host.spatialRevision())
  return fail('invalid-compiled-placement',{placement:sop});
 const original=structuredClone(state),made=[],receipts=[];
 const undo=(reason,details)=>{session.isession.state[area.world]=original;return fail(reason,{placement:sop,...details});};
 for(const [i,call] of calls.entries()){
  const before=host.observe(),operation=host.bindings().find(op=>op.id===call.type);
  const receipt=await invokeObservedNativeTool(session,{area,host,invocation:globalThis.crypto.randomUUID(),expectedVersion:before.version,sop:serialize([call]),includeCall:true});
  if(receipt.status==='refused')return undo(receipt.reason,{receipt});
  receipts.push(receipt);
  const observed=host.observeSpatial(),target=observed.observation.objects.find(object=>object.sourceType===operation.on&&!before.objects.some(prior=>prior.id===object.id)&&(object.in??object.parent)===undefined);
  const bounds=observed.boxes.find(box=>box.entity===target?.id),planned=winningBounds(options[i]);
  const verified=!!bounds&&planned.every(([key,wanted])=>Number.isFinite(wanted)&&Math.abs(wanted-bounds[key])<=1e-9*Math.max(1,Math.abs(wanted)));
  made.push({target,bounds,verified});
 }
 // A kind drawn as another keeps the kind asked for in the reply, and says what was drawn.
 const asked=parse(candidate.wires).filter(wire=>wire.type==='std.request.target'&&read(wire,'mode')==='new').map(wire=>read(wire,'kind')).filter(Boolean);
 const drawnNotes=new Set(),kindOf=target=>{const substituted=asked.flatMap(lemmasOf).map(kind=>drawnAs(target,kind)).find(Boolean);if(substituted)drawnNotes.add(substituted.note);return substituted?.kind??target?.kind;};
 const kinds=new Map();for(const {target} of made){const kind=kindOf(target);kinds.set(kind,(kinds.get(kind)??0)+1);}
 const said=[...kinds].map(([kind,count])=>count===1?'a '+kind:count+' '+en.plural(kind)).join(' and ');
 const anchor=read(options[0],'anchor'),loose=(proposal.attrs?.relaxed??[]).map(str);
 const trace={assessment:'changed',receipts,reading:candidate,placement:sop,solver,group:{made:made.map(({target,bounds,verified})=>({id:target?.id??null,kind:target?.kind,bounds,verified}))}};
 const state2={[area.world]:structuredClone(session.isession.state[area.world])},effects=receipts.map(receipt=>({operation:receipt.operation}));
 if(made.some(m=>!m.verified))return reply('Created '+said+'. The observed geometry differs from the compiled placement. You can undo this change.',false,trace,state2,effects);
 session.newEngineFocus={...session.newEngineFocus,[view]:made.at(-1).target.id};
 const note=[...drawnNotes].map(n=>' '+n).join('')+(anchor?' I used '+anchor+' as the anchor.':'')+(loose.length?' No place keeps them all close for every relation, so I placed them as close as the scene allows ('+loose.join(', ')+').':'');
 return reply('Created '+said+'.'+note+' You can undo this change.',true,trace,state2,effects);
}

/** A declared alternative reading (app.placement.hypothesis): the request's act and its relation subjects' target mode and determiner rewritten as the rule says. */
// The make request for a relation's anchor named by its kind alone (no name, no selector, the hypothesis's mode and
// determiner): a new one of that kind, nothing else said.
function anchorCandidate(candidate,rule){
 const nodes=parse(candidate.wires),request=nodes.find(wire=>wire.type==='std.request'&&wire.id===candidate.request);
 if(read(request,'act')!==rule.act)return null;
 const goals=new Set(nodes.filter(wire=>wire.type==='std.request.constraint'&&read(wire,'operator')==='relation').map(wire=>ref(wire,'goal')));
 const anchors=nodes.filter(wire=>wire.type==='std.request.target'&&goals.has(wire.id)&&read(wire,'mode')===rule.mode&&!wire.attrs.name&&!wire.attrs.selector&&read(wire,'kind'));
 if(anchors.length!==1)return null;   // "next to a tree" or "next to the tree": either way none is on the page
 const kind=read(anchors[0],'kind'),source=nodes.find(wire=>wire.type==='std.request.source');
 const wires=[source?serialize([source]):'',`@anchor.request std.request act=make mood=do${source?' source=$'+source.id:''}`,
  `@anchor.target std.request.target request=$anchor.request mode=${rule['mode.to']} determiner=${rule['determiner.to']} kind=${kind}`].filter(Boolean).join('\n');
 const label=kind.split('.').pop().replace(/_/g,' ');
 return {candidate:{request:'anchor.request',wires},kind:label};
}
function rewriteHypothesis(candidate,rule){
 const nodes=parse(candidate.wires),request=nodes.find(wire=>wire.type==='std.request'&&wire.id===candidate.request);
 if(read(request,'act')!==rule.act)return null;
 const subjects=new Set(nodes.filter(wire=>wire.type==='std.request.constraint'&&read(wire,'operator')==='relation').map(wire=>ref(wire,'target')));
 const moved=nodes.filter(wire=>wire.type==='std.request.target'&&subjects.has(wire.id)&&read(wire,'mode')===rule.mode&&read(wire,'determiner')===rule.determiner&&!wire.attrs.name&&!wire.attrs.selector);
 if(!moved.length)return null;
 const rewritten=nodes.map(wire=>wire===request?{...wire,attrs:{...wire.attrs,act:[rule['act.to']]}}:
  moved.includes(wire)?{...wire,attrs:{...wire.attrs,mode:[rule['mode.to']],determiner:[rule['determiner.to']]}}:wire);
 return {...candidate,wires:serialize(rewritten),hypothesis:rule.name};
}

const winningBounds=winner=>[['min_x','minX'],['min_y','minY'],['max_x','maxX'],['max_y','maxY']].map(([key,attribute])=>[key,Number(read(winner,attribute))]);

const boxesForTrace=({boxes,occupants})=>{
 const participants=new Set(occupants);
 return boxes.filter(box=>participants.has(box.entity)).map(({entity,min_x,min_y,max_x,max_y})=>({entity,min_x,min_y,max_x,max_y}));
};

/** A compiled call is consumed as SOP through the same exact native intent reader as UI controls. */
export async function invokeSpatialPlacementSop(session,{area,host,sop,invocation=globalThis.crypto.randomUUID()}) {
 const nodes=parse(sop),results=nodes.filter(wire=>wire.type==='std.placement.result');
 if(results.length!==1||read(results[0],'status')!=='compiled')throw Error('compiled-placement-result-required');
 const result=results[0],call=nodes.filter(wire=>wire.id===ref(result,'call')),before=host.observe();
 const operation=call.length===1?host.bindings().find(op=>op.id===call[0].type&&op.spatial):null;
 if(!operation)throw Error('compiled-placement-call-required');
 if(read(result,'instance')!==before.instanceId||read(result,'revision')!==host.spatialRevision()||read(result,'frame')!==operation.spatial.frame)
  return {receipt:{status:'refused',reason:'stale-observation'},before,operation};
 return invokeObservedNativeTool(session,{area,host,invocation,expectedVersion:before.version,sop:serialize(call),includeCall:true});
}
