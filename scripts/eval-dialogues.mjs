#!/usr/bin/env node
/**
 * Second headline next to the operational set (training/RESULTS.md "Dialogue set"): multi-turn dialogues of training/eval/dialogues.jsonl,
 * each run turn by turn in ONE session; after every turn the expectation of that turn (operational check format, scripts/lib/operational-check.mjs)
 * is evaluated against the full state before / after the turn. Reports the share of turns right and the share of whole dialogues right (every turn
 * right), per family and per world group. The runtime comes from the shared factory (src/dialog/runtime-config.mjs, as eval-operational.mjs); the
 * dialogues are sharded over worker threads (scripts/lib/shard.mjs), one dialogue per item.
 *
 *   node scripts/eval-dialogues.mjs --mode rules
 *   node scripts/eval-dialogues.mjs --mode encoder+n1 --ort <scratch>/node_modules/onnxruntime-node/dist/index.js
 *   node scripts/eval-dialogues.mjs --validate [--set file]     schema + state-field validation only (no pipeline)
 *   options: --jobs N  --family F  --group G  --tag T  --world W  --limit N  --set <file>  --model-dir --normalizer-dir --edit-tau --no-write --verbose --json
 *
 * Dialogue record: { id, world, group?, tab, init: { <world>: patch }, families: [], tags: [], turns: [ { message, expect, tab? } ] }, 3-8 turns
 * (a turn may carry `tab` to switch the active tab first; tag `rd` allows a longer real session; a turn may carry `mode: 'voice'` for a spoken message: stutter, send words and garble repair).
 * Writes training/results/dialogues/<mode>-<dispatcher sha8>-<date>.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { DEFAULT_MODE, MODES, sessionOptions, settingsForMode, runtimeSettings } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime, modelHashes } from './lib/runtime-node.mjs';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';
import { evaluateCase, classify, parseStateItem, statePath } from './lib/operational-check.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

export const FAMILIES = ['reference', 'ellipsis', 'clarification', 'correction', 'degree', 'multistep', 'confirmation', 'explain', 'feedback', 'topic', 'userfacts', 'noise', 'discussion', 'real'];
const EXPECT_KEYS = new Set(['state', 'forbid_state', 'answer', 'answer_any', 'forbid_answer', 'effects', 'status', 'none']);

export function loadDialogues(file) {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// ---- validation (mechanical, no pipeline): schema + every state expectation refers to a real field of a real world state --------------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** Walks a state path on `state`; the path is valid when it resolves, or leaves the known structure only inside an array / empty map (dynamic content). */
export function pathKnown(state, path) {
  let v = state;
  for (const part of path.split('.')) {
    if (v === undefined) return false;
    if (v === null) return true;   // a nullable record not set yet (media.music current)
    const m = part.match(/^([^[\]]+)\[(?:[\w.]+=[^\]]*|last|first)\]$/);
    const key = m ? m[1] : part;
    if (Array.isArray(v)) { if (key === 'length' || /^\d+$/.test(key)) { v = key === 'length' ? 0 : v[Number(key)]; if (v === undefined) return true; continue; } return false; }
    if (!isObj(v)) return false;
    if (!(key in v)) return Object.keys(v).length === 0;   // a key of an empty map is dynamic content (user.profile fields.name), anything else is a typo
    v = v[key];
    if (m) { if (!Array.isArray(v)) return false; v = v[0] ?? undefined; if (v === undefined) return true; }
  }
  return true;
}

export function validateDialogue(d, stateOf) {
  const err = [];
  if (!/^[\w.#-]+$/.test(d.id ?? '')) err.push('id');
  if (typeof d.world !== 'string') err.push('world');
  if (!Array.isArray(d.turns) || d.turns.length < 3 || (d.turns.length > 8 && !(d.tags ?? []).includes('rd'))) err.push(`turns ${d.turns?.length} (3-8 required)`);
  if (!Array.isArray(d.families) || !d.families.length) err.push('families empty');
  for (const f of d.families ?? []) if (!FAMILIES.includes(f)) err.push(`unknown family ${f}`);
  if (d.tab != null && typeof d.tab !== 'string') err.push('tab');
  const states = stateOf(d);
  if (!states) return [...err, 'cannot build initial state'];
  // worlds without state (kids.arith, kids.shop ...) have no entry in the state map: their expectations are answer checks, state items on them are rejected below
  for (const [i, t] of (d.turns ?? []).entries()) {
    const at = `turn ${i + 1}`;
    if (typeof t.message !== 'string' || !t.message.trim()) { err.push(`${at}: message`); continue; }
    if (!isObj(t.expect)) { err.push(`${at}: expect`); continue; }
    for (const k of Object.keys(t.expect)) if (!EXPECT_KEYS.has(k)) err.push(`${at}: unknown expect key ${k}`);
    const e = t.expect;
    if (!(e.none || e.state?.length || e.answer?.length || e.answer_any?.length || e.effects?.length || e.status || e.forbid_state?.length || e.forbid_answer?.length)) err.push(`${at}: empty expectation`);
    for (const k of ['state', 'forbid_state', 'answer', 'effects']) if (e[k] !== undefined && !(Array.isArray(e[k]) && e[k].every((x) => typeof x === 'string' && x.length))) err.push(`${at}: ${k} must be a list of strings`);
    if (e.answer_any !== undefined && !(Array.isArray(e.answer_any) && e.answer_any.every((x) => typeof x === 'string'))) err.push(`${at}: answer_any`);
    for (const spec of [...(e.state ?? []), ...(e.forbid_state ?? [])]) {
      const it = parseStateItem(spec, d.world);
      if (!it) { err.push(`${at}: unparsable state item ${spec}`); continue; }
      if (!states[it.world]) {
        // a world that creates its state lazily (kids.tasks lists) has no fields before its first use: the world must exist, the path cannot be checked
        if (!existsSync(join(DEFAULT_ROOT, it.world))) err.push(`${at}: unknown world in ${spec}`);
        continue;
      }
      if (!pathKnown(states[it.world], it.path)) err.push(`${at}: no such state field ${it.world}:${it.path}`);
      if (it.value.startsWith('@') && !pathKnown(states[it.world], it.value.slice(1))) err.push(`${at}: no such state field ${it.value}`);
    }
  }
  return err;
}

// ---- pipeline ------------------------------------------------------------------------------------------------------------------
async function buildPipeline({ mode, ortPath, modelDir, normalizerDir, editTau, ortThreads, overrides }) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const rt = await openNodeRuntime({ engine, mode, ortPath, dispatcherDir: modelDir, normalizerDir, editTau, ortThreads, overrides });
  return { engine, ...rt };
}

function newSession(engine, settings, d) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (d.tab) s.setWorldState('ui.shell', { activeTab: d.tab });
  for (const [w, patch] of Object.entries(d.init ?? {})) s.setWorldState(w, patch);
  return s;
}

const strip = (st) => { const { 'ui.help': _h, ...rest } = st; return JSON.stringify(rest); };

export async function runDialogue(engine, settings, d) {
  const s = newSession(engine, settings, d);
  const turns = [];
  for (const [i, t] of d.turns.entries()) {
    if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab });   // a turn may switch the active tab first (a real session moves between tabs)
    const c = { world: d.world, expect: t.expect };
    const before = s.state();
    const t0 = performance.now();
    let reply, error = null;
    try { reply = await s.send(t.message, t.mode ? { mode: t.mode } : undefined); } catch (e) { error = e.message; }
    const ms = performance.now() - t0;
    if (!reply) { turns.push({ i, outcome: 'wrong', error, ms }); continue; }
    const after = s.state();
    const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
    const items = evaluateCase(c, { before, after, replyText: reply.text, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
    const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged: strip(before) !== strip(after), effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
    turns.push({
      i, outcome, ms, reply: reply.text.slice(0, 200),
      failing: items.filter((x) => !x.ok && !(x.trivial && items.some((y) => !y.trivial))).map((x) => `${x.kind}:${x.spec}${x.actual !== undefined ? ` (got ${String(x.actual).slice(0, 60)})` : ''}`),
    });
  }
  return { id: d.id, world: d.world, group: d.group ?? groupOf(d.world), families: d.families, tags: d.tags ?? [], turns, right: turns.every((t) => t.outcome === 'right') };
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function tally(rows) {
  const turns = rows.flatMap((r) => r.turns);
  const turnsRight = turns.filter((t) => t.outcome === 'right').length;
  const dialoguesRight = rows.filter((r) => r.right).length;
  return { dialogues: rows.length, dialogues_right: dialoguesRight, dialogues_right_pct: pct(dialoguesRight, rows.length), turns: turns.length, turns_right: turnsRight, turns_right_pct: pct(turnsRight, turns.length), turns_wrong: turns.filter((t) => t.outcome === 'wrong').length, turns_not_understood: turns.filter((t) => t.outcome === 'not_understood').length };
}

export function summarize(rows) {
  const by = (keys, order) => {
    const m = new Map();
    for (const r of rows) for (const k of keys(r)) (m.get(k) ?? m.set(k, []).get(k)).push(r);
    const ks = [...m.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)));
    return Object.fromEntries(ks.map((k) => [k, tally(m.get(k))]));
  };
  return {
    headline: tally(rows),
    by_group: by((r) => [r.group], GROUP_ORDER),
    by_world: by((r) => [r.world]),
    by_family: by((r) => r.families),
    by_tag: by((r) => r.tags),
  };
}

const sha8 = (h) => (h ? h.slice(0, 8) : 'nomodel');

async function main() {
  const file = resolve(arg('set', join(REPO, 'training/eval/dialogues.jsonl')));
  let ds = loadDialogues(file);
  if (flag('validate')) {
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
    const settings = settingsForMode('rules');
    const stateOf = (d) => { try { return newSession(engine, settings, d).state(); } catch { return null; } };
    let bad = 0;
    const ids = new Set();
    for (const d of ds) {
      const e = validateDialogue(d, stateOf);
      if (ids.has(d.id)) e.push('duplicate id');
      ids.add(d.id);
      if (e.length) { bad++; console.log(`INVALID ${d.id}: ${e.join('; ')}`); }
    }
    console.log(`${ds.length} dialogues, ${bad} invalid`);
    process.exit(bad ? 1 : 0);
  }
  const fullSet = !arg('world') && !arg('family') && !arg('group') && !arg('tag') && !arg('limit');
  if (arg('world')) ds = ds.filter((d) => d.world === arg('world'));
  if (arg('family')) ds = ds.filter((d) => d.families.includes(arg('family')));
  if (arg('group')) ds = ds.filter((d) => (d.group ?? groupOf(d.world)) === arg('group'));
  if (arg('tag')) ds = ds.filter((d) => (d.tags ?? []).includes(arg('tag')));
  if (arg('limit')) ds = ds.slice(0, Number(arg('limit')));
  const mode = arg('mode', DEFAULT_MODE);
  if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(' | ')}`);
  const modelDir = arg('model-dir', join(REPO, 'docs/webchat/models/dispatcher'));
  const normalizerDir = arg('normalizer-dir', join(REPO, 'docs/webchat/models/normalizer'));
  const popts = { mode, ortPath: arg('ort'), modelDir, normalizerDir, editTau: arg('edit-tau') !== undefined ? Number(arg('edit-tau')) : undefined, overrides: arg('best-effort') ? { bestEffort: arg('best-effort') !== 'off' } : {} };   // --best-effort on|off: A/B of spec 03 7.15
  const jobs = Math.max(1, Math.min(parseJobs(), ds.length || 1));
  let rows, info;
  if (jobs === 1) {
    const pipe = await buildPipeline(popts);
    info = pipe.info;
    rows = [];
    for (const d of ds) rows.push(await runDialogue(pipe.engine, pipe.settings, d));
  } else {
    rows = await runSharded({ file: SELF, items: ds, jobs, workerData: { ...popts, ortThreads: mode === 'rules' ? 0 : 1 }, chunk: 2 });
    info = { mode, settings: runtimeSettings({ ...settingsForMode(mode), ...popts.overrides }), hashes: mode === 'rules' ? null : modelHashes({ dispatcherDir: resolve(modelDir), normalizerDir: resolve(normalizerDir), withNormalizer: settingsForMode(mode).normalizer !== false }) };
  }
  if (flag('verbose') && !flag('json')) {
    for (const r of rows) for (const t of r.turns) if (t.outcome !== 'right') console.log(`${t.outcome.padEnd(14)} ${r.id} turn ${t.i + 1} "${ds.find((d) => d.id === r.id).turns[t.i].message}" -> ${t.reply ?? t.error}  [${(t.failing ?? []).join('; ')}]`);
  }
  const summary = summarize(rows);
  const h = summary.headline;
  const line = (k, t) => `  ${k.padEnd(24)} dialogues ${String(t.dialogues_right).padStart(3)}/${String(t.dialogues).padEnd(3)} ${String(t.dialogues_right_pct).padStart(5)}%   turns ${String(t.turns_right).padStart(4)}/${String(t.turns).padEnd(4)} ${String(t.turns_right_pct).padStart(5)}%`;
  if (!flag('json')) {
    console.log(`mode ${mode}: ${h.dialogues} dialogues, ${h.turns} turns   turns right ${h.turns_right_pct}%   dialogues right ${h.dialogues_right_pct}%`);
    console.log('by world group'); for (const [k, t] of Object.entries(summary.by_group)) console.log(line(k, t));
    console.log('by family'); for (const [k, t] of Object.entries(summary.by_family)) console.log(line(k, t));
  }
  if (!flag('no-write')) {
    const dir = join(REPO, 'training/results/dialogues');
    mkdirSync(dir, { recursive: true });
    const config = { mode, jobs, policy: info.settings, hashes: info.hashes, set: file.replace(`${REPO}/`, ''), dialogues: ds.length, full_set: fullSet, date: new Date().toISOString().slice(0, 10) };
    const rel = `training/results/dialogues/${mode}-${sha8(info.hashes?.dispatcher?.sha256)}-${config.date}${fullSet ? '' : `-limit${ds.length}`}.json`;
    writeFileSync(join(REPO, rel), `${JSON.stringify({ config, ...summary, dialogues: rows }, null, 1)}\n`);
    if (!flag('json')) console.log(`wrote ${rel}`);
  }
  if (flag('json')) console.log(JSON.stringify({ dialogues: h.dialogues, dialogues_right: h.dialogues_right, turns: h.turns, turns_right: h.turns_right }));
}

if (!isMainThread) {
  serveShard(async (wd) => {
    const env = await buildPipeline(wd);
    return (d) => runDialogue(env.engine, env.settings, d);
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
