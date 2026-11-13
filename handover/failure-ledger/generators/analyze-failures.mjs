#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Groups the failure ledger (training/eval/failures.jsonl) by cause: the row's class plus a cause key derived by general signals in what
 * happened (no reply, translation residue, foreign-world reading, fragment/list split, continuation/correction, unknown kind, default place,
 * region, amount, ...). Counts per group, five examples per group (spread over sources). Worker-tasks "NO POINT FIXES" item 3: a change is
 * accepted only if it names a group here and reports the group's count before and after.
 *
 *   node scripts/analyze-failures.mjs [--ledger file] [--out training/results/failures-groups-2026-11-13.md] [--stdout]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ledger = arg('ledger', join(REPO, 'training/eval/failures.jsonl'));
const out = arg('out', join(REPO, 'training/results/failures-groups-2026-11-13.md'));
const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const NOT_UNDERSTOOD = /did not understand|didn't understand|not sure how .* fits|could not find|can't find|I do not know what|I don't know/i;
/** One cause key per row: the first matching general signal (order = most specific first). */
export function causeOf(r) {
  const h = r.happened ?? '', cls = r.class ?? '', src = r.source ?? '', lang = r.language ?? 'en';
  if (/^\(no reply\)/.test(h) || h === '') return 'no reply';
  if (/^\(error\)/.test(h)) return 'crash / exception';
  if (cls === 'world-routing') return 'wrong world routing (confusion pair)';
  if (src.startsWith('round-trip')) return cls.endsWith('original-fails') ? 'roundtrip: English original not read' : cls.endsWith('reader-gap') ? 'roundtrip: translation kept meaning, reader gap' : cls.endsWith('judge-strict') ? 'roundtrip: answer wording only' : 'roundtrip: translation changed meaning';
  if (/mt-residue|mt-wrong-sense|typo-source/.test(cls)) return 'translation residue / wrong sense / source typo';
  if (lang !== 'en' && /I do not know what "[^"]+"|did not know the words|I did not understand "[^"]*[^\x00-\x7f]/.test(h) && !/^OK|^Done/.test(h)) return 'translation residue / wrong sense / source typo';
  if (/foreign-world|active-tab/.test(cls) || /new game|you play black|hangman|chess|spânzur/i.test(h)) return 'foreign-world reading';
  if (/list|fragment/.test(cls) || /not sure how .* fits what we were doing/.test(h)) return 'fragment / list split';
  if (/avatar-accessory/.test(cls)) return 'avatar part not an operation of the avatar world';
  if (/about-discussion/.test(cls)) return 'session as content (about the discussion)';
  if (/continuation|correction|repair|refine|complaint|why|keep|scene-question/.test(cls) || /^dialogue:(correction|ellipsis|reference|clarification|confirmation|feedback)/.test(cls)) return 'continuation / correction / why-question';
  if (/kind-of|referent-kind|catalog/.test(cls) || /don't know how to draw/.test(h)) return 'unknown kind (no drawing / stand-in)';
  if (/default-place/.test(cls) || /usually live in|not on the ground/i.test(h)) return 'default place';
  if (/region/.test(cls)) return 'region as a thing / ground replaced';
  if (/amount|space|distribute|place|relation|set-attribute|degree/.test(cls) || /^dialogue:degree/.test(cls)) return 'amount / relation / set distribution';
  if (/^coherence:/.test(cls)) return `coherence (${cls.split(':')[1]})`;
  if (/^minimal-pair:/.test(cls)) return `minimal pair (${cls.split(':')[1]})`;
  if (/^dialogue:/.test(cls)) return 'dialogue: other turn kinds';
  if (/wrong-action|variation|unlabelled/.test(cls)) return 'acted on a partly understood sentence';
  if (/^E-T|talk/i.test(src + (r.tab ?? ''))) return 'Talk: no fact in the catalog / frame not read';
  if (NOT_UNDERSOD(h)) return 'not understood (no cause key)';
  return 'other / wrong result';
}
function NOT_UNDERSOD(h) { return NOT_UNDERSTOOD.test(h); }

const groups = new Map();
for (const r of rows) {
  const c = causeOf(r);
  (groups.get(c) ?? groups.set(c, []).get(c)).push(r);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
const spread = (list, n = 5) => { // examples from different sources first
  const bySrc = new Map();
  for (const r of list) (bySrc.get(r.source.split('#')[0]) ?? bySrc.set(r.source.split('#')[0], []).get(r.source.split('#')[0])).push(r);
  const res = []; const lists = [...bySrc.values()];
  for (let k = 0; res.length < n && lists.some((l) => l[k]); k++) for (const l of lists) if (l[k] && res.length < n) res.push(l[k]);
  return res;
};
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, n);
const bySource = {};
for (const r of rows) { const k = r.source.split('#')[0].replace(/\/.*$/, ''); bySource[k] = (bySource[k] ?? 0) + 1; }
let md = `# Failure groups (${new Date().toISOString().slice(0, 10)})\n\nLedger: \`training/eval/failures.jsonl\`, ${rows.length} rows. Produced by \`node scripts/analyze-failures.mjs\`. Rule (worker-tasks NO POINT FIXES): a change names a group below, is a general mechanism, and reports the group's count before and after plus what it broke elsewhere. The cause key is derived from the row's class and general signals in what happened (see \`causeOf\`), not from phrases.\n\n`;
md += `## Rows per source\n\n| source | rows |\n| --- | --- |\n${Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`;
md += `## Groups by cause\n\n| group | rows | share | regressions (was_passing) |\n| --- | --- | --- | --- |\n${sorted.map(([c, l]) => `| ${c} | ${l.length} | ${(100 * l.length / rows.length).toFixed(1)}% | ${l.filter((r) => r.was_passing === true).length} |`).join('\n')}\n\n`;
for (const [c, l] of sorted) {
  const cl = {}; for (const r of l) cl[r.class] = (cl[r.class] ?? 0) + 1;
  md += `### ${c} (${l.length})\n\nClasses: ${Object.entries(cl).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}\n\n| text | tab | lang | happened | expected | source |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const r of spread(l)) md += `| ${cut(r.text, 70)} | ${r.tab ?? ''} | ${r.language} | ${cut(r.happened, 110)} | ${cut(r.expected, 80)} | ${cut(r.source, 50)} |\n`;
  md += '\n';
}
if (process.argv.includes('--stdout')) console.log(md); else { writeFileSync(out, md); console.log(`wrote ${out}\n` + sorted.map(([c, l]) => `${String(l.length).padStart(5)}  ${c}`).join('\n')); }
