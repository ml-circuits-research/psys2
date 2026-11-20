// Predicted raw structure -> declared canonical structure. No reader or gold input.
import {copyHostData,snapshotHostData} from '../../worlds/native-tool-host.mjs?v=f4cf384e76';
import {positiveCardinalProof,spelledNumberProof} from './key-reader-value-proof.mjs?v=2c6e07ddb9';
import {decodeModelGraphs} from './model-graph-decoder.mjs?v=4bd37879a0';
export const RAW_STRUCTURAL_FORMAT='psys2.raw-structural-predictions/1';
// The node budget of a binding table (every kind of the pinned catalog's drawable providers, with their provenance).
export const BINDING_NODES=250000;
const has=(o,k)=>Object.hasOwn(o,k),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys={request:['span','trigger','mood','act','target','constraints','question','turn'],target:['type','mode','fill','determiner','kind','kind_span','name_span','description_span','ordinal','count','count_span','quantifier'],constraint:['key','value','value_span','operator','phase','polarity','character','step','measure','measure_span','unit','anchor_span','anchor_fill','variety','scope','group']};
// comparatives: the declared factors of comparative steps (comparative-projection.mjs), [{concept,step,factor,declaration}].
// references.queries: the declared question heads [{head,operation,property,declaration}] (query-reading-policy.sop).
// references.definite: the language world's definite determiners ("the", "that"); a relation anchor phrase is a kind
// lemma, alone or after one of them. contextTarget: {kind,declaration} — the canonical kind an earlier, observed
// reference resolution chose for a model-declared context target (fill=context); never derived here.
// partial: the declared partial-admission defaults (interpretation-policy.sop app.interpret.default, read by
// partial-admission.mjs) or null. With it, a field the reader left out takes its declared default and a role that
// cannot be bound is dropped from its request and returned in `disclosed` instead of failing the whole reading;
// only what leaves a request without an action or a theme stays a diagnostic (specs/semantic-frame.md §5).
export function bridgeRawStructure(prediction,{bindings,bindingSha256,comparatives=[],references={definite:[]},contextTarget=null,budget=200000,maxBytes=4000000,decoderBudget=200000,partial=null}={}){
 let raw,table,steps=0;const diagnostics=[],projected=[],disclosed=[],defaulted=[];
 const fallback=(field,when)=>{const rows=partial?.defaults?.filter(d=>d.field===field&&(d.when===undefined||d.when===when))??[];return (rows.find(d=>d.when!==undefined)??rows[0])?.value;};
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
  raw=copyHostData(prediction,{maxBytes});table=snapshotHostData(bindings,{maxBytes,maxNodes:BINDING_NODES});
  shape(raw,['format','source','area','model','coverage','requestCount','requests','unresolved','ranges'],[]);
  shape(raw.source,['text','unit'],['source']);shape(raw.coverage,['complete','truncated'],['coverage']);
  if(raw.format!==RAW_STRUCTURAL_FORMAT||raw.source?.unit!=='unicode-scalar'||typeof raw.source.text!=='string'||typeof raw.area!=='string')fail('invalid-raw-envelope');
  if(table.format!=='sop.structural-bindings/1'||!hash(bindingSha256))fail('invalid-binding-snapshot');
  if(!Array.isArray(comparatives)||comparatives.length>256||comparatives.some(r=>!r||!['concept','step','declaration'].every(k=>typeof r[k]==='string'&&r[k])||!(r.ordinal===true?r.factor===undefined:Number.isFinite(r.factor)&&r.factor>0)))fail('invalid-comparative-projection');
  const definite=references?.definite??[];if(!Array.isArray(definite)||definite.length>64||definite.some(d=>typeof d!=='string'||!d||/\s/.test(d)))fail('invalid-reference-projection');
  const questionHeads=references?.queries??[];if(!Array.isArray(questionHeads)||questionHeads.length>64||questionHeads.some(q=>!q||!['head','operation','declaration'].every(k=>typeof q[k]==='string'&&q[k])||typeof q.property!=='boolean'))fail('invalid-reference-projection');
  if(contextTarget!==null&&!(contextTarget&&['kind','declaration'].every(k=>typeof contextTarget[k]==='string'&&contextTarget[k])))fail('invalid-context-target');
  if(table.families!==undefined&&(!Array.isArray(table.families)||table.families.length>256))fail('invalid-family-binding-table');
  for(const row of table.families??[]){tick();if(!row||!['area','type','canonical','sourceWire','sourceWorld','moduleVersion'].every(k=>typeof row[k]==='string'&&row[k])||!hash(row.sourceSnapshotSHA)||row.alignment?.kind!=='explicit-raw-family-identity')fail('invalid-family-binding-record');}
  if(!Array.isArray(raw.requests)||raw.requests.length>32||raw.requestCount!==raw.requests.length||!Number.isSafeInteger(raw.requestCount))issue('unresolved-or-overflow-request-count',['requestCount']);
  if(!Array.isArray(raw.requests)||raw.requests.length>32)fail('request-budget');
  // In partial mode the reader's own unresolved heads are disclosed by the caller; what they left is bridged below.
  if(!partial&&(raw.coverage?.complete!==true||raw.coverage?.truncated!==false))issue('incomplete-model-coverage',['coverage']);
  if(partial&&raw.coverage?.truncated!==false)issue('incomplete-model-coverage',['coverage']);
  if(!partial&&raw.unresolved!==undefined&&(!Array.isArray(raw.unresolved)||raw.unresolved.length))issue('unresolved-model-output',['unresolved']);
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
  // The containment row whose container family has a kind of this lemma (one binding, or an ambiguity within it).
  const containerOf=(area,type,lemma)=>{
   if(table.containment!==undefined&&(!Array.isArray(table.containment)||table.containment.length>256))fail('invalid-containment-table');
   const rows=(table.containment??[]).filter(row=>{tick();return row?.area===area&&row.type===type&&typeof row.member==='string'&&typeof row.sourceWire==='string'&&hash(row.sourceSnapshotSHA)&&
    (lookup('kinds',{area,type:row.containerType,lemma})||(table.unresolved??[]).some(u=>u?.family==='kinds'&&u.rawDescriptor?.area===area&&u.rawDescriptor?.type===row.containerType&&u.rawDescriptor?.kind===lemma));});
   return rows.length===1?rows[0]:null;
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
   const target=original.target??{};
   for(const field of ['act','mood']){
    const value=has(original,field)?original[field]:fallback(field,field==='act'&&target.mode?'target.'+target.mode:undefined);
    if(value!==undefined){label[field]=value;if(!has(original,field))defaulted.push({request:index,field,value});}else unresolved('missing-annotated-field',[field]);
   }
   // Partial mode: an act without its own trigger span is anchored on the whole request span (its evidence is the request).
   anchor(['act'],original.trigger,null,!!partial&&!original.trigger,['trigger']);
   shape(target,keys.target,[...basePath,'target']);const t={id:tid};label.targets.push(t);
   if(['new','existing','bound'].includes(target.mode))t.mode=target.mode;
   else{const value=fallback('mode',label.act?'act.'+label.act:undefined);if(value){t.mode=value;defaulted.push({request:index,field:'mode',value});}else unresolved('missing-target-mode',['targets',tid,'mode']);}
   const kind=lookup('kinds',{area:raw.area,type:target.type,lemma:target.kind});
   const family=target.mode!=='bound'&&!has(target,'kind')&&!has(target,'kind_span')&&typeof target.type==='string'?lookup('families',{area:raw.area,type:target.type}):null;
   const contextual=contextTarget&&target.fill==='context'&&!has(target,'kind')&&!has(target,'kind_span')&&!has(target,'name_span');
   // A new member named by a kind of the family it lies in ("a diagram with 5 nodes": a diagram of the page the nodes
   // are made in) is a member of its own family; the containment is the declared slot (bindings.containment).
   const container=!kind&&target.mode==='new'&&typeof target.kind==='string'?containerOf(raw.area,target.type,target.kind):null;
   if(container){t.kind=container.member;anchor(['targets',tid,'kind'],target.kind_span||target.kind,container.sourceWire,false,['target',target.kind_span?'kind_span':'kind']);}
   else if(kind){t.kind=kind.canonical;anchor(['targets',tid,'kind'],target.kind_span||target.kind,kind.sourceWire,false,['target',target.kind_span?'kind_span':'kind']);}
   else if(contextual){t.kind=contextTarget.kind;anchor(['targets',tid,'kind'],null,contextTarget.declaration,true);}
   else if(family){t.kind=family.canonical;anchor(['targets',tid,'kind'],null,family.sourceWire,true);}
   else if(target.mode!=='bound')unresolved('unresolved-canonical-kind-binding',['targets',tid,'kind']);
   if(has(target,'name_span')){t.name={kind:'string',value:target.name_span};anchor(['targets',tid,'name'],target.name_span,null,false,['target','name_span']);}
   if(has(target,'determiner'))t.determiner=target.determiner;
   if(contextual)t.determiner??='definite';
   else if(['context','previous_reply','journal_step'].includes(target.fill))unresolved('context-reference-not-bound',['targets',tid]);
   else if(target.fill==='all'&&target.mode!=='bound')unresolved('unprojected-population-reference',['targets',tid]);
   else if(target.fill!==undefined&&!['written','description','all'].includes(target.fill))unresolved('unknown-target-fill',['targets',tid]);
   const phase={selector:[],result:[]},anchorOf=new Map();let conditions=original.constraints??[];if(!Array.isArray(conditions)||conditions.length>256)fail('constraint-budget',basePath);
   const cardinal=original.act==='make'&&t.mode==='new'?positiveCardinalProof(target.count_span):null;
   const countRange=cardinal&&(target.count===undefined||target.count===cardinal.value)&&span
    ?locate(original.span,target.count_span,span[0],[...rawPath,'target','count_span'],span):null;
   if(countRange){
    const id=`count${index}`,path=['constraints',id],c={id,target:tid,phase:'result',concept:'count',operator:'eq',character:'requirement',polarity:'positive',
     value:{kind:'literal',value:String(cardinal.value)},source:countRange};
    label.constraints.push(c);phase.result.push([id,c]);
    for(const key of ['concept','value'])evidence.push({path:[...path,key],ranges:[countRange],origin:'text'});
   }else if(has(target,'count')||has(target,'count_span'))
    unresolved(has(target,'count')?'requires-declared-count-projection':'unowned-count-span',['targets',tid,'count']);
   if(has(target,'ordinal'))unresolved('requires-declared-ordinal-projection',['targets',tid,'ordinal']);
   // A relative position is two mentions (the relation and its anchor, README of official-dataset): their declared
   // binding roles pair them in source order into one relation constraint whose goal is the anchor target.
   const roleOf=condition=>condition&&typeof condition==='object'?lookup('properties',{area:raw.area,key:condition.key})?.projection?.kind:undefined;
   // A relation mention that carries its anchor phrase itself (anchor_span: "a box under Bake") is the same pair: its
   // anchor mention is the anchor key of the relation key's family (projection relation-anchor), with that phrase.
   {const given=conditions.map(roleOf);if(given.filter(r=>r==='relation').length>given.filter(r=>r==='relation-anchor').length){
    const extra=[];for(const [ri,rc] of conditions.entries()){
     if(given[ri]!=='relation'||typeof rc.anchor_span!=='string'||!rc.anchor_span||typeof rc.key!=='string')continue;
     const family=rc.key.split('.')[0],anchorKey=(table.properties??[]).find(p=>p.area===raw.area&&p.projection?.kind==='relation-anchor'&&p.key.split('.')[0]===family)?.key;
     if(!anchorKey)continue;
     const ac={key:anchorKey,value:rc.anchor_span,value_span:rc.anchor_span,operator:'relation',phase:'selector',polarity:'positive',...(has(rc,'character')?{character:rc.character}:{})};anchorOf.set(ac,ri);extra.push(ac);
    }
    if(extra.length)conditions=[...conditions,...extra];
   }}
   const roles=conditions.map(roleOf),relationAt=roles.flatMap((r,i)=>r==='relation'?[i]:[]),anchorAt=roles.flatMap((r,i)=>r==='relation-anchor'?[i]:[]);
   const paired=new Set();
   const consume=(ci,field,literal)=>{const p=[...rawPath,'constraints',String(ci),field];if(span&&ranges.has(JSON.stringify(p)))return locate(original.span,literal,span[0],p,span);return null;};
   if(relationAt.length||anchorAt.length){
    if(relationAt.length!==anchorAt.length)unresolved('unpaired-relation-mention',['constraints']);
    else for(const [k,ri]of relationAt.entries()){
     const ai=anchorAt[k],rc=conditions[ri],ac=conditions[ai],prop=lookup('properties',{area:raw.area,key:rc.key}),cid=`c${index}_${ri}`,aid=`t${index}_a${k}`,path=['constraints',cid];
     shape(rc,keys.constraint,[...basePath,'constraints',ri]);shape(ac,keys.constraint,[...basePath,'constraints',ai]);paired.add(ri);paired.add(ai);
     const c={id:cid,target:tid,phase:'result',concept:prop.canonical,operator:'relation',goal:aid};label.constraints.push(c);phase.result.push([cid,c]);
     for(const field of ['character','polarity'])if(has(rc,field))c[field]=rc[field];else unresolved('missing-annotated-field',[...path,field]);
     if(rc.operator!=='relation'||ac.operator!=='relation'||rc.polarity!=='positive')unresolved('unsupported-relation-mention',path);
     const relation=typeof rc.value==='string'&&has(prop.projection.values??{},rc.value)?prop.projection.values[rc.value]:null;
     anchor([...path,'concept'],rc.value_span,prop.sourceWire,false,['constraints',String(ri),'value_span']);
     if(relation){c.relation=relation;anchor([...path,'relation'],rc.value_span,prop.sourceWire,false,['constraints',String(ri),'value_span']);}else unresolved('undeclared-relation-value',[...path,'relation']);
     consume(ri,'value',rc.value);
     const bounds=span?locate(original.span,rc.value_span,span[0],[...rawPath,'constraints',String(ri),'value_span'],span):null;if(bounds)c.source=bounds;
     // The anchor phrase names an observed object: a kind lemma of the family, alone or after a definite determiner.
     const aprop=lookup('properties',{area:raw.area,key:ac.key}),phrase=typeof ac.value_span==='string'?ac.value_span:'',determiner=definite.find(d=>phrase.toLowerCase().startsWith(d.toLowerCase()+' '));
     const lemma=determiner?phrase.slice(determiner.length+1):phrase,akind=lemma?lookup('kinds',{area:raw.area,type:target.type,lemma}):null;
     const a={id:aid,mode:'existing'};label.targets.push(a);if(determiner)a.determiner='definite';
     const outer=span?locate(original.span,phrase,span[0],anchorOf.has(ac)?[...rawPath,'constraints',String(anchorOf.get(ac)),'anchor_span']:[...rawPath,'constraints',String(ai),'value_span'],span):null;if(!anchorOf.has(ac))consume(ai,'value',ac.value);
     const afamily=!akind&&lemma&&typeof target.type==='string'?lookup('families',{area:raw.area,type:target.type}):null;
     if(akind&&outer){a.kind=akind.canonical;const at=outer[0]+Array.from(phrase).length-Array.from(lemma).length;evidence.push({path:['targets',aid,'kind'],ranges:[[at,outer[1]]],origin:'declaration',declaration:akind.sourceWire});}
     // Otherwise the phrase is the name of an observed member of the family ("to the left of House"), as a target
     // named without a kind word is: the family's class, matched by that name.
     else if(afamily&&aprop&&outer){const at=outer[0]+Array.from(phrase).length-Array.from(lemma).length;a.kind=afamily.canonical;a.name={kind:'string',value:lemma};
      evidence.push({path:['targets',aid,'kind'],ranges:[[at,outer[1]]],origin:'declaration',declaration:afamily.sourceWire},{path:['targets',aid,'name'],ranges:[[at,outer[1]]],origin:'text'});}
     else unresolved(aprop?'unresolved-anchor-reference':'unresolved-canonical-property-binding',['targets',aid,'kind']);
    }
   }
   for(const [ci,condition]of conditions.entries()){
    if(paired.has(ci))continue;
    tick();shape(condition,keys.constraint,[...basePath,'constraints',ci]);const cid=`c${index}_${ci}`,c={id:cid,target:tid},path=['constraints',cid];label.constraints.push(c);
    for(const field of ['phase','operator','character','polarity']){const value=has(condition,field)?condition[field]:fallback(field);if(value!==undefined){c[field]=value;if(!has(condition,field))defaulted.push({request:index,field,value,constraint:cid});}else unresolved('missing-annotated-field',[...path,field]);}
    if(phase[c.phase])phase[c.phase].push([cid,condition]);
    const prop=lookup('properties',{area:raw.area,key:condition.key});
    if(prop){c.concept=prop.canonical;anchor([...path,'concept'],condition.value_span,prop.sourceWire,true,['constraints',String(ci),'value_span']);}else unresolved('unresolved-canonical-property-binding',[...path,'concept']);
    // A region named by a parameter that takes region names (its declared closed list holds the value) is that parameter's value.
    if(prop&&Array.isArray(prop.classValues)&&prop.classValues.includes(condition.value)&&c.operator==='region')c.operator='eq';
    // A comparative without a number (operator=delta step=more|less) becomes the declared factor of its step on the
    // value the target has now; the raw value word is only evidence of the step.
    const steps=prop&&condition.operator==='delta'&&typeof condition.step==='string'&&!['measure','measure_span','unit'].some(k=>has(condition,k))
     ?comparatives.filter(r=>{tick();return r.concept===prop.canonical&&r.step===condition.step;}):[];
    const comparative=steps.length===1?steps[0]:null;
    if(comparative?.ordinal){
     // On an ordinal concept (an ordered scale of steps) the step itself is the degree value: the tool moves the
     // target one step along the scale from its own step.
     Object.assign(c,{operator:'degree',value:{kind:'literal',value:comparative.step}});
     anchor([...path,'value'],condition.value_span,comparative.declaration,true,['constraints',String(ci),'value_span']);
     consume(ci,'value',condition.value);
    }else if(comparative){
     Object.assign(c,{operator:'factor',baseline:'before',anchor:prop.canonical,value:{kind:'literal',value:String(comparative.factor)}});
     for(const key of ['value','anchor'])anchor([...path,key],condition.value_span,comparative.declaration,true,['constraints',String(ci),'value_span']);
     // The model's copy of the comparative word is evidence of the step, not a value: it is checked and consumed.
     consume(ci,'value',condition.value);
    }else if(has(condition,'value')){
     if(['literal','string'].includes(prop?.valueKind)&&typeof condition.value==='string'){
      const supplied=has(condition,'value_span'),literal=supplied?condition.value_span:condition.value;
      const valuePath=[...rawPath,'constraints',String(ci),'value'],hasCopy=ranges.has(JSON.stringify(valuePath));
      if(hasCopy){
       // Explicit model copy pointers may be narrower than the original evidence span.
       const outer=span?(supplied?locate(original.span,literal,span[0],[...rawPath,'constraints',String(ci),'value_span'],span):span):null;
       const copy=outer?locate(original.span,condition.value,span[0],valuePath,outer):null;
       // A numeric property takes the one number its copied words spell ("size 45" -> 45; see below).
       const spelledCopy=copy&&prop.numeric===true&&!/^[-+]?\d+(\.\d+)?$/.test(condition.value.trim())&&!['degree','region'].includes(condition.operator)?spelledNumberProof(condition.value,word=>!!lookup('units',{lemma:word})):null;
       if(copy){c.value={kind:['degree','region'].includes(condition.operator)?'literal':prop.valueKind,value:spelledCopy?String(spelledCopy.value):condition.value};evidence.push({path:[...path,'value'],ranges:[copy],origin:'text'});}
       else unresolved('invalid-source-copy-range',[...path,'value']);
      }else{
       // A numeric property (its native parameter is a number, declared-bindings.mjs) takes the one number its span
       // spells when the span is not that number itself ("size 45", "two hundred sixty"): the declared number words.
       const plain=typeof literal==='string'&&/^[-+]?\d+(\.\d+)?$/.test(literal.trim());
       const spelled=prop.numeric===true&&!plain&&!['degree','region'].includes(condition.operator)?spelledNumberProof(literal,word=>!!lookup('units',{lemma:word})):null;
       if(spelled&&(condition.value===literal||spelledNumberProof(String(condition.value))?.value===spelled.value)){
        c.value={kind:prop.valueKind,value:String(spelled.value)};anchor([...path,'value'],literal,null,false,['constraints',String(ci),supplied?'value_span':'value']);
       }else{
       const identity=typeof literal==='string'&&literal.length>0&&literal===condition.value;
       const normalization=identity?null:lookup('valueNormalizations',{area:raw.area,key:condition.key,canonical:prop.canonical,source:literal,value:condition.value,valueKind:prop.valueKind});
       // A property whose native parameter declares a closed value list (classValues, declared-bindings.mjs) takes the
       // reader's class value from that list; the mention is its evidence and the parameter's declaration its proof.
       const declaredClass=!identity&&!normalization&&Array.isArray(prop.classValues)&&prop.classValues.includes(condition.value)&&typeof literal==='string'&&literal.length>0;
       // The request graph takes a degree or region value as an unquoted vocabulary name (std.request).
       const kind=['degree','region'].includes(condition.operator)?'literal':prop.valueKind;
       if(identity||normalization||declaredClass){c.value={kind,value:condition.value};anchor([...path,'value'],literal,normalization?.sourceWire??(declaredClass?prop.sourceWire:null),false,['constraints',String(ci),supplied?'value_span':'value']);}
       else unresolved('unresolved-source-value-normalization',[...path,'value']);
       }
      }
     }else unresolved('unresolved-value-representation',[...path,'value']);
    }
    if(!comparative&&!['eq','less.equal','greater.equal','degree','region'].includes(condition.operator))unresolved('requires-operator-reference-projection',path);
    if(['each','group'].includes(condition.scope))c.scope=condition.scope;else if(has(condition,'scope'))unresolved('unknown-condition-scope',[...path,'scope']);
    if(has(condition,'measure_span')&&!has(condition,'measure')&&!has(condition,'unit'))unresolved('unowned-measure-span',[...path,'measure_span']);
    if(has(condition,'measure')&&condition.measure!==condition.value)unresolved('requires-measure-projection',[...path,'measure']);
    for(const field of ['group','variety','step','anchor_fill','anchor_span'])if(has(condition,field)&&!(field==='step'&&comparative))unresolved(`requires-declared-${field}-projection`,[...path,field]);
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
   // An annotated question projects through its declared head (references.queries): the asked property, when the head
   // asks one, binds like a constraint key; the query asks it of the request's target.
   if(has(original,'question')){
    const q=original.question,askedKey=q&&typeof q==='object'?q.asked_key:undefined,heads=questionHeads.filter(h=>h.head===q?.ask&&h.property===(askedKey!==undefined));
    const qprop=askedKey!==undefined?lookup('properties',{area:raw.area,key:askedKey}):null;
    // A query projection asks (std.request: queries require ask mood); a yes/no check stays unprojected.
    if(label.mood!=='ask'||heads.length!==1||askedKey!==undefined&&!qprop)unresolved('requires-declared-query-projection',['queries']);
    else{const qid=`q${index}`,query={id:qid,target:tid,operation:heads[0].operation};
     if(qprop){query.concept=qprop.canonical;anchor(['queries',qid,'concept'],q.asked_key_span,qprop.sourceWire,true,['question','asked_key_span']);}
     label.queries=[query];}
   }
   if(has(original,'turn')){label.turn=original.turn;unresolved('turn-contract-not-projected',['turn']);}
   const quant=target.quantifier;
   if(t.mode==='bound'&&['all','any','each','none'].includes(quant)&&!selectors.length&&phase.result.length&&phase.result.every(([,c])=>(c.scope===undefined||c.scope==='each')&&!has(c,'group')&&!has(c,'variety'))){
    const members=phase.result.map(([id])=>id);let body=members.length===1?members[0]:null;
    if(!body&&and){body=`g${index}_body`; (label.groups??=[]).push({id:body,operator:'and',members});}
    if(body){const id=`collection${index}`,collection={id,mode:'existing'};for(const f of ['kind','name','determiner'])if(has(t,f)){collection[f]=t[f];delete t[f];}for(const e of evidence)if(e.path[0]==='targets'&&e.path[1]===tid)e.path[1]=id;if(!has(collection,'kind'))unresolved('unresolved-canonical-kind-binding',['targets',id,'kind']);label.targets.push(collection);const qid=`q${index}`;label.quants=[{id:qid,kind:quant,target:id,bind:tid,body}];label.root=qid;}else unresolved('quantifier-body-closure-not-projected',['quants']);
   }else if(t.mode==='bound'||quant!==undefined)unresolved('quantifier-binder-not-projected',['targets',tid]);
   if(partial&&diagnostics.length>start){
    const own=diagnostics.splice(start);
    diagnostics.push(...dropUnbound(label,own,{index,original,conditions,tid,span,mentionOf:literal=>typeof literal==='string'&&literal?literal:null,disclosed}));
   }
   if(diagnostics.length>start)label.unresolved=diagnostics.slice(start).map(({reason,path})=>({reason,path:path.slice(2)}));
  }
  if(!partial)for(const key of ranges.keys())if(!usedRanges.has(key))issue('unconsumed-predicted-range',JSON.parse(key));
  const packet={format:'psys2.structural-predictions/1',source:raw.source,model:raw.model,coverage:{complete:diagnostics.length===0,truncated:false},hypotheses:[{requests:projected}]};
  const decoded=decodeModelGraphs(packet,{budget:decoderBudget,maxBytes});
  return {raw,packet,decoded,diagnostics,bindingSha256,steps,executable:false,...(partial?{disclosed,defaulted}:{})};
 }catch(error){return {raw:raw??null,packet:null,decoded:null,diagnostics:[...diagnostics,{reason:error.reason??'invalid-bridge-data',path:error.path??[]}],bindingSha256:bindingSha256??null,steps,executable:false};}
}

// Partial admission of one projected request (specs/semantic-frame.md §5): every issue of the request is either a role
// that can be dropped (a constraint, a relation and its anchor, a count, an ordinal, a name, a reference detail, a turn)
// — removed from the label and disclosed with its source text — or one that leaves the request without an action, a
// theme or its source, which stays a diagnostic. Returns the remaining (fatal) diagnostics.
function dropUnbound(label,issues,{index,original,conditions,tid,disclosed}){
 const fatal=[],dropC=new Set(),dropT=new Set();
 // One disclosure per dropped role: the first reason found for it names why.
 const say=(reason,role,text,extra={})=>{if(!disclosed.some(d=>d.request===index&&d.role===role&&(extra.constraint?d.constraint===extra.constraint:d.text===text)))disclosed.push({request:index,reason,role,...(text?{text}:{}),...extra});};
 const conditionText=cid=>{const m=/^c\d+_(\d+)$/.exec(cid);const c=m?conditions[Number(m[1])]:null;return c?.value_span??c?.value??c?.key??null;};
 for(const issue of issues){
  const {reason,path}=issue;
  // Range bookkeeping of the raw envelope (string request index) and fields outside the contract carry no role of their own.
  if(path[0]==='requests'&&typeof path[1]==='string'||reason==='unsupported-raw-field')continue;
  if(path[0]!=='requests'||path[1]!==index){fatal.push(issue);continue;}
  const rel=path.slice(2);
  if(rel[0]==='constraints'&&rel[1]){dropC.add(rel[1]);say(reason,'constraint',rel[1].startsWith('count')?original.target?.count_span:conditionText(rel[1]),{constraint:rel[1],key:conditions[Number(/_(\d+)$/.exec(rel[1])?.[1])]?.key});continue;}
  if(rel[0]==='constraints'){say(reason,'relation',null);continue;}
  if(rel[0]==='targets'&&rel[1]!==tid&&rel[1]?.startsWith('t')){dropT.add(rel[1]);continue;}
  if(rel[0]==='targets'&&rel[1]===tid){
   const field=rel[2];
   if(field==='kind'||field==='mode'){fatal.push(issue);continue;}
   if(field==='count'){say(reason,'count',original.target?.count_span??null);continue;}
   if(field==='ordinal'){say(reason,'ordinal',original.target?.ordinal??null);continue;}
   if(field==='name'){const t=label.targets.find(x=>x.id===tid);if(t)delete t.name;label.evidence.splice(0,label.evidence.length,...label.evidence.filter(e=>!(e.path[0]==='targets'&&e.path[1]===tid&&e.path[2]==='name')));say(reason,'name',original.target?.name_span??null);continue;}
   if(field==='selector'){const t=label.targets.find(x=>x.id===tid),selected=label.constraints.filter(c=>c.phase==='selector');for(const c of selected.slice(1))dropC.add(c.id);if(t&&selected[0])t.selector=selected[0].id;say(reason,'selector',original.target?.description_span??null);continue;}
   // A reference the reader could not tie (context, population, description without predicate, quantifier): the
   // target keeps its kind and the declared default reference (the focused or most recent object) applies.
   say(reason,'reference',original.target?.description_span??original.target?.kind_span??null);continue;
  }
  if(rel[0]==='after'){label.after=index>0?['r'+(index-1)]:[];continue;}
  if(rel[0]==='turn'){delete label.turn;say(reason,'turn',null);continue;}
  if(rel[0]==='quants'){say(reason,'quantifier',original.target?.quantifier??null);continue;}
  if(rel[0]==='queries'&&label.mood!=='ask'&&label.act!=='answer'){say(reason,'question',null);continue;}
  fatal.push(issue);
 }
 // A relation whose anchor cannot be bound is dropped with its anchor.
 for(const aid of dropT){for(const c of label.constraints)if(c.goal===aid){dropC.add(c.id);say('unresolved-anchor-reference','constraint',conditionText(c.id),{constraint:c.id});}}
 pruneLabel(label,dropC,dropT);
 return fatal;
}
/** Remove constraints and targets from a projected request with their evidence, groups and root (partial admission). */
export function pruneLabel(label,dropC,dropT=new Set()){
 for(const c of label.constraints)if(c.goal&&dropC.has(c.id))dropT.add(c.goal);
 if(dropC.size||dropT.size){
  label.constraints=label.constraints.filter(c=>!dropC.has(c.id));
  label.targets=label.targets.filter(t=>!dropT.has(t.id));
  const gone=p=>p[0]==='constraints'&&dropC.has(p[1])||p[0]==='targets'&&dropT.has(p[1]);
  label.evidence.splice(0,label.evidence.length,...label.evidence.filter(e=>!gone(e.path)));
  for(const g of label.groups??[])g.members=g.members.filter(m=>!dropC.has(m));
  if(label.groups){const empty=new Set(label.groups.filter(g=>!g.members.length).map(g=>g.id));label.groups=label.groups.filter(g=>g.members.length);if(!label.groups.length)delete label.groups;for(const t of label.targets)if(empty.has(t.selector)||dropC.has(t.selector))delete t.selector;}
  for(const t of label.targets)if(dropC.has(t.selector))delete t.selector;
  if(label.quants&&label.quants.some(q=>dropC.has(q.body)))delete label.quants;
  if(label.root&&(dropC.has(label.root)||!label.quants&&String(label.root).startsWith('q'))){delete label.root;}
  if(!label.root&&!label.quants){const results=label.constraints.filter(c=>c.phase==='result');const grouped=(label.groups??[]).find(g=>g.id.endsWith('_body'));if(grouped)label.root=grouped.id;else if(results.length===1)label.root=results[0].id;}
 }
 return label;
}
