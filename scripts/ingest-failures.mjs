#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * INGEST FAILURES (specs/06 "Learn from use", the receiving side): takes a batch of failures that people downloaded ("Download failures only", export format 3) or that the app sent
 * (`psys2-failures/1`) into the failure ledger and the case corpus, and FREEZES the new messages into the held-out set of the learning curve BEFORE anyone looks at them for fixing.
 *
 * Accepted input (a file, or `-` for stdin):
 *   psys2-failures/1      { format, sent, app, sender?, count, failures: [ { id, time, text, english, lang, tab, reasons, reading, reply, changed, expected, why, next } ] }
 *   psys2-phrase-log/3    the export of "Download failures only" (or a full export): the records that carry `failure` (or, in a full export, the ones the failure rules select) are taken;
 *                         records marked `context: true` are never ingested
 *   JSONL                 one failure entry per line (the same fields as above)
 *
 * What happens to each failure (the held-out RULE of scripts/freeze-heldout.mjs and docs/lessons.md decides, in this order):
 *   1. the message text (English: `english` when the person wrote another language) that no worker has seen yet is FROZEN into training/eval/heldout-real/rows.jsonl (source `user-feedback`).
 *      It is NOT copied into the ledger, the case corpus, a world, a test or training data: from now on it is measured only. Its context (the person's expectation, the reasons, the reply the app gave)
 *      is kept NEXT TO it in heldout-real/feedback.jsonl for the hand judgment, and nowhere else.
 *   2. a message that workers already look at (it is in the case corpus, the ledger, an owner log, ... so it is not unseen) goes to the ledger training/eval/failures.jsonl as a row
 *      `source: user-feedback`, `expected` = what the person said they expected (or a plain note when they said nothing), and from there into the case corpus (scripts/update-cases.mjs --sources ledger).
 *   3. a row that is frozen and later retired (`node scripts/freeze-heldout.mjs --retire <hash> "why"`, because a rule was written from it) is released by `--from-used`: it joins the ledger and the case corpus then.
 * Re-running the same batch changes nothing (duplicates are refused by hash / by ledger key).
 *
 *   node scripts/ingest-failures.mjs <batch.json|batch.jsonl|-> [--dry] [--no-cases] [--arrived YYYY-MM-DD]
 *   node scripts/ingest-failures.mjs --from-used [--dry] [--no-cases]
 *   (tests only: --ledger <file> --corpus <file> --runs <file>; env PSYS2_HELDOUT_DIR, PSYS2_EVAL_DIR)
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR as HELDOUT, freeze, hashOf, norm } from './freeze-heldout.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'user-feedback';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const today = () => new Date().toISOString().slice(0, 10);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r._header) : []);

/** Reads a batch in any accepted shape and returns normalised entries: { id, text, tab, lang, time, reasons, expected, happened, why, next, said }. Context-only records are dropped. */
export function readBatch(raw) {
  const t = String(raw ?? '').trim();
  let list = [];
  if (t.startsWith('{') && !t.includes('\n{"')) {
    let doc = null;
    try { doc = JSON.parse(t); } catch { doc = null; }
    if (doc?.format === 'psys2-failures/1') list = (doc.failures ?? []).map((f) => ({ ...f, _src: 'batch' }));
    else if (doc && String(doc.format ?? '').startsWith('psys2-phrase-log/')) list = (doc.records ?? []).filter((r) => r.failure && !r.context).map((r) => ({ _src: 'export', id: r.id, text: r.text, english: r.english, lang: r.lang, tab: r.tab, time: r.time, reasons: r.failure.reasons ?? [], expected: r.feedback?.wanted ?? null, reply: r.detail?.answer ?? r.happened?.shown?.[0]?.text ?? '', status: r.status, why: r.feedback?.reasons ?? [] }));
    else if (doc?.text) list = [doc];
  } else list = t.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return list.filter((f) => typeof f?.text === 'string' && f.text.trim() && !f.context).map((f) => {
    const lang = f.lang ?? 'en';
    return { id: f.id ?? null, text: clip(lang !== 'en' && f.english ? f.english : f.text, 500), said: lang !== 'en' ? clip(f.text, 500) : null, lang, tab: f.tab ?? null, time: f.time ?? null, reasons: f.reasons ?? [], expected: f.expected ? clip(f.expected, 500) : null, reply: clip(f.reply, 300), status: f.status ?? f.outcome ?? null, why: f.why ?? [], next: f.next ? clip(f.next, 300) : null };
  });
}

const happenedOf = (e) => `${e.reply || '(no reply recorded)'} [user-feedback: ${e.reasons.join(', ') || 'failure'}${e.next ? `; next message: "${e.next}"` : ''}]`;
const expectedOf = (e) => e.expected ?? `(the person gave no expectation; reasons: ${e.reasons.join(', ') || 'failure'}${e.next ? `; their next message was "${e.next}"` : ''})`;
const ledgerRow = (e, build) => ({ text: e.text, tab: e.tab, language: 'en', happened: clip(happenedOf(e), 300), expected: expectedOf(e), class: 'unclassified', source: SOURCE, first_seen: today(), build, was_passing: false, reasons: e.reasons });

/**
 * Ingests entries. Returns { frozen, ledger, duplicates, empty } counts. `files` = { ledger } (the failure ledger path). The order is the rule: freeze FIRST.
 */
export function ingest(entries, { ledger, arrived = today(), dry = false, build = '' } = {}) {
  const have = new Set(jsonl(ledger).filter((r) => r.source === SOURCE).map((r) => `${norm(r.text)}\t${r.tab ?? ''}`));
  const items = entries.map((e) => ({ text: e.text, tab: e.tab, lang: 'en', time: e.time ?? undefined }));
  const { added, refused, seenItems } = freeze(items, { source: SOURCE, arrived, dry });
  // the same message reported twice (or by two people): one row, the reasons joined, the first expectation kept
  const byHash = new Map();
  for (const e of entries) { const h = hashOf(e.text), o = byHash.get(h); byHash.set(h, o ? { ...o, reasons: [...new Set([...o.reasons, ...e.reasons])], expected: o.expected ?? e.expected, reply: o.reply || e.reply, next: o.next ?? e.next } : e); }
  // the context of the frozen rows stays next to them, for the hand judgment (it is never read to fix something)
  if (!dry && added.length) {
    mkdirSync(HELDOUT, { recursive: true });
    appendFileSync(join(HELDOUT, 'feedback.jsonl'), `${added.map((r) => { const e = byHash.get(r.hash); return JSON.stringify({ hash: r.hash, arrived, reasons: e.reasons, expected: e.expected, reply: e.reply, status: e.status, why: e.why, next: e.next, ...(e.said ? { said: e.said, lang: e.lang } : {}) }); }).join('\n')}\n`);
  }
  const rows = [];
  for (const it of seenItems) {
    const e = byHash.get(hashOf(it.text)), k = `${norm(e.text)}\t${e.tab ?? ''}`;
    if (have.has(k)) continue;
    have.add(k); rows.push(ledgerRow(e, build));
  }
  if (!dry && rows.length) appendFileSync(ledger, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return { frozen: added.length, ledger: rows.length, duplicates: refused.duplicate + (seenItems.length - rows.length), empty: refused.empty };
}

/** Releases frozen rows that were retired (`freeze-heldout.mjs --retire`): they join the ledger with the expectation kept in feedback.jsonl. */
export function releaseUsed({ ledger, dry = false, build = '' } = {}) {
  const fb = new Map(jsonl(join(HELDOUT, 'feedback.jsonl')).map((r) => [r.hash, r]));
  const have = new Set(jsonl(ledger).filter((r) => r.source === SOURCE).map((r) => `${norm(r.text)}\t${r.tab ?? ''}`));
  const rows = [];
  for (const u of jsonl(join(HELDOUT, 'used.jsonl'))) {
    const f = fb.get(u.hash);
    if (!f || have.has(`${norm(u.text)}\t${u.tab ?? ''}`)) continue;
    rows.push(ledgerRow({ text: u.text, tab: u.tab, reasons: f.reasons ?? [], expected: f.expected ?? null, reply: f.reply ?? '', next: f.next ?? null }, build));
  }
  if (!dry && rows.length) appendFileSync(ledger, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return { released: rows.length };
}

function runCases(ledger) {
  const a = ['scripts/update-cases.mjs', '--sources', 'ledger', '--ledger', ledger];
  for (const k of ['--corpus', '--runs']) if (arg(k)) a.push(k, arg(k));
  const r = spawnSync(process.execPath, a, { cwd: REPO, encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ');
}

async function main() {
  const ledger = arg('--ledger', join(REPO, 'training/eval/failures.jsonl')), dry = has('--dry');
  const build = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  if (has('--from-used')) {
    const r = releaseUsed({ ledger, dry, build });
    console.log(`${dry ? '(dry) ' : ''}released ${r.released} retired rows into the ledger`);
    if (!dry && !has('--no-cases') && r.released) console.log(`cases: ${runCases(ledger)}`);
    return;
  }
  const file = process.argv[2];
  if (!file || file.startsWith('--')) { console.error('usage: node scripts/ingest-failures.mjs <batch.json|batch.jsonl|-> [--dry] [--no-cases] [--arrived YYYY-MM-DD]  |  --from-used'); process.exit(2); }
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const entries = readBatch(raw);
  const r = ingest(entries, { ledger, arrived: arg('--arrived', today()), dry, build });
  console.log(`${dry ? '(dry) ' : ''}${entries.length} failures read: ${r.frozen} frozen into the held-out set (measured only), ${r.ledger} into the ledger, ${r.duplicates} already known, ${r.empty} empty`);
  if (!dry && !has('--no-cases') && r.ledger) console.log(`cases: ${runCases(ledger)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { await main(); process.exit(0); }
