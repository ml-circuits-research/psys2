// SPDX-License-Identifier: AGPL-3.0-only
// node:test reporter for scripts/run-tests.mjs: the usual spec output, plus one JSON line per failed test (leaf tests only) appended to the file named by
// PSYS2_FAILURES_OUT, so that the runner can split the failures into known (tests/known-failures.json) and new ones.
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { spec } from 'node:test/reporters';

export default async function* knownFailuresReporter(source) {
  const out = process.env.PSYS2_FAILURES_OUT;
  async function* tap() {
    for await (const ev of source) {
      if (ev.type === 'test:fail' && out && ev.data?.details?.type !== 'suite' && ev.data?.details?.error?.failureType !== 'subtestsFailed') {
        try { appendFileSync(out, JSON.stringify({ file: basename(ev.data.file ?? ''), name: ev.data.name, nesting: ev.data.nesting }) + '\n'); } catch { /* the runner then sees only the exit code */ }
      }
      yield ev;
    }
  }
  const s = new spec();
  Readable.from(tap(), { objectMode: true }).pipe(s);
  for await (const chunk of s) yield chunk;
}
