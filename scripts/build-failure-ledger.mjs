#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fills training/eval/failures.jsonl (the failure ledger; worker-tasks "NO POINT FIXES": a failing case is data, not a task).
 * Row: { text, tab, language, happened, expected, class, source, first_seen, build, was_passing } (+ happened_then for replays).
 * APPEND-ONLY: existing rows are kept; a row whose (source, text, tab) is already in the file is not added again. Other agents append rows too.
 * Sources replayed on the CURRENT build: the three owner logs (scripts/eval-owner-log.mjs), minimal pairs, dialogues, coherence (rules / matrix reasoner).
 * Sources read from their result files: round-trip translation failures, WORLD-OF-WORLDS routing confusions (one group).
 *
 *   node scripts/build-failure-ledger.mjs [--dry] [--skip replay,minpairs,dialogues,coherence,roundtrip,routing]
 */
import { readFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(REPO, 'training/eval/failures.jsonl');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const skip = new Set((arg('skip') ?? '').split(','));
const build = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
const today = new Date().toISOString().slice(0, 10);
const jsonl = (p) => readFileSync(join(REPO, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rows = [];
const add = (r) => rows.push({ text: r.text, tab: r.tab ?? null, language: r.language ?? 'en', happened: String(r.happened ?? '').slice(0, 300), expected: typeof r.expected === 'string' ? r.expected : JSON.stringify(r.expected ?? null), class: r.class ?? 'unclassified', source: r.source, first_seen: r.first_seen ?? today, build: r.build ?? build, was_passing: r.was_passing ?? false, ...(r.happened_then ? { happened_then: String(r.happened_then).slice(0, 200) } : {}) });
const run = (script, args) => spawnSync(process.execPath, [join(REPO, 'scripts', script), ...args], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 });

if (!skip.has('replay')) {
  const { replay } = await import('./eval-owner-log.mjs');
  for (const sfx of ['', 'b', 'c']) {
    const name = `owner-log-2026-11-13${sfx}`;
    const rep = await replay({ log: join(REPO, `training/eval/${name}.jsonl`), checks: sfx ? '/nonexistent' : undefined });
    for (const r of rep) {
      const asked = r.class !== 'ok' && r.expected != null && r.expected !== '';
      const regress = r.class === 'ok' && r.outcome === 'wrong';
      if (!asked && !regress) continue;
      const happened = r.error ? `(error) ${r.error}` : !r.reply?.trim() ? '(no reply)' : `${r.reply}${r.worlds?.length ? ` [worlds: ${r.worlds.join(',')}]` : ''}${r.failing?.length ? ` [check: ${r.failing.join(' ')}]` : ''}`;
      add({ text: r.text, tab: r.tab, language: r.lang, happened, expected: r.expected ?? (r.failing ?? []).join(' '), class: r.class, source: `${name}#${r.i}`, was_passing: regress, happened_then: r.logged });
    }
  }
}
if (!skip.has('minpairs')) {
  const o = run('eval-operational.mjs', ['--mode', 'rules', '--set', 'training/eval/minimal-pairs-2026-11-12.jsonl', '--jobs', '4', '--name', 'ledgertmp']);
  const f = /wrote (\S+ledgertmp\.json)/.exec(o.stdout)?.[1];
  if (f) {
    const res = JSON.parse(readFileSync(join(REPO, f), 'utf8')); rmSync(join(REPO, f));
    const set = new Map(jsonl('training/eval/minimal-pairs-2026-11-12.jsonl').map((c) => [c.id, c]));
    for (const c of res.cases) if (c.outcome !== 'right') add({ text: set.get(c.id)?.message, tab: set.get(c.id)?.tab ?? c.world, happened: `${c.reply} [${c.outcome}]`, expected: (c.failing ?? []).join('; '), class: `minimal-pair:${(set.get(c.id)?.families ?? [])[0] ?? 'pair'}`, source: `minimal-pairs-2026-11-12#${c.id}` });
  }
}
if (!skip.has('dialogues')) {
  const o = run('eval-dialogues.mjs', ['--mode', 'rules', '--jobs', '4']);
  const f = /wrote (\S+\.json)/.exec(o.stdout + o.stderr)?.[1] ?? `training/results/dialogues/rules-nomodel-${today}.json`;
  if (existsSync(join(REPO, f))) {
    const res = JSON.parse(readFileSync(join(REPO, f), 'utf8'));
    const set = new Map(jsonl('training/eval/dialogues.jsonl').map((d) => [d.id, d]));
    for (const d of res.dialogues) for (const t of d.turns) if (t.outcome !== 'right') {
      const def = set.get(d.id);
      add({ text: def?.turns?.[t.i]?.message, tab: def?.tab ?? d.world, happened: `${t.reply} [${t.outcome}]`, expected: (t.failing ?? []).join('; '), class: `dialogue:${(d.families ?? [])[0] ?? 'dialogue'}`, source: `dialogues#${d.id}/${t.i}` });
    }
  }
}
if (!skip.has('coherence')) {
  const coh = new Map(jsonl('training/eval/coherence-2026-11-10.jsonl').map((c) => [c.id, c]));
  const o = run('eval-reasoner.mjs', ['--reasoner', 'matrix', '--only', 'coherence', '--no-write']);
  for (const b of o.stdout.split(/^--- /m).slice(1)) {
    const m = /^(\S+) \((\S+)\) FAILED: ([^\n]*)/.exec(b); if (!m) continue;
    const c = coh.get(m[1]); const replies = [...b.matchAll(/^  (.*)$/gm)].map((x) => x[1]).filter((x) => !/^(FAIL|ok)\s/.test(x));
    add({ text: (c?.turns ?? []).join(' / '), tab: c?.tab ?? 'robot', happened: replies[replies.length - 1] ?? '', expected: c?.expect ?? m[3], class: `coherence:${m[2]}`, source: `coherence-2026-11-10#${m[1]}` });
  }
}
if (!skip.has('roundtrip')) {
  for (const r of jsonl('training/results/round-trip-cases-keep-2026-11-13.jsonl')) {
    if (r.verdict === 'right') continue;
    add({ text: r.foreign, tab: null, language: r.lang, happened: `${r.reading?.reply ?? ''} [back-translation: ${r.back_translation}]`, expected: `${r.original} -> ${JSON.stringify(r.expect?.answer ?? r.expect?.state ?? null)}`, class: `roundtrip:${r.class ?? r.verdict}`, source: `round-trip-cases-keep-2026-11-13#${r.id}/${r.lang}` });
  }
}
if (!skip.has('routing')) {
  const j = JSON.parse(readFileSync(join(REPO, 'training/results/world-routing-2026-11-13.json'), 'utf8'));
  for (const [pair, n] of j.confusionB ?? []) add({ text: `(aggregate: ${n} operational turns)`, tab: pair.split(' -> ')[0], happened: `routed to ${pair.split(' -> ')[1]} by router B`, expected: `stay in ${pair.split(' -> ')[0]}`, class: 'world-routing', source: `world-routing-2026-11-13#${pair}` });
}
const have = new Set(existsSync(LEDGER) ? jsonl('training/eval/failures.jsonl').map((r) => `${r.source}\t${r.text}\t${r.tab}`) : []);
const fresh = rows.filter((r) => !have.has(`${r.source}\t${r.text}\t${r.tab}`));
const bySrc = {}; for (const r of fresh) { const k = r.source.split('#')[0]; bySrc[k] = (bySrc[k] ?? 0) + 1; }
console.log(`new rows ${fresh.length} of ${rows.length}`, JSON.stringify(bySrc));
if (!process.argv.includes('--dry') && fresh.length) appendFileSync(LEDGER, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
