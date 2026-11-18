// Observe the actual mechanical tool boundary without changing execution or journal policy.
import{readNativeIntent}from'./native-intent-reader.mjs?v=0695766175';
import{copyHostData,toolInvocationContext}from'../../worlds/native-tool-host.mjs?v=66339be62d';
function emit(session,area,operation,phase,extra){
 try{session.engine?.onWorldActivity?.({nodeIds:['interpreter:'+area.world,'instance:'+area.world,...(area.stateWorld?[]:['native:'+area.world])],phase,label:operation,world:area.world,operation,...extra});}catch{/* Observation cannot change an operation. */}
}
export async function invokeObservedNativeTool(session,{area,host,invocation=globalThis.crypto.randomUUID(),expectedVersion,sop,includeCall=false}){
 const bindings=host.bindings?.(),{operation,args}=host.readCall ? host.readCall(sop) : readNativeIntent(sop,{operations:bindings});
 const declaration=includeCall?bindings?.find(binding=>binding.id===operation):null;
 const before=includeCall?host.observe():null;
 const started=performance.now();
 emit(session,area,operation,'start',{invocation,args:copyHostData(args),expectedVersion,sop});
 try{
  const receipt=await host.invoke(sop,toolInvocationContext(invocation,expectedVersion));
  const result=Object.fromEntries(['status','reason','verification','instanceId','beforeVersion','afterVersion','changed','effects','validation','sop'].filter(key=>receipt[key]!==undefined).map(key=>[key,copyHostData(receipt[key])]));
  emit(session,area,operation,'end',{invocation,durationMs:performance.now()-started,status:receipt.status,result});return includeCall?{before,operation:declaration,args,receipt,sop}:receipt;
 }catch(error){emit(session,area,operation,'error',{invocation,durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}
}
