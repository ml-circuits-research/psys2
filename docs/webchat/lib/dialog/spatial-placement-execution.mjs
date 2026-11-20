// Assemble trusted native observations and dispatch the compiler's SOP call.
import {World,parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=5221d62911';
import SOURCE from './new-engine-source.mjs?v=ff3610e673';
import {readPlacementProfile,rememberPlacement} from '../../worlds/app.project/spatial-profile.mjs?v=e21507370c';
import {placementInterfaceSop} from '../../worlds/native-spatial-interface.mjs?v=fcd7c60e58';
import {NATIVE_AREAS,createAreaHost} from './app-reader-context.mjs?v=c12a1b8eb7';
import {identityRegistryFor,instanceIdFor} from './instance-identity.mjs?v=024ef1ca83';
import {nativeKindCandidates,nativeCreationCandidates} from './native-binding-candidates.mjs?v=a1e925e0c7';
import {invokeObservedNativeTool} from './native-tool-activity.mjs?v=31d2f5a090';
import {describeNativeControl,verifyNativeControlEffect} from './native-control-intent.mjs?v=fa577c754c';
import {placementSearchProvider,placementSearchStatus} from './placement-search-provider.mjs?v=6dc0cd0da0';

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

export async function executeSpatialPlacement(session,candidate,{bindings,view}={}) {
 const area=NATIVE_AREAS[view],state=area&&session.isession.state[area.world];
 const fail=(reason,details={})=>reply(reason==='stale-observation'
  ?'The scene changed before I could apply the placement.'
  :'I could not apply the requested placement. Nothing changed.',false,{reason,reading:candidate,...details});
 if(!state||!bindings)return fail('spatial-instance-unavailable');
 const started=performance.now();
 let host,spatial,sop,proposal,hypotheses=null;
 try{
  const hostOptions={state,instanceId:instanceIdFor(session,area.world),identityRegistry:identityRegistryFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge};
  host=await createAreaHost(area,hostOptions);
  if(!host.observeSpatial)return fail('spatial-observation-unavailable');
  const areaId=bindings.readerAreaByView?.[view]??area.area;
  const concepts=new Set(parse(candidate.wires).filter(wire=>wire.type==='std.request.target').map(wire=>read(wire,'kind')).filter(Boolean));
  const constructors=nativeCreationCandidates(bindings,host.bindings(),areaId).filter(pair=>pair.mapping.area===areaId&&concepts.has(pair.mapping.canonical));
  // A constructor that reads declared knowledge for its kind argument (a catalog drawing by name) gets it loaded for
  // the request's kinds first, the way a UI control's preparation does, so their extents can be measured.
  const lookups={};
  for(const {mapping,operation} of constructors){
   const key=operation.spatial?.kindKey,inputs=(operation.knowledgeInputs??[]).filter(input=>input.argument===key);
   if(!key||!inputs.length)continue;
   (lookups[key]??=[]).push(mapping.lemma);
   for(const input of inputs){
    try{await session.engine?.knowledge?.[input.load]?.call(session.engine.knowledge,mapping.lemma);}
    catch(error){if(error?.name==='BudgetExceeded'||error?.name==='TurnAborted')throw error;}
   }
  }
  if(Object.keys(lookups).length)host=await createAreaHost(area,{...hostOptions,args:lookups});
  spatial=host.observeSpatial();
  const {observation,revision,frame,scope,unknown,occupants}=spatial;
  if(unknown.some(entity=>occupants.includes(entity)))return fail('unknown-peer-geometry',{unknown});
  const context=baseWorld()?.fork();
  if(!context)return fail('spatial-world-unavailable');
  const mappings=nativeKindCandidates(bindings).filter(mapping=>mapping.area===areaId&&mapping.nativeFamilyBinding);
  const native=placementInterfaceSop(host,spatial,mappings,candidate.request,{constructors,concepts});
  const profile=readPlacementProfile(session,spatial);
  const admitted=context.tell(native.configuration+'\n'+profile,{factsOnly:true});
  if(!admitted.ok)return fail('spatial-context-rejected',{diagnostics:admitted.violations});
  activity(session,area,{phase:'start',label:'Compile placement from observed geometry',instance:observation.instanceId,revision,frame,scope,participants:boxesForTrace(spatial),profile});
  // Z3 solves the placement problem where the page can run it (loaded on the first one); otherwise the call
  // stays synchronous with the library's internal search.
  const provider=placementSearchProvider();
  const compile=async wires=>{
   const out=provider?await context.compileRequest(wires+'\n'+native.context,{provider}):context.compileRequest(wires+'\n'+native.context);
   return {sop:out,proposal:parse(out).find(wire=>['std.placement.result','std.compile.result'].includes(wire.type))};
  };
  ({sop,proposal}=await compile(candidate.wires));
  // Ranked hypotheses: a definite description that names no object on the page ("put the sun above the house" with
  // no sun) also reads as asking for one, placed as requested. The reading as given ranks first; the creating one is
  // tried only when the given one has no target, and its use is disclosed (and can be undone).
  const creating=read(proposal,'status')!=='compiled'&&read(proposal,'reason')==='unbound-target'?creationHypothesis(candidate):null;
  if(creating){
   const second=await compile(creating.wires);
   hypotheses={given:{reason:read(proposal,'reason'),placement:sop},creating:{status:read(second.proposal,'status'),reason:read(second.proposal,'reason')}};
   if(read(second.proposal,'status')==='compiled'){({sop,proposal}=second);candidate=creating;hypotheses.used='creating';}
  }
  activity(session,area,{phase:'end',label:'Compiled placement from observed geometry',durationMs:performance.now()-started,status:read(proposal,'status'),
   provider:read(proposal,'provider'),search:provider?placementSearchStatus():undefined,sop});
 }catch(error){
  if(error?.name==='BudgetExceeded'||error?.name==='TurnAborted')throw error;
  return fail('spatial-compilation-error',{error:String(error?.message??error)});
 }
 if(read(proposal,'status')!=='compiled')return fail(read(proposal,'reason')??'spatial-compiler-unavailable',{placement:sop});
 if(session.isession.state[area.world]!==state)return fail('stale-observation',{placement:sop});
 let result;
 try{result=await invokeSpatialPlacementSop(session,{area,host,sop});}
 catch(error){return fail('invalid-compiled-placement',{placement:sop,error:String(error?.message??error)});}
 const {receipt,operation,args,before}=result;
 if(receipt.status==='refused')return fail(receipt.reason,{receipt,placement:sop,controlIntent:result.sop});
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
 const trace={assessment:receipt.status,receipt,reading:candidate,placement:sop,effectVerification:verification,observedBounds:bounds,geometryVerified,controlIntent:result.sop,
  ...(hypotheses?{hypotheses,uncertainty:hypotheses.used?['created-absent-target']:[]}:{})};
 const changed=receipt.status==='changed',worldState={[area.world]:structuredClone(state)},effects=changed?[{operation:operation.id}]:[];
 const observedLocation=bounds?' at ('+((bounds.min_x+bounds.max_x)/2)+', '+((bounds.min_y+bounds.max_y)/2)+')':'';
 const effect=target?(operation.act==='make'?'Created ':'Moved ')+target.kind+' '+target.id+observedLocation+'. ':'';
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

/** The reading that creates each definite subject of a relation instead of moving one (act place -> make). */
function creationHypothesis(candidate){
 const nodes=parse(candidate.wires),request=nodes.find(wire=>wire.type==='std.request'&&wire.id===candidate.request);
 if(read(request,'act')!=='place')return null;
 const subjects=new Set(nodes.filter(wire=>wire.type==='std.request.constraint'&&read(wire,'operator')==='relation').map(wire=>ref(wire,'target')));
 const moved=nodes.filter(wire=>wire.type==='std.request.target'&&subjects.has(wire.id)&&read(wire,'mode')==='existing'&&read(wire,'determiner')==='definite'&&!wire.attrs.name&&!wire.attrs.selector);
 if(!moved.length)return null;
 const rewritten=nodes.map(wire=>wire===request?{...wire,attrs:{...wire.attrs,act:['make']}}:
  moved.includes(wire)?{...wire,attrs:{...wire.attrs,mode:['new'],determiner:['indefinite']}}:wire);
 return {...candidate,wires:serialize(rewritten),hypothesis:'create-absent-target'};
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
