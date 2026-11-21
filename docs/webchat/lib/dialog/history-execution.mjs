import {readAuthoredRequest} from './authored-request-tool.mjs?v=8ddb059cc1';
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import {historyPolicy} from './history-policy.mjs?v=e051f9cf0e';
import {observeHistory,createHistoryTool} from './history-tool.mjs?v=0038b8389b';
import {invokeObservedNativeTool} from './native-tool-activity.mjs?v=86d64591aa';

const area={world:'app.history',stateWorld:true};
const first=(wire,key)=>wire?.attrs[key]?.[0];

async function execute(session,candidate,view){
 const authored=historyPolicy(),request=parse(candidate.wires).find(wire=>wire.type==='std.request'&&wire.id===candidate.request);
 const act=first(request,'act');
 if(!authored.ofType('std.compile.rule').some(wire=>first(wire,'act')===act))return null;
 const world=authored.fork(),heads=observeHistory(session,view);
 if(!world.tell(serialize(heads),{factsOnly:true}).ok)throw Error('invalid-history-observation');
 const compiledSop=world.compileRequest(candidate.wires);
 const [result]=parse(compiledSop);
 if(first(result,'status')!=='compiled'){
  const reason=first(result,'reason');
  const empty=reason==='no-complete-derivation'&&!heads.some(wire=>first(wire,'direction')===act);
  return {ok:false,changed:false,compiledSop,reason:empty?'empty-history':reason,
   message:empty?'There is no earlier action to '+act+'.':'I could not apply that history request. Nothing changed.'};
 }
 const sop=world.compileToolInput(compiledSop);
 const host=createHistoryTool(session,view),{args}=host.readCall(sop);
 try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:history-policy'],phase:'stage',operation:'std.compile',
  label:'Compile journal command',wires:compiledSop});}catch{/* Observation cannot change execution. */}
 const receipt=await invokeObservedNativeTool(session,{area,host,expectedVersion:args.entry,sop});
 const ok=receipt.status==='changed'&&receipt.verification==='verified';
 const message=ok?(receipt.direction==='redo'?'Redid the last action.':'Undid the last action.'):
  receipt.reason==='history-content-changed'?'The objects changed after that action. Nothing changed.':'The journal changed before the operation. Nothing changed.';
 const verification={status:receipt.verification,reason:receipt.reason??'journal-content-restored-with-current-view-preferences'};
 return {ok,changed:ok,message,reason:receipt.reason,receipt,compiledSop,sop,
  intentRecord:{format:'psys2.ui-training-pair/1',id:receipt.invocation,view,world:area.world,text:message,wires:sop,
   tool:{operation:receipt.operation,args},verification,before:receipt.before,after:receipt.after,outcome:receipt.status}};
}

export async function runHistoryControlQuery(session,view,wires){
 const {candidate,reason}=readAuthoredRequest(wires);
 if(!candidate)throw Error(reason);
 const result=await execute(session,candidate,view);
 if(!result)throw Error('undeclared-history-request');
 if(result.intentRecord){
  const nodes=parse(candidate.wires),request=nodes.find(node=>node.id===candidate.request);
  const source=nodes.find(node=>'$'+node.id===first(request,'source'));
  result.intentRecord.inputSop=wires;
  result.intentRecord.text=str(first(source,'text'))??result.message;
 }
 return result;
}

export async function executeHistoryRequest(session,candidate,view){
 const result=await execute(session,candidate,view);
 if(!result)return null;
 const {ok,message,receipt,compiledSop,sop,reason}=result;
 return {text:message,parts:[{text:message,translate:false}],statuses:[ok?'supported':'unsupported'],answers:[],segments:[],
  state:ok?structuredClone(session.isession.state):{},effects:ok?[{operation:receipt.direction}]:[],
  trace:{legacy:false,engine:'new',history:true,assessment:ok?receipt.direction:'history-refused',compiledSop,controlIntent:sop,receipt,reason,
   effectVerification:result.intentRecord?.verification}};
}
