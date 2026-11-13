#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Sends the failures of the three robustness sets (typos, loose-words, paraphrases-rt) of a model-ablation result file to the failure ledger
 * (training/eval/failures.jsonl; NO POINT FIXES: a failing case is data, not a task), by cause. Row class = `robust:<set>:<cause key>`, which
 * `scripts/lib/failure-cause.mjs` turns into the group `robustness: <set>: <cause>` for `scripts/analyze-failures.mjs`.
 * APPEND-ONLY, no row is added twice ((source, text, tab) already present). Nothing here changes behaviour.
 *
 *   node scripts/ledger-robustness.mjs --result <dir>/rules-C.json [--dry]
 */
import { readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(REPO, 'training/eval/failures.jsonl');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const jsonl = (p) => readFileSync(join(REPO, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** The cause key of a failed robustness row: general signals of what the pipeline did, never the phrase. */
export function robustCause(set, r) {
  const reply = r.reply ?? '', corrected = (r.corrections ?? []).length > 0, said = r.outcome;   // wrong | nu | asked
  if (set === 'typos') {
    if (!corrected && said !== 'wrong') return ['not-corrected', 'the slipped word was not corrected (no word of the worlds within the slip budget, or the word is known to another world) and nothing else read the message'];
    if (corrected && said === 'wrong') return ['corrected-to-another-word', 'the spelling stage replaced the slipped word by a different known word than the one meant'];
    if (corrected) return ['corrected-not-read', 'a correction was made but the corrected text is still not read by any world'];
    return ['read-as-another-command', 'the slipped word is itself a word (or the message was read as another command) and no correction was tried'];
  }
  if (set === 'loose-words') {
    if (r.group === 'junk') return ['junk-acted-on', 'a message with no intent was acted on (best effort or a rule read it as a command)'];
    if (said === 'wrong') return ['read-as-another-intent', 'the loose words were read, but as another intent than the one the words belong to (best-effort choice of the reading)'];
    return ['not-read', 'the loose words (content words only, word order scrambled or the frame missing) were not read by any world'];
  }
  if (/I do not know what|did not know the words|do not know the word/i.test(reply)) return ['unknown-word', 'the paraphrase uses a word no world, card or catalog entry knows (a synonym of the intended word)'];
  if (said === 'wrong') return ['read-as-another-reading', 'the paraphrase was read, but as another reading than its original (different state or answer)'];
  return ['phrasing-not-read', 'the paraphrase frame is not read by any world (another sentence frame, same meaning)'];
}

export function robustRows(resultFile, { build, today }) {
  const res = JSON.parse(readFileSync(resultFile, 'utf8'));
  const typoDir = join(REPO, 'training/eval/typos');
  const typos = readdirSync(typoDir).filter((f) => f.endsWith('.jsonl') && f !== 'proper-names.jsonl').flatMap((f) => readFileSync(join(typoDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const loose = jsonl('training/eval/loose-words.jsonl'), para = new Map(jsonl('training/eval/paraphrases-rt-2026-11-12.jsonl').map((c) => [c.id, c]));
  const out = [];
  for (const r of res.rows) {
    if (!['typos', 'loose-words', 'paraphrases-rt'].includes(r.set) || r.outcome === 'right' || r.outcome === 'skip') continue;
    const [key, why] = robustCause(r.set, r);
    let expected, tab = null;
    if (r.set === 'typos') { const t = typos[Number(r.id.split('#')[1])]; expected = `the same state and answer as "${t?.original}"`; tab = t?.tab ?? null; }
    else if (r.set === 'loose-words') { const t = loose[Number(r.id.split('#')[1])]; expected = t?.kind === 'junk' ? 'nothing done' : `the same state and answer as "${t?.intent}"`; tab = t?.tab ?? null; }
    else { const c = para.get(r.id); expected = JSON.stringify(c?.expect ?? null).slice(0, 200); tab = c?.tab ?? r.world ?? null; }
    out.push({ text: r.text, tab, language: 'en', happened: `${r.reply ?? '(no reply)'} [${r.outcome}${r.corrections?.length ? `; corrections: ${r.corrections.join(', ')}` : ''}]`, expected, class: `robust:${r.set}:${key}`, source: `ablation-${res.config}#${r.set}/${r.id}`, cause: why, first_seen: today, build });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = arg('result'); if (!file) throw new Error('--result <ablation result json>');
  const build = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const rows = robustRows(resolve(file), { build, today: new Date().toISOString().slice(0, 10) });
  const have = new Set(jsonl('training/eval/failures.jsonl').map((r) => `${r.text}\t${r.tab}\t${r.class}`));
  const fresh = rows.filter((r) => !have.has(`${r.text}\t${r.tab}\t${r.class}`));
  const by = {}; for (const r of fresh) { by[r.class] = (by[r.class] ?? 0) + 1; }
  console.log(`new rows ${fresh.length} of ${rows.length}`, JSON.stringify(by, null, 1));
  if (!process.argv.includes('--dry') && fresh.length) appendFileSync(LEDGER, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
