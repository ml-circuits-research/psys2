#!/usr/bin/env node
/**
 * Loose-words evaluation (spec 03 section 7.15): word-salad messages ("square eyes robot pls") with the correct outcome written as the
 * sentence they should be read as (`intent`) or as "not understood" (`kind: junk`). Every row is run twice in the same pipeline, best effort off and on
 * (the per-message `bestEffort` option of `session.send`), and compared with what the intent does in a fresh session (state, effects, answer values).
 *
 *   node scripts/eval-loose-words.mjs [--mode rules|encoder|encoder+n1] [--ort <path>] [--set training/eval/loose-words.jsonl] [--world W] [--verbose] [--json] [--no-write]
 *
 * recover rows: `recovered` = same effect as the intent; `not_understood` = the reply is "not understood"; `misled` = something else was executed.
 * junk rows:    `right` = not understood (nothing executed); `misled` = the system guessed.
 * `already` counts recover rows that are right with best effort OFF (the rules already read them).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { DEFAULT_MODE, MODES, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';
import { visibleState } from './lib/visible-state.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

function newSession(engine, settings, row) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (row.tab) s.setWorldState('ui.shell', { activeTab: row.tab });
  return s;
}

const strip = (st) => visibleState(st);
/** What a reply did: state, effects and answer values (not the wording). */
function signature(s, reply) {
  return JSON.stringify({ state: strip(s.state()), effects: reply.effects.filter((e) => e.name !== 'chat.suggest').map((e) => [e.name, e.args]), values: reply.answers.map((a) => a.value) });
}
const unparsedAll = (reply) => reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);

async function run(engine, settings, row, text, bestEffort) {
  const s = newSession(engine, settings, row);
  for (const m of row.setup ?? []) await s.send(m, { bestEffort: false });
  const t0 = performance.now();
  const reply = await s.send(text, { bestEffort });
  return { reply, sig: signature(s, reply), unparsed: unparsedAll(reply), ms: performance.now() - t0 };
}

export async function evaluateRows(engine, settings, rows) {
  const out = [];
  for (const row of rows) {
    const ref = row.kind === 'junk' ? null : await run(engine, settings, row, row.intent, false);
    if (ref && ref.unparsed) { out.push({ id: row.id, world: row.world, kind: row.kind, invalid: true }); continue; }
    const res = {};
    for (const be of [false, true]) {
      const r = await run(engine, settings, row, row.message, be);
      let outcome;
      if (row.kind === 'junk') outcome = r.unparsed ? 'right' : 'misled';
      else outcome = r.unparsed ? 'not_understood' : r.sig === ref.sig ? 'recovered' : 'misled';
      res[be ? 'on' : 'off'] = { outcome, ms: Math.round(r.ms), reply: r.reply.text.slice(0, 200) };
    }
    out.push({ id: row.id, world: row.world, kind: row.kind, message: row.message, intent: row.intent, off: res.off, on: res.on });
  }
  return out;
}

export function summarizeLoose(results) {
  const tally = (rows, side) => {
    const t = { n: rows.length, recovered: 0, not_understood: 0, misled: 0, right: 0 };
    for (const r of rows) t[r[side].outcome]++;
    return t;
  };
  const valid = results.filter((r) => !r.invalid);
  const rec = valid.filter((r) => r.kind !== 'junk'), junk = valid.filter((r) => r.kind === 'junk');
  const by_world = {};
  for (const w of [...new Set(valid.map((r) => r.world))].sort()) {
    const rw = rec.filter((r) => r.world === w), jw = junk.filter((r) => r.world === w);
    by_world[w] = { recover: { off: tally(rw, 'off'), on: tally(rw, 'on') }, junk: { off: tally(jw, 'off'), on: tally(jw, 'on') } };
  }
  const gained = rec.filter((r) => r.off.outcome !== 'recovered' && r.on.outcome === 'recovered').length;
  const lost = rec.filter((r) => r.off.outcome === 'recovered' && r.on.outcome !== 'recovered').length;
  const lat = (side) => { const a = valid.map((r) => r[side].ms).sort((x, y) => x - y); return { p50: a[Math.floor(a.length / 2)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, max: a.at(-1) ?? 0 }; };
  return {
    rows: results.length, invalid: results.length - valid.length,
    recover: { off: tally(rec, 'off'), on: tally(rec, 'on'), gained, lost },
    junk: { off: tally(junk, 'off'), on: tally(junk, 'on') },
    latency_ms: { off: lat('off'), on: lat('on') }, by_world,
  };
}

async function main() {
  const file = resolve(arg('set', join(REPO, 'training/eval/loose-words.jsonl')));
  let rows = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l, i) => { const r = JSON.parse(l); r.id ??= `${r.world}#L${i + 1}`; return r; });
  if (arg('world')) rows = rows.filter((r) => r.world === arg('world'));
  const mode = arg('mode', DEFAULT_MODE);
  if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(' | ')}`);
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const rt = await openNodeRuntime({ engine, mode, ortPath: arg('ort'), dispatcherDir: arg('model-dir', join(REPO, 'docs/webchat/models/dispatcher')), normalizerDir: arg('normalizer-dir', join(REPO, 'docs/webchat/models/normalizer')) });
  const results = await evaluateRows(engine, rt.settings, rows);
  const summary = summarizeLoose(results);
  const out = { config: { mode, set: file.replace(`${REPO}/`, ''), date: new Date().toISOString().slice(0, 10) }, ...summary, cases: results };
  if (flag('json')) console.log(JSON.stringify({ config: out.config, ...summary }));
  else {
    const f = (t) => `recovered ${t.recovered ?? 0}  not-understood ${t.not_understood ?? 0}  misled ${t.misled ?? 0}`;
    console.log(`mode ${mode}: ${summary.rows} rows (${summary.invalid} invalid: the intent is not read by the rules)`);
    console.log(`  recover rows (${summary.recover.on.n}): off  ${f(summary.recover.off)}`);
    console.log(`                      on   ${f(summary.recover.on)}   gained ${summary.recover.gained}, lost ${summary.recover.lost}`);
    console.log(`  junk rows (${summary.junk.on.n}):    off misled ${summary.junk.off.misled}, on misled ${summary.junk.on.misled}`);
    console.log(`  latency ms off p50 ${summary.latency_ms.off.p50} p95 ${summary.latency_ms.off.p95}; on p50 ${summary.latency_ms.on.p50} p95 ${summary.latency_ms.on.p95}`);
    for (const [w, t] of Object.entries(summary.by_world)) console.log(`  ${w.padEnd(16)} recover on: ${f(t.recover.on)} (off ${t.recover.off.recovered})   junk misled off/on ${t.junk.off.misled}/${t.junk.on.misled}`);
    if (flag('verbose')) for (const r of results) if (!r.invalid && r.on.outcome !== 'recovered' && r.on.outcome !== 'right') console.log(`${r.on.outcome.padEnd(15)} ${r.world.padEnd(15)} "${r.message}" -> ${r.on.reply}   [intent: ${r.intent}]`);
  }
  if (!flag('no-write')) {
    const dir = join(REPO, 'training/results/loose-words');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${mode}-${out.config.date}.json`), JSON.stringify(out, null, 1) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
