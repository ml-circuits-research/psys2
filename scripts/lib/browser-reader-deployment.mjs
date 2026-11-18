// Bind the shipped browser implementation to the immutable model manifest.
import {readFile,writeFile,stat} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function refreshBrowserReaderDeployment(outDir){
 const file=path.join(outDir,'models/sop-bert/deployment.json');if(!await stat(file).then(()=>true,()=>false))return null;
 const deployment=JSON.parse(await readFile(file,'utf8'));if(deployment.format!=='psys2.browser-reader-deployment/1')throw Error('unsupported-reader-deployment');
 const groups={
  appBuildSha256:['ui/engine-worker.mjs','lib/dialog/index.mjs','lib/dialog/native-request-sampler.mjs','lib/dialog/sampler.mjs'],
  readerSha256:['lib/dialog/cutter-inference.mjs','lib/dialog/key-reader-inference.mjs','lib/dialog/bert-source-offsets.mjs','lib/dialog/model-selection-score.mjs'],
  pipelineSha256:['lib/dialog/reader-source.mjs','lib/dialog/key-reader-pipeline.mjs','lib/dialog/reader-head-alternative.mjs','worlds/app.project/reader-head-policy-source.mjs','worlds/app.project/reader-head-schema-source.mjs','lib/dialog/verified-reader-provider.mjs','lib/dialog/browser-reader-host.mjs','lib/dialog/project-journal-action.mjs','lib/dialog/history-policy.mjs','worlds/app.project/history-policy-source.mjs','worlds/app.project/history-schema-source.mjs','lib/dialog/project-context-action.mjs','lib/dialog/grounded-projection.mjs','worlds/app.project/grounded-projection-source.mjs','worlds/app.project/grounded-projection-schema-source.mjs','lib/dialog/reference-policy.mjs','lib/dialog/observed-choice.mjs','worlds/app.project/reference-schema-source.mjs','worlds/app.project/reference-policy-source.mjs','lib/dialog/project-create-action.mjs','lib/dialog/project-query-action.mjs','worlds/app.project/query-reading-schema-source.mjs','worlds/app.project/query-reading-policy-source.mjs','worlds/app.project/creation-policy-source.mjs','worlds/app.project/creation-schema-source.mjs'],
  packetAdapterSha256:['lib/dialog/key-reader-packet.mjs'],
  graphDecoderSha256:['lib/dialog/raw-structural-bridge.mjs','lib/dialog/model-graph-decoder.mjs','lib/vendor/sopworld/sopworld.mjs'],
  executorSha256:[
   'lib/dialog/new-engine.mjs','lib/dialog/reader-routing.mjs','lib/dialog/request-composition-policy.mjs','worlds/app.project/request-composition-policy-source.mjs','worlds/app.project/request-composition-policy-schema-source.mjs','lib/dialog/authored-request-tool.mjs',
   'lib/dialog/reader-admission.mjs','lib/dialog/reader-policy.mjs','lib/dialog/declared-execution.mjs',
   'lib/dialog/native-binding-candidates.mjs','worlds/app.project/constructor-policy-source.mjs','worlds/app.project/constructor-schema-source.mjs',
   'lib/dialog/capability-plan-adapter.mjs','lib/dialog/native-query-execution.mjs','lib/dialog/execution-policy.mjs','worlds/native-tool-interface.mjs',
   'worlds/app.project/capability-policy.mjs','worlds/app.project/execution-policy-source.mjs',
   'worlds/app.project/execution-policy-schema-source.mjs','worlds/art.draw/native-interface-source.mjs',
   'worlds/data.charts/native-interface-source.mjs',
   'lib/dialog/request-routing-policy.mjs','worlds/app.project/request-routing-schema-source.mjs','worlds/app.project/request-routing-policy-source.mjs',
   'lib/dialog/spatial-placement-execution.mjs','lib/dialog/new-engine-source.mjs','lib/dialog/native-tool-activity.mjs',
   'lib/dialog/history-tool.mjs','lib/dialog/history-journal.mjs','lib/dialog/history-execution.mjs','worlds/app.project/history-policy-source.mjs','worlds/app.project/history-schema-source.mjs',
   'lib/dialog/native-intent-reader.mjs','lib/dialog/native-binding-candidates.mjs','lib/dialog/native-tool-controls.mjs',
   'worlds/native-tool-host.mjs','worlds/native-tool-arguments.mjs','lib/vendor/sopworld/capability-call.mjs','worlds/native-spatial-observation.mjs','worlds/native-spatial-interface.mjs',
   'worlds/app.project/reader-admission-policy-source.mjs','worlds/app.project/reader-admission-schema-source.mjs','worlds/app.project/spatial-profile.mjs','worlds/art.draw/declared-host.mjs','worlds/diagram.sketch/declared-host.mjs',
   'worlds/ui.avatar/declared-host.mjs','worlds/docs.editor/declared-host.mjs',
   'worlds/art.draw/canonical-state.mjs','worlds/art.draw/state-schema-source.mjs',
   'worlds/diagram.sketch/canonical-state.mjs','worlds/diagram.sketch/state-schema-source.mjs','worlds/diagram.sketch/arrows.mjs',
   'worlds/docs.editor/canonical-state.mjs','worlds/docs.editor/state-schema-source.mjs',
   'worlds/tool-instance-state.mjs','lib/vendor/sopworld/instance-fact-codec.mjs',
  ],
  contextSerializationSha256:[
   'lib/dialog/native-reader-context.mjs','lib/dialog/reader-context-policy.mjs','lib/dialog/app-reader-context.mjs','lib/dialog/key-reader-inference.mjs',
   'worlds/app.project/reader-context-policy-source.mjs','worlds/app.project/reader-context-schema-source.mjs',
   'lib/dialog/instance-identity.mjs',
  ],
  backendSha256:['vendor/onnxruntime/ort.wasm.bundle.min.mjs','vendor/onnxruntime/ort-wasm-simd-threaded.mjs','vendor/onnxruntime/ort-wasm-simd-threaded.wasm','vendor/sop-tokenizer/bert-tokenizer.mjs']
 };
 const sourceInventory={};
 for(const [key,files]of Object.entries(groups))sourceInventory[key]=await Promise.all(files.map(async name=>({path:name,sha256:sha(await readFile(path.join(outDir,name)))})));
 deployment.runtimeIdentity=Object.fromEntries(Object.entries(sourceInventory).map(([key,files])=>[key,sha(JSON.stringify(key==='backendSha256'?{files,executionProvider:'wasm',numThreads:1,proxy:false}:files))]));
 deployment.runtimeIdentity.bindingsSha256=deployment.bindingsArtifact.sha256;
 deployment.implementation={format:'psys2.browser-reader-implementation/1',sourceInventory,backend:{executionProvider:'wasm',numThreads:1,proxy:false},trust:'application deployment; browser-specific empirical report still required'};
 deployment.admission=null;
 await writeFile(file,JSON.stringify(deployment,null,2)+'\n');return deployment;
}
