// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emit, done } from './lib/generated.mjs';

const folder = new URL('../worlds/app.project/', import.meta.url);
for (const [source, module] of [
  ['capability-policy.sop', 'capability-policy.mjs'],
  ['execution-policy.sop', 'execution-policy-source.mjs'],
  ['execution-policy-schema.sop', 'execution-policy-schema-source.mjs'],
]) {
  const text = readFileSync(new URL(source, folder), 'utf8');
  emit(fileURLToPath(new URL(module, folder)), '// Generated from ' + source + '.\nexport default ' + JSON.stringify(text) + ';\n');
}
done('build-capability-policy-sources');
