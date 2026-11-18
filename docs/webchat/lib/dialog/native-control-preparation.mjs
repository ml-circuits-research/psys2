// Shared declaration-driven knowledge preparation for UI and interpreted controls.
import{NATIVE_AREAS,createAreaHost}from'./app-reader-context.mjs?v=de06cfe134';
import{identityRegistryFor,instanceIdFor}from'./instance-identity.mjs?v=024ef1ca83';
export async function prepareNativeControlHost(session,{view,operation,args={},host=null,invocation=null}={}){
 const area=NATIVE_AREAS[view];if(!area)throw Error('unknown-native-area');
 const create=()=>createAreaHost(area,{state:session.isession.state[area.world],instanceId:instanceIdFor(session,area.world),identityRegistry:identityRegistryFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
 host??=await create();
 const inputs=host.bindings().find(declaration=>declaration.id===operation)?.knowledgeInputs??[];
 for(const input of inputs){
  const emit=(phase,extra={})=>{try{session.engine?.onWorldActivity?.({nodeIds:['knowledge:catalog','interpreter:'+area.world],phase,label:'Load declared tool knowledge',world:area.world,operation,invocation,service:input.load,argument:input.argument,value:args[input.argument],...extra});}catch{/* Observation must not change preparation. */}};
  const started=performance.now();emit('start');
  try{const service=session.engine?.knowledge?.[input.load];if(typeof service!=='function')throw Error('knowledge-service-unavailable');const value=await service.call(session.engine.knowledge,args[input.argument]);emit('end',{durationMs:performance.now()-started,available:value!==null&&value!==undefined});}catch(error){emit('error',{durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}
 }
 return inputs.length?await create():host;
}
