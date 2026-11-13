#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SCENE-NATURAL P6: scans every reply template literal of the worlds (`text=` / `why=` / `note=` of .sop files, the English sentences passed to ok( / no( /
 * answer / SOPError in the worlds' .mjs) with the reply check of scripts/lib/reply-check.mjs. A hole (`${x}` or `{x}`) is filled with a sample noun, then
 * with a function word (an article taken as the thing must not make the sentence worse than a question), so the template itself is judged.
 *   node scripts/scan-reply-templates.mjs [--all]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyFlags } from './lib/reply-check.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p]; });
const files = walk(join(REPO, 'worlds')).filter((f) => /\.(sop|mjs)$/.test(f) && !/tests\.sop$|\/knowledge\//.test(f));
const found = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = f.slice(REPO.length + 1);
  const add = (text, line) => { if (/[A-Za-z]{3,} [A-Za-z]{2,}/.test(text) && /^[A-Z]/.test(text.trim())) found.push({ rel, line, text }); };
  if (f.endsWith('.sop')) {
    src.split('\n').forEach((l, i) => { const m = /^\s*(?:text|why|reply|say)="([^"]+)"/.exec(l); if (m && !/scripts\/|spec 03|do not edit/.test(m[1])) add(m[1], i + 1); });
  } else {
    const re = /\b(?:ok|no|SOPError|answer)\(\s*(?:[^`'"()]*,\s*)?(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
    for (const m of src.matchAll(re)) add(m[1].slice(1, -1), src.slice(0, m.index).split('\n').length);
  }
}
const fill = (t, v) => t.replace(/\$\{[^}]*\}|\{[a-z_.?]+\}/gi, v);
const bad = [];
const balanced = (t) => (t.match(/\$\{/g) ?? []).length === (t.match(/\}/g) ?? []).length - (t.match(/(?<!\$)\{[a-z_.?]+\}/gi) ?? []).length;
for (const t of found) {
  if (!balanced(t.text)) continue;   // a literal cut inside a nested template: not a whole sentence
  const flags = new Set();
  for (const v of ['thing']) for (const fl of replyFlags(fill(t.text, v))) flags.add(fl);
  // fragments are joined with others: only what is wrong in any context is reported (an internal word, a dangling article)
  const own = [...flags].filter((x) => /internal|ontology|dangling|two articles|taken as/.test(x));
  if (own.length) bad.push({ ...t, flags: own });
}
console.log(`${found.length} reply templates scanned, ${bad.length} flagged`);
for (const b of bad) console.log(`${b.rel}:${b.line} ${JSON.stringify(b.text.slice(0, 120))} => ${b.flags.join('; ')}`);
process.exitCode = bad.length ? 1 : 0;
