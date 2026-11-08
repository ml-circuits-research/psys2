#!/usr/bin/env node
/**
 * The single measure of success (worker-tasks, "The single measure of success (user): the result is correct"):
 * every message of training/eval/operational.jsonl goes through the full pipeline in the webchat configuration and the final
 * state / answer / effects are checked against the expectation written for it. Deterministic (no sampling, fixed order).
 *
 * Configurations (the webchat defaults, docs/webchat/ui/settings.mjs): formalizer 'encoder' (dispatcher model through onnxruntime-node,
 * rule validation), spellcheck on, partial understanding on, acceptRefused on. `--rules-only` uses the rule formalizer with the same
 * spellcheck/partial settings (what the webchat answers with while the model loads).
 *
 *   node scripts/eval-operational.mjs --rules-only [--name rules]
 *   node scripts/eval-operational.mjs --ort <scratch>/node_modules/onnxruntime-node/dist/index.js [--model docs/webchat/models/dispatcher] [--name full]
 *   options: --model-dir <dir> (dispatcher export: model.int8.onnx, vocab.txt, meta.json) --edit-tau <float> (simplifier threshold) --json (last stdout line = one JSON object {n,right,partly_right,wrong,not_understood,latency_ms}; combine with --no-write)  --limit N  --world <id>  --family <name>  --set <file>  --no-write  --verbose (print non-right cases)  --replies (print every case's outcome and reply, for diffing runs)
 *
 * onnxruntime-node is NOT a dependency of the repository: install it in a scratch directory and pass the path (like verify-dispatcher-js.mjs).
 *
 * Outcomes per message: right | partly | wrong (it acted or answered, and the result is wrong or contradicts: worse than not understood)
 * | not_understood. Headline = right / all messages, per world and per world group (scripts/lib/world-groups.mjs); latency per message.
 * Writes training/results/operational-<name>.json (summary + one row per case).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatcherFormalizer } from '../src/dialog/encoder-dispatch.mjs';
import { createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const OUTCOMES = ['right', 'partly', 'wrong', 'not_understood'];

/** The webchat default configuration (docs/webchat/ui/settings.mjs DEFAULT_SETTINGS). */
export const WEBCHAT = { formalizer: 'encoder', spellcheck: true, partialUnderstanding: true, encoderAcceptRefused: true };

export function loadCases(file) {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function makeEngine({ rulesOnly, ortPath, modelDir, editTau }) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  if (rulesOnly) return { engine, formalizer: 'rules', modelInfo: null };
  if (!ortPath) throw new Error('--ort <path to onnxruntime-node entry> is required (or use --rules-only)');
  const mod = await import(pathToFileURL(resolve(ortPath)).href);
  const ort = mod.InferenceSession ? mod : mod.default;
  const dir = resolve(modelDir);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const enc = createDispatcherFormalizer({
    waitForModel: true,
    getPolicy: () => ({ acceptRefused: WEBCHAT.encoderAcceptRefused, trySpell: WEBCHAT.spellcheck, acceptPartial: WEBCHAT.partialUnderstanding }),
    load: async () => {
      const session = await ort.InferenceSession.create(join(dir, 'model.int8.onnx'), { graphOptimizationLevel: 'all' });
      let editTags = null;
      if (meta.onnx?.outputs?.includes('edit_logits')) editTags = JSON.parse(readFileSync(join(dir, 'edit-vocab.json'), 'utf8')).tags;
      return { ort, session, tokenizer: createWordPieceTokenizer(readFileSync(existsSync(join(dir, 'vocab.txt')) ? join(dir, 'vocab.txt') : join(dir, 'tokenizer', 'vocab.txt'), 'utf8')), worlds: meta.worlds, editTags, editTau: editTau ?? meta.edit_threshold ?? 0.5, useContext: meta.context !== false };
    },
  });
  enc.attach(engine);
  engine.formalizers.encoder = enc;
  await enc.prepare();
  return { engine, formalizer: 'encoder', modelInfo: meta.version ?? { model: meta.model } };
}

function newSession(engine, formalizer, c) {
  const s = engine.createSession({ language: 'en', formalizer, spell: WEBCHAT.spellcheck, partial: WEBCHAT.partialUnderstanding });
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  return s;
}

export async function runCase(engine, formalizer, c) {
  const s = newSession(engine, formalizer, c);
  for (const m of c.setup ?? []) await s.send(m);
  const before = s.state();
  const t0 = performance.now();
  let reply, error = null;
  try { reply = await s.send(c.message); } catch (e) { error = e.message; }
  const ms = performance.now() - t0;
  if (!reply) return { id: c.id, world: c.world, outcome: 'wrong', error, ms };
  const after = s.state();
  const strip = (s) => { const { 'ui.help': _h, ...rest } = s; return JSON.stringify(rest); };   // ui.help only remembers the last unparsed text
  const stateChanged = strip(before) !== strip(after);
  const last = reply.answers.at(-1);
  const replyText = reply.text;
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const items = evaluateCase(c, { before, after, replyText, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged, effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
  return {
    id: c.id, world: c.world, outcome, ms,
    reply: replyText.slice(0, 240), statuses: reply.statuses,
    failing: items.filter((x) => !x.ok && !(x.trivial && items.some((y) => !y.trivial))).map((x) => `${x.kind}:${x.spec}${x.actual !== undefined ? ` (got ${String(x.actual).slice(0, 60)})` : ''}`),
    trivial: items.filter((x) => x.trivial).length,
    strategy: [...new Set(reply.segments.map((x) => x.strategy))].join(','),
    ...(last ? {} : {}),
  };
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function tally(rows) {
  const t = { n: rows.length, right: 0, partly: 0, wrong: 0, not_understood: 0 };
  for (const r of rows) t[r.outcome]++;
  return { ...t, right_pct: pct(t.right, t.n), partly_pct: pct(t.partly, t.n), wrong_pct: pct(t.wrong, t.n), not_understood_pct: pct(t.not_understood, t.n) };
}
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0; };

export function summarize(cases, rows) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const joined = rows.map((r) => ({ ...r, c: byId.get(r.id) }));
  const group = (keyFn, order) => {
    const keys = [...new Set(joined.map(keyFn))];
    keys.sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)));
    return Object.fromEntries(keys.map((k) => [k, tally(joined.filter((r) => keyFn(r) === k))]));
  };
  const families = {};
  for (const r of joined) for (const f of r.c.families ?? []) (families[f] ??= []).push(r);
  const ms = rows.map((r) => r.ms);
  return {
    headline: tally(joined),
    excluding_known_gaps: tally(joined.filter((r) => !r.c.known_gap)),
    known_gap_only: tally(joined.filter((r) => r.c.known_gap)),
    by_group: group((r) => groupOf(r.world), GROUP_ORDER),
    by_world: group((r) => r.world),
    by_family: Object.fromEntries(Object.entries(families).sort().map(([k, v]) => [k, tally(v)])),
    latency_ms: { mean: Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)), p50: quant(ms, 0.5), p95: quant(ms, 0.95), max: Math.round(Math.max(0, ...ms)) },
  };
}

async function main() {
  const file = resolve(arg('set', join(REPO, 'training/eval/operational.jsonl')));
  let cases = loadCases(file);
  if (arg('world')) cases = cases.filter((c) => c.world === arg('world'));
  if (arg('family')) cases = cases.filter((c) => (c.families ?? []).includes(arg('family')));
  if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
  const rulesOnly = flag('rules-only');
  const name = arg('name', rulesOnly ? 'rules-only' : 'full');
  const { engine, formalizer, modelInfo } = await makeEngine({ rulesOnly, ortPath: arg('ort'), modelDir: arg('model-dir', arg('model', join(REPO, 'docs/webchat/models/dispatcher'))), editTau: arg('edit-tau') !== undefined ? Number(arg('edit-tau')) : undefined });
  const rows = [];
  for (const c of cases) {
    const r = await runCase(engine, formalizer, c);
    rows.push(r);
    if (flag('replies') && !flag('json')) console.log(`${c.id}\t${r.outcome}\t${JSON.stringify(r.reply ?? r.error ?? null)}`);
    if (flag('verbose') && !flag('json') && r.outcome !== 'right') console.log(`${r.outcome.padEnd(14)} ${c.world.padEnd(15)} ${c.id}  "${c.message}"  -> ${r.reply ?? r.error}  [${(r.failing ?? []).join('; ')}]`);
  }
  const summary = summarize(cases, rows);
  const out = { config: { name, formalizer, ...WEBCHAT, rulesOnly, set: file.replace(`${REPO}/`, ''), cases: cases.length, model: modelInfo }, ...summary, cases: rows.map(({ ms, ...r }) => ({ ...r, ms: Math.round(ms) })) };
  const h = summary.headline;
  if (!flag('json')) console.log(`config ${name}: ${h.n} messages  right ${h.right_pct}%  partly ${h.partly_pct}%  wrong ${h.wrong_pct}%  not understood ${h.not_understood_pct}%  latency p50 ${summary.latency_ms.p50} ms p95 ${summary.latency_ms.p95} ms`);
  if (!flag('json')) for (const [g, t] of Object.entries(summary.by_group)) console.log(`  ${g.padEnd(24)} n=${String(t.n).padStart(4)}  right ${String(t.right_pct).padStart(5)}%  partly ${String(t.partly_pct).padStart(5)}%  wrong ${String(t.wrong_pct).padStart(5)}%  nu ${String(t.not_understood_pct).padStart(5)}%`);
  if (!flag('no-write')) {
    mkdirSync(join(REPO, 'training/results'), { recursive: true });
    writeFileSync(join(REPO, `training/results/operational-${name}.json`), `${JSON.stringify(out, null, 1)}\n`);
  }
  // checkpoint-selection contract: exactly one JSON object on the last stdout line
  if (flag('json')) console.log(JSON.stringify({ n: h.n, right: h.right, partly_right: h.partly, wrong: h.wrong, not_understood: h.not_understood, latency_ms: summary.latency_ms.mean }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
