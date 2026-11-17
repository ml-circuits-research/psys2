// C1 measurement: strict graph comparison is diagnostic, never an intent/effect correctness label.
import {parse,readValue,World,retainSelectiveCalibration} from '../../src/vendor/sopworld/sopworld.mjs';
import {scoreReaderProposal,readerCalibrationScope} from '../../src/dialog/reader-admission.mjs';
function graph(entry) {
  return {request:entry.request,nodes:parse(entry.wires).map(w=>({id:w.id,type:w.type,attrs:Object.fromEntries(Object.entries(w.attrs).map(([key,values])=>[key,values.map(t=>{const v=readValue(t);return {kind:v.kind,value:v.v};})]))}))};
}
export function calibrationObservation(proposal,text,expectation,{compareRequestGraphs}={}) {
  const scored=scoreReaderProposal(proposal,text);
  if(!scored.eligible) return {eligible:false,score:scored.score,correct:null,graphAgreement:null,reason:scored.reason};
  if(expectation?.status!=='canonical-expectation'||expectation.expectedGraphs?.length!==1)
    return {eligible:true,score:scored.score,correct:null,graphAgreement:null,reason:'canonical-teacher-expectation-unavailable'};
  let comparison;
  try {comparison=compareRequestGraphs(graph(scored.candidate),graph(expectation.expectedGraphs[0]));}catch {comparison={ok:false};}
  if(!comparison.ok) return {eligible:true,score:scored.score,correct:null,graphAgreement:null,reason:'graph-comparison-unavailable'};
  return {eligible:true,score:scored.score,correct:null,graphAgreement:comparison.equal,
    reason:comparison.equal?'intent-and-effect-checker-unavailable':'graph-difference-needs-intent-review'};
}
export function retainCalibrationCohorts(rows,{identity,policy}) {
  const reports={};
  for(const area of [...new Set(rows.map(r=>r.area))].sort()) {
    const selected=rows.filter(r=>r.area===area),unknown=selected.filter(r=>r.eligible&&r.correct===null);
    // Do not hide unknown eligible labels by changing their eligibility after inspection.
    if(unknown.length) {reports[area]={approved:false,reason:'unknown-eligible-label',unknownEligible:unknown.length,total:selected.length};continue;}
    const fitRows=[],evaluationRows=[];
    for(const r of selected) (r.partition==='fit'?fitRows:evaluationRows).push({id:r.id,source:r.source,score:r.score,eligible:r.eligible,correct:r.correct});
    const world=new World(),result=retainSelectiveCalibration(world,{owner:'reader.calibration',revision:'1',identity,scope:readerCalibrationScope(area),policy,fitRows,evaluationRows});
    reports[area]=result.ok?result.calibration:{approved:false,reason:result.issues?.[0]?.reason??'calibration-refused'};
  }
  return reports;
}
