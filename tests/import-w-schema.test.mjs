// SPDX-License-Identifier: AGPL-3.0-only
// THIN LIVE WORLDS: a live world takes the schema of a published world schema (`w.*` of the knowledge catalog) through scripts/import-w-schema.mjs.
// The generated schema.sop must equal what the converter makes from the published schema and the world's own schema.host.sop, and the host must be able to read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { parseSchema } from '../worlds/acts/acts.mjs';
import { convert } from '../scripts/import-w-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS = [['plan.seating', 'w.seating', 'seat'], ['plan.timeline', 'w.timeline', 'time']];
const fixture = (wid) => readFileSync(join(ROOT, 'tests/fixtures/w-schemas', wid, 'schema.sop'), 'utf8');

for (const [world, wid, id] of WORLDS) {
  test(`${world}: schema.sop is generated from the published ${wid} and the host overlay, and the host reads it`, () => {
    const dir = join(ROOT, 'worlds', world);
    const src = fixture(wid);
    const version = /core\.module[^\n]*\bversion=(\d+)/.exec(src)?.[1];
    const { text } = convert({ text: src, overlay: readFileSync(join(dir, 'schema.host.sop'), 'utf8'), id, wid, version });
    assert.equal(readFileSync(join(dir, 'schema.sop'), 'utf8'), text, `schema.sop is stale: node scripts/import-w-schema.mjs <catalog> ${wid} worlds/${world}`);
    const schema = parseSchema(parse(text).wires);
    assert.ok(Object.keys(schema.kinds).length >= 2, 'the kinds of the published schema');
    const published = [...src.matchAll(/^@\S+ core\.type of=(\S+)/gm)].map((m) => m[1].split('.').pop());
    for (const k of published.filter((k) => !/^(part|face)$/.test(k))) assert.ok(schema.kinds[k], `kind ${k} of ${wid} is in the live world`);
  });
}

test('the fixture copies of the published schemas are the catalog\'s (checked where PSYS2_KNOWLEDGE names the catalog)', { skip: !process.env.PSYS2_KNOWLEDGE }, () => {
  for (const wid of ['w.seating', 'w.timeline', 'w.face', 'w.map']) {
    const f = join(process.env.PSYS2_KNOWLEDGE, wid, 'schema.sop');
    if (existsSync(f)) assert.equal(readFileSync(f, 'utf8'), fixture(wid), `${wid}: refresh tests/fixtures/w-schemas/${wid}/schema.sop`);
  }
});
