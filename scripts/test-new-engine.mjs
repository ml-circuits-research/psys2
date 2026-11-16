// Active acceptance gate after owner decision 2026-11-16 21:45.
// The old conversational suite is retired, not reclassified as passing.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const fixed = [
  'new-engine.test.mjs', 'property-selection.test.mjs', 'drawing-property-host.test.mjs',
  'calendar-host.test.mjs', 'calendar-observation.test.mjs', 'face-preparation.test.mjs',
  'request-label-codec.test.mjs', 'sop-bert-bootstrap.test.mjs', 'webchat-assets.test.mjs', 'webchat-build.test.mjs',
  'system-map.test.mjs', 'loop-guard.test.mjs',
];
const lanes = readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('-declared-host.test.mjs'));
const files = [...new Set([...fixed, ...lanes])].sort().map(name => `tests/${name}`);
console.log(`Active new-engine gate: ${files.length} files; retired dialogue/REAL suites are not acceptance gates.`);
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: new URL('../', import.meta.url), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
