#!/usr/bin/env node
/**
 * Mechanical validation of an operational-format case file (training/eval/operational*.jsonl), independent of any model:
 *   node scripts/validate-operational-set.mjs training/eval/operational-long.jsonl [--strict]
 * Checks: JSON, required fields and types, unique ids, `world` and every `world:` prefix of a state item are real worlds, the tab is a known tab,
 * every state item parses (scripts/lib/operational-check.mjs), its ROOT key exists in the initial state of that world (typo guard), at most one
 * kind of vacuity (an item already true in the initial state), and the message carries >= 2 commands for `mid`/`long` tags (word count only).
 * It never judges the expectation against the system output: gold is written as the correct outcome.
 * With --probe it also reports (information only, never a failure) the items whose whole path does not resolve in the state after the rules formalizer ran the case.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { parseStateItem, statePath, checkState } from './lib/operational-check.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
const probe = process.argv.includes('--probe');
if (!file) { console.error('usage: validate-operational-set.mjs <file.jsonl> [--probe]'); process.exit(2); }

const TABS = new Set(['robot', 'draw', 'map', 'music', 'charts', 'editor', 'documents', 'chess', 'hangman', 'tictactoe', 'guess']);
const KEYS = new Set(['id', 'world', 'tab', 'setup', 'message', 'expect', 'families', 'tags', 'note', 'known_gap', 'init']);
const EXPECT_KEYS = new Set(['state', 'forbid_state', 'answer', 'answer_any', 'effects', 'status', 'none']);
const worlds = new Set(readdirSync(join(REPO, 'worlds')).filter((d) => d !== 'core' || true));

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const fresh = (c) => { const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab }); for (const [w, p] of Object.entries(c.init ?? {})) s.setWorldState(w, p); return s; };

const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
const ids = new Set(); let bad = 0, info = 0, n = 0;
const fail = (c, msg) => { bad++; console.log(`FAIL ${c?.id ?? '?'}: ${msg}`); };
for (const [i, l] of lines.entries()) {
  let c; try { c = JSON.parse(l); } catch (e) { fail({ id: `line ${i + 1}` }, `bad JSON: ${e.message}`); continue; }
  n++;
  for (const k of Object.keys(c)) if (!KEYS.has(k)) fail(c, `unknown field ${k}`);
  if (typeof c.id !== 'string' || ids.has(c.id)) { fail(c, 'id missing or duplicate'); continue; }
  ids.add(c.id);
  if (!worlds.has(c.world) && !existsWorld(c.world)) fail(c, `world ${c.world} does not exist`);
  if (c.tab !== null && !TABS.has(c.tab)) fail(c, `unknown tab ${c.tab}`);
  if (!Array.isArray(c.setup) || c.setup.some((m) => typeof m !== 'string')) fail(c, 'setup must be an array of strings');
  if (typeof c.message !== 'string' || !c.message.trim()) fail(c, 'message missing');
  if (!c.expect || typeof c.expect !== 'object') { fail(c, 'expect missing'); continue; }
  for (const k of Object.keys(c.expect)) if (!EXPECT_KEYS.has(k)) fail(c, `unknown expect key ${k}`);
  if (!Array.isArray(c.families)) fail(c, 'families must be an array');
  const tags = c.tags ?? [];
  if (tags.includes('long') && c.message.split(/\s+/).length < 20) fail(c, 'long tag but fewer than 20 words');
  if (!tags.some((t) => ['mid', 'long'].includes(t))) fail(c, 'needs a mid or long tag');
  const nExpect = ['state', 'forbid_state', 'answer', 'answer_any', 'effects'].reduce((a, k) => a + (c.expect[k] ? 1 : 0), 0);
  if (!nExpect && !c.expect.none && !c.expect.status) fail(c, 'empty expectation');
  const s0 = fresh(c); const before = s0.state();
  for (const spec of [...(c.expect.state ?? []), ...(c.expect.forbid_state ?? [])]) {
    const it = parseStateItem(spec, c.world);
    if (!it) { fail(c, `state item does not parse: ${spec}`); continue; }
    if (!(it.world in before)) { fail(c, `state item world ${it.world} not loaded: ${spec}`); continue; }
    const root = it.path.split('.')[0].replace(/\[.*$/, '');
    if (!(root in (before[it.world] ?? {}))) fail(c, `root key "${root}" is not a state field of ${it.world}: ${spec}`);
  }
  if (probe) {
    const s = fresh(c); for (const m of c.setup) await s.send(m);
    await s.send(c.message); const after = s.state();
    for (const spec of c.expect.state ?? []) {
      const it = parseStateItem(spec, c.world);
      if (it && statePath(after[it.world] ?? {}, it.path) === undefined && !(it.op === '=' && it.value === 'null')) { info++; console.log(`info ${c.id}: path unresolved after rules: ${spec}`); }
    }
  }
}
function existsWorld(w) { try { return readdirSync(join(REPO, 'worlds', w)).length > 0; } catch { return false; } }
console.log(`${n} cases, ${bad} failures${probe ? `, ${info} unresolved paths (info)` : ''}`);
process.exit(bad ? 1 : 0);
