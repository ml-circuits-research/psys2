// Explicit neural structure -> published request graphs. No reading or execution.
import {serializeRequestGraph,inspectRequest,prepareRequestBatch} from '../vendor/sopworld/sopworld.mjs?v=ca48804f00';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=463e762442';
export const STRUCTURAL_PREDICTIONS_FORMAT='psys2.structural-predictions/1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonempty=v=>typeof v==='string'&&v.length>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const literal=value=>({kind:'literal',value}),ref=value=>({kind:'ref',value}),string=value=>({kind:'string',value});
export function decodeModelGraphs(prediction,{budget:stepLimit=200000,maxBytes=4000000,maxHypotheses=16,maxRequests=32,maxNodes=256,calibrations=[]}={}){
 const issues=[],candidates=[];let packet,steps=0;
 const fail=(reason,path,details)=>{throw {decoder:true,reason,path,...(details===undefined?{}:{details})};};
 const tick=(cost=1)=>{steps+=cost;if(steps>stepLimit)fail('decoder-budget',[]);};
 const budget={tick};
 const record=(v,keys,path)=>{tick();if(!plain(v)||Object.keys(v).some(k=>{tick(1+k.length);return !keys.includes(k);}))fail('unknown-or-invalid-fields',path);};
 const list=(v,path,limit=maxNodes)=>{tick();if(!Array.isArray(v)||v.length>limit)fail('invalid-or-oversized-list',path);return v;};
 const id=(v,path)=>{tick(typeof v==='string'?1+v.length:1);if(!nonempty(v))fail('unresolved-or-invalid-identity',path);return v;};
 const scalar=(v,path)=>{tick(typeof v==='string'?1+v.length:1);if(!nonempty(v))fail('unresolved-or-invalid-field',path);return v;};
 const token=(v,path)=>{record(v,['kind','value'],path);if(!['literal','string','ref'].includes(v.kind)||typeof v.value!=='string')fail('unresolved-or-invalid-token',path);tick(1+v.value.length);return {kind:v.kind,value:v.value};};
 const atom=(v,path)=>typeof v==='string'?literal(scalar(v,path)):token(v,path);
 const diagnostic=(error,hypothesis)=>({...error?.decoder?{reason:error.reason,path:error.path,...(error.details===undefined?{}:{details:error.details})}:{reason:'invalid-prediction-data'},...(hypothesis===undefined?{}:{hypothesis})});
 const output=()=>{const graph=candidates.some(c=>c.batch.entries.length>0);return {candidates,issues,predictions:packet??null,coverage:{complete:issues.length===0,executable:false,graphProposal:graph,ambiguous:candidates.length>1},steps};};
 try{
  if(![stepLimit,maxBytes,maxHypotheses,maxRequests,maxNodes].every(v=>Number.isSafeInteger(v)&&v>0))fail('invalid-decoder-limits',[]);
  packet=copyHostData(prediction,{maxBytes});
  const trustedCalibrations=list(copyHostData(calibrations,{maxBytes}),['calibrations'],maxHypotheses);
  record(packet,['format','source','model','coverage','hypotheses'],[]);
  if(packet.format!==STRUCTURAL_PREDICTIONS_FORMAT)fail('structural-predictions-required',[]);
  record(packet.model,['kind','sha256','decoderVersion'],['model']);
  if(packet.model.kind!=='structural-graph'||!hash(packet.model.sha256)||!Number.isSafeInteger(packet.model.decoderVersion)||packet.model.decoderVersion<1)fail('structural-model-required',['model']);
  record(packet.source,['text','unit'],['source']);
  if(typeof packet.source.text!=='string'||packet.source.unit!=='unicode-scalar')fail('invalid-source',['source']);
  const chars=[];for(const ch of packet.source.text){tick();const cp=ch.codePointAt(0);if(cp>=0xd800&&cp<=0xdfff)fail('invalid-unicode-source',['source']);chars.push(ch);}
  record(packet.coverage,['complete','truncated'],['coverage']);
  if(packet.coverage.complete!==true||packet.coverage.truncated!==false)fail('incomplete-structural-coverage',['coverage']);
  const hypotheses=list(packet.hypotheses,['hypotheses'],maxHypotheses);if(!hypotheses.length)fail('missing-structural-hypotheses',['hypotheses']);
  const range=(v,path,within=[0,chars.length])=>{list(v,path,2);if(v.length!==2||!v.every(Number.isSafeInteger)||v[0]<within[0]||v[1]>within[1]||v[0]>=v[1])fail('invalid-source-range',path);return [...v];};
  for(const [hi,h]of hypotheses.entries()){
   try{
    record(h,['requests','unresolved','confidence','auxiliaryScores'],['hypotheses',hi]);
    if(h.unresolved!==undefined&&list(h.unresolved,['unresolved']).length)fail('unresolved-structural-decisions',['unresolved'],h.unresolved);
    let confidence=null;
    if(h.confidence!==undefined){record(h.confidence,['scope','value','modelSha256','calibrationSha256'],['confidence']);if(h.confidence.scope!=='whole-graph'||typeof h.confidence.value!=='number'||h.confidence.value<0||h.confidence.value>1||h.confidence.modelSha256!==packet.model.sha256||!hash(h.confidence.calibrationSha256))fail('invalid-whole-graph-confidence',['confidence']);const matches=trustedCalibrations.filter(c=>{tick();return c.scope==='whole-graph'&&c.sha256===h.confidence.calibrationSha256&&c.modelSha256===packet.model.sha256&&c.decoderVersion===packet.model.decoderVersion;});if(matches.length!==1)fail('untrusted-whole-graph-calibration',['confidence']);confidence={...h.confidence,calibration:matches[0]};}
    const requests=list(h.requests,['requests'],maxRequests),entries=[],evidence=[];
    if(!requests.length){candidates.push({outcome:'no-request',batch:{entries:[]},confidence,auxiliaryScores:h.auxiliaryScores??null,origins:[packet.model]});continue;}
    for(const [ri,r]of requests.entries()){
     const base=['requests',ri];record(r,['id','span','act','mood','targets','constraints','groups','nots','quants','values','queries','root','after','unresolved','turn','evidence'],base);
     if(r.unresolved!==undefined&&list(r.unresolved,[...base,'unresolved']).length)fail('unresolved-request-decisions',[...base,'unresolved'],r.unresolved);
     if(r.turn!==undefined)fail('unsupported-turn-contract',[...base,'turn'],r.turn);
     const request=id(r.id,[...base,'id']),span=range(r.span,[...base,'span']);
     const anchors=new Map(),used=new Set();
     for(const e of list(r.evidence,[...base,'evidence'])){
      record(e,['path','ranges','origin','declaration'],[...base,'evidence']);list(e.path,['evidence','path']);if(!e.path.length||e.path.some(p=>{tick(typeof p==='string'?1+p.length:1);return typeof p!=='string';}))fail('invalid-evidence-path',['evidence']);
      const key=JSON.stringify(e.path);if(anchors.has(key))fail('duplicate-field-evidence',e.path);
      if(!['text','declaration'].includes(e.origin)||e.origin==='declaration'&&!nonempty(e.declaration)||e.origin==='text'&&e.declaration!==undefined)fail('invalid-field-origin',e.path);
      const ranges=list(e.ranges,e.path);if(!ranges.length)fail('missing-field-ranges',e.path);for(const v of ranges)range(v,e.path,span);anchors.set(key,e);
     }
     const anchored=(value,path)=>{const key=JSON.stringify(path);if(!anchors.has(key))fail('missing-field-source',path);used.add(key);return atom(value,path);};
     const source='__model_source',nodes=[{id:source,type:'std.request.source',attrs:{text:[string(packet.source.text)]}}];
     const requestNode={id:request,type:'std.request',attrs:{act:[anchored(r.act,['act'])],mood:[atom(r.mood,['mood'])],source:[ref(source)]}};nodes.push(requestNode);if(nodes.length>maxNodes)fail('node-budget',base);
     if(r.root!==undefined)requestNode.attrs.root=[ref(id(r.root,['root']))];
     const targetNodes=new Map(),constraints=new Map();
     const add=(node)=>{tick();if(nodes.length>=maxNodes)fail('node-budget',base);nodes.push(node);return node;};
     for(const t of list(r.targets,[...base,'targets'])){
      record(t,['id','mode','kind','name','determiner','selector'],['targets']);const tid=id(t.id,['targets','id']),attrs={request:[ref(request)],mode:[atom(t.mode,['targets',tid,'mode'])]};
      for(const key of ['kind','name'])if(t[key]!==undefined)attrs[key]=[anchored(t[key],['targets',tid,key])];
      if(t.determiner!==undefined)attrs.determiner=[atom(t.determiner,['targets',tid,'determiner'])];if(t.selector!==undefined)attrs.selector=[ref(id(t.selector,['targets',tid,'selector']))];
      if(targetNodes.has(tid))fail('duplicate-target',['targets',tid]);targetNodes.set(tid,add({id:tid,type:'std.request.target',attrs}));
     }
     const attachSource=(node,value,path)=>{if(value===undefined)return;const v=range(value,path,span);node.attrs.source=[ref(source)];node.attrs['source.start']=[literal(String(v[0]))];node.attrs['source.end']=[literal(String(v[1]))];};
     for(const c of list(r.constraints??[],[...base,'constraints'])){
      record(c,['id','target','phase','concept','operator','value','character','polarity','scope','relation','goal','act','unit','baseline','anchor','measure','from','to','source'],['constraints']);
      const cid=id(c.id,['constraints','id']),path=['constraints',cid];if(!['selector','result'].includes(c.phase))fail('unresolved-constraint-phase',[...path,'phase']);
      const attrs={request:[ref(request)],target:[ref(id(c.target,[...path,'target']))],concept:[anchored(c.concept,[...path,'concept'])],operator:[atom(c.operator,[...path,'operator'])],character:[atom(c.character,[...path,'character'])],polarity:[atom(c.polarity,[...path,'polarity'])]};
      if(c.value!==undefined){const key=JSON.stringify([...path,'value']);if(!anchors.has(key))fail('missing-field-source',[...path,'value']);used.add(key);attrs.value=(Array.isArray(c.value)?c.value:[c.value]).map(v=>token(v,[...path,'value']));}
      for(const key of ['relation','act','unit','anchor','from','to'])if(c[key]!==undefined)attrs[key]=[anchored(c[key],[...path,key])];
      if(c.goal!==undefined)attrs.goal=[ref(id(c.goal,[...path,'goal']))];
      for(const key of ['scope','baseline'])if(c[key]!==undefined)attrs[key]=[atom(c[key],[...path,key])];
      if(c.measure!==undefined){const key=JSON.stringify([...path,'measure']);if(!anchors.has(key))fail('missing-field-source',[...path,'measure']);used.add(key);attrs.measure=[token(c.measure,[...path,'measure'])];}
      if(attrs.operator[0].value==='occurred')attrs.phase=[literal(c.phase)];
      const node=add({id:cid,type:'std.request.constraint',attrs});attachSource(node,c.source,[...path,'source']);if(constraints.has(cid))fail('duplicate-constraint',path);constraints.set(cid,{node,phase:c.phase,target:c.target});
     }
     const logical=new Map();
     for(const g of list(r.groups??[],['groups'])){record(g,['id','operator','members'],['groups']);const gid=id(g.id,['groups','id']),members=list(g.members,['groups',gid,'members']).map(v=>id(v,['groups',gid,'members']));add({id:gid,type:'std.request.group',attrs:{request:[ref(request)],operator:[atom(g.operator,['groups',gid,'operator'])],member:members.map(ref)}});logical.set(gid,members);}
     for(const n of list(r.nots??[],['nots'])){record(n,['id','of'],['nots']);const nid=id(n.id,['nots','id']),of=id(n.of,['nots',nid,'of']);add({id:nid,type:'std.request.not',attrs:{request:[ref(request)],of:[ref(of)]}});logical.set(nid,[of]);}
     for(const q of list(r.quants??[],['quants'])){record(q,['id','kind','target','bind','body'],['quants']);const qid=id(q.id,['quants','id']),attrs={request:[ref(request)],kind:[atom(q.kind,['quants',qid,'kind'])]};for(const key of ['target','bind','body'])attrs[key]=[ref(id(q[key],['quants',qid,key]))];add({id:qid,type:'std.request.quant',attrs});logical.set(qid,[q.body]);}
     for(const v of list(r.values??[],['values'])){record(v,['id','target','concept'],['values']);const vid=id(v.id,['values','id']);add({id:vid,type:'std.request.value',attrs:{target:[ref(id(v.target,['values',vid,'target']))],concept:[anchored(v.concept,['values',vid,'concept'])]}});}
     const selectors=new Set();
     for(const [tid,target]of targetNodes){
      const selected=[...constraints.values()].filter(c=>{tick();return c.phase==='selector'&&c.target===tid;});
      if(!target.attrs.selector&&selected.length===1)target.attrs.selector=[ref(selected[0].node.id)];
      if(!target.attrs.selector&&selected.length>1)fail('missing-explicit-selector-closure',['targets',tid]);
      if(target.attrs.selector){const pending=[target.attrs.selector[0].value],seen=new Set();while(pending.length){budget.tick();const node=pending.pop();if(seen.has(node))continue;seen.add(node);if(constraints.has(node))selectors.add(node);pending.push(...(logical.get(node)??[]));}}
     }
     for(const [cid,c]of constraints)if((selectors.has(cid)?'selector':'result')!==c.phase)fail('selector-result-phase-mismatch',['constraints',cid]);
     const queries=list(r.queries??[],['queries']);
     for(const q of queries){record(q,['id','target','operation','concept','source'],['queries']);const qid=id(q.id,['queries','id']),attrs={request:[ref(request)],target:[ref(id(q.target,['queries',qid,'target']))],operation:[atom(q.operation,['queries',qid,'operation'])]};if(q.concept!==undefined)attrs.concept=[anchored(q.concept,['queries',qid,'concept'])];const node=add({id:qid,type:'std.request.query',attrs});attachSource(node,q.source,['queries',qid,'source']);(requestNode.attrs.query??=[]).push(ref(qid));}
     if([...anchors.keys()].some(key=>{tick();return !used.has(key);}))fail('unconsumed-field-evidence',['evidence']);
     const serialized=serializeRequestGraph({request,nodes},{budget:stepLimit});if(!serialized.ok)fail('invalid-request-graph',base,serialized.issues);
     const inspected=inspectRequest(serialized.world,request,{budget:{steps:stepLimit}});if(!inspected.ok)fail('invalid-request-graph',base,inspected.issues);
     if(requests.length>1&&r.after===undefined)fail('unresolved-request-dependencies',[...base,'after']);
     const after=list(r.after??[],[...base,'after'],maxRequests).map(v=>id(v,[...base,'after']));
     entries.push({id:request,request,wires:serialized.wires,after});evidence.push({request,span,fields:[...anchors.values()]});
    }
    const batch=prepareRequestBatch({entries},{budget:stepLimit});if(!batch.ok)fail('invalid-request-batch',[],batch.issues);
    candidates.push({...(entries.length===1?{request:entries[0].request,wires:entries[0].wires}:{}),batch:{entries},evidence:{unit:'unicode-scalar',requests:evidence},confidence,auxiliaryScores:h.auxiliaryScores??null,origins:[packet.model]});
   }catch(error){issues.push(diagnostic(error,hi));}
  }
 }catch(error){issues.push(diagnostic(error));}
 return output();
}
