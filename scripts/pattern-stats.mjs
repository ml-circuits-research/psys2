#!/usr/bin/env node
/**
 * Read-only statistics of the pattern match strings of all worlds (task L0 of worker-tasks.md).
 *
 *   node scripts/pattern-stats.mjs [--json] [--union lead|tail|filler]
 *
 * Default report: patterns, bytes of match text, alternative groups, distinct groups, groups copied verbatim in more than one
 * pattern (top 10), and unreachable alternatives (words the tokenizer drops or rewrites: fillers, contractions).
 * `--union <kind>` prints the union of the per-world alternative lists of that kind with the number of worlds using each
 * alternative (input for `worlds/lang.common`, task L3):
 *   lead   = optional alternative groups before the first mandatory element
 *   tail   = optional alternative groups after the last mandatory element
 *   filler = all other optional alternative groups (between mandatory elements)
 * Unreachable alternatives are marked with a trailing `!` in the union output.
 */
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { compilePattern } from '../src/formalizer/rules/matcher.mjs';
import { isFillerWord } from '../src/formalizer/rules/normalize.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';

const args = process.argv.slice(2);
const kind = args.includes('--union') ? args[args.indexOf('--union') + 1] : null;
if (args.includes('--union') && !['lead', 'tail', 'filler'].includes(kind)) { console.error('--union takes lead|tail|filler'); process.exit(2); }

/** A word the tokenizer drops (filler) or splits (contraction): an alternative with it cannot match a token. */
const unreachableWord = (w) => isFillerWord(w) || /'/.test(w);
const altText = (alt) => alt.join('_');
const unreachable = (alt) => alt.some(unreachableWord);
const groupKey = (el) => el.alts.map(altText).sort().join('|');

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const worlds = engine.set.list();

let patterns = 0, bytes = 0, groups = 0, alts = 0, unreach = 0, badPatterns = 0;
const groupCount = new Map();       // group key -> occurrences
const worldsOfGroup = new Map();    // group key -> Set(world)
const union = { lead: new Map(), tail: new Map(), filler: new Map() };   // alt text -> Set(world)
const unreachWords = new Map();

for (const w of worlds) {
  for (const p of w.patterns ?? []) {
    patterns++; bytes += p.match.length;
    let c;
    try { c = compilePattern(p.match, lexIndex(engine.set).phrases); } catch { badPatterns++; continue; }
    const els = c.elements;
    const mandatory = (e) => (e.t === 'lit') || ((e.t === 'slot' || e.t === 'alt') && !e.optional);
    const first = els.findIndex(mandatory);
    const last = els.length - 1 - [...els].reverse().findIndex(mandatory);
    els.forEach((e, i) => {
      if (e.t !== 'alt') return;
      groups++; alts += e.alts.length;
      const key = groupKey(e);
      groupCount.set(key, (groupCount.get(key) ?? 0) + 1);
      if (!worldsOfGroup.has(key)) worldsOfGroup.set(key, new Set());
      worldsOfGroup.get(key).add(w.id);
      for (const a of e.alts) if (unreachable(a)) { unreach++; for (const x of a.filter(unreachableWord)) unreachWords.set(x, (unreachWords.get(x) ?? 0) + 1); }
      if (!e.optional) return;
      const k = first < 0 || i < first ? 'lead' : i > last ? 'tail' : 'filler';
      for (const a of e.alts) {
        const t = altText(a);
        if (!union[k].has(t)) union[k].set(t, new Set());
        union[k].get(t).add(w.id);
      }
    });
  }
}

if (kind) {
  const rows = [...union[kind]].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  console.log(`# union of ${kind} alternatives over ${worlds.length} worlds: ${rows.length} alternatives ('!' = unreachable)`);
  for (const [t, ws] of rows) console.log(`${t}${unreachable(t.split('_')) ? ' !' : ''}\t${ws.size}`);
  process.exit(0);
}

const repeated = [...groupCount].filter(([, n]) => n > 1);
const copies = repeated.reduce((s, [, n]) => s + n, 0);
const top = [...repeated].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 10);
const unionSizes = Object.fromEntries(Object.entries(union).map(([k, m]) => [k, m.size]));
const stats = {
  worlds: worlds.length, patterns, match_bytes: bytes, uncompilable: badPatterns,
  alt_groups: groups, alternatives: alts, distinct_groups: groupCount.size,
  repeated_groups: repeated.length, repeated_group_occurrences: copies,
  unreachable_alternatives: unreach, unreachable_pct: +(100 * unreach / (alts || 1)).toFixed(1),
  union_sizes: unionSizes,
  top_repeated: top.map(([k, n]) => ({ occurrences: n, worlds: worldsOfGroup.get(k).size, alternatives: k.split('|').length, sample: k.slice(0, 60) })),
  unreachable_words: Object.fromEntries([...unreachWords].sort((a, b) => b[1] - a[1]).slice(0, 15)),
};
if (args.includes('--json')) { console.log(JSON.stringify(stats, null, 2)); process.exit(0); }
console.log(`worlds ${stats.worlds}  patterns ${patterns}  match text ${bytes} bytes  uncompilable ${badPatterns}`);
console.log(`alternative groups ${groups}  alternatives ${alts}  distinct groups ${groupCount.size}`);
console.log(`groups occurring more than once ${repeated.length} (${copies} occurrences)`);
console.log(`unreachable alternatives ${unreach} (${stats.unreachable_pct}% of alternatives)`);
console.log(`union sizes: lead ${unionSizes.lead}, tail ${unionSizes.tail}, filler ${unionSizes.filler}`);
console.log('top repeated groups (occurrences, worlds, alternatives, sample):');
for (const t of stats.top_repeated) console.log(`  ${t.occurrences}\t${t.worlds}\t${t.alternatives}\t${t.sample}`);
console.log('most frequent unreachable words:', JSON.stringify(stats.unreachable_words));
