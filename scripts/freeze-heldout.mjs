#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The FROZEN HELD-OUT SET OF REAL MESSAGES (worker-tasks 2026-11-14 06:30, learning curve, curve 1).
 *
 * THE RULE (also in docs/lessons.md): a real message (a new owner export, a new ledger row that came from a person) is frozen HERE AT ARRIVAL, before anyone reads it to fix something.
 * From then on it is MEASURED ONLY. It is never copied into a world, a pattern, a lexicon, a test, a case of the corpus, a training file or a worker task, and nobody writes or changes a rule
 * to make one of its messages work. The share right on this set is the learning curve's first line: it rises only if the general mechanisms generalise to messages nobody looked at.
 * (This is the one deliberate exception to the data principle "overlap is acceptable": for THIS set, the point is that nothing overlaps. If a message is ever used to write a rule, it is
 * moved to `used.jsonl` by `--retire <hash>` and no longer counts; it is never deleted.)
 *
 * Files in training/eval/heldout-real/:
 *   rows.jsonl       one row per frozen message: { hash, arrived, source, tab, lang, time, text }; first line is a { _header } record. Append-only. hash = sha256 of the normalized text, the identity.
 *   replies.jsonl    the reply of every `--score` (one row per message and build): { hash, build, date, reply, worlds, statuses }; for the HAND judgment (reading a reply is not judging it).
 *   judgments.jsonl  { hash, build, verdict: right|wrong, by, date, note }; by hand, by the reviewer, never by the worker who fixed things. Append-only; the latest row per hash and build counts.
 *   used.jsonl       rows retired because a rule was written from them (kept for the record).
 *
 *   node scripts/freeze-heldout.mjs --add <file.jsonl|file.txt> --source <name> [--arrived YYYY-MM-DD] [--dry]   freeze new messages (jsonl rows with `text`, optional tab/lang/time; or one message per line)
 *   node scripts/freeze-heldout.mjs --check                 hashes intact, no frozen message appears in worlds/, tests/, training/ data or the corpus (a LEAK is reported and exits 3)
 *   node scripts/freeze-heldout.mjs --score                 replay the frozen messages on this build, write replies.jsonl (judging is separate)
 *   node scripts/freeze-heldout.mjs --judge <hash-prefix> right|wrong ["note"] [--by name]
 *   node scripts/freeze-heldout.mjs --summary               { total, judged, right, share } for the latest scored build
 *   node scripts/freeze-heldout.mjs --retire <hash-prefix> "why"
 * `--add` refuses a message that is ALREADY IN what workers look at (training/eval/*.jsonl and *.txt: the case corpus, owner logs, real-phrases, operational sets, ledger): it is no longer unseen.
 */
import { readFileSync, existsSync, appendFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EVAL_DIR = process.env.PSYS2_EVAL_DIR || join(REPO, 'training/eval');   // the env overrides are for tests only
export const DIR = process.env.PSYS2_HELDOUT_DIR || join(EVAL_DIR, 'heldout-real');
const F = (n) => join(DIR, n);
const HEADER = { _header: 'FROZEN HELD-OUT REAL MESSAGES. Frozen at arrival; measured only; never used to write a rule, a test, a pattern, a lexicon entry or training data. Append-only. See scripts/freeze-heldout.mjs and docs/lessons.md.' };
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r._header) : []);
const append = (f, rs) => { mkdirSync(DIR, { recursive: true }); if (!existsSync(f)) writeFileSync(f, `${JSON.stringify(HEADER)}\n`); if (rs.length) appendFileSync(f, `${rs.map((r) => JSON.stringify(r)).join('\n')}\n`); };
export const norm = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
export const hashOf = (t) => createHash('sha256').update(norm(t)).digest('hex').slice(0, 16);
const today = () => new Date().toISOString().slice(0, 10);
const build = () => spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

export const rows = () => { const used = new Set(jsonl(F('used.jsonl')).map((r) => r.hash)); return jsonl(F('rows.jsonl')).filter((r) => !used.has(r.hash)); };

/** { total, scoredBuild, judged, right, share } for the latest scored build; unjudged rows are not counted as right. */
export function summary() {
  const all = rows(), reps = jsonl(F('replies.jsonl'));
  const b = reps.at(-1)?.build ?? null;
  if (!all.length) return { total: 0, scoredBuild: null, judged: 0, right: 0, share: null };
  const live = new Set(all.map((r) => r.hash)), v = new Map();
  for (const j of jsonl(F('judgments.jsonl'))) if (j.build === b && live.has(j.hash)) v.set(j.hash, j.verdict);
  const right = [...v.values()].filter((x) => x === 'right').length;
  return { total: all.length, scoredBuild: b, judged: v.size, right, share: v.size ? right / v.size : null };
}

/** Texts workers look at (a message in here is not unseen). */
export function seenTexts() {
  const seen = new Set();
  const take = (f) => { try { for (const l of readFileSync(f, 'utf8').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); for (const k of ['text', 'message', 'original']) if (typeof r[k] === 'string') seen.add(norm(r[k])); } catch { seen.add(norm(l)); } } } catch { /* missing */ } };
  const ev = EVAL_DIR;
  for (const f of readdirSync(ev)) if (/\.(jsonl|txt)$/.test(f)) take(join(ev, f));
  return seen;
}

function walk(d, out = []) {
  for (const f of readdirSync(d)) {
    if (f === 'node_modules' || f === '.git' || f === 'heldout-real' || f === 'vendor' || f === 'worktrees') continue;
    const p = join(d, f), s = statSync(p);
    if (s.isDirectory()) walk(p, out); else if (s.size < 3e6 && /\.(sop|mjs|js|json|jsonl|md|txt|py)$/.test(f)) out.push(p);
  }
  return out;
}

/** Freezes new messages (the rule above): `items` are { text, tab?, lang?, time? }. Returns { added: [rows], refused: { duplicate, seen, empty }, seenItems: [items that workers already look at] }. */
export function freeze(items, { source, arrived = today(), dry = false } = {}) {
  const have = new Set(rows().map((r) => r.hash)), seen = seenTexts(), added = [], seenItems = [], refused = { duplicate: 0, seen: 0, empty: 0 };
  for (const it of items) {
    const text = String(it.text ?? '').trim(), hash = hashOf(text);
    if (!text) refused.empty++;
    else if (have.has(hash) || added.some((r) => r.hash === hash)) refused.duplicate++;
    else if (seen.has(norm(text))) { refused.seen++; seenItems.push(it); }
    else added.push({ hash, arrived, source, tab: it.tab ?? null, lang: it.lang ?? 'en', time: it.time ?? `${arrived}T00:00:00.000Z`, text });
  }
  if (!dry) append(F('rows.jsonl'), added);
  return { added, refused, seenItems };
}

async function main() {
  if (has('--add')) {
    const file = arg('--add'), source = arg('--source', file), arrived = arg('--arrived', today());
    const raw = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
    const items = raw.map((l) => { try { const r = JSON.parse(l); return typeof r.text === 'string' ? r : null; } catch { return { text: l.trim() }; } }).filter(Boolean);
    const { added, refused } = freeze(items, { source, arrived, dry: has('--dry') });
    console.log(`${has('--dry') ? '(dry) ' : ''}frozen ${added.length} of ${items.length} messages from ${source}; refused: ${refused.duplicate} duplicate, ${refused.seen} already seen by workers, ${refused.empty} empty`);
    return;
  }
  if (has('--check')) {
    const all = rows();
    let bad = 0;
    for (const r of all) if (hashOf(r.text) !== r.hash) { console.log(`HASH CHANGED ${r.hash}`); bad++; }
    const texts = all.map((r) => r.text).filter((t) => t.length >= 12);
    if (texts.length) for (const p of walk(REPO)) { const body = readFileSync(p, 'utf8').toLowerCase(); for (const t of texts) if (body.includes(t.toLowerCase())) { console.log(`LEAK ${hashOf(t)} in ${p.slice(REPO.length + 1)}`); bad++; } }
    console.log(`${all.length} frozen messages checked: ${bad ? `${bad} problem(s)` : 'intact, no leak'}`);
    process.exit(bad ? 3 : 0);
  }
  if (has('--score')) {
    const all = rows();
    if (!all.length) { console.log('no frozen messages yet; nothing to score'); return; }
    const dir = mkdtempSync(join(tmpdir(), 'heldout-')), log = join(dir, 'log.jsonl');
    writeFileSync(log, all.map((r) => JSON.stringify({ time: r.time, tab: r.tab, lang: r.lang, text: r.text, class: 'heldout' })).join('\n'));
    const { replay } = await import('./eval-owner-log.mjs');
    const rep = await replay({ log, checks: '/nonexistent' });
    rmSync(dir, { recursive: true, force: true });
    const b = build(), date = today();
    append(F('replies.jsonl'), rep.map((x, i) => ({ hash: all[i].hash, build: b, date, text: all[i].text, reply: x.reply ?? x.error ?? null, worlds: x.worlds ?? [], statuses: x.statuses ?? null })));
    console.log(`scored ${rep.length} messages on ${b}; judge them by hand: --judge <hash> right|wrong`);
    return;
  }
  if (has('--judge')) {
    const i = process.argv.indexOf('--judge'), pre = process.argv[i + 1], verdict = process.argv[i + 2], note = process.argv[i + 3]?.startsWith('--') ? '' : (process.argv[i + 3] ?? '');
    if (!['right', 'wrong'].includes(verdict)) throw new Error('verdict: right | wrong');
    const b = jsonl(F('replies.jsonl')).at(-1)?.build, hit = rows().filter((r) => r.hash.startsWith(pre));
    if (hit.length !== 1) throw new Error(`${hit.length} messages match ${pre}`);
    append(F('judgments.jsonl'), [{ hash: hit[0].hash, build: b, verdict, by: arg('--by', 'reviewer'), date: today(), note }]);
    console.log(`${hit[0].hash} ${verdict}`);
    return;
  }
  if (has('--retire')) {
    const i = process.argv.indexOf('--retire'), pre = process.argv[i + 1], why = process.argv[i + 2] ?? '';
    const hit = rows().filter((r) => r.hash.startsWith(pre));
    if (hit.length !== 1) throw new Error(`${hit.length} messages match ${pre}`);
    append(F('used.jsonl'), [{ ...hit[0], retired: today(), why }]);
    console.log(`retired ${hit[0].hash}`);
    return;
  }
  console.log(JSON.stringify(summary()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { await main(); process.exit(0); }
