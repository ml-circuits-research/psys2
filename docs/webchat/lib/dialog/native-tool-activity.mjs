// Observe the actual mechanical tool boundary without changing execution or journal policy.
import{copyHostData}from'../../worlds/native-tool-host.mjs?v=463e762442';
function emit(session,area,operation,phase,extra){
 try{session.engine?.onWorldActivity?.({nodeIds:['interpreter:'+area.world,'instance:'+area.world,'native:'+area.world],phase,label:operation,world:area.world,operation,...extra});}catch{/* Observation cannot change an operation. */}
}
export async function invokeObservedNativeTool(session,{area,host,invocation=globalThis.crypto.randomUUID(),operation,args,expectedVersion}){
 const started=performance.now();
 emit(session,area,operation,'start',{invocation,args:copyHostData(args),expectedVersion});
 try{
  const receipt=await host.invoke({invocation,expectedVersion,operation,args:copyHostData(args)});
  const result=Object.fromEntries(['status','reason','verification','instanceId','beforeVersion','afterVersion','changed','effects','validation'].filter(key=>receipt[key]!==undefined).map(key=>[key,copyHostData(receipt[key])]));
  emit(session,area,operation,'end',{invocation,durationMs:performance.now()-started,status:receipt.status,result});return receipt;
 }catch(error){emit(session,area,operation,'error',{invocation,durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}
}
