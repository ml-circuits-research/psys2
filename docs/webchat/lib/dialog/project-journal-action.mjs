// A declared journal-step act has no object/property arguments. This consumes model structure, never source words.
import {serializeRequestGraph} from '../vendor/sopworld/sopworld.mjs?v=b7d50d9480';
import {historyPolicy} from './history-policy.mjs?v=86df5db75d';
export function projectJournalAction(proposal) {
 const raw=proposal?.raw,request=raw?.requests?.[0];
 const profile=request?.target?.fill && historyPolicy().ofType('app.history.reader').find(wire=>wire.attrs.act[0]===request.act&&wire.attrs.fill[0]===request.target.fill);
 if(!profile||proposal.coverage?.complete||raw.requestCount!==1||raw.coverage?.truncated||(request.mood!==undefined&&request.mood!=='do')||request.constraints?.length!==0)return proposal;
 if(request.turn?.repeat_count!==undefined&&request.turn.repeat_count!==1)return proposal;
 const anchors=raw.ranges?.filter(r=>JSON.stringify(r.path)===JSON.stringify(['requests','0','trigger']))??[];
 const sourceAnchored=anchors.length===1&&Array.from(raw.source.text).slice(...anchors[0].range).join('')===request.trigger;
 const wholeSpan=(raw.ranges??[]).some(r=>JSON.stringify(r.path)===JSON.stringify(['requests','0','span'])&&r.range[0]===0&&r.range[1]===Array.from(raw.source.text).length);
 if(!sourceAnchored&&!wholeSpan)return proposal;
 const serialized=serializeRequestGraph({request:'journal.request',nodes:[
  {id:'journal.source',type:'std.request.source',attrs:{text:[{kind:'string',value:raw.source.text}]}},
  {id:'journal.request',type:'std.request',attrs:{act:[{kind:'literal',value:request.act}],mood:[{kind:'literal',value:'do'}],source:[{kind:'ref',value:'journal.source'}]}}
 ]});
 if(!serialized.ok)return proposal;
 return {...proposal,candidates:[{request:'journal.request',wires:serialized.wires}],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'journal-step/1',unresolved:proposal.failures}};
}
