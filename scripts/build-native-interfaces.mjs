// SPDX-License-Identifier: AGPL-3.0-only
// Keep the browser module transport byte-for-byte equivalent to authored SOP.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emit, done } from './lib/generated.mjs';

const worlds = new URL('../worlds/', import.meta.url);
let count = 0;
for (const owner of readdirSync(worlds, { withFileTypes: true })) {
  if (!owner.isDirectory()) continue;
  const author = new URL(owner.name + '/native-interface.sop', worlds);
  if (!existsSync(author)) continue;
  const source = readFileSync(author, 'utf8');
  const transport = new URL('native-interface-source.mjs', author);
  emit(fileURLToPath(transport), '// Generated from native-interface.sop.\nexport default ' + JSON.stringify(source) + ';\n');
  count++;
}
done('build-native-interfaces');
console.log(count + ' authored native interfaces');
