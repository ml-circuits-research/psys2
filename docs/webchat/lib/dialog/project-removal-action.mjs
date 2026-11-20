// Ground an existing-object mention in the current application's declared vocabulary.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=742ead90b3';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=548a72e573';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=0aab7fb675';
import {projectGroundedRequest,observeGroundedProjection,resolveGroundedMention} from './grounded-projection.mjs?v=86c8217b5b';

const read=(wire,key)=>str(wire.attrs[key]?.[0]);
const articles=parse(LANG_EN_FACTS.determiners)
 .filter(wire=>read(wire,'kind')==='article'&&read(wire,'definite')==='yes')
 .map(wire=>read(wire,'text'));
const normalize=text=>typeof text==='string'?text.trim().toLowerCase():null;
const targetKeys=new Set(['type','mode','fill','determiner','name_span','description_span']);
const exactRange=(range)=>Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)&&range[0]>=0&&range[0]<range[1];
function anchored(raw,key,value){
 const path=JSON.stringify(['requests','0','target',key]);
 const spans=(raw.ranges??[]).filter(item=>JSON.stringify(item.path)===path);
 const source=Array.from(raw.source.text),range=spans[0]?.range;
 return spans.length===1&&exactRange(range)&&range[1]<=source.length&&source.slice(...range).join('')===value?range:null;
}
function diagnosticEvidence(raw,cutStart){
 const rows=raw.unresolved??[];
 const local=rows.filter(row=>row.path?.length===2&&row.path[0]==='requests'&&row.path[1]===0);
 const details=local.filter(row=>row.reason==='provider-unresolved');
 const detail=details.length===1?details[0].detail:undefined;
 const head=detail?.head;
 const ranges=Array.isArray(head?.ranges)?head.ranges:[];
 const [range]=ranges.filter(exactRange);
 return {diagnostics:rows.length,incomplete:local.filter(row=>row.reason==='incomplete-provider-coverage').length,
  reason:detail?.reason,head:head?.path,present:head?.present,ranges:Array.isArray(head?.ranges)?ranges.length:undefined,
  headStart:range?.[0]===undefined?undefined:range[0]+cutStart,headEnd:range?.[1]===undefined?undefined:range[1]+cutStart};
}
export function projectRemovalAction(proposal,session,{bindings,view}={}){
 const raw=proposal?.raw,request=raw?.requests?.[0],target=request?.target,area=NATIVE_AREAS[view];
 const readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!session.isession.state[area.world]||proposal.coverage?.complete||raw?.requestCount!==1||
   raw.area!==readerArea||raw.coverage?.truncated!==false||
   request.act!=='remove'||request.mood!=='do'||target?.mode!=='existing'||target.fill!=='written'||
   target.determiner!=='definite'||request.constraints?.length!==0||request.turn||request.question||
   Object.keys(target).some(key=>!targetKeys.has(key))||
   typeof target.name_span!=='string')return null;
 const noun=normalize(target.name_span);
 const nameSpan=anchored(raw,'name_span',target.name_span);
 if(!nameSpan)return null;
 const description=target.description_span===undefined?null:anchored(raw,'description_span',target.description_span);
 const evidence={start:nameSpan[0],end:nameSpan[1],descriptionMarked:target.description_span!==undefined,
  descriptionStart:description?.[0],descriptionEnd:description?.[1],
  ...diagnosticEvidence(raw,proposal.sourceCut?.spans?.[0]?.[0]??0)};
 const trigger=raw.ranges.filter(item=>JSON.stringify(item.path)===JSON.stringify(['requests','0','trigger']));
 if(trigger.length!==1||Array.from(raw.source.text).slice(...trigger[0].range).join('')!==request.trigger)return null;
 const lexemes=nativeKindCandidates(bindings).filter(mapping=>mapping.area===readerArea&&mapping.type===target.type&&mapping.nativeFamilyBinding)
  .flatMap(mapping=>{
   const lemma=normalize(mapping.lemma);
   if(!lemma)return [];
   const lexeme={area:mapping.area,family:mapping.type,canonical:mapping.canonical,witness:mapping.sourceWire??mapping.canonical};
   return [{...lexeme,text:lemma,form:'bare'},...articles.map(article=>({...lexeme,text:article+' '+lemma,form:'definite'}))];
  });
 const matches=resolveGroundedMention({text:noun,area:readerArea,family:target.type,lexemes,evidence});
 const mappings=new Map(matches.map(mapping=>[mapping.canonical,mapping]));
 if(!mappings.size||mappings.size>16)return null;
 const candidates=[...mappings.values()].flatMap(mapping=>{
  const graph=projectGroundedRequest({profile:'context',act:request.act,mood:request.mood,kind:mapping.canonical,text:raw.source.text,
   values:[],witness:mapping.witness});
  if(graph){
   graph.projection.input=mapping.proof+'\n'+graph.projection.input;
   graph.projection.support.unshift(mapping.support);
   observeGroundedProjection(session,graph.projection);
  }
  return graph?[graph]:[];
 });
 return candidates.length?{candidates,range:nameSpan,mention:target.name_span}:null;
}
