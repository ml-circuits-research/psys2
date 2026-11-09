#!/usr/bin/env node
/**
 * Typo recovery per world (RD1). Reads training/eval/typos/<world>.jsonl, written by Haiku subagents: { world, tab, original, typo, kind }
 * with kind nonword (a misspelling that is not a word) or realword (a slip that spells another word: eyes -> yes, bigger -> bugger).
 *
 * For every record, two fresh sessions with the record's tab open read the original and the typo. The typo is
 *   recovered  when it is understood exactly as the original: same worlds and patterns, same state afterwards;
 *   misled     when it is understood, but differently (another world, another pattern or another state);
 *   missed     when nothing understood it (every segment unparsed).
 * Records whose original is itself not understood are skipped (the test set is about the typo, not about the original).
 *
 *   node scripts/eval-typos.mjs [--world W] [--root DIR] [--verbose] [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const dir = join(REPO, 'training/eval/typos');
if (!existsSync(dir)) { console.error(`no ${dir}`); process.exit(1); }

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const settings = settingsForMode('rules');
const strip = (st) => { const { 'ui.help': _h, ...rest } = st; return JSON.stringify(rest); };

async function read(text, tab) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  const reply = await s.send(text);
  const understood = reply.segments.some((x) => !x.unparsed);
  const sig = reply.segments.map((x) => `${x.match?.worldId ?? '-'}:${x.match?.patternId ?? '-'}`).join('+');
  return { understood, sig, state: strip(s.state()), text: reply.text };
}

const rows = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) {
  if (arg('world') && f !== `${arg('world')}.jsonl`) continue;
  for (const line of readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean)) rows.push(JSON.parse(line));
}
const stats = new Map();
for (const r of rows) {
  const o = await read(r.original, r.tab);
  if (!o.understood) continue;
  const t = await read(r.typo, r.tab);
  const outcome = !t.understood ? 'missed' : t.sig === o.sig && t.state === o.state ? 'recovered' : 'misled';
  const key = r.world;
  const st = stats.get(key) ?? stats.set(key, { n: 0, nonword: { recovered: 0, misled: 0, missed: 0 }, realword: { recovered: 0, misled: 0, missed: 0 } }).get(key);
  st.n++; st[r.kind === 'realword' ? 'realword' : 'nonword'][outcome]++;
  if (flag('verbose') && outcome !== 'recovered') console.log(`${outcome.padEnd(9)} ${r.world} [${r.tab}] ${r.kind}: "${r.typo}" (was "${r.original}") -> ${t.understood ? t.sig : 'unparsed'}: ${t.text.slice(0, 80)}`);
}
const tot = { nonword: { recovered: 0, misled: 0, missed: 0 }, realword: { recovered: 0, misled: 0, missed: 0 } };
const pct = (a, b) => (b ? `${Math.round((1000 * a) / b) / 10}%` : '-');
const out = [];
for (const [w, st] of [...stats].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (const k of ['nonword', 'realword']) for (const o of ['recovered', 'misled', 'missed']) tot[k][o] += st[k][o];
  const n = st.nonword.recovered + st.nonword.misled + st.nonword.missed, m = st.realword.recovered + st.realword.misled + st.realword.missed;
  out.push({ world: w, nonword: st.nonword, realword: st.realword });
  if (!flag('json')) console.log(`${w.padEnd(16)} nonword ${String(st.nonword.recovered).padStart(3)}/${String(n).padEnd(3)} recovered ${String(st.nonword.misled).padStart(2)} misled ${String(st.nonword.missed).padStart(2)} missed   realword ${String(st.realword.recovered).padStart(2)}/${String(m).padEnd(2)} recovered ${String(st.realword.misled).padStart(2)} misled ${String(st.realword.missed).padStart(2)} missed`);
}
const N = tot.nonword.recovered + tot.nonword.misled + tot.nonword.missed, M = tot.realword.recovered + tot.realword.misled + tot.realword.missed;
if (flag('json')) console.log(JSON.stringify({ worlds: out, total: tot }));
else console.log(`TOTAL nonword: recovered ${tot.nonword.recovered}/${N} (${pct(tot.nonword.recovered, N)}), misled ${tot.nonword.misled} (${pct(tot.nonword.misled, N)}), missed ${tot.nonword.missed}; realword: recovered ${tot.realword.recovered}/${M} (${pct(tot.realword.recovered, M)}), misled ${tot.realword.misled} (${pct(tot.realword.misled, M)}), missed ${tot.realword.missed}`);
