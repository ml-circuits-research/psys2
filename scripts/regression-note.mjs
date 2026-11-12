#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SHIP-NOW item 3: the regression note after a publish. Runs the operational, operational-ro and dialogue sets (rules mode; `--encoder` adds encoder+n1 when
 * PSYS2_ORT points at onnxruntime-node) and the A/B coherence gate (the fixed sample of tests/ab-gate.test.mjs), compares each with the previous run stored in
 * training/results/regression/baseline.json, prints a short note and appends it to worker-log.md.
 *
 * What counts: per set, the right share and the wrong share (percentage points against the baseline) and the cases that were right and are not any more
 * (listed by id). FLAG when a set loses more than 2 points of right, or gains more than 2 points of wrong, or the A/B gate has any "ops better" session
 * (a coherence failure). The baseline is replaced by this run when it is not flagged, or with --update-baseline.
 *
 *   node scripts/regression-note.mjs [--encoder] [--no-log] [--update-baseline] [--only operational,operational-ro,dialogues,ab] [--tolerance 2]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const TOL = Number(arg('tolerance', 2));
const ONLY = new Set((arg('only', 'operational,operational-ro,dialogues,ab')).split(','));
const BASELINE = join(REPO, 'training/results/regression/baseline.json');

const run = (script, args, timeout = 1500000) => spawnSync(process.execPath, [join(REPO, 'scripts', script), ...args], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout });
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);

/** One operational-format set: headline numbers and the ids that are not right. Output lines are parsed from the script's --verbose listing. */
function operationalSet(setFile, mode, extra = []) {
  const args = ['--mode', mode, '--no-write', '--verbose', ...extra, ...(setFile ? ['--set', setFile] : [])];
  if (mode !== 'rules') args.push('--ort', process.env.PSYS2_ORT);
  const r = run('eval-operational.mjs', args);
  const out = r.stdout ?? '';
  const m = /mode \S+: (\d+) messages\s+right ([\d.]+)%\s+partly ([\d.]+)%\s+wrong ([\d.]+)%\s+not understood ([\d.]+)%/.exec(out);
  if (!m) return { error: (r.stderr || out).slice(-300) };
  const bad = {};
  for (const l of out.split('\n')) { const x = /^(wrong|partly|not_understood)\s+\S+\s+(\S+)\s+"/.exec(l); if (x) bad[x[2]] = x[1]; }
  return { n: +m[1], right_pct: +m[2], partly_pct: +m[3], wrong_pct: +m[4], not_understood_pct: +m[5], bad };
}

function dialogueSet(mode) {
  const args = ['--mode', mode, '--no-write', '--verbose'];
  if (mode !== 'rules') args.push('--ort', process.env.PSYS2_ORT);
  const r = run('eval-dialogues.mjs', args);
  const out = r.stdout ?? '';
  const m = /mode \S+: (\d+) dialogues, (\d+) turns\s+turns right ([\d.]+)%\s+dialogues right ([\d.]+)%/.exec(out);
  if (!m) return { error: (r.stderr || out).slice(-300) };
  const bad = {};
  for (const l of out.split('\n')) { const x = /^(wrong|partly|not_understood)\s+(\S+) turn (\d+)\s/.exec(l); if (x) bad[`${x[2]}/${x[3]}`] = x[1]; }
  const wrongTurns = Object.values(bad).filter((o) => o === 'wrong').length;
  return { n: +m[2], dialogues: +m[1], right_pct: +m[3], dialogues_right_pct: +m[4], wrong_pct: pct(wrongTurns, +m[2]), bad };
}

function abGate() {
  const test = readFileSync(join(REPO, 'tests/ab-gate.test.mjs'), 'utf8');
  const ids = [...new Set(test.match(/'dlg\.[\w#.-]+'/g) ?? [])].map((s) => s.slice(1, -1));
  const r = run('ab-sopworld.mjs', ['--sets', 'dialogues', '--ids', ids.join(','), '--no-write'], 600000);
  try { const o = JSON.parse(r.stdout); return { sessions: o.sessions, ops_better: o.ops_better }; } catch { return { error: (r.stderr || r.stdout || '').slice(-300) }; }
}

const now = {};
const modes = ['rules', ...(flag('encoder') && process.env.PSYS2_ORT ? ['encoder+n1'] : [])];
for (const mode of modes) {
  const sfx = mode === 'rules' ? '' : `@${mode}`;
  if (ONLY.has('operational')) now[`operational${sfx}`] = operationalSet(null, mode);
  if (ONLY.has('operational-ro')) now[`operational-ro${sfx}`] = operationalSet('training/eval/operational-ro.jsonl', mode);
  if (ONLY.has('dialogues')) now[`dialogues${sfx}`] = dialogueSet(mode);
}
if (ONLY.has('ab')) now.ab = abGate();

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const lines = [];
const flags = [];
for (const [name, cur] of Object.entries(now)) {
  if (cur.error) { lines.push(`- ${name}: FAILED to run (${cur.error.replace(/\s+/g, ' ')})`); flags.push(`${name} did not run`); continue; }
  if (name === 'ab') {
    lines.push(`- A/B gate: ${cur.sessions} dialogues, "ops better": ${cur.ops_better.length ? cur.ops_better.join(', ') : 'none'}`);
    if (cur.ops_better.length) flags.push(`A/B gate: coherence failure in ${cur.ops_better.join(', ')}`);
    continue;
  }
  const prev = base?.sets?.[name];
  const head = `${name}: n=${cur.n}, right ${cur.right_pct}%, wrong ${cur.wrong_pct}%`;
  if (!prev) { lines.push(`- ${head} (no previous note: baseline)`); continue; }
  const dRight = Math.round((cur.right_pct - prev.right_pct) * 10) / 10, dWrong = Math.round((cur.wrong_pct - prev.wrong_pct) * 10) / 10;
  const worse = Object.keys(cur.bad).filter((id) => !(id in prev.bad) || (prev.bad[id] !== 'wrong' && cur.bad[id] === 'wrong'));
  const better = Object.keys(prev.bad).filter((id) => !(id in cur.bad));
  const flagged = dRight < -TOL || dWrong > TOL;
  if (flagged) flags.push(`${name}: right ${dRight >= 0 ? '+' : ''}${dRight} points, wrong ${dWrong >= 0 ? '+' : ''}${dWrong} points`);
  lines.push(`- ${head}; against the previous note: right ${dRight >= 0 ? '+' : ''}${dRight}, wrong ${dWrong >= 0 ? '+' : ''}${dWrong} points${flagged ? '  **FLAG (> ' + TOL + ' points)**' : ''}; got worse ${worse.length}${worse.length ? ` (${worse.slice(0, 12).join(', ')}${worse.length > 12 ? ', ...' : ''})` : ''}, got better ${better.length}`);
}

const commit = spawnSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
const note = [`## ${date.slice(0, 10)} - regression note (${commit}, ${modes.join(' + ')})`, '',
  ...lines, '', flags.length ? `- **FLAGGED, fix first:** ${flags.join('; ')}` : '- Nothing above the tolerance and no coherence failure: keep going.', ''].join('\n');
console.log(note);

if (!flag('no-log')) appendFileSync(join(REPO, 'worker-log.md'), `\n${note}`);
if (flag('update-baseline') || !flags.length || !base) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  const merged = { date: date.slice(0, 10), commit, sets: { ...(base?.sets ?? {}) } };
  for (const [k, v] of Object.entries(now)) if (k !== 'ab' && !v.error) merged.sets[k] = v;
  writeFileSync(BASELINE, `${JSON.stringify(merged, null, 1)}\n`);
}
process.exit(flags.length ? 1 : 0);
