// Ground a mentioned word against candidate lemmas through the library's declared
// std.ground policy. This module only gathers evidence: the knowledge relations the
// policy says to follow (read from catalog facts that name each term) and the
// candidates' own measurements. Admission, costs and ranking belong to the policy.
import {parse,quote,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import {budget} from './budget.mjs?v=00bce6e369';
import {lemmaCandidates} from '../knowledge/facts.mjs?v=829529408b';

const LOOKUPS=48,EDGES=2048;
const atom=/^[A-Za-z_][A-Za-z0-9_.-]*$/;

const policyRow=(world,name)=>world.ofType('std.ground.policy').find(fact=>str(fact.attrs.name?.[0])===name);
// A followed relation is named as the catalog states it. A wire that qualifies its relation by a
// declared dimension (k.kinds.parent: kind, part_of, use, material…) states it as relation.dimension,
// so a policy admits exactly the dimensions it names: "is_a.kind" follows kind parents and never a
// part ("eyes" is_a cat, dimension part_of) or a use as kind evidence. An unqualified name follows
// only wires that state no dimension. "lemma" is the step from an inflected word to a lemma the
// catalog vocabulary knows ("dogs" to "dog").
function policyOf(world,name){
 const row=policyRow(world,name);
 if(!row)throw Error('missing-ground-policy');
 const follow=new Set((row.attrs.follow??[]).map(str));
 return {follow,maxSteps:Number(str(row.attrs.maxSteps?.[0]??'0')),relations:[...follow].map(relation=>{
  const cut=relation.indexOf('.');
  return cut<0?{relation,base:relation,dimension:null}:{relation,base:relation.slice(0,cut),dimension:relation.slice(cut+1)};
 })};
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
   const add=(relation,value)=>{
    const to=String(value).toLowerCase();
    if(!to||to===term||to.length>64||edges.size>=EDGES)return;
    edges.set(term+'\u0000'+relation+'\u0000'+to,{from:term,to,relation});
    if(!seen.has(to)){seen.add(to);next.push(to);}
   };
   if(policy.follow.has('lemma')&&typeof knowledge.knowsWord==='function')
    for(const lemma of lemmaCandidates(term).slice(1))if(knowledge.knowsWord(lemma)===true)add('lemma',lemma);
   for(const wire of thing?.wires??[]){
    if(!(wire.f?.name??[]).some(name=>String(name).toLowerCase()===term))continue;
    const dimensions=wire.f.dimension??[];
    if(dimensions.length>1)continue;
    const dimension=dimensions.length?String(dimensions[0]):null;
    for(const {relation,base,dimension:admitted} of policy.relations){
     if(base==='lemma'||admitted!==dimension)continue;
     for(const value of wire.f[base]??[])add(relation,value);
    }
   }
  }
  frontier=next;
 }
 return [...edges.values()];
}

// The library compiles one grounding request of at most this many wires. A larger
// candidate list is grounded in batches: every candidate the policy admits in a batch
// (any route with a cost) is carried into the next one, under its original identity,
// so the last request ranks exactly the admitted set one unbounded request would.
const REQUEST_WIRES=8192;
function groundBatch(world,policy,term,candidates,indices,edgeRows){
 const rows=[],measurements=[];
 for(const index of indices){
  const {lemma,measures={}}=candidates[index];
  const refs=Object.entries(measures).map(([metric,value],j)=>{
   if(!atom.test(metric)||!Number.isFinite(value))throw Error('invalid-ground-measure');
   const id='ground.in.measure.'+index+'.'+j;
   measurements.push({id,type:'std.choice.measurement',attrs:{metric:[metric],value:[String(value)]}});
   return '$'+id;
  });
  rows.push({id:'ground.in.candidate.'+index,type:'std.ground.candidate',attrs:{lemma:[quote(String(lemma))],...(refs.length?{measurement:refs}:{})}});
 }
 const request={id:'ground.in.request',type:'std.ground.request',attrs:{policy:[policy],mention:[quote(term)],
  ...(rows.length?{candidate:rows.map(row=>'$'+row.id)}:{}),...(edgeRows.length?{edge:edgeRows.map(row=>'$'+row.id)}:{})}};
 const input=serialize([request,...rows,...measurements,...edgeRows]);
 const sop=world.compileRequest(input);
 return {input,sop,output:parse(sop)};
}

// Spelling repair is evidence only for a mention the catalog vocabulary does not know: a known
// word ("ground", "eyes") is never repaired into another word ("round"). A policy P states this
// by declaring its companion P.word (the same policy without spelling) for known mentions.
export async function groundMention(world,requested,mention,candidates,knowledge){
 if(typeof requested!=='string'||!atom.test(requested))throw Error('invalid-ground-policy');
 const term=String(mention??'').normalize('NFC').toLowerCase();
 const edges=await knowledgeEdges(knowledge,term,policyOf(world,requested));
 const known=typeof knowledge?.knowsWord==='function'&&knowledge.knowsWord(term)===true;
 const policy=known&&policyRow(world,requested+'.word')?requested+'.word':requested;
 const edgeRows=edges.map((edge,index)=>({id:'ground.in.edge.'+index,type:'std.ground.edge',
  attrs:{from:[quote(edge.from)],to:[quote(edge.to)],relation:[edge.relation]}}));
 const index=token=>Number(String(token).split('.').pop());
 const size=i=>1+Object.keys(candidates[i].measures??{}).length,room=REQUEST_WIRES-1-edgeRows.length;
 const evidence=new Map();
 let carried=[],next=0,batch,result;
 do{
  budget.tick('grounding.batch');
  const indices=[...carried];
  let used=indices.reduce((sum,i)=>sum+size(i),0);
  const start=next;
  while(next<candidates.length&&used+size(next)<=room){budget.tick('grounding.batch.fill');used+=size(next);indices.push(next++);}
  if(next===start&&next<candidates.length)break;
  batch=groundBatch(world,policy,term,candidates,indices,edgeRows);
  result=batch.output.find(row=>row.type==='std.ground.result');
  if(!result)break;
  for(const row of batch.output.filter(row=>row.type==='std.ground.evidence'))evidence.set(index(row.attrs.candidate[0]),{
   route:row.attrs.route[0],cost:row.attrs.cost?Number(row.attrs.cost[0]):undefined,path:(row.attrs.path??[]).map(str)});
  carried=indices.filter(i=>evidence.get(i)?.cost!==undefined);
 }while(next<candidates.length);
 const complete=!!result&&next>=candidates.length;
 const listed=key=>complete?(result.attrs[key]??[]).map(index):[];
 return {input:batch?.input??'',sop:batch?.sop??'',edges,policy,known,selected:listed('selected')[0],alternatives:listed('alternative'),ties:listed('tie'),evidence};
}
