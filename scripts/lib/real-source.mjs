// SPDX-License-Identifier: AGPL-3.0-only
// Which ledger rows came from REAL users (owner decision 2026-11-14 22:10: priorities from real problems, synthetic sets are secondary diagnostics).
// A row is real when its source is a log of what a person typed or said (owner logs, phrase-log exports, real voice/mobile logs, the live demo), a
// dialogue authored from such a log (family `real`), or a user feedback export. Synthetic sets (MT round trips, paraphrases, loose words, typos, dice, grids,
// generated experiments) are real:false. Nothing is deleted either way: the flag only orders the work.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REAL_SOURCE = [
  /^owner-log-/,              // the owner's logs (a, b, c and later exports)
  /real-phrases/,             // real voice / mobile phrase logs
  /phrase-log/,               // phrase-log exports (Settings > Phrase log) and ingested user feedback
  /^user-feedback/, /^ingest-failures/, /^failures-export/,
  /check-live-demo/,          // live-demo checks against the deployed page
  /^real-set/,                // rows written by scripts/real-set.mjs
];

export function realDialogueIds(repo) {
  const f = join(repo, 'training/eval/dialogues.jsonl');
  if (!existsSync(f)) return new Set();
  return new Set(readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((d) => (d.families ?? []).includes('real')).map((d) => d.id));
}

/** True when the ledger row came from a real user turn. `dialogueIds` is realDialogueIds(repo). */
export function isRealRow(r, dialogueIds = new Set()) {
  const src = String(r.source ?? '');
  if (REAL_SOURCE.some((re) => re.test(src))) return true;
  const m = /^dialogues#(.+?)\/\d+$/.exec(src);
  if (m && dialogueIds.has(m[1])) return true;
  return false;
}
