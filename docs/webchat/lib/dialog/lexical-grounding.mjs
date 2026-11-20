// Ground a mentioned word against candidate lemmas through the library's declared
// std.ground policy. This module only gathers evidence: the knowledge relations the
// policy says to follow (read from catalog facts that name each term) and the
// candidates' own measurements. Admission, costs and ranking belong to the policy.
import {parse,quote,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=dde6e85489';
import {budget} from './budget.mjs?v=00bce6e369';

const LOOKUPS=48,EDGES=2048;
const atom=/^[A-Za-z_][A-Za-z0-9_.-]*$/;

function policyOf(world,name){
 const [row]=world.ofType('std.ground.policy').filter(fact=>str(fact.attrs.name?.[0])===name);
 if(!row)throw Error('missing-ground-policy');
 return {follow:new Set((row.attrs.follow??[]).map(str)),maxSteps:Number(str(row.attrs.maxSteps?.[0]??'0'))};
}

// Relations named by the policy, starting from the mention, bounded by its step limit.
async function knowledgeEdges(knowledge,mention,policy){
 const edges=new Map();
 if(typeof knowledge?.thing!=='function'||!policy.follow.size||!(policy.maxSteps>0))return [];
 const seen=new Set([mention]);
 let frontier=[mention],lookups=0;
 for(let depth=0;depth<policy.maxSteps&&frontier.length;depth++){
  const next=[];
  for(const term of frontier){
   if(++lookups>LOOKUPS)return [...edges.values()];
   budget.tick('grounding.knowledge');
   let thing=null;
   try{thing=await knowledge.thing(term);}catch{/* An unreadable term contributes no relation. */}
   for(const wire of thing?.wires??[]){
    if(!(wire.f?.name??[]).some(name=>String(name).toLowerCase()===term))continue;
    for(const relation of policy.follow)for(const value of wire.f[relation]??[]){
     const to=String(value).toLowerCase();
     if(!to||to.length>64||edges.size>=EDGES)continue;
     edges.set(term+'\u0000'+relation+'\u0000'+to,{from:term,to,relation});
     if(!seen.has(to)){seen.add(to);next.push(to);}
    }
   }
  }
  frontier=next;
 }
 return [...edges.values()];
}

export async function groundMention(world,policy,mention,candidates,knowledge){
 if(typeof policy!=='string'||!atom.test(policy))throw Error('invalid-ground-policy');
 const term=String(mention??'').normalize('NFC').toLowerCase();
 const edges=await knowledgeEdges(knowledge,term,policyOf(world,policy));
 const rows=[],measurements=[];
 candidates.forEach(({lemma,measures={}},index)=>{
  const refs=Object.entries(measures).map(([metric,value],j)=>{
   if(!atom.test(metric)||!Number.isFinite(value))throw Error('invalid-ground-measure');
   const id='ground.in.measure.'+index+'.'+j;
   measurements.push({id,type:'std.choice.measurement',attrs:{metric:[metric],value:[String(value)]}});
   return '$'+id;
  });
  rows.push({id:'ground.in.candidate.'+index,type:'std.ground.candidate',attrs:{lemma:[quote(String(lemma))],...(refs.length?{measurement:refs}:{})}});
 });
 const edgeRows=edges.map((edge,index)=>({id:'ground.in.edge.'+index,type:'std.ground.edge',
  attrs:{from:[quote(edge.from)],to:[quote(edge.to)],relation:[edge.relation]}}));
 const request={id:'ground.in.request',type:'std.ground.request',attrs:{policy:[policy],mention:[quote(term)],
  ...(rows.length?{candidate:rows.map(row=>'$'+row.id)}:{}),...(edgeRows.length?{edge:edgeRows.map(row=>'$'+row.id)}:{})}};
 const input=serialize([request,...rows,...measurements,...edgeRows]);
 const sop=world.compileRequest(input);
 const output=parse(sop),result=output.find(row=>row.type==='std.ground.result');
 const index=token=>Number(String(token).split('.').pop());
 const listed=key=>(result?.attrs[key]??[]).map(index);
 const evidence=new Map(output.filter(row=>row.type==='std.ground.evidence').map(row=>[index(row.attrs.candidate[0]),{
  route:row.attrs.route[0],cost:row.attrs.cost?Number(row.attrs.cost[0]):undefined,path:(row.attrs.path??[]).map(str)}]));
 return {input,sop,edges,selected:listed('selected')[0],alternatives:listed('alternative'),ties:listed('tie'),evidence};
}
