// Prove a foreign head has a grounded equivalent before trying a structural projection.
import {World, quote, serialize} from '../vendor/sopworld/sopworld.mjs?v=4cf6e60057';
import {bridgeRawStructure} from './raw-structural-bridge.mjs?v=78467599aa';
import {comparativeSteps} from './comparative-projection.mjs?v=2367e21e55';
import SCHEMA from '../../worlds/app.project/reader-head-schema-source.mjs?v=80e042aeb5';
import POLICY from '../../worlds/app.project/reader-head-policy-source.mjs?v=9a0b47fbc1';

let policy;
const diagnostic = (item, reason) => item.reason === 'provider-unresolved' && item.path?.length === 2 &&
 item.path[0] === 'requests' && item.path[1] === 0 && item.detail?.reason === reason;
const property = (bindings, area, key) => {
 const matches = bindings.properties?.filter(row => row.area === area && row.key === key);
 return matches?.length === 1 && ['canonical','sourceWire','sourceWorld','sourceSnapshotSHA'].every(field=>typeof matches[0][field]==='string'&&matches[0][field]) ? matches[0] : null;
};
export function inspectReaderHeadPolicy(){return {source:POLICY,schema:SCHEMA,loaded:!!policy};}
function factsWorld(){
 if(!policy){
  const world=new World({library:{'app.reader.head':SCHEMA}});
  world.load(POLICY);
  policy=world;
 }
 return policy.fork();
}
const fact=(id,key,role,row,unique)=>({id,type:'app.reader.head.evidence',attrs:{
 key:[quote(key)],role:[role],area:[quote(row.area)],concept:[quote(row.canonical)],declaration:[quote(row.sourceWire)],world:[quote(row.sourceWorld)],snapshot:[quote(row.sourceSnapshotSHA)],unique:[String(unique)],
}});
export function proveReaderHeadAlternative(raw, bindings, cutStart=0){
 if(!bindings||raw?.requestCount!==1||raw.coverage?.truncated!==false||raw.coverage?.complete!==false||!raw.area)return null;
 const reports=raw.unresolved?.filter(item=>diagnostic(item,'cross-area-key-unresolved'));
 const inconsistencies=raw.unresolved?.filter(item=>diagnostic(item,'presence-span-inconsistent'));
 const coverage=raw.unresolved?.filter(item=>item.reason==='incomplete-provider-coverage'&&item.path?.length===2&&item.path[0]==='requests'&&item.path[1]===0);
 if(!reports?.length||coverage.length!==1||raw.unresolved.length!==reports.length+coverage.length+inconsistencies.length)return null;
 if(!Array.isArray(raw.requests?.[0]?.constraints)||!Array.isArray(raw.ranges)||typeof raw.source?.text!=='string')return null;
 const local=[], rangesByKey=new Map(), chars=Array.from(raw.source.text);
 for(const [index, condition] of raw.requests[0].constraints.entries()){
  const row=property(bindings,raw.area,condition.key);
  const ranges=raw.ranges.filter(item=>item.path.length===5&&item.path[0]==='requests'&&item.path[1]==='0'&&item.path[2]==='constraints'&&
   item.path[3]===String(index)&&item.path[4]==='value_span');
  if(!row||ranges.length!==1||typeof condition.value_span!=='string'||chars.slice(...ranges[0].range).join('')!==condition.value_span)continue;
  if(!rangesByKey.has(row.key))local.push(fact('head.grounded.'+local.length,row.key,'grounded',row,0));
  const rangesForKey=rangesByKey.get(row.key)??[];
  rangesForKey.push({row,range:ranges[0].range});rangesByKey.set(row.key,rangesForKey);
 }
 const foreign=[];
 for(const {detail} of reports){
  const {head,key}=detail;
  if(!head||typeof head.present!=='boolean'||!Array.isArray(head.ranges)||!head.present&&!head.ranges.length||head.area===raw.area)return null;
  const row=property(bindings,head.area,head.property);
  if(!row)return null;
  const grounded=[...rangesByKey.values()].flat().filter(value=>['canonical','sourceWire','sourceWorld','sourceSnapshotSHA'].every(field=>value.row[field]===row[field]));
  const unique=head.ranges.filter(range=>!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||
   !grounded.some(({range:anchored})=>range[0]+cutStart===anchored[0]&&range[1]+cutStart===anchored[1])).length;
  foreign.push(fact('head.report.'+foreign.length,key,'reported',row,unique));
 }
 if(inconsistencies.some(({detail})=>!reports.some(report=>report.detail.key===detail.key&&JSON.stringify(report.detail.head)===JSON.stringify(detail.head))))return null;
 const world=factsWorld(),input=serialize([...foreign,...local]);
 if(!world.tell(input,{factsOnly:true}).ok)return null;
 const matches=world.ofType('app.reader.head.alternative');
 if(foreign.some(row=>!matches.some(match=>match.attrs.reported[0]==='$'+row.id)))return null;
 return {input,sop:serialize(matches),competing:reports.map(report=>report.detail)};
}

export function projectReaderHeadAlternative(raw,{bindings,bindingSha256,cutStart}={}){
 const proof=proveReaderHeadAlternative(raw,bindings,cutStart);
 if(!proof)return null;
 const trial=bridgeRawStructure({...raw,coverage:{complete:true,truncated:false},unresolved:[]},{bindings,bindingSha256,comparatives:comparativeSteps()});
 if(trial.decoded?.coverage?.complete!==true||trial.diagnostics.length||trial.decoded.candidates?.length!==1)return null;
 return {candidate:trial.decoded.candidates[0],proof};
}
