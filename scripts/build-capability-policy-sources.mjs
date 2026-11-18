// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emit, done } from './lib/generated.mjs';

const folder = new URL('../worlds/app.project/', import.meta.url);
for (const [source, module] of [
  ['reader-context-schema.sop', 'reader-context-schema-source.mjs'],
  ['reader-context-policy.sop', 'reader-context-policy-source.mjs'],
  ['reader-admission-schema.sop', 'reader-admission-schema-source.mjs'],
  ['reader-admission-policy.sop', 'reader-admission-policy-source.mjs'],
  ['capability-policy.sop', 'capability-policy.mjs'],
  ['constructor-policy.sop', 'constructor-policy-source.mjs'],
  ['constructor-schema.sop', 'constructor-schema-source.mjs'],
  ['execution-policy.sop', 'execution-policy-source.mjs'],
  ['execution-policy-schema.sop', 'execution-policy-schema-source.mjs'],
  ['history-policy.sop', 'history-policy-source.mjs'],
  ['history-schema.sop', 'history-schema-source.mjs'],
  ['request-routing-schema.sop', 'request-routing-schema-source.mjs'],
  ['request-routing-policy.sop', 'request-routing-policy-source.mjs'],
]) {
  const text = readFileSync(new URL(source, folder), 'utf8');
  emit(fileURLToPath(new URL(module, folder)), '// Generated from ' + source + '.\nexport default ' + JSON.stringify(text) + ';\n');
}
done('build-capability-policy-sources');
