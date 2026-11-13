// SPDX-License-Identifier: AGPL-3.0-only
// The case corpus (training/eval/cases.jsonl): one append-only file in the format of the sopworld failure ledger (handover/failure-ledger/README.md),
// extended so that RIGHT cases are kept too (a case that changes from right to wrong must be seen). Each line is an OBSERVATION of a case:
//   { id, kind, text, tab, language, happened, expected, class, source, first_seen, build, run, outcome, group, stage, [cause, pair, exp, world, reasoner], [changed: 'right>wrong' | 'wrong>right'] }
//   id        sha1(source \t text \t tab), the same key the ledger uses; kind: owner-log | ledger | grid | transfer
//   outcome   right | wrong | na (said plainly, correct) | unchecked
//   group     cause group (scripts/lib/failure-cause.mjs causeOf), only for wrong rows; stage: the pipeline step the group belongs to (stageOf)
// A new observation of an id is appended only when its outcome differs from the last one; nothing is ever rewritten or removed.
// Runs are listed in training/eval/cases-runs.jsonl ({ run, date, build, added, changed, regressions: [id], fixed: [id] }).
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CORPUS = join(REPO, 'training/eval/cases.jsonl');
export const RUNS = join(REPO, 'training/eval/cases-runs.jsonl');
export const caseId = (source, text, tab) => createHash('sha1').update(`${source}\t${text}\t${tab ?? null}`).digest('hex').slice(0, 12);
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const readCorpus = (f = CORPUS) => jsonl(f);
export const readRuns = (f = RUNS) => jsonl(f);
/** The last observation of every id (Map id -> row). */
export function latest(rows) { const m = new Map(); for (const r of rows) m.set(r.id, r); return m; }
export const appendRows = (rows, f = CORPUS) => { if (rows.length) appendFileSync(f, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`); };
export const appendRun = (run, f = RUNS) => appendFileSync(f, `${JSON.stringify(run)}\n`);
