import {invokeToolCommand} from './native-control-intent.mjs?v=94cc7d01b8';
// A dice gesture samples declared UI fields. It is not a language-reader prediction.
import {copyHostData,validateNativeArguments} from '../../worlds/native-tool-host.mjs?v=812ac605aa';
const pick=(items,random)=>items.length?items[Math.min(items.length-1,Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*items.length))]:undefined;
const projection=observation=>JSON.stringify(observation.objects.map(({source,version,...row})=>({...row,inputs:(row.inputs??[]).map(({source,version,...input})=>input)})));
function argument(strategy,param,observation,random,serial){
 if(!strategy||typeof strategy!=='object')return {ok:false};
 if(Object.hasOwn(strategy,'value'))return {ok:true,value:copyHostData(strategy.value)};
 if(strategy.enum===true){const value=pick(param.enum??[],random);return value===undefined?{ok:false}:{ok:true,value};}
 if(strategy.ref){const candidates=observation.objects.filter(o=>o.sourceType===strategy.ref.on),row=pick(candidates,random);return row?{ok:true,value:strategy.ref.many?[row.id]:row.id}:{ok:false};}
 if(strategy.unique){const prefix=strategy.unique.prefix;if(typeof prefix!=='string'||!prefix)return {ok:false};const occupied=new Set(observation.objects.map(o=>o.id));for(let n=0;n<64;n++){const value=prefix+(strategy.unique.separator??' ')+serial+'-'+n;if(!occupied.has(value)&&!observation.objects.some(o=>(o.inputs??[]).some(input=>input.values.includes(JSON.stringify(value)))))return {ok:true,value};}return {ok:false};}
 if(strategy.now){const {round=1,offset=0}=strategy.now;if(!Number.isSafeInteger(round)||round<1||!Number.isSafeInteger(offset))return {ok:false};return {ok:true,value:Math.floor(Date.now()/round)*round+offset};}
 if(strategy.number){const {min,max,integer=false}=strategy.number;if(!Number.isFinite(min)||!Number.isFinite(max)||max<min)return {ok:false};const ratio=Math.max(0,Math.min(.999999999,Number(random())||0)),value=integer?Math.floor(min+ratio*(max-min+1)):min+ratio*(max-min);return {ok:true,value};}
 return {ok:false};
}
export async function sampleNativeControl({host,createHost,state,random=Math.random}={}){
 if(!host||typeof createHost!=='function'||typeof random!=='function')return null;
 const observation=host.observe(),bindings=host.bindings();if(bindings.length>256)return null;
 const candidates=[];for(const operation of bindings){if(!['make','change','place'].includes(operation.act)||!Array.isArray(operation.sample))continue;for(const recipe of operation.sample.slice(0,16))if(recipe?.args&&Object.keys(recipe.args).length<=32&&(!recipe.when?.missing||!observation.objects.some(o=>o.sourceType===recipe.when.missing)))candidates.push({operation,recipe});}
 if(!candidates.length)return null;
 for(let attempt=0;attempt<48;attempt++){
  const candidate=pick(candidates,random),args={};let complete=true;
  for(const [key,strategy]of Object.entries(candidate.recipe.args)){const parameter=candidate.operation.params[key];if(!parameter){complete=false;break;}const result=argument(strategy,parameter,observation,random,Date.now().toString(36)+'-'+attempt);if(!result.ok){complete=false;break;}args[key]=result.value;}
  if(!complete||!validateNativeArguments(candidate.operation,args).ok)continue;
  try{const clone=copyHostData(state),trial=await createHost({state:clone}),before=trial.observe(),operation=trial.bindings().find(o=>o.id===candidate.operation.id);if(!operation||!validateNativeArguments(operation,args).ok)continue;const receipt=await invokeToolCommand(trial,{invocation:'native-control-sample-'+attempt,expectedVersion:before.version,operation:operation.id,args});if(receipt.status==='changed'&&projection(before)!==projection(trial.observe()))return {operation:operation.id,args};}catch{/* A failed or unavailable native primitive is not a proposal. */}
 }
 return null;
}
