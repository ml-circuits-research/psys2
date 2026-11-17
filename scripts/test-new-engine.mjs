// Active acceptance gate after owner decision 2026-11-16 21:45.
// The old conversational suite is retired, not reclassified as passing.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const fixed = [
  'candidate-execution-measurement.test.mjs', 'reader-stage-counts.test.mjs',
  'verified-reader-provider.test.mjs', 'actual-reader-replay.test.mjs', 'browser-reader-host.test.mjs', 'browser-reader-route.test.mjs', 'app-reader-context.test.mjs', 'reader-probe-selection.test.mjs', 'new-engine.test.mjs', 'reader-routing.test.mjs', 'functional-context-seeding.test.mjs', 'declared-dispatch.test.mjs', 'native-selection.test.mjs', 'observation-query.test.mjs', 'property-selection.test.mjs', 'drawing-property-host.test.mjs',
  'calendar-host.test.mjs', 'calendar-observation.test.mjs', 'face-preparation.test.mjs',
  'declared-candidate-plan.test.mjs', 'predict-request-cutter.test.mjs', 'cutter-decoder-comparison.test.mjs', 'key-reader-training.test.mjs', 'key-reader-onnx-prototype.test.mjs', 'reader-onnx-export.test.mjs', 'target-type-candidate.test.mjs', 'target-type-weight-migration.test.mjs', 'target-type-training-source.test.mjs', 'predict-target-type-candidate.test.mjs', 'predict-key-reader.test.mjs', 'predicted-key-inputs.test.mjs', 'request-cutter-training.test.mjs', 'key-reader-pipeline.test.mjs', 'key-reader-packet.test.mjs', 'key-reader-inference.test.mjs', 'cutter-inference.test.mjs', 'bert-source-offsets.test.mjs', 'structural-inference.test.mjs', 'predict-structural.test.mjs', 'structural-trainer.test.mjs', 'structural-bindings.test.mjs', 'raw-structural-bridge.test.mjs', 'project-structural-gold.test.mjs', 'request-check.test.mjs', 'model-graph-decoder.test.mjs', 'bootstrap-onnx-calibration.test.mjs', 'structural-supervision-audit.test.mjs', 'request-label-codec.test.mjs', 'sop-bert-bootstrap.test.mjs', 'inventory-bootstrap-inference.test.mjs', 'webchat-assets.test.mjs', 'webchat-build.test.mjs',
  'system-map.test.mjs', 'loop-guard.test.mjs', 'bio-viterbi.test.mjs',
];
const lanes = readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('-declared-host.test.mjs'));
const files = [...new Set([...fixed, ...lanes])].sort().map(name => `tests/${name}`);
files.push('training/sop-bert/tests/compile-teacher-expectations.test.mjs');
console.log(`Active new-engine gate: ${files.length} files; retired dialogue/REAL suites are not acceptance gates.`);
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: new URL('../', import.meta.url), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
