// Ground an existing-object mention in the current application's declared vocabulary.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=e931f8b20e';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=8ccb1aaeab';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=abf36e3d52';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=f430418571';
import {projectGroundedRequest,observeGroundedProjection,resolveGroundedMention} from './grounded-projection.mjs?v=01fe10c4a8';

const read=(wire,key)=>str(wire.attrs[key]?.[0]);
const articles=parse(LANG_EN_FACTS.determiners)
 .filter(wire=>read(wire,'kind')==='article'&&read(wire,'definite')==='yes')
 .map(wire=>read(wire,'text'));
const normalize=text=>typeof text==='string'?text.trim().toLowerCase():null;
const targetKeys=new Set(['type','mode','fill','determiner','name_span','description_span']);
function anchored(raw,key,value){
 const path=JSON.stringify(['requests','0','target',key]);
 const spans=raw.ranges.filter(item=>JSON.stringify(item.path)===path);
 return spans.length===1&&Array.from(raw.source.text).slice(...spans[0].range).join('')===value?spans[0].range:null;
}
function compatibleDiagnostic(raw,range,cutStart){
 const rows=raw.unresolved??[];
 if(rows.length!==2||!rows.every(row=>row.path?.length===2&&row.path[0]==='requests'&&row.path[1]===0)||
   !rows.some(row=>row.reason==='incomplete-provider-coverage'))return false;
 const detail=rows.find(row=>row.reason==='provider-unresolved')?.detail;
 const head=detail?.head;
 if(detail?.reason!=='presence-span-inconsistent'||!Array.isArray(head?.ranges))return false;
 if(head.path==='target.kind')return head.present===true&&head.ranges.length===0;
 const [observed]=head.ranges;
 return head.path==='target.description_span'&&head.present===false&&head.ranges.length===1&&
   Array.isArray(observed)&&observed.length===2&&observed.every((index,i)=>index+cutStart===range[i]);
}
export function projectRemovalAction(proposal,session,{bindings,view}={}){
 const raw=proposal?.raw,request=raw?.requests?.[0],target=request?.target,area=NATIVE_AREAS[view];
 const readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!session.isession.state[area.world]||proposal.coverage?.complete||raw?.requestCount!==1||
   raw.area!==readerArea||raw.coverage?.truncated!==false||
   request.act!=='remove'||request.mood!=='do'||target?.mode!=='existing'||target.fill!=='written'||
   target.determiner!=='definite'||request.constraints?.length!==0||request.turn||request.question||
   Object.keys(target).some(key=>!targetKeys.has(key))||
   typeof target.name_span!=='string'||target.name_span!==target.description_span) return null;
 const noun=normalize(target.name_span);
 const nameSpan=anchored(raw,'name_span',target.name_span),description=anchored(raw,'description_span',target.description_span);
 const cutStart=proposal.sourceCut?.spans?.[0]?.[0]??0;
 if(!nameSpan||!description||nameSpan.some((part,index)=>part!==description[index])||
   !compatibleDiagnostic(raw,nameSpan,cutStart))return null;
 const trigger=raw.ranges.filter(item=>JSON.stringify(item.path)===JSON.stringify(['requests','0','trigger']));
 if(trigger.length!==1||Array.from(raw.source.text).slice(...trigger[0].range).join('')!==request.trigger)return null;
 const lexemes=nativeKindCandidates(bindings).filter(mapping=>mapping.area===readerArea&&mapping.type===target.type&&mapping.nativeFamilyBinding)
  .flatMap(mapping=>{
   const lemma=normalize(mapping.lemma);
   if(!lemma)return [];
   return [lemma,...articles.map(article=>article+' '+lemma)].map(text=>({
    area:mapping.area,family:mapping.type,text,canonical:mapping.canonical,witness:mapping.sourceWire??mapping.canonical,
   }));
  });
 const matches=resolveGroundedMention({text:noun,area:readerArea,family:target.type,lexemes});
 const mappings=new Map(matches.map(mapping=>[mapping.canonical,mapping]));
 if(!mappings.size||mappings.size>16)return null;
 const candidates=[...mappings.values()].flatMap(mapping=>{
  const graph=projectGroundedRequest({profile:'context',act:request.act,mood:request.mood,kind:mapping.canonical,text:raw.source.text,
   values:[],witness:mapping.witness});
  if(graph)observeGroundedProjection(session,graph.projection);
  return graph?[graph]:[];
 });
 return candidates.length?{candidates,range:nameSpan,mention:target.name_span}:null;
}
