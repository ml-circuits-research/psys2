// C1 full-message CAL measurement through the installed reader. No admission is installed by this command.
import {readFileSync,writeFileSync,openSync,writeSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
import {createDrawingHost,initialDrawingState as drawing} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState as diagram} from '../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost,initialDocumentState as document} from '../worlds/docs.editor/declared-host.mjs';
import {initialChartState as charts} from '../worlds/data.charts/declared-host.mjs';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
import {prepareFunctionalFixture} from './lib/functional-fixture-policy.mjs';
import {compileTeacherRow} from '../training/sop-bert/compile-teacher-expectations.mjs';
import {calibrationObservation,retainCalibrationCohorts} from './lib/reader-calibration-measurement.mjs';
import {summarizeReaderStages,rankLeafReasons} from './lib/reader-stage-counts.mjs';
import {readerCalibrationIdentity} from '../src/dialog/reader-admission.mjs';
import {readerCalibrationErrorLimit} from '../src/dialog/reader-policy.mjs';
const [specPath,corpusPath,output,comparisonLibrary='../soplang-words-lib/docs/sopworld.mjs']=process.argv.slice(2);
const {compareRequestGraphs}=await import(pathToFileURL(resolve(comparisonLibrary)));
if(typeof compareRequestGraphs!=='function') throw Error('published-graph-comparator-required');
if(!output) throw Error('usage: calibrate-reader.mjs READER_SPEC CAL_CORPUS OUTPUT_PREFIX');
const sha=x=>createHash('sha256').update(x).digest('hex'),deployment=JSON.parse(readFileSync('docs/webchat/models/sop-bert/deployment.json'));
const spec=JSON.parse(readFileSync(specPath));
if(spec.manifestSha256!==deployment.manifestSha256) throw Error('calibrate-installed-model-only');
spec.artifactRoot=resolve('docs/webchat',dirname(deployment.manifestPath));
spec.runtimeIdentity={...deployment.runtimeIdentity,backendSha256:spec.runtimeIdentity.backendSha256};
const actual=await loadActualReplayReader(spec),manifest=JSON.parse(readFileSync(spec.artifactRoot+'/manifest.json')),config=JSON.parse(manifest.configJSON);
const bindings=JSON.parse(readFileSync(spec.artifactRoot+'/'+spec.bindingsArtifact.path));
const compilerOptions={bindings,bindingSha256:spec.bindingsArtifact.sha256,
  compilerSha256:sha(readFileSync('training/sop-bert/compile-teacher-expectations.mjs')),bridgeSha256:sha(readFileSync('src/dialog/raw-structural-bridge.mjs')),librarySha256:sha(readFileSync('src/vendor/sopworld/sopworld.mjs'))};
const corpus=readFileSync(corpusPath),input=corpus.toString().trim().split('\n').map(JSON.parse),seen=new Set(),rows=[],tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'};
if(input.some(r=>r.split!=='calibration'||seen.has(r.id)||!seen.add(r.id))) throw Error('invalid-calibration-source');
const fd=openSync(output+'.rows.jsonl','wx'),started=Date.now();let provenance=null;
try {for(const row of input) {
  const text=row.source.text,area=row.world,instanceId='cal-'+sha(row.id).slice(0,24);
  const state={'art.draw':drawing(),'diagram.sketch':diagram(),'docs.editor':document(),'data.charts':charts(),'time.calendar':{people:[],rooms:[],meetings:[]},'ui.shell':{activeTab:tabs[area]}};
  const host=area==='drawing'?createDrawingHost({state:state['art.draw'],instanceId}):area==='diagram'?await createDiagramHost({state:state['diagram.sketch'],instanceId}):area==='document'?createDocumentHost({state:state['docs.editor'],instanceId}):area==='calendar'?createCalendarHost({state:state['time.calendar'],instanceId}):null;
  const fixture=prepareFunctionalFixture(area,row.context??{});
  const setup=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[area]??[],invocationPrefix:instanceId});
  const source=sha(JSON.stringify([text,row.context??null])),partition=parseInt(source.slice(0,8),16)%2?'evaluation':'fit';
  const record={id:row.id,source,area,partition,setupComplete:setup.ok,semanticallyLimited:fixture.semanticallyLimited,eligible:false,score:0,correct:null,graphAgreement:null,reason:'excluded-native-setup',readerInvoked:false};
  if(setup.ok) {
    const session={isession:{state},newEngineJournal:[]},before=JSON.stringify(state);
    const measured=await actual.run(session,text,{area,host});
    provenance=measured.reply.trace.readerRouting.model.provenance;
    // Teacher annotations are consumed only after source-only inference has returned.
    const expectation=compileTeacherRow(row,compilerOptions);
    Object.assign(record,calibrationObservation(measured.measurement.proposal,text,expectation,{compareRequestGraphs}),{readerInvoked:true,teacherStatus:expectation.status,
      stages:summarizeReaderStages(measured.measurement,config),unchanged:JSON.stringify(session.isession.state)===before});
    record.executed=measured.reply.statuses?.includes('supported')===true;record.stateChanged=!record.unchanged;
  }
  writeSync(fd,JSON.stringify(record)+'\n');rows.push(record);
  if(rows.length%100===0) console.log(JSON.stringify({completed:rows.length,total:input.length,invoked:rows.filter(r=>r.readerInvoked).length,seconds:Math.round((Date.now()-started)/1000)}));
}} finally {closeSync(fd);}
if(sha(readFileSync(corpusPath))!==sha(corpus)) throw Error('calibration-input-mutated');
const policy={minFitAccepted:2,minEvaluationAccepted:2,maxErrorRate:readerCalibrationErrorLimit()};
const identity=provenance?readerCalibrationIdentity(provenance,spec.runtimeIdentity):null;
const reports=identity?retainCalibrationCohorts(rows,{identity,policy}):{};
const counts={messages:rows.length,readerInvoked:rows.filter(r=>r.readerInvoked).length,setupExcluded:rows.filter(r=>!r.setupComplete).length,
  executed:rows.filter(r=>r.executed).length,eligible:rows.filter(r=>r.eligible).length,unknownEligible:rows.filter(r=>r.eligible&&r.correct===null).length,graphAgreements:rows.filter(r=>r.graphAgreement===true).length,
  graphDisagreements:rows.filter(r=>r.graphAgreement===false).length,cutterComplete:rows.filter(r=>r.stages?.cutter.complete).length,rawComplete:rows.filter(r=>r.stages?.raw.complete).length,
  nonemptyGraphs:rows.filter(r=>r.stages?.pipeline.nonemptyGraph).length};
const result={format:'psys2.reader-calibration-measurement/1',complete:true,model:deployment.manifestSha256,selectedEpoch:manifest.componentProofs?.key?.selectedEpoch??null,corpus:{path:corpusPath,sha256:sha(corpus)},
  seconds:(Date.now()-started)/1000,policy,counts,reports,reasons:rankLeafReasons(rows),identity,
  scope:'Actual Node CPU inference using installed model/bindings and native observed-context setup. CAL messages only; source-context groups split fit/evaluation before labels. Setup exclusions stay in denominator. Graph agreement does not certify intent/effect. Node evidence does not authorize browser admission.',admissionInstalled:false};
writeFileSync(output+'.summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({counts,reports,seconds:result.seconds}));
