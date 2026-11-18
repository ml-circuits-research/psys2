// Predicted raw structure -> declared canonical structure. No reader or gold input.
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=2bfbd36d18';
import {decodeModelGraphs} from './model-graph-decoder.mjs?v=53b983b1e0';
export const RAW_STRUCTURAL_FORMAT='psys2.raw-structural-predictions/1';
const has=(o,k)=>Object.hasOwn(o,k),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys={request:['span','trigger','mood','act','target','constraints','question','turn'],target:['type','mode','fill','determiner','kind','kind_span','name_span','description_span','ordinal','count','count_span','quantifier'],constraint:['key','value','value_span','operator','phase','polarity','character','step','measure','measure_span','unit','anchor_span','anchor_fill','variety','scope','group']};
export function bridgeRawStructure(prediction,{bindings,bindingSha256,budget=200000,maxBytes=4000000,decoderBudget=200000}={}){
 let raw,table,steps=0;const diagnostics=[],projected=[];
 const fail=(reason,path=[])=>{throw {reason,path};};
 const tick=(n=1)=>{steps+=n;if(steps>budget)fail('bridge-budget');};
 const issue=(reason,path)=>diagnostics.push({reason,path});
 const shape=(o,allowed,path)=>{tick();if(!o||typeof o!=='object'||Array.isArray(o))fail('invalid-object',path);for(const k of Object.keys(o)){tick();if(!allowed.includes(k))issue('unsupported-raw-field',[...path,k]);}};
 // Exact supplied span matching; never searches for a verb, phrase or synonym.
 const unique=(text,literal,base=0)=>{
  if(typeof literal!=='string'||!literal)return null;const hay=Array.from(text),needle=Array.from(literal);tick(hay.length+needle.length);let found=null;
  for(let i=0;i+needle.length<=hay.length;i++){let same=true;for(let j=0;j<needle.length;j++){tick();if(hay[i+j]!==needle[j]){same=false;break;}}if(same){if(found!==null)return null;found=i;}}
  return found===null?null:[base+found,base+found+needle.length];
 };
 try{
  if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(decoderBudget)||decoderBudget<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4000000)fail('invalid-budget');
  raw=copyHostData(prediction,{maxBytes});table=copyHostData(bindings,{maxBytes});
  shape(raw,['format','source','area','model','coverage','requestCount','requests','unresolved','ranges'],[]);
  shape(raw.source,['text','unit'],['source']);shape(raw.coverage,['complete','truncated'],['coverage']);
  if(raw.format!==RAW_STRUCTURAL_FORMAT||raw.source?.unit!=='unicode-scalar'||typeof raw.source.text!=='string'||typeof raw.area!=='string')fail('invalid-raw-envelope');
  if(table.format!=='sop.structural-bindings/1'||!hash(bindingSha256))fail('invalid-binding-snapshot');
  if(table.families!==undefined&&(!Array.isArray(table.families)||table.families.length>256))fail('invalid-family-binding-table');
  for(const row of table.families??[]){tick();if(!row||!['area','type','canonical','sourceWire','sourceWorld','moduleVersion'].every(k=>typeof row[k]==='string'&&row[k])||!hash(row.sourceSnapshotSHA)||row.alignment?.kind!=='explicit-raw-family-identity')fail('invalid-family-binding-record');}
  if(!Array.isArray(raw.requests)||raw.requests.length>32||raw.requestCount!==raw.requests.length||!Number.isSafeInteger(raw.requestCount))issue('unresolved-or-overflow-request-count',['requestCount']);
  if(!Array.isArray(raw.requests)||raw.requests.length>32)fail('request-budget');
  if(raw.coverage?.complete!==true||raw.coverage?.truncated!==false)issue('incomplete-model-coverage',['coverage']);
  if(raw.unresolved!==undefined&&(!Array.isArray(raw.unresolved)||raw.unresolved.length))issue('unresolved-model-output',['unresolved']);
  const sourceChars=Array.from(raw.source.text),ranges=new Map(),usedRanges=new Set();tick(sourceChars.length);
  for(const r of raw.ranges??[]){shape(r,['path','range'],['ranges']);if(!Array.isArray(r.path)||r.path.some(x=>typeof x!=='string')||!Array.isArray(r.range)||r.range.length!==2||!r.range.every(Number.isSafeInteger)||r.range[0]<0||r.range[1]>sourceChars.length||r.range[0]>=r.range[1])fail('invalid-predicted-range');const key=JSON.stringify(r.path);if(ranges.has(key))fail('duplicate-predicted-range');ranges.set(key,r.range);}
  const locate=(segment,literal,base,path,within)=>{
   const key=JSON.stringify(path),range=ranges.get(key);if(!range)return unique(segment,literal,base);usedRanges.add(key);tick(range[1]-range[0]);
   if(typeof literal!=='string'||sourceChars.slice(...range).join('')!==literal||within&&(range[0]<within[0]||range[1]>within[1])){issue('incompatible-predicted-range',path);return null;}return [...range];
  };
  const lookup=(family,criteria)=>{
   if(!Array.isArray(table[family]??[]))fail('invalid-binding-family',[family]);const found=[];
   for(const row of table[family]??[]){tick();if(Object.entries(criteria).every(([k,v])=>row[k]===v))found.push(row);}
   if(found.length!==1)return null;const r=found[0];
   if(!['canonical','sourceWire','sourceWorld','moduleVersion'].every(k=>typeof r[k]==='string'&&r[k])||!hash(r.sourceSnapshotSHA))return null;return r;
  };
  for(const [index,original]of raw.requests.entries()){
   tick();const basePath=['requests',index],start=diagnostics.length;shape(original,keys.request,basePath);
   const rid=`r${index}`,tid=`t${index}`,evidence=[],label={id:rid,targets:[],constraints:[],evidence};projected.push(label);
   const unresolved=(reason,path)=>issue(reason,[...basePath,...path]);
   const rawPath=['requests',String(index)];
   const span=locate(raw.source.text,original.span,0,[...rawPath,'span']);if(span)label.span=span;else unresolved('ambiguous-or-missing-request-span',['span']);
   if(raw.requests.length===1)label.after=[];else unresolved('request-dependencies-not-annotated',['after']);
   const anchor=(path,literal,declaration=null,allowRequest=false,fieldPath=[])=>{
    let range=span?locate(original.span,literal,span[0],[...rawPath,...fieldPath],span):null;if(!range&&allowRequest&&span)range=span;
    if(!range){unresolved('missing-or-ambiguous-field-anchor',path);return;}
    evidence.push({path,ranges:[range],origin:declaration?'declaration':'text',...(declaration?{declaration}:{})});
   };
   for(const field of ['act','mood'])if(has(original,field))label[field]=original[field];else unresolved('missing-annotated-field',[field]);
   anchor(['act'],original.trigger,null,false,['trigger']);
   const target=original.target??{};shape(target,keys.target,[...basePath,'target']);const t={id:tid};label.targets.push(t);
   if(['new','existing','bound'].includes(target.mode))t.mode=target.mode;else unresolved('missing-target-mode',['targets',tid,'mode']);
   const kind=lookup('kinds',{area:raw.area,type:target.type,lemma:target.kind});
   const family=target.mode!=='bound'&&!has(target,'kind')&&!has(target,'kind_span')&&typeof target.type==='string'?lookup('families',{area:raw.area,type:target.type}):null;
   if(kind){t.kind=kind.canonical;anchor(['targets',tid,'kind'],target.kind_span||target.kind,kind.sourceWire,false,['target',target.kind_span?'kind_span':'kind']);}
   else if(family){t.kind=family.canonical;anchor(['targets',tid,'kind'],null,family.sourceWire,true);}
   else if(target.mode!=='bound')unresolved('unresolved-canonical-kind-binding',['targets',tid,'kind']);
   if(has(target,'name_span')){t.name={kind:'string',value:target.name_span};anchor(['targets',tid,'name'],target.name_span,null,false,['target','name_span']);}
   if(has(target,'determiner'))t.determiner=target.determiner;
   if(['context','previous_reply','journal_step'].includes(target.fill))unresolved('context-reference-not-bound',['targets',tid]);
   else if(target.fill==='all'&&target.mode!=='bound')unresolved('unprojected-population-reference',['targets',tid]);
   else if(target.fill!==undefined&&!['written','description','all'].includes(target.fill))unresolved('unknown-target-fill',['targets',tid]);
   if(has(target,'count_span')&&!has(target,'count'))unresolved('unowned-count-span',['targets',tid,'count_span']);
   for(const field of ['count','ordinal'])if(has(target,field))unresolved(`requires-declared-${field}-projection`,['targets',tid,field]);
   const phase={selector:[],result:[]},conditions=original.constraints??[];if(!Array.isArray(conditions)||conditions.length>256)fail('constraint-budget',basePath);
   for(const [ci,condition]of conditions.entries()){
    tick();shape(condition,keys.constraint,[...basePath,'constraints',ci]);const cid=`c${index}_${ci}`,c={id:cid,target:tid},path=['constraints',cid];label.constraints.push(c);
    for(const field of ['phase','operator','character','polarity'])if(has(condition,field))c[field]=condition[field];else unresolved('missing-annotated-field',[...path,field]);
    if(phase[c.phase])phase[c.phase].push([cid,condition]);
    const prop=lookup('properties',{area:raw.area,key:condition.key});
    if(prop){c.concept=prop.canonical;anchor([...path,'concept'],condition.value_span,prop.sourceWire,true,['constraints',String(ci),'value_span']);}else unresolved('unresolved-canonical-property-binding',[...path,'concept']);
    if(has(condition,'value')){
     if(['literal','string'].includes(prop?.valueKind)&&typeof condition.value==='string'){
      const supplied=has(condition,'value_span'),literal=supplied?condition.value_span:condition.value;
      const valuePath=[...rawPath,'constraints',String(ci),'value'],hasCopy=ranges.has(JSON.stringify(valuePath));
      if(hasCopy){
       // Explicit model copy pointers may be narrower than the original evidence span.
       const outer=span?(supplied?locate(original.span,literal,span[0],[...rawPath,'constraints',String(ci),'value_span'],span):span):null;
       const copy=outer?locate(original.span,condition.value,span[0],valuePath,outer):null;
       if(copy){c.value={kind:prop.valueKind,value:condition.value};evidence.push({path:[...path,'value'],ranges:[copy],origin:'text'});}
       else unresolved('invalid-source-copy-range',[...path,'value']);
      }else{
       const identity=typeof literal==='string'&&literal.length>0&&literal===condition.value;
       const normalization=identity?null:lookup('valueNormalizations',{area:raw.area,key:condition.key,canonical:prop.canonical,source:literal,value:condition.value,valueKind:prop.valueKind});
       if(identity||normalization){c.value={kind:prop.valueKind,value:condition.value};anchor([...path,'value'],literal,normalization?.sourceWire??null,false,['constraints',String(ci),supplied?'value_span':'value']);}
       else unresolved('unresolved-source-value-normalization',[...path,'value']);
      }
     }else unresolved('unresolved-value-representation',[...path,'value']);
    }
    if(!['eq','less.equal','greater.equal','degree','region'].includes(condition.operator))unresolved('requires-operator-reference-projection',path);
    if(['each','group'].includes(condition.scope))c.scope=condition.scope;else if(has(condition,'scope'))unresolved('unknown-condition-scope',[...path,'scope']);
    if(has(condition,'measure_span')&&!has(condition,'measure')&&!has(condition,'unit'))unresolved('unowned-measure-span',[...path,'measure_span']);
    if(has(condition,'measure')&&condition.measure!==condition.value)unresolved('requires-measure-projection',[...path,'measure']);
    for(const field of ['group','variety','step','anchor_fill','anchor_span'])if(has(condition,field))unresolved(`requires-declared-${field}-projection`,[...path,field]);
    if(has(condition,'unit')){const unit=lookup('units',{lemma:condition.unit});if(unit){c.unit=unit.canonical;anchor([...path,'unit'],condition.measure_span||condition.value_span,unit.sourceWire,false,['constraints',String(ci),condition.measure_span?'measure_span':'value_span']);}else unresolved('unresolved-unit-binding',[...path,'unit']);}
    const bounds=span?locate(original.span,condition.value_span,span[0],[...rawPath,'constraints',String(ci),'value_span'],span):null;if(bounds)c.source=bounds;
   }
   const and=table.projectionPolicy?.unmarkedConditions==='and'&&hash(table.projectionPolicy.sourcePromptSha256);
   const selectors=phase.selector;
   if(target.description_span&&selectors.length&&span&&!locate(original.span,target.description_span,span[0],[...rawPath,'target','description_span'],span))unresolved('missing-or-ambiguous-description-anchor',['targets',tid]);
   if(target.description_span&&!selectors.length)unresolved('description-reference-without-predicate',['targets',tid]);
   if(selectors.length===1)t.selector=selectors[0][0];else if(selectors.length>1){
    if(and&&selectors.every(([,c])=>!has(c,'group'))){const id=`g${index}_selector`;(label.groups??=[]).push({id,operator:'and',members:selectors.map(([id])=>id)});t.selector=id;}else unresolved('selector-logical-closure-not-projected',['targets',tid,'selector']);
   }
   if(phase.result.length===1)label.root=phase.result[0][0];
   if(has(original,'question'))unresolved('requires-declared-query-projection',['queries']);
   if(has(original,'turn')){label.turn=original.turn;unresolved('turn-contract-not-projected',['turn']);}
   const quant=target.quantifier;
   if(t.mode==='bound'&&['all','any','each','none'].includes(quant)&&!selectors.length&&phase.result.length&&phase.result.every(([,c])=>(c.scope===undefined||c.scope==='each')&&!has(c,'group')&&!has(c,'variety'))){
    const members=phase.result.map(([id])=>id);let body=members.length===1?members[0]:null;
    if(!body&&and){body=`g${index}_body`; (label.groups??=[]).push({id:body,operator:'and',members});}
    if(body){const id=`collection${index}`,collection={id,mode:'existing'};for(const f of ['kind','name','determiner'])if(has(t,f)){collection[f]=t[f];delete t[f];}for(const e of evidence)if(e.path[0]==='targets'&&e.path[1]===tid)e.path[1]=id;if(!has(collection,'kind'))unresolved('unresolved-canonical-kind-binding',['targets',id,'kind']);label.targets.push(collection);const qid=`q${index}`;label.quants=[{id:qid,kind:quant,target:id,bind:tid,body}];label.root=qid;}else unresolved('quantifier-body-closure-not-projected',['quants']);
   }else if(t.mode==='bound'||quant!==undefined)unresolved('quantifier-binder-not-projected',['targets',tid]);
   if(diagnostics.length>start)label.unresolved=diagnostics.slice(start).map(({reason,path})=>({reason,path:path.slice(2)}));
  }
  for(const key of ranges.keys())if(!usedRanges.has(key))issue('unconsumed-predicted-range',JSON.parse(key));
  const packet={format:'psys2.structural-predictions/1',source:raw.source,model:raw.model,coverage:{complete:diagnostics.length===0,truncated:false},hypotheses:[{requests:projected}]};
  const decoded=decodeModelGraphs(packet,{budget:decoderBudget,maxBytes});
  return {raw,packet,decoded,diagnostics,bindingSha256,steps,executable:false};
 }catch(error){return {raw:raw??null,packet:null,decoded:null,diagnostics:[...diagnostics,{reason:error.reason??'invalid-bridge-data',path:error.path??[]}],bindingSha256:bindingSha256??null,steps,executable:false};}
}
