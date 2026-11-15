// SPDX-License-Identifier: AGPL-3.0-only
// node:test reporter for scripts/run-tests.mjs: the usual spec output, plus one JSON line per failed test (leaf tests only) appended to the file named by
// PSYS2_FAILURES_OUT, so that the runner can list every failure at the end of the run (no failure is forgiven: P3, 2026-11-15). A test on the legacy list (tests/helpers.mjs legacyOnly: a TODO) is listed apart, report-only (reviewer 2026-11-15 16:40).
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { spec } from 'node:test/reporters';

// The legacy list (tests/legacy-list.json, reviewer 2026-11-15 16:40, owner 17:55): tests that pin a reader, a wording or a route the request door replaced, each with its reason.
// A listed test still runs; its failure is reported apart, not counted. A test may also say so itself (tests/helpers.mjs legacyOnly: a TODO).
const LIST_FILE = fileURLToPath(new URL('../../tests/legacy-list.json', import.meta.url));
const LEGACY = new Map((existsSync(LIST_FILE) ? JSON.parse(readFileSync(LIST_FILE, 'utf8')).tests ?? [] : []).map((t) => [`${t.file}|${t.name}`, t.reason]));

export default async function* failuresReporter(source) {
  const out = process.env.PSYS2_FAILURES_OUT;
  async function* tap() {
    for await (const ev of source) {
      if (ev.type === 'test:fail' && out && ev.data?.details?.type !== 'suite' && ev.data?.details?.error?.failureType !== 'subtestsFailed') {
        try { appendFileSync(out, JSON.stringify({ file: basename(ev.data.file ?? ''), name: ev.data.name, nesting: ev.data.nesting, ...(ev.data.todo ? { legacy: String(ev.data.todo) } : LEGACY.has(`${basename(ev.data.file ?? '')}|${ev.data.name}`) ? { legacy: LEGACY.get(`${basename(ev.data.file ?? '')}|${ev.data.name}`) } : {}) }) + '\n'); } catch { /* the runner then sees only the exit code */ }
      }
      yield ev;
    }
  }
  const s = new spec();
  Readable.from(tap(), { objectMode: true }).pipe(s);
  for await (const chunk of s) yield chunk;
}
